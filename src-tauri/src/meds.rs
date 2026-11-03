//! Medication tracking: medications with schedules, logged doses, stock, and a health diary
//! (measurements, symptoms, mood). Everything is stored as synced `items`.
//!
//! Scheduled doses are never stored ahead of time. A dose slot is computed from the schedule
//! and only becomes a record once it's taken or skipped, so editing a schedule never leaves
//! stale rows behind. Slot ids are `{med}@{YYYY-MM-DD}T{HH:MM}`; extra (as-needed) doses
//! add `~{random}` so several can share a minute.

use anyhow::{Result, anyhow};
use chrono::{Datelike, Duration, Local, NaiveDate, NaiveTime, TimeZone};
use serde::{Deserialize, Serialize, de::DeserializeOwned};

use crate::db::{Db, Item, now_ms};
use crate::model::{LedgerEntry, Reminder, RewardEvent};
use crate::rewards;

const MED: &str = "med";
const DOSE: &str = "dose";
const ENTRY: &str = "entry";

/// Seeds for taking a dose, plus a little extra within an hour of its time.
pub const DEFAULT_DOSE_REWARD: i64 = 5;
pub const ON_TIME_BONUS: i64 = 2;
const ON_TIME_WINDOW_MS: i64 = 60 * 60 * 1000;
/// Seeds for writing something in the health diary.
pub const ENTRY_REWARD: i64 = 2;

fn one() -> f64 {
    1.0
}
fn one_i() -> i64 {
    1
}
fn default_reward() -> i64 {
    DEFAULT_DOSE_REWARD
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DoseTime {
    /// `HH:MM`
    pub time: String,
    #[serde(default = "one")]
    pub amount: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Schedule {
    /// `daily` | `interval` (every N days) | `weekdays` | `cycle` (N on, M off) | `asNeeded`
    pub kind: String,
    #[serde(default = "one_i")]
    pub every: i64,
    /// Days of the week for `weekdays`, 0 = Monday.
    #[serde(default)]
    pub days: Vec<u32>,
    #[serde(default)]
    pub on_days: i64,
    #[serde(default)]
    pub off_days: i64,
    #[serde(default)]
    pub times: Vec<DoseTime>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Med {
    pub id: String,
    pub name: String,
    /// e.g. "20 mg"
    #[serde(default)]
    pub strength: String,
    /// Unit of one dose: `pill`, `capsule`, `drop`, `ml`, `puff`…
    pub form: String,
    /// Shape shown in the app: `round`, `oval`, `capsule`, `drop`, `bottle`, `syringe`…
    pub icon: String,
    pub color: String,
    /// Intake advice, e.g. "with food".
    #[serde(default)]
    pub notes: String,
    pub schedule: Schedule,
    pub start_date: String,
    #[serde(default)]
    pub end_date: Option<String>,
    /// Stock counted at `stock_at`; doses taken since then are subtracted.
    #[serde(default)]
    pub stock: Option<f64>,
    #[serde(default)]
    pub stock_at: i64,
    /// Warn when this many or fewer are left.
    #[serde(default)]
    pub refill_at: Option<f64>,
    #[serde(default)]
    pub paused: bool,
    /// Reminds even during quiet hours.
    #[serde(default)]
    pub critical: bool,
    #[serde(default = "default_reward")]
    pub reward: i64,
    #[serde(default)]
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Dose {
    pub id: String,
    pub med_id: String,
    pub date: String,
    pub time: String,
    pub amount: f64,
    /// `taken` | `skipped`
    pub status: String,
    /// When it was logged (epoch ms).
    pub at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub id: String,
    /// `measurement` | `symptom` | `mood`
    pub kind: String,
    /// "Blood pressure", "Headache", "Mood"…
    pub name: String,
    /// The reading, severity (1–4) or mood (1–5).
    pub value: f64,
    /// Second number where a reading has two (diastolic blood pressure).
    #[serde(default)]
    pub value2: Option<f64>,
    #[serde(default)]
    pub unit: String,
    #[serde(default)]
    pub note: String,
    pub at: i64,
}

/// A dose as the app shows it: scheduled (from a med's schedule) or logged.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DoseSlot {
    pub id: String,
    pub med_id: String,
    pub name: String,
    pub date: String,
    pub time: String,
    pub amount: f64,
    pub form: String,
    /// `upcoming` | `due` | `taken` | `skipped`
    pub status: String,
    /// Epoch ms the slot is scheduled for.
    pub due_at: i64,
    /// When it was taken or skipped.
    pub logged_at: Option<i64>,
    pub critical: bool,
    pub extra: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MedView {
    #[serde(flatten)]
    pub med: Med,
    /// Units left right now, if stock is tracked.
    pub left: Option<f64>,
    pub days_left: Option<f64>,
    pub low: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DayAdherence {
    pub date: String,
    pub scheduled: i64,
    pub taken: i64,
    pub skipped: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MedInput {
    pub id: Option<String>,
    pub name: String,
    #[serde(default)]
    pub strength: String,
    pub form: String,
    pub icon: String,
    pub color: String,
    #[serde(default)]
    pub notes: String,
    pub schedule: Schedule,
    pub start_date: String,
    #[serde(default)]
    pub end_date: Option<String>,
    /// Units on hand now. Changing it recounts the stock from this moment.
    #[serde(default)]
    pub stock: Option<f64>,
    #[serde(default)]
    pub refill_at: Option<f64>,
    #[serde(default)]
    pub paused: bool,
    #[serde(default)]
    pub critical: bool,
    #[serde(default = "default_reward")]
    pub reward: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthExport {
    pub app: String,
    pub version: u32,
    pub meds: Vec<Med>,
    #[serde(default)]
    pub doses: Vec<Dose>,
    #[serde(default)]
    pub entries: Vec<Entry>,
}

// ---- storage -------------------------------------------------------------------------------

fn put<T: Serialize>(db: &Db, kind: &str, id: &str, k1: &str, k2: &str, value: &T, deleted: bool) -> Result<()> {
    let mut it = Item {
        kind: kind.into(),
        id: id.into(),
        k1: k1.into(),
        k2: k2.into(),
        data: serde_json::to_value(value)?,
        updated_at: 0,
        device: String::new(),
        deleted,
    };
    db.put_item(&mut it)
}

fn parse<T: DeserializeOwned>(it: &Item) -> Option<T> {
    serde_json::from_value(it.data.clone()).ok()
}

fn save_med(db: &Db, m: &Med) -> Result<()> {
    put(db, MED, &m.id, "", "", m, false)
}

fn save_dose(db: &Db, d: &Dose, deleted: bool) -> Result<()> {
    put(db, DOSE, &d.id, &d.med_id, &d.date, d, deleted)
}

fn entry_day(at: i64) -> String {
    Local.timestamp_millis_opt(at).single().map(|d| d.format("%Y-%m-%d").to_string()).unwrap_or_default()
}

fn save_entry_item(db: &Db, e: &Entry, deleted: bool) -> Result<()> {
    put(db, ENTRY, &e.id, &e.kind, &entry_day(e.at), e, deleted)
}

pub fn meds(db: &Db) -> Result<Vec<Med>> {
    let mut out: Vec<Med> = db.items(MED, None, None)?.iter().filter_map(parse).collect();
    out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(out)
}

pub fn get_med(db: &Db, id: &str) -> Result<Med> {
    db.get_item(MED, id)?
        .filter(|it| !it.deleted)
        .and_then(|it| parse(&it))
        .ok_or_else(|| anyhow!("That medication no longer exists"))
}

fn doses_for(db: &Db, med_id: &str, from: &str, to: &str) -> Result<Vec<Dose>> {
    Ok(db.items(DOSE, Some(med_id), Some((from, to)))?.iter().filter_map(parse).collect())
}

fn get_dose(db: &Db, id: &str) -> Result<Option<Dose>> {
    Ok(db.get_item(DOSE, id)?.filter(|it| !it.deleted).and_then(|it| parse(&it)))
}

pub fn entries(db: &Db, since_date: &str) -> Result<Vec<Entry>> {
    let mut out: Vec<Entry> = ["measurement", "symptom", "mood"]
        .iter()
        .map(|k| db.items(ENTRY, Some(k), Some((since_date, "9999"))))
        .collect::<Result<Vec<_>>>()?
        .into_iter()
        .flatten()
        .filter_map(|it| parse(&it))
        .collect();
    out.sort_by_key(|e: &Entry| std::cmp::Reverse(e.at));
    Ok(out)
}

// ---- schedules -----------------------------------------------------------------------------

fn date(s: &str) -> Result<NaiveDate> {
    NaiveDate::parse_from_str(s, "%Y-%m-%d").map_err(|_| anyhow!("bad date {s}"))
}

fn ymd(d: NaiveDate) -> String {
    d.format("%Y-%m-%d").to_string()
}

fn valid_time(t: &str) -> bool {
    NaiveTime::parse_from_str(t, "%H:%M").is_ok()
}

/// Local epoch ms for a date + `HH:MM`.
pub fn local_ms(d: &str, t: &str) -> i64 {
    let (Ok(d), Ok(t)) = (date(d), NaiveTime::parse_from_str(t.get(..5).unwrap_or(t), "%H:%M")) else {
        return 0;
    };
    Local.from_local_datetime(&d.and_time(t)).earliest().map_or(0, |x| x.timestamp_millis())
}

pub fn scheduled_on(m: &Med, d: NaiveDate) -> bool {
    let Ok(start) = date(&m.start_date) else { return false };
    if m.paused || d < start || m.end_date.as_deref().and_then(|e| date(e).ok()).is_some_and(|end| d > end) {
        return false;
    }
    let since = (d - start).num_days();
    let s = &m.schedule;
    match s.kind.as_str() {
        "daily" => true,
        "interval" => since % s.every.max(1) == 0,
        "weekdays" => s.days.contains(&d.weekday().num_days_from_monday()),
        "cycle" => since % (s.on_days.max(1) + s.off_days.max(0)) < s.on_days.max(1),
        _ => false,
    }
}

/// Average units per day, for "lasts about N days".
fn per_day(m: &Med) -> f64 {
    let s = &m.schedule;
    let per = s.times.iter().map(|t| t.amount).sum::<f64>();
    match s.kind.as_str() {
        "daily" => per,
        "interval" => per / s.every.max(1) as f64,
        "weekdays" => per * s.days.len() as f64 / 7.0,
        "cycle" => per * s.on_days.max(1) as f64 / (s.on_days.max(1) + s.off_days.max(0)) as f64,
        _ => 0.0,
    }
}

fn split_slot(id: &str) -> Result<(&str, &str, &str)> {
    let (med, rest) = id.split_once('@').ok_or_else(|| anyhow!("bad dose id"))?;
    let (d, t) = rest.split_once('T').ok_or_else(|| anyhow!("bad dose id"))?;
    Ok((med, d, t))
}

fn slot_id(med: &str, d: &str, t: &str) -> String {
    format!("{med}@{d}T{t}")
}

fn slot_for(m: &Med, d: &str, time: &str, amount: f64, logged: Option<&Dose>, now: i64) -> DoseSlot {
    let due_at = local_ms(d, time);
    let status = match logged {
        Some(x) => x.status.clone(),
        None if due_at <= now => "due".into(),
        None => "upcoming".into(),
    };
    DoseSlot {
        id: logged.map_or_else(|| slot_id(&m.id, d, time), |x| x.id.clone()),
        med_id: m.id.clone(),
        name: display_name(m),
        date: d.into(),
        time: time.get(..5).unwrap_or(time).into(),
        amount: logged.map_or(amount, |x| x.amount),
        form: m.form.clone(),
        status,
        due_at,
        logged_at: logged.map(|x| x.at),
        critical: m.critical,
        extra: time.contains('~'),
    }
}

pub fn display_name(m: &Med) -> String {
    if m.strength.trim().is_empty() || m.name.contains(m.strength.trim()) {
        m.name.clone()
    } else {
        format!("{} {}", m.name, m.strength.trim())
    }
}

/// Every dose for `d`: scheduled slots plus anything logged that day (extras included).
pub fn slots_on(db: &Db, m: &Med, d: &str, now: i64) -> Result<Vec<DoseSlot>> {
    let logged = doses_for(db, &m.id, d, d)?;
    let mut out = vec![];
    if scheduled_on(m, date(d)?) {
        for t in &m.schedule.times {
            let id = slot_id(&m.id, d, &t.time);
            out.push(slot_for(m, d, &t.time, t.amount, logged.iter().find(|x| x.id == id), now));
        }
    }
    let extras: Vec<DoseSlot> = logged
        .iter()
        .filter(|x| !out.iter().any(|s| s.id == x.id))
        .map(|x| slot_for(m, d, &x.time, x.amount, Some(x), now))
        .collect();
    out.extend(extras);
    out.sort_by(|a, b| a.time.cmp(&b.time));
    Ok(out)
}

pub fn stock_left(db: &Db, m: &Med) -> Result<Option<f64>> {
    let Some(stock) = m.stock else { return Ok(None) };
    let used: f64 = doses_for(db, &m.id, "", "9999")?
        .iter()
        .filter(|x| x.status == "taken" && x.at >= m.stock_at)
        .map(|x| x.amount)
        .sum();
    Ok(Some((stock - used).max(0.0)))
}

pub fn view(db: &Db, m: Med) -> Result<MedView> {
    let left = stock_left(db, &m)?;
    let rate = per_day(&m);
    let days_left = left.filter(|_| rate > 0.0).map(|l| (l / rate).floor());
    let low = match (left, m.refill_at) {
        (Some(l), Some(r)) => l <= r,
        (Some(l), None) => days_left.is_some_and(|d| d <= 7.0) || l <= 0.0,
        _ => false,
    };
    Ok(MedView { med: m, left, days_left, low })
}

/// Today's doses across every med, soonest first.
pub fn today_slots(db: &Db) -> Result<Vec<DoseSlot>> {
    let today = ymd(Local::now().date_naive());
    let now = now_ms();
    let mut out = vec![];
    for m in meds(db)? {
        out.extend(slots_on(db, &m, &today, now)?);
    }
    out.sort_by(|a, b| a.time.cmp(&b.time).then(a.name.cmp(&b.name)));
    Ok(out)
}

/// Untaken scheduled doses in the next `days` days, for alarms.
pub fn upcoming_slots(db: &Db, days: i64) -> Result<Vec<DoseSlot>> {
    let now = now_ms();
    let first = Local::now().date_naive();
    let mut out = vec![];
    for m in meds(db)? {
        for i in 0..days {
            let d = ymd(first + Duration::days(i));
            out.extend(slots_on(db, &m, &d, now)?.into_iter().filter(|s| s.status == "upcoming" && !s.extra));
        }
    }
    out.sort_by_key(|s| s.due_at);
    Ok(out)
}

pub fn history(db: &Db, med_id: &str, days: i64) -> Result<Vec<DayAdherence>> {
    let m = get_med(db, med_id)?;
    let today = Local::now().date_naive();
    let now = now_ms();
    (0..days)
        .rev()
        .map(|i| {
            let d = ymd(today - Duration::days(i));
            let slots = slots_on(db, &m, &d, now)?;
            Ok(DayAdherence {
                scheduled: slots.iter().filter(|s| !s.extra).count() as i64,
                taken: slots.iter().filter(|s| s.status == "taken").count() as i64,
                skipped: slots.iter().filter(|s| s.status == "skipped").count() as i64,
                date: d,
            })
        })
        .collect()
}

// ---- edits ---------------------------------------------------------------------------------

fn clean_schedule(mut s: Schedule) -> Result<Schedule> {
    if !["daily", "interval", "weekdays", "cycle", "asNeeded"].contains(&s.kind.as_str()) {
        return Err(anyhow!("Unknown schedule"));
    }
    s.every = s.every.clamp(1, 365);
    s.days.retain(|d| *d < 7);
    s.days.sort();
    s.days.dedup();
    s.on_days = s.on_days.clamp(0, 365);
    s.off_days = s.off_days.clamp(0, 365);
    s.times.retain(|t| valid_time(&t.time) && t.amount > 0.0);
    s.times.sort_by(|a, b| a.time.cmp(&b.time));
    s.times.dedup_by(|a, b| a.time == b.time);
    if s.kind == "weekdays" && s.days.is_empty() {
        return Err(anyhow!("Pick at least one day"));
    }
    if s.kind == "cycle" && s.on_days == 0 {
        return Err(anyhow!("A cycle needs at least one day on"));
    }
    if s.kind != "asNeeded" && s.times.is_empty() {
        return Err(anyhow!("Add at least one time"));
    }
    Ok(s)
}

pub fn upsert_med(db: &Db, input: MedInput) -> Result<Med> {
    let name = input.name.trim().to_string();
    if name.is_empty() {
        return Err(anyhow!("A medication needs a name"));
    }
    date(&input.start_date)?;
    if let Some(e) = input.end_date.as_deref() {
        date(e)?;
    }
    let schedule = clean_schedule(input.schedule)?;
    let existing = match input.id.as_deref() {
        Some(id) => db.get_item(MED, id)?.filter(|it| !it.deleted).and_then(|it| parse::<Med>(&it)),
        None => None,
    };
    let now = now_ms();
    let mut m = existing.clone().unwrap_or(Med {
        id: input.id.clone().unwrap_or_else(|| uuid::Uuid::new_v4().to_string()),
        name: String::new(),
        strength: String::new(),
        form: String::new(),
        icon: String::new(),
        color: String::new(),
        notes: String::new(),
        schedule: schedule.clone(),
        start_date: String::new(),
        end_date: None,
        stock: None,
        stock_at: now,
        refill_at: None,
        paused: false,
        critical: false,
        reward: DEFAULT_DOSE_REWARD,
        created_at: now,
    });
    // Recount stock only when the number on hand was actually changed.
    let current = match &existing {
        Some(e) => stock_left(db, e)?,
        None => None,
    };
    let new_stock = input.stock.map(|s| s.max(0.0));
    if existing.is_none() || new_stock != current {
        m.stock = new_stock;
        m.stock_at = now;
    }
    m.name = name;
    m.strength = input.strength.trim().into();
    m.form = input.form;
    m.icon = input.icon;
    m.color = input.color;
    m.notes = input.notes;
    m.schedule = schedule;
    m.start_date = input.start_date;
    m.end_date = input.end_date.filter(|e| !e.is_empty());
    m.refill_at = input.refill_at.map(|r| r.max(0.0));
    m.paused = input.paused;
    m.critical = input.critical;
    m.reward = input.reward.clamp(1, 50);
    save_med(db, &m)?;
    Ok(m)
}

pub fn delete_med(db: &Db, id: &str) -> Result<()> {
    let m = get_med(db, id)?;
    // The history and seeds stay; the med just stops showing up.
    put(db, MED, &m.id, "", "", &m, true)
}

pub fn add_stock(db: &Db, id: &str, amount: f64) -> Result<Med> {
    let mut m = get_med(db, id)?;
    let left = stock_left(db, &m)?.unwrap_or(0.0);
    m.stock = Some((left + amount).max(0.0));
    m.stock_at = now_ms();
    save_med(db, &m)?;
    Ok(m)
}

fn ledger(subject: &str, kind: &str, amount: i64, void: bool) -> LedgerEntry {
    LedgerEntry {
        id: format!("{subject}:{kind}"),
        reminder_id: subject.into(),
        kind: kind.into(),
        amount,
        at: now_ms(),
        void,
        updated_at: 0,
        device: String::new(),
    }
}

/// Reward screens expect a reminder; a dose or diary entry is shown as a tiny finished one.
fn as_reminder(id: &str, title: &str) -> Reminder {
    let now = now_ms();
    Reminder {
        id: id.into(),
        series_id: id.into(),
        title: title.into(),
        notes: String::new(),
        date: ymd(Local::now().date_naive()),
        time: None,
        steps: vec![],
        reward: 0,
        suggested: None,
        status: "done".into(),
        repeat: None,
        bits: 0,
        completed_at: Some(now),
        created_at: now,
        updated_at: now,
        device: String::new(),
        deleted: false,
        exercise: None,
    }
}

pub(crate) fn event(db: &Db, kind: &str, gained: i64, bonus: i64, xp_before: i64, id: &str, title: &str) -> Result<RewardEvent> {
    Ok(RewardEvent {
        kind: kind.into(),
        gained,
        bonus,
        remaining: 0,
        before: rewards::level_info(xp_before),
        after: rewards::level_info(db.total_xp()?),
        reminder: as_reminder(id, title),
    })
}

fn void_seeds(db: &Db, id: &str, kinds: &[&str]) -> Result<()> {
    let rows = db.ledger_for(id)?;
    for kind in kinds {
        if rows.iter().any(|e| e.id == format!("{id}:{kind}") && !e.void) {
            db.put_ledger(ledger(id, kind, 0, true))?;
        }
    }
    Ok(())
}

fn void_dose_seeds(db: &Db, id: &str) -> Result<()> {
    void_seeds(db, id, &["dose", "ontime", "skip"])
}

/// Skipping on purpose still counts for something: a quarter of the dose's seeds (at least 1).
pub fn skip_value(reward: i64) -> i64 {
    ((reward + 3) / 4).max(1)
}

/// Takes a scheduled dose (by slot id). Taking one twice does nothing.
pub fn take(db: &Db, slot: &str) -> Result<RewardEvent> {
    let xp_before = db.total_xp()?;
    let (med_id, d, t) = split_slot(slot)?;
    let m = get_med(db, med_id)?;
    let existing = get_dose(db, slot)?;
    if existing.as_ref().is_some_and(|x| x.status == "taken") {
        return event(db, "none", 0, 0, xp_before, slot, &display_name(&m));
    }
    let amount = existing
        .as_ref()
        .map(|x| x.amount)
        .or_else(|| m.schedule.times.iter().find(|x| x.time == t).map(|x| x.amount))
        .unwrap_or(1.0);
    let now = now_ms();
    let dose = Dose { id: slot.into(), med_id: m.id.clone(), date: d.into(), time: t.into(), amount, status: "taken".into(), at: now };
    save_dose(db, &dose, false)?;
    // Taken after all: the dose's seeds replace the smaller skip ones.
    void_seeds(db, slot, &["skip"])?;
    db.put_ledger(ledger(slot, "dose", m.reward, false))?;
    let mut bonus = 0;
    if !t.contains('~') && (now - local_ms(d, t)).abs() <= ON_TIME_WINDOW_MS {
        bonus = ON_TIME_BONUS;
        db.put_ledger(ledger(slot, "ontime", bonus, false))?;
    }
    event(db, "bit", m.reward + bonus, 0, xp_before, slot, &display_name(&m))
}

/// Logs an extra dose right now (as-needed meds, or one more than planned).
pub fn take_extra(db: &Db, med_id: &str, amount: f64) -> Result<RewardEvent> {
    let now = Local::now();
    let tag = &uuid::Uuid::new_v4().simple().to_string()[..6];
    let slot = slot_id(med_id, &ymd(now.date_naive()), &format!("{}~{tag}", now.format("%H:%M")));
    let xp_before = db.total_xp()?;
    let m = get_med(db, med_id)?;
    let (_, d, t) = split_slot(&slot)?;
    let dose = Dose {
        id: slot.clone(),
        med_id: m.id.clone(),
        date: d.into(),
        time: t.into(),
        amount: if amount > 0.0 { amount } else { 1.0 },
        status: "taken".into(),
        at: now_ms(),
    };
    save_dose(db, &dose, false)?;
    db.put_ledger(ledger(&slot, "dose", m.reward, false))?;
    event(db, "bit", m.reward, 0, xp_before, &slot, &display_name(&m))
}

/// Skips a scheduled dose. Replaces a "taken" record (and its seeds); skipping twice does nothing.
pub fn skip(db: &Db, slot: &str) -> Result<RewardEvent> {
    let xp_before = db.total_xp()?;
    let (med_id, d, t) = split_slot(slot)?;
    let m = get_med(db, med_id)?;
    if get_dose(db, slot)?.is_some_and(|x| x.status == "skipped") {
        return event(db, "none", 0, 0, xp_before, slot, &display_name(&m));
    }
    let amount = m.schedule.times.iter().find(|x| x.time == t).map_or(1.0, |x| x.amount);
    let dose = Dose { id: slot.into(), med_id: m.id.clone(), date: d.into(), time: t.into(), amount, status: "skipped".into(), at: now_ms() };
    save_dose(db, &dose, false)?;
    void_seeds(db, slot, &["dose", "ontime"])?;
    db.put_ledger(ledger(slot, "skip", skip_value(m.reward), false))?;
    let after = db.total_xp()?;
    event(db, "bit", after - xp_before, 0, xp_before, slot, &display_name(&m))
}

/// Forgets a taken or skipped dose (a mistap); a scheduled one becomes due again.
pub fn undo(db: &Db, slot: &str) -> Result<RewardEvent> {
    let xp_before = db.total_xp()?;
    let Some(dose) = get_dose(db, slot)? else {
        return event(db, "none", 0, 0, xp_before, slot, "");
    };
    save_dose(db, &dose, true)?;
    void_dose_seeds(db, slot)?;
    let after = db.total_xp()?;
    event(db, "undo", after - xp_before, 0, xp_before, slot, "")
}

pub fn save_entry(db: &Db, mut e: Entry) -> Result<RewardEvent> {
    let xp_before = db.total_xp()?;
    if !["measurement", "symptom", "mood"].contains(&e.kind.as_str()) {
        return Err(anyhow!("Unknown entry"));
    }
    e.name = e.name.trim().into();
    if e.name.is_empty() {
        return Err(anyhow!("An entry needs a name"));
    }
    if e.id.is_empty() {
        e.id = uuid::Uuid::new_v4().to_string();
    }
    if e.at == 0 {
        e.at = now_ms();
    }
    // Moving an entry to another day changes its lookup key: clear the old copy first.
    if let Some(old) = db.get_item(ENTRY, &e.id)?.filter(|it| !it.deleted).and_then(|it| parse::<Entry>(&it)) {
        if old.kind != e.kind || entry_day(old.at) != entry_day(e.at) {
            save_entry_item(db, &old, true)?;
        }
    }
    save_entry_item(db, &e, false)?;
    let paid = db.ledger_for(&e.id)?.iter().any(|l| !l.void);
    if paid {
        return event(db, "none", 0, 0, xp_before, &e.id, &e.name);
    }
    db.put_ledger(ledger(&e.id, "log", ENTRY_REWARD, false))?;
    event(db, "bit", ENTRY_REWARD, 0, xp_before, &e.id, &e.name)
}

pub fn delete_entry(db: &Db, id: &str) -> Result<()> {
    let it = db.get_item(ENTRY, id)?.ok_or_else(|| anyhow!("That entry no longer exists"))?;
    let e: Entry = parse(&it).ok_or_else(|| anyhow!("That entry no longer exists"))?;
    save_entry_item(db, &e, true)?;
    if db.ledger_for(id)?.iter().any(|l| !l.void) {
        db.put_ledger(ledger(id, "log", 0, true))?;
    }
    Ok(())
}

// ---- import / export -----------------------------------------------------------------------

pub fn export(db: &Db) -> Result<HealthExport> {
    let meds = meds(db)?;
    let mut doses = vec![];
    for m in &meds {
        doses.extend(doses_for(db, &m.id, "", "9999")?);
    }
    Ok(HealthExport { app: "tend".into(), version: 1, meds, doses, entries: entries(db, "")? })
}

/// Adds everything from an export. Records already here are updated; nothing is removed.
pub fn import(db: &Db, data: HealthExport) -> Result<(usize, usize, usize)> {
    if data.app != "tend" {
        return Err(anyhow!("That file isn't a Tend health export"));
    }
    let mut counts = (0, 0, 0);
    for mut m in data.meds {
        if m.name.trim().is_empty() || date(&m.start_date).is_err() {
            continue;
        }
        m.schedule = clean_schedule(m.schedule).unwrap_or(Schedule {
            kind: "asNeeded".into(),
            every: 1,
            days: vec![],
            on_days: 0,
            off_days: 0,
            times: vec![],
        });
        if m.created_at == 0 {
            m.created_at = now_ms();
        }
        save_med(db, &m)?;
        counts.0 += 1;
    }
    for d in data.doses {
        if split_slot(&d.id).is_ok() && date(&d.date).is_ok() {
            save_dose(db, &d, false)?;
            counts.1 += 1;
        }
    }
    for e in data.entries {
        if !e.id.is_empty() && e.at > 0 {
            save_entry_item(db, &e, false)?;
            counts.2 += 1;
        }
    }
    Ok(counts)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn db() -> Db {
        Db::open(std::path::Path::new(":memory:")).unwrap()
    }

    fn input(kind: &str) -> MedInput {
        MedInput {
            id: None,
            name: "Fluoxetine".into(),
            strength: "20 mg".into(),
            form: "capsule".into(),
            icon: "capsule".into(),
            color: "sage".into(),
            notes: String::new(),
            schedule: Schedule {
                kind: kind.into(),
                every: 2,
                days: vec![0, 2, 4],
                on_days: 21,
                off_days: 7,
                times: vec![DoseTime { time: "08:05".into(), amount: 1.0 }],
            },
            start_date: "2026-09-04".into(),
            end_date: None,
            stock: Some(10.0),
            refill_at: Some(3.0),
            paused: false,
            critical: false,
            reward: 5,
        }
    }

    fn d(s: &str) -> NaiveDate {
        date(s).unwrap()
    }

    #[test]
    fn schedules() {
        let db = db();
        let every2 = upsert_med(&db, input("interval")).unwrap();
        assert!(scheduled_on(&every2, d("2026-09-04")));
        assert!(!scheduled_on(&every2, d("2026-09-05")));
        assert!(scheduled_on(&every2, d("2026-11-03")));
        assert!(!scheduled_on(&every2, d("2026-09-03")));
        let week = upsert_med(&db, input("weekdays")).unwrap();
        assert!(scheduled_on(&week, d("2026-11-02"))); // Monday
        assert!(!scheduled_on(&week, d("2026-11-03")));
        let cycle = upsert_med(&db, input("cycle")).unwrap();
        assert!(scheduled_on(&cycle, d("2026-09-24"))); // day 20
        assert!(!scheduled_on(&cycle, d("2026-09-25"))); // day 21: off week
        assert!(scheduled_on(&cycle, d("2026-10-02"))); // day 28: on again
    }

    #[test]
    fn take_pays_once_and_counts_stock() {
        let db = db();
        let mut i = input("daily");
        i.start_date = ymd(Local::now().date_naive() - Duration::days(1));
        let m = upsert_med(&db, i).unwrap();
        let today = ymd(Local::now().date_naive());
        let slot = slot_id(&m.id, &today, "08:05");
        let e = take(&db, &slot).unwrap();
        assert!(e.gained >= 5);
        assert_eq!(take(&db, &slot).unwrap().kind, "none");
        assert_eq!(stock_left(&db, &get_med(&db, &m.id).unwrap()).unwrap(), Some(9.0));
        undo(&db, &slot).unwrap();
        assert_eq!(db.total_xp().unwrap(), 0);
        assert_eq!(stock_left(&db, &get_med(&db, &m.id).unwrap()).unwrap(), Some(10.0));
        let s = skip(&db, &slot).unwrap();
        assert_eq!(s.gained, 2);
        assert_eq!(db.total_xp().unwrap(), 2);
        assert_eq!(skip(&db, &slot).unwrap().kind, "none");
        let slots = slots_on(&db, &m, &today, now_ms()).unwrap();
        assert_eq!(slots[0].status, "skipped");
    }

    #[test]
    fn skipping_pays_a_quarter() {
        assert_eq!(skip_value(5), 2);
        assert_eq!(skip_value(8), 2);
        assert_eq!(skip_value(10), 3);
        assert_eq!(skip_value(1), 1);
        assert_eq!(skip_value(0), 1);
        let db = db();
        let mut i = input("daily");
        i.start_date = ymd(Local::now().date_naive() - Duration::days(1));
        i.reward = 10;
        let m = upsert_med(&db, i).unwrap();
        let slot = slot_id(&m.id, &ymd(Local::now().date_naive()), "08:05");
        // Skip, then undo: nothing left.
        skip(&db, &slot).unwrap();
        assert_eq!(db.total_xp().unwrap(), 3);
        undo(&db, &slot).unwrap();
        assert_eq!(db.total_xp().unwrap(), 0);
        // Skip, then take after all: the dose replaces the skip.
        skip(&db, &slot).unwrap();
        let taken = take(&db, &slot).unwrap();
        let full = db.total_xp().unwrap();
        assert!(full >= 10);
        // The event shows the dose's own seeds; the skip's 3 are quietly replaced.
        assert_eq!(taken.gained, full);
        assert!(db.ledger_for(&slot).unwrap().iter().any(|e| e.kind == "skip" && e.void));
        // Take, then skip: the dose's seeds go, the skip's come.
        let e = skip(&db, &slot).unwrap();
        assert_eq!(db.total_xp().unwrap(), 3);
        assert_eq!(e.gained, 3 - full);
        assert!(db.ledger_for(&slot).unwrap().iter().any(|e| e.id == format!("{slot}:skip") && !e.void));
    }

    #[test]
    fn editing_keeps_stock_unless_changed() {
        let db = db();
        let mut i = input("daily");
        i.start_date = ymd(Local::now().date_naive());
        let m = upsert_med(&db, i.clone()).unwrap();
        take(&db, &slot_id(&m.id, &i.start_date, "08:05")).unwrap();
        i.id = Some(m.id.clone());
        i.stock = Some(9.0); // what the form shows: unchanged
        i.name = "Fluoxetine HCl".into();
        let m2 = upsert_med(&db, i.clone()).unwrap();
        assert_eq!(stock_left(&db, &m2).unwrap(), Some(9.0));
        i.stock = Some(30.0);
        let m3 = upsert_med(&db, i).unwrap();
        assert_eq!(stock_left(&db, &m3).unwrap(), Some(30.0));
        assert_eq!(add_stock(&db, &m.id, 28.0).map(|m| stock_left(&db, &m).unwrap()).unwrap(), Some(58.0));
    }

    #[test]
    fn extras_and_entries() {
        let db = db();
        let mut i = input("asNeeded");
        i.schedule.times.clear();
        let m = upsert_med(&db, i).unwrap();
        take_extra(&db, &m.id, 2.0).unwrap();
        take_extra(&db, &m.id, 1.0).unwrap();
        assert_eq!(today_slots(&db).unwrap().len(), 2);
        assert_eq!(stock_left(&db, &m).unwrap(), Some(7.0));
        let e = Entry {
            id: String::new(),
            kind: "measurement".into(),
            name: "Blood pressure".into(),
            value: 120.0,
            value2: Some(80.0),
            unit: "mmHg".into(),
            note: String::new(),
            at: 0,
        };
        let ev = save_entry(&db, e).unwrap();
        assert_eq!(ev.gained, ENTRY_REWARD);
        let all = entries(&db, "").unwrap();
        assert_eq!(all.len(), 1);
        delete_entry(&db, &all[0].id).unwrap();
        assert!(entries(&db, "").unwrap().is_empty());
    }

    #[test]
    fn export_import_and_sync() {
        let a = db();
        let b = db();
        let mut i = input("daily");
        i.start_date = ymd(Local::now().date_naive());
        let m = upsert_med(&a, i.clone()).unwrap();
        take(&a, &slot_id(&m.id, &i.start_date, "08:05")).unwrap();
        let counts = import(&b, export(&a).unwrap()).unwrap();
        assert_eq!(counts, (1, 1, 0));
        assert_eq!(stock_left(&b, &get_med(&b, &m.id).unwrap()).unwrap(), Some(9.0));
        // Sync carries items both ways and settles.
        let c = db();
        c.apply_remote(&[], &a.ledger_since(0).unwrap(), &a.items_since(0).unwrap()).unwrap();
        assert_eq!(today_slots(&c).unwrap()[0].status, "taken");
        assert_eq!(c.apply_remote(&[], &a.ledger_since(0).unwrap(), &a.items_since(0).unwrap()).unwrap(), 0);
    }
}
