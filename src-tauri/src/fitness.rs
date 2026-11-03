//! Seeds for moving, read from Health Connect on the phone.
//!
//! - Steps: the user picks a daily goal and what reaching it is worth. Quarter-way milestones
//!   pay a little, the goal pays the rest, and going past it keeps paying up to double.
//! - Exercise: the same for active minutes a day, plus a couple of seeds for each workout.
//! - Exercise tasks: reminders with an exercise target tick themselves off when a matching
//!   workout shows up.
//!
//! Ledger ids are fixed per day/milestone and per workout, so reading the same data again
//! (or on two phones) never pays twice. Seeds earned here are never taken back.

use std::collections::BTreeMap;

use anyhow::Result;
use chrono::{Local, NaiveDate, TimeZone};
use serde::{Deserialize, Serialize};

use crate::actions;
use crate::db::{Db, now_ms};
use crate::meds;
use crate::model::{LedgerEntry, RewardEvent};

/// Shorter sessions are usually accidental starts.
const MIN_WORKOUT_MINUTES: i64 = 5;
/// For showing up, per workout.
pub const WORKOUT_SEEDS: i64 = 2;

/// `(percent of goal, seeds)`. Mirrored in src/lib/fitness.ts.
fn milestones(reward: i64, lead: &[i64], lead_share: f64, over: &[i64], over_share: f64) -> Vec<(i64, i64)> {
    let each = |share: f64| ((reward as f64 * share).round() as i64).max(1);
    let mut out: Vec<(i64, i64)> = lead.iter().map(|&p| (p, each(lead_share))).collect();
    let lead_total: i64 = out.iter().map(|m| m.1).sum();
    out.push((100, (reward - lead_total).max(1)));
    out.extend(over.iter().map(|&p| (p, each(over_share))));
    out
}

pub fn step_milestones(reward: i64) -> Vec<(i64, i64)> {
    milestones(reward, &[25, 50, 75], 0.15, &[125, 150, 175, 200], 0.1)
}

pub fn minute_milestones(reward: i64) -> Vec<(i64, i64)> {
    milestones(reward, &[50], 0.3, &[150, 200], 0.15)
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
    /// Health Connect exercise type.
    #[serde(default)]
    pub kind: i64,
    /// What to call it, e.g. "Morning run" or "Yoga".
    pub label: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Goals {
    pub steps: i64,
    pub step_seeds: i64,
    /// Active minutes a day.
    pub minutes: i64,
    pub minute_seeds: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FitInput {
    /// Nothing before this day pays: connecting doesn't dump a backlog of seeds.
    pub since: String,
    pub goals: Goals,
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
    /// Workout ids that count (a copy logged by a second app doesn't).
    pub counted: Vec<String>,
    /// Exercise tasks that just ticked themselves off.
    pub completed: Vec<RewardEvent>,
}

fn paid_ids(db: &Db, subject: &str) -> Result<Vec<String>> {
    Ok(db.ledger_for(subject)?.into_iter().map(|e| e.id).collect())
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

/// Pays each milestone `value` has reached that isn't paid yet. Returns the seeds paid.
fn pay_milestones(db: &Db, subject: &str, kind: &str, value: i64, goal: i64, plan: &[(i64, i64)], at: i64) -> Result<i64> {
    let paid = paid_ids(db, subject)?;
    let mut total = 0;
    for &(pct, seeds) in plan {
        let id = format!("{subject}:p{pct}");
        if value * 100 >= goal * pct && !paid.contains(&id) {
            pay(db, subject, &id, kind, seeds, at)?;
            total += seeds;
        }
    }
    Ok(total)
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

fn local_day(ms: i64) -> String {
    Local.timestamp_millis_opt(ms).single().map(|d| d.format("%Y-%m-%d").to_string()).unwrap_or_default()
}

fn minutes(w: &FitWorkout) -> i64 {
    (w.end - w.start) / 60_000
}

fn overlap(a: &FitWorkout, b: &FitWorkout) -> i64 {
    (a.end.min(b.end) - a.start.max(b.start)).max(0)
}

fn when(date: NaiveDate, today: NaiveDate) -> String {
    if date == today { "today".into() } else { format!("on {}", date.format("%A")) }
}

pub fn award(db: &Db, input: FitInput, surprise: bool) -> Result<FitResult> {
    let xp_before = db.total_xp()?;
    let now = now_ms();
    let today = Local::now().date_naive();
    let since = NaiveDate::parse_from_str(&input.since, "%Y-%m-%d").unwrap_or(today);
    let since_ms = meds::local_ms(&input.since, "00:00");
    let g = &input.goals;
    let step_goal = g.steps.clamp(500, 100_000);
    let minute_goal = g.minutes.clamp(5, 600);
    let step_plan = step_milestones(g.step_seeds.clamp(1, 200));
    let minute_plan = minute_milestones(g.minute_seeds.clamp(1, 200));
    let mut earned = vec![];
    let mut gained = 0;
    // Count seeds on the day they were earned, not the day Tend happened to look.
    let day_at = |d: NaiveDate| if d == today { now } else { meds::local_ms(&d.format("%Y-%m-%d").to_string(), "23:59") };
    let in_range = |d: NaiveDate| d >= since && d <= today;

    // ---- steps ----
    for day in &input.days {
        let Ok(date) = NaiveDate::parse_from_str(&day.date, "%Y-%m-%d") else { continue };
        if !in_range(date) {
            continue;
        }
        let subject = format!("fit:steps:{}", day.date);
        // Days 0.2.3 already paid on fixed step counts stay as they were.
        if paid_ids(db, &subject)?.iter().any(|id| !id.contains(":p")) {
            continue;
        }
        let amount = pay_milestones(db, &subject, "steps", day.steps, step_goal, &step_plan, day_at(date))?;
        if amount > 0 {
            let reached = if day.steps >= step_goal { ", goal reached" } else { "" };
            earned.push(Earned { label: format!("{} steps {}{reached}", thousands(day.steps), when(date, today)), amount });
            gained += amount;
        }
    }

    // ---- workouts ----
    // Two apps can log the same workout. Keep what's already paid, then the rest by start
    // time, and skip anything that mostly overlaps a workout already kept.
    let mut workouts: Vec<(bool, FitWorkout)> = vec![];
    for w in input.workouts {
        if w.end < since_ms || w.end > now + 60_000 || minutes(&w) < MIN_WORKOUT_MINUTES {
            continue;
        }
        let subject = format!("fit:workout:{}", w.id);
        let done = paid_ids(db, &subject)?.contains(&format!("{subject}:workout"));
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
            pay(db, &subject, &format!("{subject}:workout"), "workout", WORKOUT_SEEDS, w.end.min(now))?;
            earned.push(Earned { label: format!("{}, {} min", w.label, minutes(&w)), amount: WORKOUT_SEEDS });
            gained += WORKOUT_SEEDS;
        }
        kept.push(w);
    }

    // ---- active minutes ----
    let mut per_day: BTreeMap<String, i64> = BTreeMap::new();
    for w in &kept {
        *per_day.entry(local_day(w.start)).or_default() += minutes(w);
    }
    for (day, mins) in &per_day {
        let Ok(date) = NaiveDate::parse_from_str(day, "%Y-%m-%d") else { continue };
        if !in_range(date) || paid_ids(db, &format!("fit:steps:{day}"))?.iter().any(|id| !id.contains(":p")) {
            continue;
        }
        let subject = format!("fit:move:{day}");
        let amount = pay_milestones(db, &subject, "move", *mins, minute_goal, &minute_plan, day_at(date))?;
        if amount > 0 {
            let reached = if *mins >= minute_goal { ", goal reached" } else { "" };
            earned.push(Earned { label: format!("{mins} active minutes {}{reached}", when(date, today)), amount });
            gained += amount;
        }
    }

    let title = match earned.as_slice() {
        [one] => one.label.clone(),
        _ => "Moving".into(),
    };
    let kind = if gained > 0 { "bit" } else { "none" };
    let event = meds::event(db, kind, gained, 0, xp_before, "fit", &title)?;

    // ---- exercise tasks ----
    let mut completed = vec![];
    let horizon = (today - chrono::Duration::days(45)).format("%Y-%m-%d").to_string();
    for r in db.reminders_live(&horizon)? {
        let Some(ex) = &r.exercise else { continue };
        if r.status != "open" || r.date.as_str() > today.format("%Y-%m-%d").to_string().as_str() {
            continue;
        }
        // Enough matching minutes on one day, on or after the day it was planned for.
        let mut by_day: BTreeMap<String, i64> = BTreeMap::new();
        for w in kept.iter().filter(|w| ex.types.is_empty() || ex.types.contains(&w.kind)) {
            let day = local_day(w.start);
            if day >= r.date {
                *by_day.entry(day).or_default() += minutes(w);
            }
        }
        if by_day.values().any(|&m| m >= ex.minutes) {
            completed.push(actions::complete(db, &r.id, surprise)?);
        }
    }

    Ok(FitResult { event, earned, counted: kept.into_iter().map(|w| w.id).collect(), completed })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{Exercise, ReminderInput};

    fn db() -> Db {
        Db::open(std::path::Path::new(":memory:")).unwrap()
    }

    fn today() -> String {
        Local::now().format("%Y-%m-%d").to_string()
    }

    fn goals() -> Goals {
        Goals { steps: 8_000, step_seeds: 20, minutes: 30, minute_seeds: 10 }
    }

    fn input(steps: i64, workouts: Vec<FitWorkout>) -> FitInput {
        FitInput { since: today(), goals: goals(), days: vec![FitDay { date: today(), steps }], workouts }
    }

    fn workout(id: &str, kind: i64, start_min_ago: i64, minutes: i64) -> FitWorkout {
        let start = now_ms() - start_min_ago * 60_000;
        FitWorkout { id: id.into(), start, end: start + minutes * 60_000, kind, label: "Run".into() }
    }

    #[test]
    fn plans_add_up_to_the_reward_at_the_goal() {
        let p = step_milestones(20);
        assert_eq!(p.iter().filter(|m| m.0 <= 100).map(|m| m.1).sum::<i64>(), 20);
        assert_eq!(p.last().unwrap(), &(200, 2));
        let m = minute_milestones(10);
        assert_eq!(m.iter().filter(|x| x.0 <= 100).map(|x| x.1).sum::<i64>(), 10);
    }

    #[test]
    fn steps_pay_toward_the_goal_and_beyond_once() {
        let db = db();
        // 25% and 50% of 8,000: 3 + 3.
        assert_eq!(award(&db, input(4_000, vec![]), false).unwrap().event.gained, 6);
        assert_eq!(award(&db, input(4_100, vec![]), false).unwrap().event.gained, 0);
        // 75% (3) and the goal (20 - 9 = 11) and 125% (2).
        assert_eq!(award(&db, input(10_000, vec![]), false).unwrap().event.gained, 16);
        // Way past double: only up to 200%.
        assert_eq!(award(&db, input(50_000, vec![]), false).unwrap().event.gained, 6);
        assert_eq!(award(&db, input(60_000, vec![]), false).unwrap().event.gained, 0);
    }

    #[test]
    fn nothing_before_connecting() {
        let db = db();
        let old = (Local::now() - chrono::Duration::days(2)).format("%Y-%m-%d").to_string();
        let i = FitInput { since: today(), goals: goals(), days: vec![FitDay { date: old, steps: 20_000 }], workouts: vec![] };
        assert_eq!(award(&db, i, false).unwrap().event.gained, 0);
    }

    #[test]
    fn workouts_count_once_and_add_up_to_minutes() {
        let db = db();
        let a = workout("a", 56, 120, 20);
        let dup = workout("b", 56, 118, 18);
        let b = workout("c", 79, 60, 20);
        let r = award(&db, input(0, vec![a.clone(), dup.clone(), b]), false).unwrap();
        // Two workouts (2 each), 40 of 30 minutes: 50% (3) + goal (7).
        assert_eq!(r.event.gained, 2 + 2 + 3 + 7);
        assert_eq!(r.counted.len(), 2);
        assert_eq!(award(&db, input(0, vec![dup, a]), false).unwrap().event.gained, 0);
    }

    #[test]
    fn exercise_task_ticks_itself_off() {
        let db = db();
        let task = |types: Vec<i64>, minutes: i64| {
            actions::upsert(
                &db,
                ReminderInput {
                    id: None,
                    title: "Go for a run".into(),
                    notes: String::new(),
                    date: today(),
                    time: None,
                    steps: vec![],
                    reward: 15,
                    suggested: None,
                    repeat: None,
                    exercise: Some(Exercise { types, minutes }),
                },
            )
            .unwrap()
        };
        let run = task(vec![56, 57], 20);
        let yoga = task(vec![83], 10);
        let r = award(&db, input(0, vec![workout("w", 56, 40, 25)]), false).unwrap();
        assert_eq!(r.completed.len(), 1);
        assert_eq!(r.completed[0].reminder.id, run.id);
        assert_eq!(db.get_reminder(&yoga.id).unwrap().unwrap().status, "open");
    }
}
