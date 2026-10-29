//! Desktop has no native side: every command is a harmless no-op.

use serde::de::DeserializeOwned;
use tauri::{plugin::PluginApi, AppHandle, Runtime};

use crate::models::*;

pub fn init<R: Runtime, C: DeserializeOwned>(
    app: &AppHandle<R>,
    _api: PluginApi<R, C>,
) -> crate::Result<TendNative<R>> {
    Ok(TendNative(app.clone()))
}

/// Access to the Tend native APIs (no-op on desktop).
pub struct TendNative<R: Runtime>(#[allow(dead_code)] AppHandle<R>);

impl<R: Runtime> TendNative<R> {
    pub fn set_state(&self, _state: NativeState) -> crate::Result<()> {
        Ok(())
    }

    pub fn get_permissions(&self) -> crate::Result<Permissions> {
        Ok(Permissions::all_granted())
    }

    pub fn request_permission(&self, _kind: PermissionKind) -> crate::Result<Permissions> {
        Ok(Permissions::all_granted())
    }

    pub fn take_launch_action(&self) -> crate::Result<LaunchAction> {
        Ok(LaunchAction::default())
    }

    pub fn take_pending_actions(&self) -> crate::Result<PendingActions> {
        Ok(PendingActions::default())
    }

    /// Desktop updates go through tauri-plugin-updater instead.
    pub fn download_update(&self, _url: String) -> crate::Result<()> {
        Ok(())
    }

    pub fn install_update(&self) -> crate::Result<()> {
        Ok(())
    }
}
