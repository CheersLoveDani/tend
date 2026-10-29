use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingItem {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub time: Option<String>,
    #[serde(default)]
    pub steps_done: u32,
    #[serde(default)]
    pub steps_total: u32,
    #[serde(default)]
    pub reward: f64,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Alarm {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub body: String,
    /// Epoch milliseconds.
    pub at: i64,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuietHours {
    /// "HH:mm"
    pub start: String,
    /// "HH:mm"
    pub end: String,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeState {
    #[serde(default)]
    pub pending: Vec<PendingItem>,
    #[serde(default)]
    pub alarms: Vec<Alarm>,
    #[serde(default)]
    pub persistent_notification: bool,
    #[serde(default)]
    pub nag_on_unlock: bool,
    #[serde(default)]
    pub nag_cooldown_minutes: u32,
    #[serde(default)]
    pub quiet_hours: Option<QuietHours>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SetStateArgs {
    pub state: NativeState,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Permissions {
    pub notifications: bool,
    pub exact_alarm: bool,
    pub overlay: bool,
    pub full_screen_intent: bool,
    pub battery_unrestricted: bool,
}

impl Permissions {
    pub fn all_granted() -> Self {
        Self {
            notifications: true,
            exact_alarm: true,
            overlay: true,
            full_screen_intent: true,
            battery_unrestricted: true,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum PermissionKind {
    Notifications,
    ExactAlarm,
    Overlay,
    FullScreenIntent,
    BatteryUnrestricted,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestPermissionArgs {
    pub kind: PermissionKind,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadUpdateArgs {
    pub url: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum LaunchActionKind {
    Nag,
    Open,
    Reminder,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchAction {
    /// `null` when the activity was not opened by one of Tend's intents (or it was already taken).
    #[serde(default)]
    pub action: Option<LaunchActionKind>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reminder_id: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum PendingActionType {
    Complete,
    Snooze,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingAction {
    #[serde(rename = "type")]
    pub kind: PendingActionType,
    pub id: String,
    /// Epoch milliseconds when the user pressed the button.
    pub at: i64,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingActions {
    #[serde(default)]
    pub actions: Vec<PendingAction>,
}
