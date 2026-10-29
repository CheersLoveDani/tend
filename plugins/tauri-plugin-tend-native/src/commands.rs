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
