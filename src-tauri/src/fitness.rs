//! Seeds for moving: daily step milestones and logged workouts, read from Health Connect on
//! the phone. Ledger ids are fixed per day/milestone and per workout, so reading the same data
//! again (or on two phones) never pays twice. Seeds earned here are never taken back.

use anyhow::Result;
use chrono::{Local, NaiveDate};
use serde::{Deserialize, Serialize};

use crate::db::{Db, now_ms};
use crate::meds;
use crate::model::{LedgerEntry, RewardEvent};

/// `(steps, seeds)`: each milestone pays once per day. Mirrored in src/lib/fitness.ts.
pub const STEP_TIERS: [(i64, i64); 6] = [(2_000, 3), (4_000, 3), (6_000, 4), (8_000, 5), (10_000, 5), (15_000, 5)];
/// Shorter sessions are usually accidental starts.
const MIN_WORKOUT_MINUTES: i64 = 5;
const MAX_WORKOUT_SEEDS: i64 = 20;

/// 3 seeds for showing up, plus one per 5 minutes, up to 20.
pub fn workout_seeds(minutes: i64) -> i64 {
    if minutes < MIN_WORKOUT_MINUTES {
        return 0;
    }
    (3 + minutes / 5).min(MAX_WORKOUT_SEEDS)
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FitDay {
    /// Local day, `YYYY-MM-DD`.
    pub date: String,
    pub steps: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FitWorkout {
    pub id: String,
    pub start: i64,
    pub end: i64,
    /// What to call it, e.g. "Morning run" or "Yoga".
    pub label: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FitInput {
    /// Nothing before this day pays: connecting doesn't dump a backlog of seeds.
    pub since: String,
    #[serde(default)]
    pub days: Vec<FitDay>,
    #[serde(default)]
    pub workouts: Vec<FitWorkout>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Earned {
    pub label: String,
    pub amount: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FitResult {
    pub event: RewardEvent,
    pub earned: Vec<Earned>,
    /// Workout ids that earn seeds (paid now or before), so the UI can show what counted.
    pub counted: Vec<String>,
}

fn paid(db: &Db, subject: &str, id: &str) -> Result<bool> {
    Ok(db.ledger_for(subject)?.iter().any(|e| e.id == id))
}

fn pay(db: &Db, subject: &str, id: &str, kind: &str, amount: i64, at: i64) -> Result<()> {
    db.put_ledger(LedgerEntry {
        id: id.into(),
        reminder_id: subject.into(),
        kind: kind.into(),
        amount,
        at,
        void: false,
        updated_at: 0,
        device: String::new(),
    })
}

fn thousands(n: i64) -> String {
    let s = n.to_string();
    let mut out = String::new();
    for (i, c) in s.chars().enumerate() {
        if i > 0 && (s.len() - i) % 3 == 0 {
            out.push(',');
        }
        out.push(c);
    }
    out
}

fn overlap(a: &FitWorkout, b: &FitWorkout) -> i64 {
    (a.end.min(b.end) - a.start.max(b.start)).max(0)
}

pub fn award(db: &Db, input: FitInput) -> Result<FitResult> {
    let xp_before = db.total_xp()?;
    let now = now_ms();
    let today = Local::now().date_naive();
    let since = NaiveDate::parse_from_str(&input.since, "%Y-%m-%d").unwrap_or(today);
    let since_ms = meds::local_ms(&input.since, "00:00");
    let mut earned = vec![];
    let mut gained = 0;

    for day in &input.days {
        let Ok(date) = NaiveDate::parse_from_str(&day.date, "%Y-%m-%d") else { continue };
        if date < since || date > today {
            continue;
        }
        let subject = format!("fit:steps:{}", day.date);
        // Count the seeds on the day they were walked, not the day Tend happened to look.
        let at = if date == today { now } else { meds::local_ms(&day.date, "23:59") };
        let mut amount = 0;
        for (threshold, seeds) in STEP_TIERS {
            let id = format!("{subject}:{threshold}");
            if day.steps >= threshold && !paid(db, &subject, &id)? {
                pay(db, &subject, &id, "steps", seeds, at)?;
                amount += seeds;
            }
        }
        if amount > 0 {
            let when = if date == today { "today".to_string() } else { format!("on {}", date.format("%A")) };
            earned.push(Earned { label: format!("{} steps {when}", thousands(day.steps)), amount });
            gained += amount;
        }
    }

    // Two apps can log the same workout. Keep what's already paid, then the rest by start
    // time, and skip anything that mostly overlaps a workout already kept.
    let mut workouts: Vec<(bool, FitWorkout)> = vec![];
    for w in input.workouts {
        if w.end < since_ms || w.end > now + 60_000 || workout_seeds((w.end - w.start) / 60_000) == 0 {
            continue;
        }
        let subject = format!("fit:workout:{}", w.id);
        let done = paid(db, &subject, &format!("{subject}:workout"))?;
        workouts.push((done, w));
    }
    workouts.sort_by_key(|(done, w)| (!*done, w.start));
    let mut kept: Vec<FitWorkout> = vec![];
    for (done, w) in workouts {
        let shorter = |o: &FitWorkout| (w.end - w.start).min(o.end - o.start).max(1);
        if kept.iter().any(|k| overlap(&w, k) * 2 > shorter(k)) {
            continue;
        }
        if !done {
            let subject = format!("fit:workout:{}", w.id);
            let minutes = (w.end - w.start) / 60_000;
            let seeds = workout_seeds(minutes);
            pay(db, &subject, &format!("{subject}:workout"), "workout", seeds, w.end.min(now))?;
            earned.push(Earned { label: format!("{}, {minutes} min", w.label), amount: seeds });
            gained += seeds;
        }
        kept.push(w);
    }

    let title = match earned.as_slice() {
        [one] => one.label.clone(),
        _ => "Moving".into(),
    };
    let kind = if gained > 0 { "bit" } else { "none" };
    Ok(FitResult {
        event: meds::event(db, kind, gained, 0, xp_before, "fit", &title)?,
        earned,
        counted: kept.into_iter().map(|w| w.id).collect(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn db() -> Db {
        let dir = std::env::temp_dir().join(format!("tend-fit-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        Db::open(&dir.join("t.db")).unwrap()
    }

    fn today() -> String {
        Local::now().format("%Y-%m-%d").to_string()
    }

    fn input(steps: i64, workouts: Vec<FitWorkout>) -> FitInput {
        FitInput { since: today(), days: vec![FitDay { date: today(), steps }], workouts }
    }

    fn workout(id: &str, start_min_ago: i64, minutes: i64) -> FitWorkout {
        let start = now_ms() - start_min_ago * 60_000;
        FitWorkout { id: id.into(), start, end: start + minutes * 60_000, label: "Run".into() }
    }

    #[test]
    fn steps_pay_each_milestone_once() {
        let db = db();
        assert_eq!(award(&db, input(4_500, vec![])).unwrap().event.gained, 6);
        assert_eq!(award(&db, input(4_600, vec![])).unwrap().event.gained, 0);
        assert_eq!(award(&db, input(10_000, vec![])).unwrap().event.gained, 14);
        assert_eq!(db.total_xp().unwrap(), 20);
    }

    #[test]
    fn nothing_before_connecting() {
        let db = db();
        let old = (Local::now() - chrono::Duration::days(2)).format("%Y-%m-%d").to_string();
        let r = award(&db, FitInput { since: today(), days: vec![FitDay { date: old, steps: 20_000 }], workouts: vec![] }).unwrap();
        assert_eq!(r.event.gained, 0);
    }

    #[test]
    fn workouts_pay_once_and_skip_duplicates() {
        let db = db();
        let a = workout("a", 90, 30);
        let dup = workout("b", 88, 28);
        let short = workout("c", 20, 3);
        let r = award(&db, input(0, vec![a.clone(), dup.clone(), short])).unwrap();
        assert_eq!(r.event.gained, workout_seeds(30));
        assert_eq!(r.counted, vec!["a".to_string()]);
        // The duplicate showing up first next time still doesn't pay.
        let r = award(&db, input(0, vec![dup, a])).unwrap();
        assert_eq!(r.event.gained, 0);
    }

    #[test]
    fn workout_scale() {
        assert_eq!(workout_seeds(4), 0);
        assert_eq!(workout_seeds(5), 4);
        assert_eq!(workout_seeds(30), 9);
        assert_eq!(workout_seeds(300), 20);
    }

    #[test]
    fn number_format() {
        assert_eq!(thousands(950), "950");
        assert_eq!(thousands(12_345), "12,345");
    }
}
