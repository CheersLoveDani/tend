//! Encrypted backups of everything: reminders, seeds, medicine, the diary and settings.
//!
//! File layout: `TENDBAK1` | salt (16) | nonce (24) | XChaCha20-Poly1305 ciphertext.
//! The key comes from the user's passphrase via Argon2id. Only the derived key is kept on
//! this device (so daily backups can run unattended); the passphrase is needed to restore.
//!
//! Restoring merges with what's here using the same last-writer-wins rules as sync, so it
//! never throws away anything newer.

use anyhow::{Result, anyhow};
use argon2::{Algorithm, Argon2, Params, Version};
use base64::{Engine, engine::general_purpose::STANDARD as B64};
use chacha20poly1305::{Key, KeyInit, XChaCha20Poly1305, XNonce, aead::Aead};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

use crate::db::{Db, Item, now_ms};
use crate::model::{LedgerEntry, Reminder};

const MAGIC: &[u8; 8] = b"TENDBAK1";
const SALT_LEN: usize = 16;
const NONCE_LEN: usize = 24;
/// Daily files kept in a backup folder (desktop).
const KEEP: usize = 7;
pub const MIN_PASSPHRASE: usize = 8;

const K_KEY: &str = "backup.key";
const K_SALT: &str = "backup.salt";
const K_DIR: &str = "backup.dir";
const K_LAST: &str = "backup.last";
const K_ERROR: &str = "backup.error";

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Payload {
    app: String,
    version: u32,
    created_at: i64,
    device: String,
    reminders: Vec<Reminder>,
    ledger: Vec<LedgerEntry>,
    items: Vec<Item>,
    /// The app's settings (theme, chime…), restored onto a fresh install.
    #[serde(default)]
    settings: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub has_key: bool,
    pub dir: Option<String>,
    pub last: Option<i64>,
    pub error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Restored {
    pub reminders: usize,
    pub items: usize,
    pub changed: usize,
    pub created_at: i64,
}

fn derive(pass: &str, salt: &[u8]) -> Result<[u8; 32]> {
    let params = Params::new(19 * 1024, 2, 1, Some(32)).map_err(|e| anyhow!("{e}"))?;
    let mut key = [0u8; 32];
    Argon2::new(Algorithm::Argon2id, Version::V0x13, params)
        .hash_password_into(pass.as_bytes(), salt, &mut key)
        .map_err(|e| anyhow!("{e}"))?;
    Ok(key)
}

fn setting_b64(db: &Db, key: &str) -> Result<Option<Vec<u8>>> {
    Ok(db.setting(key)?.and_then(|v| B64.decode(v).ok()))
}

pub fn status(db: &Db) -> Result<Status> {
    Ok(Status {
        has_key: db.setting(K_KEY)?.is_some(),
        dir: db.setting(K_DIR)?.filter(|d| !d.is_empty()),
        last: db.setting(K_LAST)?.and_then(|v| v.parse().ok()),
        error: db.setting(K_ERROR)?.filter(|e| !e.is_empty()),
    })
}

pub fn set_passphrase(db: &Db, pass: &str) -> Result<()> {
    if pass.chars().count() < MIN_PASSPHRASE {
        return Err(anyhow!("Use at least {MIN_PASSPHRASE} characters"));
    }
    let mut salt = [0u8; SALT_LEN];
    rand::rng().fill_bytes(&mut salt);
    let key = derive(pass, &salt)?;
    db.set_setting(K_SALT, &B64.encode(salt))?;
    db.set_setting(K_KEY, &B64.encode(key))
}

pub fn set_dir(db: &Db, dir: &str) -> Result<()> {
    if !dir.is_empty() && !Path::new(dir).is_dir() {
        return Err(anyhow!("That folder doesn't exist"));
    }
    db.set_setting(K_DIR, dir)
}

pub fn record(db: &Db, error: Option<&str>) -> Result<()> {
    match error {
        None => {
            db.set_setting(K_LAST, &now_ms().to_string())?;
            db.set_setting(K_ERROR, "")
        }
        Some(e) => db.set_setting(K_ERROR, e),
    }
}

/// The whole database, encrypted with the stored key.
pub fn encrypt(db: &Db) -> Result<Vec<u8>> {
    let key = setting_b64(db, K_KEY)?.ok_or_else(|| anyhow!("Set a backup passphrase first"))?;
    let salt = setting_b64(db, K_SALT)?.ok_or_else(|| anyhow!("Set a backup passphrase first"))?;
    let payload = Payload {
        app: "tend".into(),
        version: 1,
        created_at: now_ms(),
        device: db.device.clone(),
        reminders: db.reminders_since(0)?,
        ledger: db.ledger_since(0)?,
        items: db.items_since(0)?,
        settings: db.setting("ui")?,
    };
    let plain = serde_json::to_vec(&payload)?;
    let mut nonce = [0u8; NONCE_LEN];
    rand::rng().fill_bytes(&mut nonce);
    let cipher = XChaCha20Poly1305::new(Key::from_slice(&key));
    let sealed = cipher.encrypt(XNonce::from_slice(&nonce), plain.as_ref()).map_err(|_| anyhow!("Couldn't encrypt the backup"))?;
    let mut out = Vec::with_capacity(MAGIC.len() + SALT_LEN + NONCE_LEN + sealed.len());
    out.extend_from_slice(MAGIC);
    out.extend_from_slice(&salt);
    out.extend_from_slice(&nonce);
    out.extend_from_slice(&sealed);
    Ok(out)
}

fn decrypt(bytes: &[u8], pass: &str) -> Result<Payload> {
    if bytes.len() < MAGIC.len() + SALT_LEN + NONCE_LEN + 16 || &bytes[..MAGIC.len()] != MAGIC {
        return Err(anyhow!("That isn't a Tend backup"));
    }
    let salt = &bytes[MAGIC.len()..MAGIC.len() + SALT_LEN];
    let nonce = &bytes[MAGIC.len() + SALT_LEN..MAGIC.len() + SALT_LEN + NONCE_LEN];
    let key = derive(pass, salt)?;
    let plain = XChaCha20Poly1305::new(Key::from_slice(&key))
        .decrypt(XNonce::from_slice(nonce), &bytes[MAGIC.len() + SALT_LEN + NONCE_LEN..])
        .map_err(|_| anyhow!("Wrong passphrase, or the backup is damaged"))?;
    let p: Payload = serde_json::from_slice(&plain).map_err(|_| anyhow!("The backup couldn't be read"))?;
    if p.app != "tend" {
        return Err(anyhow!("That isn't a Tend backup"));
    }
    Ok(p)
}

/// Merges a backup into this device. Newer local edits win, exactly as with sync.
pub fn restore(db: &Db, bytes: &[u8], pass: &str) -> Result<Restored> {
    let p = decrypt(bytes, pass)?;
    let changed = db.apply_remote(&p.reminders, &p.ledger, &p.items)?;
    // Bring settings across only onto a device that hasn't been set up yet.
    if let Some(s) = p.settings.as_deref() {
        let fresh = db
            .setting("ui")?
            .and_then(|v| serde_json::from_str::<serde_json::Value>(&v).ok())
            .is_none_or(|v| v.get("onboarded").and_then(|o| o.as_bool()) != Some(true));
        if fresh {
            db.set_setting("ui", s)?;
        }
    }
    Ok(Restored { reminders: p.reminders.len(), items: p.items.len(), changed, created_at: p.created_at })
}

fn file_name() -> String {
    format!("tend-backup-{}.tendbak", chrono::Local::now().format("%Y-%m-%d"))
}

/// Writes today's backup into the chosen folder and keeps the newest few.
pub fn to_dir(db: &Db) -> Result<PathBuf> {
    let dir = db.setting(K_DIR)?.filter(|d| !d.is_empty()).ok_or_else(|| anyhow!("Choose a backup folder first"))?;
    let dir = PathBuf::from(dir);
    if !dir.is_dir() {
        return Err(anyhow!("The backup folder is missing: {}", dir.display()));
    }
    let bytes = encrypt(db)?;
    let path = dir.join(file_name());
    let tmp = path.with_extension("tendbak.part");
    std::fs::write(&tmp, &bytes)?;
    std::fs::rename(&tmp, &path)?;
    let mut old: Vec<PathBuf> = std::fs::read_dir(&dir)?
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.file_name().and_then(|n| n.to_str()).is_some_and(|n| n.starts_with("tend-backup-") && n.ends_with(".tendbak")))
        .collect();
    old.sort();
    old.reverse();
    for p in old.into_iter().skip(KEEP) {
        let _ = std::fs::remove_file(p);
    }
    Ok(path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::actions;
    use crate::model::ReminderInput;

    fn db() -> Db {
        Db::open(Path::new(":memory:")).unwrap()
    }

    #[test]
    fn round_trip_and_wrong_passphrase() {
        let a = db();
        set_passphrase(&a, "correct horse").unwrap();
        let r = actions::upsert(
            &a,
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
        actions::complete(&a, &r.id, false).unwrap();
        let bytes = encrypt(&a).unwrap();
        assert!(!String::from_utf8_lossy(&bytes).contains("Bins"));

        let b = db();
        assert!(restore(&b, &bytes, "wrong horse").is_err());
        let done = restore(&b, &bytes, "correct horse").unwrap();
        assert_eq!(done.reminders, 1);
        assert_eq!(b.total_xp().unwrap(), a.total_xp().unwrap());
        // Restoring twice changes nothing.
        assert_eq!(restore(&b, &bytes, "correct horse").unwrap().changed, 0);
        assert!(set_passphrase(&b, "short").is_err());
    }

    #[test]
    fn folder_keeps_a_week() {
        let a = db();
        set_passphrase(&a, "correct horse").unwrap();
        let dir = std::env::temp_dir().join(format!("tend-bak-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        for i in 0..10 {
            std::fs::write(dir.join(format!("tend-backup-2020-01-{:02}.tendbak", i + 1)), b"x").unwrap();
        }
        set_dir(&a, dir.to_str().unwrap()).unwrap();
        let p = to_dir(&a).unwrap();
        assert!(p.exists());
        assert_eq!(std::fs::read_dir(&dir).unwrap().count(), KEEP);
        let _ = std::fs::remove_dir_all(dir);
    }
}
