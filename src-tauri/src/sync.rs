//! Local-network sync. Any device can host (desktop does by default); others pair with a
//! 6-digit code and then exchange "changes since rev N" with last-writer-wins merging.
//! Discovery is a UDP broadcast so the phone can find the desktop when its IP changes.
//!
//! The pairing token never travels after pairing: each /sync request is signed with an
//! HMAC over a timestamp, a one-time nonce and the body, and the host signs its reply the
//! same way. A device answering discovery under a paired host's id therefore learns
//! nothing reusable, and its replies are rejected. Pairing codes lock after a few misses.

use anyhow::{Result, anyhow};
use hmac::{Hmac, Mac};
use rand::Rng;
use rusqlite::{OptionalExtension, params};
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use std::collections::HashMap;
use std::io::Read;
use std::net::{IpAddr, Ipv4Addr, UdpSocket};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use crate::db::{Db, now_ms};
use crate::model::{LedgerEntry, Reminder};

pub const HTTP_PORT: u16 = 47821;
pub const UDP_PORT: u16 = 47822;
const DISCOVER: &[u8] = b"TEND_DISCOVER";
/// Wrong pairing codes one address may send before it is paused, and how many wrong
/// codes the current code survives (from anyone) before it is replaced.
const MAX_PAIR_FAILURES: u32 = 5;
const PAIR_LOCKOUT: Duration = Duration::from_secs(300);
/// Wrong codes accepted from everyone together per window; past it pairing pauses for all.
const MAX_PAIR_MISSES_PER_WINDOW: u32 = 20;
const PAIR_WINDOW: Duration = Duration::from_secs(600);
/// Pairing is only accepted while the code is on screen; the Settings view keeps this open.
const PAIR_OPEN_FOR: Duration = Duration::from_secs(120);
const MAX_TRACKED_ADDRS: usize = 1024;
/// How far a signed request's clock may be from ours.
const MAX_SKEW_MS: i64 = 5 * 60 * 1000;
const MAX_SYNC_BODY: u64 = 16 * 1024 * 1024;
const MAX_SMALL_BODY: u64 = 4 * 1024;

type HmacSha256 = Hmac<Sha256>;

fn mac_over(token: &str, parts: &[&str]) -> HmacSha256 {
    let mut mac = HmacSha256::new_from_slice(token.as_bytes()).expect("any key length works");
    for p in parts {
        mac.update(p.as_bytes());
        mac.update(b"\n");
    }
    mac
}

fn sign(token: &str, parts: &[&str]) -> String {
    mac_over(token, parts).finalize().into_bytes().iter().map(|b| format!("{b:02x}")).collect()
}

/// Constant-time check of a hex signature.
fn verify(token: &str, parts: &[&str], sig: &str) -> bool {
    let bytes: Option<Vec<u8>> = (0..sig.len())
        .step_by(2)
        .map(|i| sig.get(i..i + 2).and_then(|h| u8::from_str_radix(h, 16).ok()))
        .collect();
    bytes.is_some_and(|b| mac_over(token, parts).verify_slice(&b).is_ok())
}

fn nonce() -> String {
    let mut rng = rand::rng();
    (0..16).map(|_| format!("{:02x}", rng.random::<u8>())).collect()
}

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

struct PairCode {
    code: String,
    issued: Instant,
    /// Wrong guesses against the current code, from anyone.
    misses: u32,
    /// Wrong guesses from everyone in the current window: (window start, count).
    window: (Instant, u32),
    /// Until when pairing is accepted (the code is on screen on this device).
    open_until: Option<Instant>,
    /// Per-address (wrong guesses, first miss, paused until).
    by_addr: HashMap<IpAddr, (u32, Instant, Option<Instant>)>,
}

pub struct SyncState {
    pub name: String,
    pub hosting: bool,
    code: Mutex<PairCode>,
    /// Nonces of recently accepted /sync requests, so a captured request can't be replayed.
    seen: Mutex<HashMap<String, i64>>,
}

impl SyncState {
    pub fn new(name: String, hosting: bool) -> Self {
        Self {
            name,
            hosting,
            code: Mutex::new(PairCode {
                code: new_code(),
                issued: Instant::now(),
                misses: 0,
                window: (Instant::now(), 0),
                open_until: None,
                by_addr: HashMap::new(),
            }),
            seen: Mutex::new(HashMap::new()),
        }
    }

    /// Current pairing code; rotates every 10 minutes.
    pub fn code(&self) -> String {
        let mut c = self.code.lock().unwrap();
        if c.issued.elapsed() > Duration::from_secs(600) {
            c.code = new_code();
            c.issued = Instant::now();
        }
        c.code.clone()
    }

    /// Accept pairing for the next couple of minutes. Called while the code is on screen.
    pub fn open_pairing(&self) {
        self.code.lock().unwrap().open_until = Some(Instant::now() + PAIR_OPEN_FOR);
    }

    /// Checks a pairing attempt. Pairing is only possible while the code is on screen.
    /// Each code survives only a few wrong guesses before it is replaced, an address that
    /// keeps guessing is paused on its own, and wrong guesses from everyone together are
    /// capped per window, so switching addresses doesn't buy more tries.
    fn try_code(&self, attempt: &str, from: IpAddr) -> Result<()> {
        use subtle::ConstantTimeEq;
        let current = self.code();
        let mut c = self.code.lock().unwrap();
        let now = Instant::now();
        if c.open_until.is_none_or(|t| now >= t) {
            return Err(anyhow!("closed"));
        }
        if c.window.0.elapsed() >= PAIR_WINDOW {
            c.window = (now, 0);
        }
        c.by_addr.retain(|_, (_, first, until)| match until {
            Some(t) => now < *t,
            None => first.elapsed() < PAIR_LOCKOUT,
        });
        if c.window.1 >= MAX_PAIR_MISSES_PER_WINDOW || c.by_addr.get(&from).is_some_and(|e| e.2.is_some()) {
            return Err(anyhow!("locked"));
        }
        if bool::from(attempt.trim().as_bytes().ct_eq(current.as_bytes())) {
            c.by_addr.remove(&from);
            return Ok(());
        }
        if c.by_addr.len() >= MAX_TRACKED_ADDRS {
            c.by_addr.retain(|_, e| e.2.is_some());
        }
        let entry = c.by_addr.entry(from).or_insert((0, now, None));
        entry.0 += 1;
        if entry.0 >= MAX_PAIR_FAILURES {
            entry.2 = Some(now + PAIR_LOCKOUT);
        }
        c.window.1 += 1;
        c.misses += 1;
        if c.misses >= MAX_PAIR_FAILURES {
            c.code = new_code();
            c.issued = now;
            c.misses = 0;
        }
        Err(anyhow!("wrong code"))
    }

    /// True the first time a nonce is seen. Entries are kept for as long as a request
    /// signed at `time` could still be accepted, so a replay can never outlive its record.
    fn fresh_nonce(&self, nonce: &str, time: i64, now: i64) -> bool {
        let mut seen = self.seen.lock().unwrap();
        seen.retain(|_, t| (now - *t).abs() <= MAX_SKEW_MS);
        seen.insert(nonce.to_string(), time).is_none()
    }
}

/// Signature headers on a /sync request.
struct SignedRequest {
    device: String,
    time: String,
    nonce: String,
    sig: String,
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
                let json =
                    tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..]).unwrap();
                let limit = if req.url() == "/sync" { MAX_SYNC_BODY } else { MAX_SMALL_BODY };
                let mut body = String::new();
                let too_big = req.body_length().is_some_and(|n| n as u64 > limit)
                    || req.as_reader().take(limit + 1).read_to_string(&mut body).is_err()
                    || body.len() as u64 > limit;
                if too_big {
                    let _ = req.respond(
                        tiny_http::Response::from_string(r#"{"error":"too large"}"#).with_status_code(413).with_header(json),
                    );
                    continue;
                }
                let header = |name: &'static str| {
                    req.headers()
                        .iter()
                        .find(|h| h.field.equiv(name))
                        .map(|h| h.value.as_str().to_string())
                        .unwrap_or_default()
                };
                let signed = SignedRequest {
                    device: header("X-Tend-Device"),
                    time: header("X-Tend-Time"),
                    nonce: header("X-Tend-Nonce"),
                    sig: header("X-Tend-Sig"),
                };
                let from = req.remote_addr().map_or(IpAddr::V4(Ipv4Addr::UNSPECIFIED), |a| a.ip());
                let (status, out, changed, reply_sig) = handle(&db, &state, req.url(), &body, &signed, from);
                if changed {
                    on_change();
                }
                let mut response = tiny_http::Response::from_string(out).with_status_code(status).with_header(json);
                if let Some(sig) = reply_sig {
                    response = response.with_header(tiny_http::Header::from_bytes(&b"X-Tend-Sig"[..], sig.as_bytes()).unwrap());
                }
                let _ = req.respond(response);
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
    signed: &SignedRequest,
    from: IpAddr,
) -> (u16, String, bool, Option<String>) {
    let db = db.lock().unwrap();
    let result: Result<(String, bool, Option<String>)> = (|| match url {
        "/hello" => Ok((
            serde_json::to_string(&Hello {
                app: "tend".into(),
                device_id: db.device.clone(),
                name: state.name.clone(),
                port: HTTP_PORT,
                host: String::new(),
            })?,
            false,
            None,
        )),
        "/pair" => {
            let req: PairRequest = serde_json::from_str(body)?;
            state.try_code(&req.code, from)?;
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
                None,
            ))
        }
        "/sync" => {
            let unauthorised = || anyhow!("unauthorised");
            let tok: String = db
                .conn
                .query_row("SELECT token FROM peers WHERE id=?1 AND is_client=1", [&signed.device], |r| r.get(0))
                .optional()?
                .ok_or_else(unauthorised)?;
            let now = now_ms();
            let time: i64 = signed.time.parse().map_err(|_| unauthorised())?;
            if (now - time).abs() > MAX_SKEW_MS
                || signed.nonce.len() < 16
                || !verify(&tok, &["req", &signed.time, &signed.nonce, body], &signed.sig)
                || !state.fresh_nonce(&signed.nonce, time, now)
            {
                return Err(unauthorised());
            }
            let peer = signed.device.clone();
            let req: SyncBody = serde_json::from_str(body)?;
            let changed = db.apply_remote(&req.reminders, &req.ledger)?;
            db.conn
                .execute("UPDATE peers SET last_sync=?1 WHERE id=?2", params![now_ms(), peer])?;
            let reply = SyncReply {
                rev: db.max_rev()?,
                reminders: db.reminders_since(req.since)?,
                ledger: db.ledger_since(req.since)?,
            };
            let out = serde_json::to_string(&reply)?;
            let sig = sign(&tok, &["res", &signed.nonce, &out]);
            Ok((out, changed > 0, Some(sig)))
        }
        _ => Err(anyhow!("not found")),
    })();
    match result {
        Ok((s, changed, sig)) => (200, s, changed, sig),
        Err(e) => {
            let code = match e.to_string().as_str() {
                "unauthorised" | "wrong code" => 401,
                "closed" => 403,
                "locked" => 429,
                _ => 400,
            };
            (code, serde_json::json!({ "error": e.to_string() }).to_string(), false, None)
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
    if res.status() == 403 {
        return Err(anyhow!("Open Settings on the computer so its code is showing, then try again"));
    }
    if res.status() == 429 {
        return Err(anyhow!("Too many wrong codes. Wait a few minutes, then use the new code shown on the computer"));
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
                // The host may have a new IP: look for it and retry once. Discovery replies are
                // unauthenticated and a signed reply can't tell a relay from the real host, so
                // the address is used for this sync only and never stored; a stranger can't
                // become a lasting middleman. Pairing again saves a new address.
                let own = db.lock().unwrap().device.clone();
                match discover(&own).into_iter().find(|h| h.device_id == id) {
                    Some(h) => sync_one(db, &h.host, h.port, &tok, pull_rev, push_rev),
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
    let (body, mark, device) = {
        let db = db.lock().unwrap();
        let mark = db.max_rev()?;
        (
            SyncBody { since: pull_rev, reminders: db.reminders_since(push_rev)?, ledger: db.ledger_since(push_rev)? },
            mark,
            db.device.clone(),
        )
    };
    let body = serde_json::to_string(&body)?;
    let time = now_ms().to_string();
    let nonce = nonce();
    let mut res = agent()
        .post(&format!("http://{host}:{port}/sync"))
        .header("Content-Type", "application/json")
        .header("X-Tend-Device", &device)
        .header("X-Tend-Time", &time)
        .header("X-Tend-Nonce", &nonce)
        .header("X-Tend-Sig", &sign(tok, &["req", &time, &nonce, &body]))
        .send(&body)
        .map_err(|e| anyhow!("unreachable ({e})"))?;
    if res.status() == 401 {
        return Err(anyhow!("this device was unpaired — pair again"));
    }
    if res.status() != 200 {
        return Err(anyhow!("host error {}", res.status()));
    }
    let sig = res.headers().get("X-Tend-Sig").and_then(|v| v.to_str().ok()).unwrap_or_default().to_string();
    let text = res.body_mut().with_config().limit(MAX_SYNC_BODY).read_to_string()?;
    if !verify(tok, &["res", &nonce, &text], &sig) {
        return Err(anyhow!("the reply wasn't signed by the paired computer"));
    }
    let reply: SyncReply = serde_json::from_str(&text)?;
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
        // Closed until the code is on screen.
        assert!(pair(&phone, "Phone", "127.0.0.1", HTTP_PORT, &state.code()).is_err());
        state.open_pairing();
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

        // A signed request works once; replaying it, or sending it unsigned, is refused.
        let (me, tok) = {
            let p = phone.lock().unwrap();
            let tok: String = p.conn.query_row("SELECT token FROM peers", [], |r| r.get(0)).unwrap();
            (p.device.clone(), tok)
        };
        let body = r#"{"since":0,"reminders":[],"ledger":[]}"#;
        let (time, n) = (now_ms().to_string(), nonce());
        let send = |sig: &str| {
            agent()
                .post(&format!("http://127.0.0.1:{HTTP_PORT}/sync"))
                .header("X-Tend-Device", &me)
                .header("X-Tend-Time", &time)
                .header("X-Tend-Nonce", &n)
                .header("X-Tend-Sig", sig)
                .send(body)
                .unwrap()
                .status()
                .as_u16()
        };
        let sig = sign(&tok, &["req", &time, &n, body]);
        assert_eq!(send(&sig), 200);
        assert_eq!(send(&sig), 401, "replayed request must be refused");
        assert_eq!(send("00"), 401);
    }

    #[test]
    fn signatures_bind_every_part() {
        let sig = sign("secret", &["res", "n1", "{}"]);
        assert!(verify("secret", &["res", "n1", "{}"], &sig));
        assert!(!verify("other", &["res", "n1", "{}"], &sig));
        assert!(!verify("secret", &["res", "n2", "{}"], &sig));
        assert!(!verify("secret", &["res", "n1", "{ }"], &sig));
        assert!(!verify("secret", &["res", "n1", "{}"], "zz"));
    }

    #[test]
    fn pairing_locks_after_repeated_wrong_codes() {
        let state = SyncState::new("Desk".into(), true);
        state.open_pairing();
        let noisy: IpAddr = "10.0.0.9".parse().unwrap();
        let other: IpAddr = "10.0.0.2".parse().unwrap();
        let first = state.code();
        let wrong = if first == "000000" { "000001" } else { "000000" };
        for _ in 0..MAX_PAIR_FAILURES {
            assert!(state.try_code(wrong, noisy).is_err());
        }
        // The guessed-at code was replaced, and the guessing address is paused...
        let next = state.code();
        assert_ne!(first, next);
        assert_eq!(state.try_code(&next, noisy).unwrap_err().to_string(), "locked");
        // ...but everyone else can still pair with the new code.
        assert!(state.try_code(&next, other).is_ok());

        // Spreading guesses over many addresses hits the shared cap.
        for i in 0..MAX_PAIR_MISSES_PER_WINDOW {
            let addr: IpAddr = format!("10.1.{}.{}", i / 200, i % 200 + 1).parse().unwrap();
            let current = state.code();
            let _ = state.try_code(if current == "000000" { "000001" } else { "000000" }, addr);
        }
        let fresh: IpAddr = "10.2.0.1".parse().unwrap();
        assert_eq!(state.try_code(&state.code(), fresh).unwrap_err().to_string(), "locked");
    }
}
