//! Local-network sync. Any device can host (desktop does by default); others pair with a
//! 6-digit code and then exchange "changes since rev N" with last-writer-wins merging.
//! Discovery is a UDP broadcast so the phone can find the desktop when its IP changes.

use anyhow::{Result, anyhow};
use rand::Rng;
use rusqlite::{OptionalExtension, params};
use serde::{Deserialize, Serialize};
use std::net::UdpSocket;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use crate::db::{Db, now_ms};
use crate::model::{LedgerEntry, Reminder};

pub const HTTP_PORT: u16 = 47821;
pub const UDP_PORT: u16 = 47822;
const DISCOVER: &[u8] = b"TEND_DISCOVER";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Peer {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub last_sync: Option<i64>,
    pub is_client: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Hello {
    pub app: String,
    pub device_id: String,
    pub name: String,
    pub port: u16,
    #[serde(default)]
    pub host: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PairRequest {
    code: String,
    device_id: String,
    name: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PairResponse {
    token: String,
    device_id: String,
    name: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SyncBody {
    since: i64,
    reminders: Vec<Reminder>,
    ledger: Vec<LedgerEntry>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SyncReply {
    rev: i64,
    reminders: Vec<Reminder>,
    ledger: Vec<LedgerEntry>,
}

pub struct SyncState {
    pub name: String,
    pub hosting: bool,
    code: Mutex<(String, Instant)>,
}

impl SyncState {
    pub fn new(name: String, hosting: bool) -> Self {
        Self { name, hosting, code: Mutex::new((new_code(), Instant::now())) }
    }

    /// Current pairing code; rotates every 10 minutes.
    pub fn code(&self) -> String {
        let mut c = self.code.lock().unwrap();
        if c.1.elapsed() > Duration::from_secs(600) {
            *c = (new_code(), Instant::now());
        }
        c.0.clone()
    }
}

fn new_code() -> String {
    format!("{:06}", rand::rng().random_range(0..1_000_000))
}

fn token() -> String {
    let mut rng = rand::rng();
    (0..32).map(|_| format!("{:02x}", rng.random::<u8>())).collect()
}

pub fn local_addresses() -> Vec<String> {
    if_addrs::get_if_addrs()
        .unwrap_or_default()
        .into_iter()
        .filter(|i| !i.is_loopback())
        .filter_map(|i| match i.ip() {
            std::net::IpAddr::V4(v4) if !v4.is_link_local() => Some(v4.to_string()),
            _ => None,
        })
        .collect()
}

pub fn peers(db: &Db) -> Result<Vec<Peer>> {
    let mut stmt = db
        .conn
        .prepare("SELECT id,name,host,port,last_sync,is_client FROM peers ORDER BY name")?;
    let rows = stmt.query_map([], |r| {
        Ok(Peer {
            id: r.get(0)?,
            name: r.get(1)?,
            host: r.get(2)?,
            port: r.get::<_, i64>(3)? as u16,
            last_sync: r.get(4)?,
            is_client: r.get::<_, i64>(5)? != 0,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<_>>()?)
}

pub fn forget(db: &Db, id: &str) -> Result<()> {
    db.conn.execute("DELETE FROM peers WHERE id=?1", [id])?;
    Ok(())
}

// ---------------- host side ----------------

/// Starts the HTTP + discovery responders. `on_change` fires when a peer pushed changes.
pub fn serve(db: Arc<Mutex<Db>>, state: Arc<SyncState>, on_change: impl Fn() + Send + Sync + 'static) {
    let on_change = Arc::new(on_change);
    {
        let db = db.clone();
        let state = state.clone();
        std::thread::spawn(move || {
            let server = match tiny_http::Server::http(("0.0.0.0", HTTP_PORT)) {
                Ok(s) => s,
                Err(e) => {
                    log::warn!("sync server could not start: {e}");
                    return;
                }
            };
            for mut req in server.incoming_requests() {
                let mut body = String::new();
                let _ = req.as_reader().read_to_string(&mut body);
                let auth = req
                    .headers()
                    .iter()
                    .find(|h| h.field.equiv("Authorization"))
                    .map(|h| h.value.as_str().trim_start_matches("Bearer ").to_string());
                let (status, out, changed) = handle(&db, &state, req.url(), &body, auth.as_deref());
                if changed {
                    on_change();
                }
                let header =
                    tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..]).unwrap();
                let _ = req.respond(
                    tiny_http::Response::from_string(out).with_status_code(status).with_header(header),
                );
            }
        });
    }
    std::thread::spawn(move || {
        let Ok(sock) = UdpSocket::bind(("0.0.0.0", UDP_PORT)) else { return };
        let mut buf = [0u8; 64];
        while let Ok((n, from)) = sock.recv_from(&mut buf) {
            if &buf[..n] == DISCOVER {
                let device_id = db.lock().unwrap().device.clone();
                let hello = Hello {
                    app: "tend".into(),
                    device_id,
                    name: state.name.clone(),
                    port: HTTP_PORT,
                    host: String::new(),
                };
                let _ = sock.send_to(serde_json::to_string(&hello).unwrap().as_bytes(), from);
            }
        }
    });
}

fn handle(
    db: &Mutex<Db>,
    state: &SyncState,
    url: &str,
    body: &str,
    auth: Option<&str>,
) -> (u16, String, bool) {
    let db = db.lock().unwrap();
    let result: Result<(String, bool)> = (|| match url {
        "/hello" => Ok((
            serde_json::to_string(&Hello {
                app: "tend".into(),
                device_id: db.device.clone(),
                name: state.name.clone(),
                port: HTTP_PORT,
                host: String::new(),
            })?,
            false,
        )),
        "/pair" => {
            let req: PairRequest = serde_json::from_str(body)?;
            if req.code.trim() != state.code() {
                return Err(anyhow!("wrong code"));
            }
            let tok = token();
            db.conn.execute(
                "INSERT INTO peers(id,name,host,port,token,is_client) VALUES(?1,?2,'',0,?3,1)
                 ON CONFLICT(id) DO UPDATE SET name=excluded.name, token=excluded.token, is_client=1",
                params![req.device_id, req.name, tok],
            )?;
            Ok((
                serde_json::to_string(&PairResponse {
                    token: tok,
                    device_id: db.device.clone(),
                    name: state.name.clone(),
                })?,
                false,
            ))
        }
        "/sync" => {
            let tok = auth.ok_or_else(|| anyhow!("unauthorised"))?;
            let peer: Option<String> = db
                .conn
                .query_row("SELECT id FROM peers WHERE token=?1 AND is_client=1", [tok], |r| r.get(0))
                .optional()?;
            let peer = peer.ok_or_else(|| anyhow!("unauthorised"))?;
            let req: SyncBody = serde_json::from_str(body)?;
            let changed = db.apply_remote(&req.reminders, &req.ledger)?;
            db.conn
                .execute("UPDATE peers SET last_sync=?1 WHERE id=?2", params![now_ms(), peer])?;
            let reply = SyncReply {
                rev: db.max_rev()?,
                reminders: db.reminders_since(req.since)?,
                ledger: db.ledger_since(req.since)?,
            };
            Ok((serde_json::to_string(&reply)?, changed > 0))
        }
        _ => Err(anyhow!("not found")),
    })();
    match result {
        Ok((s, changed)) => (200, s, changed),
        Err(e) => {
            let code = if e.to_string() == "unauthorised" || e.to_string() == "wrong code" { 401 } else { 400 };
            (code, serde_json::json!({ "error": e.to_string() }).to_string(), false)
        }
    }
}

// ---------------- client side ----------------

fn agent() -> ureq::Agent {
    ureq::Agent::config_builder()
        .timeout_global(Some(Duration::from_secs(6)))
        .http_status_as_error(false)
        .build()
        .into()
}

/// Broadcasts on the LAN and collects Tend hosts that answer within ~1.2s.
pub fn discover(own_id: &str) -> Vec<Hello> {
    let mut found: Vec<Hello> = vec![];
    let Ok(sock) = UdpSocket::bind(("0.0.0.0", 0)) else { return found };
    let _ = sock.set_broadcast(true);
    let _ = sock.set_read_timeout(Some(Duration::from_millis(300)));
    let mut targets = vec!["255.255.255.255".to_string()];
    for a in local_addresses() {
        // Directed /24 broadcast helps on networks that drop limited broadcast.
        if let Some((prefix, _)) = a.rsplit_once('.') {
            targets.push(format!("{prefix}.255"));
        }
    }
    let deadline = Instant::now() + Duration::from_millis(1200);
    let mut sent_at = Instant::now() - Duration::from_secs(1);
    let mut buf = [0u8; 1024];
    while Instant::now() < deadline {
        if sent_at.elapsed() > Duration::from_millis(400) {
            for t in &targets {
                let _ = sock.send_to(DISCOVER, (t.as_str(), UDP_PORT));
            }
            sent_at = Instant::now();
        }
        if let Ok((n, from)) = sock.recv_from(&mut buf) {
            if let Ok(mut h) = serde_json::from_slice::<Hello>(&buf[..n]) {
                h.host = from.ip().to_string();
                if h.app == "tend" && h.device_id != own_id && !found.iter().any(|f| f.device_id == h.device_id) {
                    found.push(h);
                }
            }
        }
    }
    found
}

/// Probes every candidate address at once (a QR code carries all of the host's IPs)
/// and pairs with the first that answers as the expected Tend device.
pub fn pair_any(db: &Mutex<Db>, my_name: &str, hosts: &[String], port: u16, code: &str, device: Option<&str>) -> Result<Peer> {
    let (tx, rx) = std::sync::mpsc::channel();
    for h in hosts {
        let (tx, h) = (tx.clone(), h.clone());
        std::thread::spawn(move || {
            let agent: ureq::Agent = ureq::Agent::config_builder()
                .timeout_global(Some(Duration::from_millis(2500)))
                .build()
                .into();
            let hello = agent
                .get(&format!("http://{h}:{port}/hello"))
                .call()
                .ok()
                .and_then(|mut r| r.body_mut().read_json::<Hello>().ok());
            let _ = tx.send((h, hello));
        });
    }
    drop(tx);
    for (h, hello) in rx {
        if let Some(hello) = hello {
            if device.is_none_or(|d| d == hello.device_id) {
                return pair(db, my_name, &h, port, code);
            }
        }
    }
    Err(anyhow!("Couldn't reach the computer — make sure both devices are on the same Wi-Fi"))
}

pub fn pair(db: &Mutex<Db>, my_name: &str, host: &str, port: u16, code: &str) -> Result<Peer> {
    let device = db.lock().unwrap().device.clone();
    let mut res = agent()
        .post(&format!("http://{host}:{port}/pair"))
        .send_json(&PairRequest { code: code.trim().into(), device_id: device, name: my_name.into() })
        .map_err(|e| anyhow!("Couldn't reach {host}: {e}"))?;
    if res.status() == 401 {
        return Err(anyhow!("That code didn't match — check the code on the other device"));
    }
    let reply: PairResponse = res.body_mut().read_json().map_err(|e| anyhow!("Bad reply: {e}"))?;
    let db = db.lock().unwrap();
    db.conn.execute(
        "INSERT INTO peers(id,name,host,port,token,pull_rev,push_rev,is_client) VALUES(?1,?2,?3,?4,?5,0,0,0)
         ON CONFLICT(id) DO UPDATE SET name=excluded.name,host=excluded.host,port=excluded.port,
           token=excluded.token,pull_rev=0,push_rev=0,is_client=0",
        params![reply.device_id, reply.name, host, port as i64, reply.token],
    )?;
    Ok(Peer {
        id: reply.device_id,
        name: reply.name,
        host: host.into(),
        port,
        last_sync: None,
        is_client: false,
    })
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncOutcome {
    pub peers: usize,
    pub ok: usize,
    pub changed: usize,
    pub errors: Vec<String>,
}

/// Pushes our changes to every host we paired with and pulls theirs.
pub fn sync_all(db: &Mutex<Db>) -> SyncOutcome {
    let targets: Vec<(String, String, String, u16, String, i64, i64)> = {
        let db = db.lock().unwrap();
        let mut stmt = db
            .conn
            .prepare("SELECT id,name,host,port,token,pull_rev,push_rev FROM peers WHERE is_client=0")
            .unwrap();
        stmt.query_map([], |r| {
            Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get::<_, i64>(3)? as u16, r.get(4)?, r.get(5)?, r.get(6)?))
        })
        .unwrap()
        .filter_map(|r| r.ok())
        .collect()
    };
    let mut out = SyncOutcome { peers: targets.len(), ok: 0, changed: 0, errors: vec![] };
    for (id, name, host, port, tok, pull_rev, push_rev) in targets {
        let attempt = sync_one(db, &host, port, &tok, pull_rev, push_rev);
        let attempt = match attempt {
            Err(_) => {
                // The host may have a new IP — look for it and retry once.
                let own = db.lock().unwrap().device.clone();
                match discover(&own).into_iter().find(|h| h.device_id == id) {
                    Some(h) => {
                        let _ = db
                            .lock()
                            .unwrap()
                            .conn
                            .execute("UPDATE peers SET host=?1, port=?2 WHERE id=?3", params![h.host, h.port, id]);
                        sync_one(db, &h.host, h.port, &tok, pull_rev, push_rev)
                    }
                    None => attempt,
                }
            }
            ok => ok,
        };
        match attempt {
            Ok((changed, new_pull, new_push)) => {
                out.ok += 1;
                out.changed += changed;
                let _ = db.lock().unwrap().conn.execute(
                    "UPDATE peers SET pull_rev=?1, push_rev=?2, last_sync=?3 WHERE id=?4",
                    params![new_pull, new_push, now_ms(), id],
                );
            }
            Err(e) => out.errors.push(format!("{name}: {e}")),
        }
    }
    out
}

fn sync_one(db: &Mutex<Db>, host: &str, port: u16, tok: &str, pull_rev: i64, push_rev: i64) -> Result<(usize, i64, i64)> {
    let (body, mark) = {
        let db = db.lock().unwrap();
        let mark = db.max_rev()?;
        (
            SyncBody { since: pull_rev, reminders: db.reminders_since(push_rev)?, ledger: db.ledger_since(push_rev)? },
            mark,
        )
    };
    let mut res = agent()
        .post(&format!("http://{host}:{port}/sync"))
        .header("Authorization", &format!("Bearer {tok}"))
        .send_json(&body)
        .map_err(|e| anyhow!("unreachable ({e})"))?;
    if res.status() == 401 {
        return Err(anyhow!("this device was unpaired — pair again"));
    }
    if res.status() != 200 {
        return Err(anyhow!("host error {}", res.status()));
    }
    let reply: SyncReply = res.body_mut().read_json()?;
    let changed = db.lock().unwrap().apply_remote(&reply.reminders, &reply.ledger)?;
    Ok((changed, reply.rev, mark))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::actions;
    use crate::model::ReminderInput;

    fn db() -> Arc<Mutex<Db>> {
        Arc::new(Mutex::new(Db::open(std::path::Path::new(":memory:")).unwrap()))
    }

    #[test]
    fn pair_and_sync_over_http() {
        let host = db();
        let state = Arc::new(SyncState::new("Desk".into(), true));
        serve(host.clone(), state.clone(), || {});
        std::thread::sleep(Duration::from_millis(300));

        let phone = db();
        assert!(pair(&phone, "Phone", "127.0.0.1", HTTP_PORT, "999999x").is_err());
        let peer = pair(&phone, "Phone", "127.0.0.1", HTTP_PORT, &state.code()).unwrap();
        assert_eq!(peer.name, "Desk");

        let r = actions::upsert(
            &phone.lock().unwrap(),
            ReminderInput {
                id: None,
                title: "Bins".into(),
                notes: String::new(),
                date: actions::today(),
                time: None,
                steps: vec![],
                reward: 10,
                suggested: None,
                repeat: None,
            },
        )
        .unwrap();
        let out = sync_all(&phone);
        assert_eq!(out.ok, 1, "{:?}", out.errors);
        assert!(host.lock().unwrap().get_reminder(&r.id).unwrap().is_some());

        actions::complete(&host.lock().unwrap(), &r.id, false).unwrap();
        let out = sync_all(&phone);
        assert!(out.changed > 0);
        let p = phone.lock().unwrap();
        assert_eq!(p.get_reminder(&r.id).unwrap().unwrap().status, "done");
        assert_eq!(p.total_xp().unwrap(), 10);
        drop(p);
        // Steady state: nothing more to move.
        assert_eq!(sync_all(&phone).changed, 0);

        // QR pairing: an unreachable address in the list must not block the reachable one.
        let tablet = db();
        let hosts = vec!["10.255.255.1".to_string(), "127.0.0.1".to_string()];
        let device = host.lock().unwrap().device.clone();
        let peer = pair_any(&tablet, "Tablet", &hosts, HTTP_PORT, &state.code(), Some(&device)).unwrap();
        assert_eq!(peer.host, "127.0.0.1");
        assert!(pair_any(&tablet, "Tablet", &hosts, HTTP_PORT, &state.code(), Some("someone-else")).is_err());
    }
}
