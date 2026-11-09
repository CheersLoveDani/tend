use serde::{Deserialize, Serialize};

use crate::meds::{DoseSlot, Entry, MedView};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Step {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub done: bool,
}

/// A reminder that is a workout: it ticks itself off when Health Connect sees a matching one.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Exercise {
    /// Health Connect exercise types that count; empty means any workout.
    #[serde(default)]
    pub types: Vec<i64>,
    /// Minutes needed in one day.
    pub minutes: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Reminder {
    pub id: String,
    /// Shared by every occurrence of a repeating reminder.
    pub series_id: String,
    pub title: String,
    #[serde(default)]
    pub notes: String,
    /// Local calendar day, `YYYY-MM-DD`.
    pub date: String,
    /// Optional local time, `HH:MM`.
    pub time: Option<String>,
    #[serde(default)]
    pub steps: Vec<Step>,
    /// Seeds earned for doing the whole thing.
    pub reward: i64,
    /// What the suggester proposed, kept so nudges can be learned from.
    pub suggested: Option<i64>,
    /// `open` | `done`
    pub status: String,
    /// `daily` | `weekdays` | `weekly` | `monthly`
    pub repeat: Option<String>,
    /// Number of "did a bit" bumps on a step-less reminder.
    #[serde(default)]
    pub bits: i64,
    pub completed_at: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
    pub device: String,
    #[serde(default)]
    pub deleted: bool,
    #[serde(default)]
    pub exercise: Option<Exercise>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LedgerEntry {
    /// Deterministic: `{reminder}:{kind}[:{key}]`, so syncing is idempotent.
    pub id: String,
    pub reminder_id: String,
    /// `step` | `bit` | `finish` | `bonus`
    pub kind: String,
    pub amount: i64,
    pub at: i64,
    #[serde(default)]
    pub void: bool,
    pub updated_at: i64,
    pub device: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReminderInput {
    pub id: Option<String>,
    pub title: String,
    #[serde(default)]
    pub notes: String,
    pub date: String,
    pub time: Option<String>,
    #[serde(default)]
    pub steps: Vec<Step>,
    pub reward: i64,
    pub suggested: Option<i64>,
    pub repeat: Option<String>,
    #[serde(default)]
    pub exercise: Option<Exercise>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LevelInfo {
    pub level: i64,
    pub xp: i64,
    /// Seeds earned inside the current level.
    pub into_level: i64,
    /// Seeds the current level needs in total.
    pub level_size: i64,
    pub stage: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RewardEvent {
    pub kind: String,
    pub gained: i64,
    pub bonus: i64,
    /// What is still on the table for finishing this reminder.
    pub remaining: i64,
    pub before: LevelInfo,
    pub after: LevelInfo,
    pub reminder: Reminder,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DayStat {
    pub date: String,
    pub seeds: i64,
    pub done: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub reminders: Vec<Reminder>,
    pub level: LevelInfo,
    pub days: Vec<DayStat>,
    pub device_id: String,
    pub meds: Vec<MedView>,
    /// Today's doses, soonest first.
    pub doses: Vec<DoseSlot>,
    /// Untaken doses over the next week, for alarms.
    pub dose_alarms: Vec<DoseSlot>,
    /// Health diary for the last 90 days, newest first.
    pub entries: Vec<Entry>,
    /// Food log for the last 90 days, newest first.
    pub foods: Vec<crate::food::Food>,
    /// Foods eaten before, most recent first.
    pub food_lib: Vec<crate::food::SavedFood>,
}
