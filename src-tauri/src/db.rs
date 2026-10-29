//! SQLite storage. Every row carries `updated_at` + `device` for last-writer-wins sync
//! and a local `rev` so peers can ask for "everything since rev N".

use anyhow::Result;
use rusqlite::{Connection, OptionalExtension, params};
use std::path::Path;

use crate::model::{LedgerEntry, Reminder, Step};

pub fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

pub struct Db {
    pub conn: Connection,
    pub device: String,
}

const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS reminders (
  id TEXT PRIMARY KEY, series_id TEXT NOT NULL, title TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '',
  date TEXT NOT NULL, time TEXT, steps TEXT NOT NULL DEFAULT '[]', reward INTEGER NOT NULL,
  suggested INTEGER, status TEXT NOT NULL DEFAULT 'open', repeat TEXT, bits INTEGER NOT NULL DEFAULT 0,
  completed_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, device TEXT NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0, rev INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS reminders_date ON reminders(date);
CREATE INDEX IF NOT EXISTS reminders_rev ON reminders(rev);
CREATE TABLE IF NOT EXISTS ledger (
  id TEXT PRIMARY KEY, reminder_id TEXT NOT NULL, kind TEXT NOT NULL, amount INTEGER NOT NULL,
  at INTEGER NOT NULL, void INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL, device TEXT NOT NULL,
  rev INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ledger_rev ON ledger(rev);
CREATE INDEX IF NOT EXISTS ledger_reminder ON ledger(reminder_id);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS peers (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, host TEXT NOT NULL, port INTEGER NOT NULL, token TEXT NOT NULL,
  pull_rev INTEGER NOT NULL DEFAULT 0, push_rev INTEGER NOT NULL DEFAULT 0, last_sync INTEGER,
  is_client INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS notified (id TEXT PRIMARY KEY, at INTEGER NOT NULL);
"#;

fn row_to_reminder(row: &rusqlite::Row) -> rusqlite::Result<Reminder> {
    let steps: String = row.get("steps")?;
    Ok(Reminder {
        id: row.get("id")?,
        series_id: row.get("series_id")?,
        title: row.get("title")?,
        notes: row.get("notes")?,
        date: row.get("date")?,
        time: row.get("time")?,
        steps: serde_json::from_str::<Vec<Step>>(&steps).unwrap_or_default(),
        reward: row.get("reward")?,
        suggested: row.get("suggested")?,
        status: row.get("status")?,
        repeat: row.get("repeat")?,
        bits: row.get("bits")?,
        completed_at: row.get("completed_at")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
        device: row.get("device")?,
        deleted: row.get::<_, i64>("deleted")? != 0,
    })
}

fn row_to_ledger(row: &rusqlite::Row) -> rusqlite::Result<LedgerEntry> {
    Ok(LedgerEntry {
        id: row.get("id")?,
        reminder_id: row.get("reminder_id")?,
        kind: row.get("kind")?,
        amount: row.get("amount")?,
        at: row.get("at")?,
        void: row.get::<_, i64>("void")? != 0,
        updated_at: row.get("updated_at")?,
        device: row.get("device")?,
    })
}

/// Last-writer-wins ordering; device id breaks ties deterministically.
fn newer(a_at: i64, a_dev: &str, b_at: i64, b_dev: &str) -> bool {
    (a_at, a_dev) > (b_at, b_dev)
}

impl Db {
    pub fn open(path: &Path) -> Result<Self> {
        let conn = Connection::open(path)?;
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;")?;
        conn.execute_batch(SCHEMA)?;
        let device = match conn
            .query_row("SELECT value FROM meta WHERE key='device'", [], |r| r.get::<_, String>(0))
            .optional()?
        {
            Some(d) => d,
            None => {
                let d = uuid::Uuid::new_v4().to_string();
                conn.execute("INSERT INTO meta(key,value) VALUES('device',?1)", [&d])?;
                d
            }
        };
        Ok(Self { conn, device })
    }

    fn next_rev(&self) -> Result<i64> {
        let cur: i64 = self
            .conn
            .query_row("SELECT value FROM meta WHERE key='rev'", [], |r| r.get::<_, String>(0))
            .optional()?
            .and_then(|s| s.parse().ok())
            .unwrap_or(0);
        let next = cur + 1;
        self.conn.execute(
            "INSERT INTO meta(key,value) VALUES('rev',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            [next.to_string()],
        )?;
        Ok(next)
    }

    pub fn max_rev(&self) -> Result<i64> {
        Ok(self
            .conn
            .query_row("SELECT value FROM meta WHERE key='rev'", [], |r| r.get::<_, String>(0))
            .optional()?
            .and_then(|s| s.parse().ok())
            .unwrap_or(0))
    }

    fn write_reminder(&self, r: &Reminder) -> Result<()> {
        let rev = self.next_rev()?;
        self.conn.execute(
            "INSERT INTO reminders(id,series_id,title,notes,date,time,steps,reward,suggested,status,repeat,bits,
               completed_at,created_at,updated_at,device,deleted,rev)
             VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18)
             ON CONFLICT(id) DO UPDATE SET series_id=excluded.series_id,title=excluded.title,notes=excluded.notes,
               date=excluded.date,time=excluded.time,steps=excluded.steps,reward=excluded.reward,
               suggested=excluded.suggested,status=excluded.status,repeat=excluded.repeat,bits=excluded.bits,
               completed_at=excluded.completed_at,created_at=excluded.created_at,updated_at=excluded.updated_at,
               device=excluded.device,deleted=excluded.deleted,rev=excluded.rev",
            params![
                r.id, r.series_id, r.title, r.notes, r.date, r.time,
                serde_json::to_string(&r.steps)?, r.reward, r.suggested, r.status, r.repeat, r.bits,
                r.completed_at, r.created_at, r.updated_at, r.device, r.deleted as i64, rev
            ],
        )?;
        Ok(())
    }

    /// Saves a locally edited reminder, stamping it as the newest version.
    pub fn save_reminder(&self, r: &mut Reminder) -> Result<()> {
        r.updated_at = now_ms().max(r.updated_at + 1);
        r.device = self.device.clone();
        self.write_reminder(r)
    }

    pub fn get_reminder(&self, id: &str) -> Result<Option<Reminder>> {
        Ok(self
            .conn
            .query_row("SELECT * FROM reminders WHERE id=?1", [id], row_to_reminder)
            .optional()?)
    }

    pub fn reminders_live(&self, since_date: &str) -> Result<Vec<Reminder>> {
        let mut stmt = self.conn.prepare(
            "SELECT * FROM reminders WHERE deleted=0 AND (date >= ?1 OR status='open')
             ORDER BY date, COALESCE(time,'99:99'), created_at",
        )?;
        let rows = stmt.query_map([since_date], row_to_reminder)?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    }

    /// Reminders that carry a user-confirmed reward, newest first — the suggester's memory.
    pub fn reward_history(&self, limit: i64) -> Result<Vec<Reminder>> {
        let mut stmt = self.conn.prepare(
            "SELECT * FROM reminders WHERE deleted=0 ORDER BY created_at DESC LIMIT ?1",
        )?;
        let rows = stmt.query_map([limit], row_to_reminder)?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    }

    pub fn put_ledger(&self, mut e: LedgerEntry) -> Result<()> {
        let existing = self
            .conn
            .query_row("SELECT * FROM ledger WHERE id=?1", [&e.id], row_to_ledger)
            .optional()?;
        e.updated_at = now_ms().max(existing.as_ref().map_or(0, |x| x.updated_at + 1));
        e.device = self.device.clone();
        self.write_ledger(&e)
    }

    fn write_ledger(&self, e: &LedgerEntry) -> Result<()> {
        let rev = self.next_rev()?;
        self.conn.execute(
            "INSERT INTO ledger(id,reminder_id,kind,amount,at,void,updated_at,device,rev)
             VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)
             ON CONFLICT(id) DO UPDATE SET reminder_id=excluded.reminder_id,kind=excluded.kind,amount=excluded.amount,
               at=excluded.at,void=excluded.void,updated_at=excluded.updated_at,device=excluded.device,rev=excluded.rev",
            params![e.id, e.reminder_id, e.kind, e.amount, e.at, e.void as i64, e.updated_at, e.device, rev],
        )?;
        Ok(())
    }

    pub fn ledger_for(&self, reminder_id: &str) -> Result<Vec<LedgerEntry>> {
        let mut stmt = self.conn.prepare("SELECT * FROM ledger WHERE reminder_id=?1")?;
        let rows = stmt.query_map([reminder_id], row_to_ledger)?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    }

    pub fn total_xp(&self) -> Result<i64> {
        Ok(self
            .conn
            .query_row("SELECT COALESCE(SUM(amount),0) FROM ledger WHERE void=0", [], |r| r.get(0))?)
    }

    /// Seeds and finished reminders per local day for the last `days` days.
    pub fn day_stats(&self, since_ms: i64) -> Result<Vec<(i64, i64, String)>> {
        let mut stmt = self.conn.prepare(
            "SELECT at, amount, kind FROM ledger WHERE void=0 AND at >= ?1 ORDER BY at",
        )?;
        let rows = stmt.query_map([since_ms], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    }

    // ---- sync ----

    pub fn reminders_since(&self, rev: i64) -> Result<Vec<Reminder>> {
        let mut stmt = self.conn.prepare("SELECT * FROM reminders WHERE rev > ?1")?;
        let rows = stmt.query_map([rev], row_to_reminder)?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    }

    pub fn ledger_since(&self, rev: i64) -> Result<Vec<LedgerEntry>> {
        let mut stmt = self.conn.prepare("SELECT * FROM ledger WHERE rev > ?1")?;
        let rows = stmt.query_map([rev], row_to_ledger)?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    }

    /// Applies remote rows that are newer than ours. Returns how many changed.
    pub fn apply_remote(&self, reminders: &[Reminder], ledger: &[LedgerEntry]) -> Result<usize> {
        let mut changed = 0;
        self.conn.execute_batch("BEGIN")?;
        let result = (|| -> Result<()> {
            for r in reminders {
                let mine = self.get_reminder(&r.id)?;
                if mine.is_none_or(|m| newer(r.updated_at, &r.device, m.updated_at, &m.device)) {
                    self.write_reminder(r)?;
                    changed += 1;
                }
            }
            for e in ledger {
                let mine = self
                    .conn
                    .query_row("SELECT * FROM ledger WHERE id=?1", [&e.id], row_to_ledger)
                    .optional()?;
                if mine.is_none_or(|m| newer(e.updated_at, &e.device, m.updated_at, &m.device)) {
                    self.write_ledger(e)?;
                    changed += 1;
                }
            }
            Ok(())
        })();
        match result {
            Ok(()) => self.conn.execute_batch("COMMIT")?,
            Err(e) => {
                self.conn.execute_batch("ROLLBACK")?;
                return Err(e);
            }
        }
        Ok(changed)
    }

    // ---- settings ----

    pub fn setting(&self, key: &str) -> Result<Option<String>> {
        Ok(self
            .conn
            .query_row("SELECT value FROM settings WHERE key=?1", [key], |r| r.get(0))
            .optional()?)
    }

    pub fn set_setting(&self, key: &str, value: &str) -> Result<()> {
        self.conn.execute(
            "INSERT INTO settings(key,value) VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            [key, value],
        )?;
        Ok(())
    }

    pub fn was_notified(&self, key: &str) -> Result<bool> {
        Ok(self
            .conn
            .query_row("SELECT 1 FROM notified WHERE id=?1", [key], |_| Ok(()))
            .optional()?
            .is_some())
    }

    pub fn mark_notified(&self, key: &str) -> Result<()> {
        self.conn
            .execute("INSERT OR IGNORE INTO notified(id,at) VALUES(?1,?2)", params![key, now_ms()])?;
        Ok(())
    }
}
