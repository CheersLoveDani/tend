use tauri::{command, AppHandle, Runtime};

use crate::models::*;
use crate::{Result, TendNativeExt};

// Commands are async so the blocking mobile round-trip (request_permission waits for the
// user to come back from a settings screen) never runs on the main thread.

#[command]
pub(crate) async fn set_state<R: Runtime>(app: AppHandle<R>, state: NativeState) -> Result<()> {
    app.tend_native().set_state(state)
}

#[command]
pub(crate) async fn get_permissions<R: Runtime>(app: AppHandle<R>) -> Result<Permissions> {
    app.tend_native().get_permissions()
}

#[command]
pub(crate) async fn request_permission<R: Runtime>(
    app: AppHandle<R>,
    kind: PermissionKind,
) -> Result<Permissions> {
    app.tend_native().request_permission(kind)
}

#[command]
pub(crate) async fn take_launch_action<R: Runtime>(app: AppHandle<R>) -> Result<LaunchAction> {
    app.tend_native().take_launch_action()
}

#[command]
pub(crate) async fn take_pending_actions<R: Runtime>(
    app: AppHandle<R>,
) -> Result<PendingActions> {
    app.tend_native().take_pending_actions()
}

/// Fetches a new APK from this project's GitHub releases into the app's cache.
#[command]
pub(crate) async fn download_update<R: Runtime>(app: AppHandle<R>, url: String) -> Result<()> {
    app.tend_native().download_update(url)
}

/// Hands the downloaded APK to Android's installer, which asks before replacing the app.
#[command]
pub(crate) async fn install_update<R: Runtime>(app: AppHandle<R>) -> Result<()> {
    app.tend_native().install_update()
}

/// Asks where to keep the backup (a new file anywhere, Google Drive included).
#[command]
pub(crate) async fn choose_backup_file<R: Runtime>(app: AppHandle<R>) -> Result<BackupTarget> {
    app.tend_native().choose_backup_file()
}

#[command]
pub(crate) async fn backup_target<R: Runtime>(app: AppHandle<R>) -> Result<BackupTarget> {
    app.tend_native().backup_target()
}

/// Overwrites the chosen backup file with `data` (base64).
#[command]
pub(crate) async fn write_backup<R: Runtime>(app: AppHandle<R>, data: String) -> Result<()> {
    app.tend_native().write_backup(data)
}

/// Lets the user pick a backup to restore and returns its contents.
#[command]
pub(crate) async fn open_backup_file<R: Runtime>(app: AppHandle<R>) -> Result<BackupFile> {
    app.tend_native().open_backup_file()
}

/// Is Health Connect installed, and may Tend read steps and workouts?
#[command]
pub(crate) async fn health_status<R: Runtime>(app: AppHandle<R>) -> Result<HealthStatus> {
    app.tend_native().health_status()
}

/// Asks for steps and workouts (or sends the user to install Health Connect).
#[command]
pub(crate) async fn health_request<R: Runtime>(app: AppHandle<R>) -> Result<HealthStatus> {
    app.tend_native().health_request()
}

/// Daily step totals and workouts over the last `days` days: `{ days: [...], workouts: [...] }`.
#[command]
pub(crate) async fn health_read<R: Runtime>(app: AppHandle<R>, days: u32) -> Result<serde_json::Value> {
    app.tend_native().health_read(days)
}

/// Sends the app to the background, like Android's own back on a home screen.
#[command]
pub(crate) async fn move_to_back<R: Runtime>(app: AppHandle<R>) -> Result<()> {
    app.tend_native().move_to_back()
}

/// May Tend read the phone's calendars? (`unsupported` on desktop.)
#[command]
pub(crate) async fn calendar_status<R: Runtime>(app: AppHandle<R>) -> Result<CalendarAccess> {
    app.tend_native().calendar_status()
}

/// Asks for read-only calendar access (or opens the app's settings if it was refused for good).
#[command]
pub(crate) async fn calendar_request<R: Runtime>(app: AppHandle<R>) -> Result<CalendarAccess> {
    app.tend_native().calendar_request()
}

/// Visible calendars: `{ calendars: [{ id, name, account, color }] }`.
#[command]
pub(crate) async fn calendar_list<R: Runtime>(app: AppHandle<R>) -> Result<serde_json::Value> {
    app.tend_native().calendar_list()
}

/// Event instances overlapping [from, to) (epoch ms) from `ids` (empty = all visible):
/// `{ events: [{ id, calendarId, title, start, end, allDay, color, location }] }`.
#[command]
pub(crate) async fn calendar_events<R: Runtime>(
    app: AppHandle<R>,
    from: i64,
    to: i64,
    ids: Option<Vec<String>>,
) -> Result<serde_json::Value> {
    app.tend_native().calendar_events(CalendarEventsArgs { from, to, ids: ids.unwrap_or_default() })
}
