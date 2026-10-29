//! Reminder state changes that pay out (or take back) seeds.

use anyhow::{Result, anyhow};
use chrono::{Datelike, Duration, NaiveDate, Weekday};
use rand::Rng;

use crate::db::{Db, now_ms};
use crate::model::{LedgerEntry, Reminder, ReminderInput, RewardEvent};
use crate::rewards::{self, MAX_BITS};

pub fn today() -> String {
    chrono::Local::now().format("%Y-%m-%d").to_string()
}

fn parse_date(d: &str) -> Result<NaiveDate> {
    NaiveDate::parse_from_str(d, "%Y-%m-%d").map_err(|e| anyhow!("bad date {d}: {e}"))
}

pub fn next_date(date: &str, repeat: &str) -> Result<String> {
    let d = parse_date(date)?;
    let next = match repeat {
        "daily" => d + Duration::days(1),
        "weekdays" => {
            let mut n = d + Duration::days(1);
            while matches!(n.weekday(), Weekday::Sat | Weekday::Sun) {
                n += Duration::days(1);
            }
            n
        }
        "weekly" => d + Duration::days(7),
        "monthly" => d.checked_add_months(chrono::Months::new(1)).unwrap_or(d + Duration::days(30)),
        other => return Err(anyhow!("unknown repeat {other}")),
    };
    Ok(next.format("%Y-%m-%d").to_string())
}

pub fn upsert(db: &Db, input: ReminderInput) -> Result<Reminder> {
    parse_date(&input.date)?;
    let title = input.title.trim().to_string();
    if title.is_empty() {
        return Err(anyhow!("A reminder needs a name"));
    }
    let mut r = match input.id.as_deref().map(|id| db.get_reminder(id)).transpose()?.flatten() {
        Some(existing) => existing,
        None => {
            let id = uuid::Uuid::new_v4().to_string();
            Reminder {
                series_id: id.clone(),
                id,
                title: String::new(),
                notes: String::new(),
                date: String::new(),
                time: None,
                steps: vec![],
                reward: 10,
                suggested: None,
                status: "open".into(),
                repeat: None,
                bits: 0,
                completed_at: None,
                created_at: now_ms(),
                updated_at: 0,
                device: String::new(),
                deleted: false,
            }
        }
    };
    r.title = title;
    r.notes = input.notes;
    r.date = input.date;
    r.time = input.time.filter(|t| !t.is_empty());
    r.steps = input.steps.into_iter().filter(|s| !s.title.trim().is_empty()).collect();
    r.reward = input.reward.clamp(1, 100);
    r.suggested = input.suggested.or(r.suggested);
    r.repeat = input.repeat.filter(|s| !s.is_empty());
    r.deleted = false;
    db.save_reminder(&mut r)?;
    Ok(r)
}

fn paid(db: &Db, id: &str) -> Result<i64> {
    Ok(db
        .ledger_for(id)?
        .iter()
        .filter(|e| !e.void && (e.kind == "step" || e.kind == "bit"))
        .map(|e| e.amount)
        .sum())
}

fn entry(r: &Reminder, kind: &str, key: Option<&str>, amount: i64, void: bool) -> LedgerEntry {
    let id = match key {
        Some(k) => format!("{}:{kind}:{k}", r.id),
        None => format!("{}:{kind}", r.id),
    };
    LedgerEntry {
        id,
        reminder_id: r.id.clone(),
        kind: kind.into(),
        amount,
        at: now_ms(),
        void,
        updated_at: 0,
        device: String::new(),
    }
}

fn load(db: &Db, id: &str) -> Result<Reminder> {
    db.get_reminder(id)?.ok_or_else(|| anyhow!("That reminder no longer exists"))
}

fn event(db: &Db, kind: &str, gained: i64, bonus: i64, xp_before: i64, r: Reminder) -> Result<RewardEvent> {
    let remaining = if r.status == "done" { 0 } else { rewards::finish_value(&r, paid(db, &r.id)?) };
    Ok(RewardEvent {
        kind: kind.into(),
        gained,
        bonus,
        remaining,
        before: rewards::level_info(xp_before),
        after: rewards::level_info(db.total_xp()?),
        reminder: r,
    })
}

/// Creates the next occurrence of a repeating reminder (idempotent across devices).
fn spawn_next(db: &Db, r: &Reminder) -> Result<()> {
    let Some(repeat) = r.repeat.as_deref() else { return Ok(()) };
    let mut date = next_date(&r.date, repeat)?;
    // Don't create a pile of occurrences in the past if it was finished late.
    let today = today();
    while date < today {
        date = next_date(&date, repeat)?;
    }
    let id = format!("{}@{}", r.series_id, date);
    if db.get_reminder(&id)?.is_some() {
        return Ok(());
    }
    let mut next = r.clone();
    next.id = id;
    next.date = date;
    next.status = "open".into();
    next.bits = 0;
    next.completed_at = None;
    next.created_at = now_ms();
    next.updated_at = 0;
    next.deleted = false;
    for s in &mut next.steps {
        s.done = false;
    }
    db.save_reminder(&mut next)
}

fn finish(db: &Db, r: &mut Reminder, surprise: bool) -> Result<(i64, i64)> {
    let gained = rewards::finish_value(r, paid(db, &r.id)?);
    db.put_ledger(entry(r, "finish", None, gained, false))?;
    let mut bonus = 0;
    if surprise {
        let mut rng = rand::rng();
        if rng.random_bool(0.15) {
            bonus = rng.random_range(2..=(r.reward / 4).max(3));
            db.put_ledger(entry(r, "bonus", None, bonus, false))?;
        }
    }
    r.status = "done".into();
    r.completed_at = Some(now_ms());
    for s in &mut r.steps {
        s.done = true;
    }
    db.save_reminder(r)?;
    spawn_next(db, r)?;
    Ok((gained, bonus))
}

fn unfinish(db: &Db, r: &mut Reminder) -> Result<()> {
    for kind in ["finish", "bonus"] {
        db.put_ledger(entry(r, kind, None, 0, true))?;
    }
    r.status = "open".into();
    r.completed_at = None;
    Ok(())
}

pub fn toggle_step(db: &Db, id: &str, step_id: &str, done: bool, surprise: bool) -> Result<RewardEvent> {
    let xp_before = db.total_xp()?;
    let mut r = load(db, id)?;
    let value = rewards::step_value(&r);
    let step = r
        .steps
        .iter_mut()
        .find(|s| s.id == step_id)
        .ok_or_else(|| anyhow!("That step no longer exists"))?;
    if step.done == done {
        return event(db, "none", 0, 0, xp_before, r);
    }
    step.done = done;
    if done {
        db.put_ledger(entry(&r, "step", Some(step_id), value, false))?;
        if r.steps.iter().all(|s| s.done) && r.status != "done" {
            let (gained, bonus) = finish(db, &mut r, surprise)?;
            return event(db, "finish", value + gained, bonus, xp_before, r);
        }
        db.save_reminder(&mut r)?;
        event(db, "step", value, 0, xp_before, r)
    } else {
        db.put_ledger(entry(&r, "step", Some(step_id), 0, true))?;
        if r.status == "done" {
            unfinish(db, &mut r)?;
        }
        db.save_reminder(&mut r)?;
        event(db, "undo", -value, 0, xp_before, r)
    }
}

pub fn did_a_bit(db: &Db, id: &str) -> Result<RewardEvent> {
    let xp_before = db.total_xp()?;
    let mut r = load(db, id)?;
    if r.status == "done" || r.bits >= MAX_BITS {
        return event(db, "none", 0, 0, xp_before, r);
    }
    r.bits += 1;
    let value = rewards::bit_value(&r);
    db.put_ledger(entry(&r, "bit", Some(&r.bits.to_string()), value, false))?;
    db.save_reminder(&mut r)?;
    event(db, "bit", value, 0, xp_before, r)
}

pub fn complete(db: &Db, id: &str, surprise: bool) -> Result<RewardEvent> {
    let xp_before = db.total_xp()?;
    let mut r = load(db, id)?;
    if r.status == "done" {
        return event(db, "none", 0, 0, xp_before, r);
    }
    let (gained, bonus) = finish(db, &mut r, surprise)?;
    event(db, "finish", gained, bonus, xp_before, r)
}

pub fn reopen(db: &Db, id: &str) -> Result<RewardEvent> {
    let xp_before = db.total_xp()?;
    let mut r = load(db, id)?;
    if r.status != "done" {
        return event(db, "none", 0, 0, xp_before, r);
    }
    unfinish(db, &mut r)?;
    // Steps that were only ticked by "finish" were never paid; untick those.
    let paid_steps: Vec<String> = db
        .ledger_for(&r.id)?
        .into_iter()
        .filter(|e| e.kind == "step" && !e.void)
        .map(|e| e.id)
        .collect();
    for s in &mut r.steps {
        s.done = paid_steps.contains(&format!("{}:step:{}", r.id, s.id));
    }
    db.save_reminder(&mut r)?;
    let after = db.total_xp()?;
    event(db, "undo", after - xp_before, 0, xp_before, r)
}

pub fn move_to(db: &Db, id: &str, date: &str) -> Result<Reminder> {
    parse_date(date)?;
    let mut r = load(db, id)?;
    r.date = date.to_string();
    db.save_reminder(&mut r)?;
    Ok(r)
}

pub fn delete(db: &Db, id: &str) -> Result<()> {
    let mut r = load(db, id)?;
    r.deleted = true;
    db.save_reminder(&mut r)?;
    // Seeds already earned stay earned — deleting is not a punishment.
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::Step;

    fn db() -> Db {
        Db::open(std::path::Path::new(":memory:")).unwrap()
    }

    fn input(steps: usize) -> ReminderInput {
        ReminderInput {
            id: None,
            title: "Clean kitchen".into(),
            notes: String::new(),
            date: today(),
            time: None,
            steps: (0..steps)
                .map(|i| Step { id: format!("s{i}"), title: format!("step {i}"), done: false })
                .collect(),
            reward: 30,
            suggested: Some(25),
            repeat: None,
        }
    }

    #[test]
    fn steps_then_finish_pay_full_reward() {
        let db = db();
        let r = upsert(&db, input(3)).unwrap();
        let a = toggle_step(&db, &r.id, "s0", true, false).unwrap();
        assert_eq!(a.gained, 6);
        assert_eq!(a.remaining, 24);
        toggle_step(&db, &r.id, "s1", true, false).unwrap();
        let c = toggle_step(&db, &r.id, "s2", true, false).unwrap();
        assert_eq!(c.kind, "finish");
        assert_eq!(db.total_xp().unwrap(), 30);
    }

    #[test]
    fn untick_takes_back_and_reopens() {
        let db = db();
        let r = upsert(&db, input(2)).unwrap();
        toggle_step(&db, &r.id, "s0", true, false).unwrap();
        toggle_step(&db, &r.id, "s1", true, false).unwrap();
        assert_eq!(db.total_xp().unwrap(), 30);
        let u = toggle_step(&db, &r.id, "s1", false, false).unwrap();
        assert_eq!(u.reminder.status, "open");
        assert_eq!(db.total_xp().unwrap(), 9);
    }

    #[test]
    fn bits_and_complete() {
        let db = db();
        let r = upsert(&db, input(0)).unwrap();
        did_a_bit(&db, &r.id).unwrap();
        let e = complete(&db, &r.id, false).unwrap();
        assert_eq!(e.gained, 26);
        assert_eq!(db.total_xp().unwrap(), 30);
        reopen(&db, &r.id).unwrap();
        assert_eq!(db.total_xp().unwrap(), 4);
    }

    #[test]
    fn repeating_spawns_next_once() {
        let db = db();
        let mut i = input(1);
        i.repeat = Some("daily".into());
        let r = upsert(&db, i).unwrap();
        complete(&db, &r.id, false).unwrap();
        reopen(&db, &r.id).unwrap();
        complete(&db, &r.id, false).unwrap();
        let all = db.reminders_live("0000-00-00").unwrap();
        assert_eq!(all.len(), 2);
        assert!(all.iter().any(|x| x.status == "open" && x.steps.iter().all(|s| !s.done)));
    }

    #[test]
    fn sync_merges_last_writer_wins() {
        let a = db();
        let b = db();
        let r = upsert(&a, input(1)).unwrap();
        b.apply_remote(&a.reminders_since(0).unwrap(), &a.ledger_since(0).unwrap()).unwrap();
        complete(&b, &r.id, false).unwrap();
        a.apply_remote(&b.reminders_since(0).unwrap(), &b.ledger_since(0).unwrap()).unwrap();
        assert_eq!(a.get_reminder(&r.id).unwrap().unwrap().status, "done");
        assert_eq!(a.total_xp().unwrap(), b.total_xp().unwrap());
        // Re-applying is a no-op.
        assert_eq!(a.apply_remote(&b.reminders_since(0).unwrap(), &b.ledger_since(0).unwrap()).unwrap(), 0);
    }
}
