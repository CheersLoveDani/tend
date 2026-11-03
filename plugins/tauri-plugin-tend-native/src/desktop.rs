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

    /// Desktop backups go to a folder handled by the app itself.
    pub fn choose_backup_file(&self) -> crate::Result<BackupTarget> {
        Ok(BackupTarget::default())
    }

    pub fn backup_target(&self) -> crate::Result<BackupTarget> {
        Ok(BackupTarget::default())
    }

    pub fn write_backup(&self, _data: String) -> crate::Result<()> {
        Ok(())
    }

    pub fn open_backup_file(&self) -> crate::Result<BackupFile> {
        Ok(BackupFile::default())
    }

    /// Health Connect is Android-only; seeds earned there reach desktop through sync.
    pub fn health_status(&self) -> crate::Result<HealthStatus> {
        Ok(HealthStatus::unsupported())
    }

    pub fn health_request(&self) -> crate::Result<HealthStatus> {
        Ok(HealthStatus::unsupported())
    }

    pub fn health_read(&self, _days: u32) -> crate::Result<serde_json::Value> {
        Ok(serde_json::json!({ "days": [], "workouts": [] }))
    }

    pub fn move_to_back(&self) -> crate::Result<()> {
        Ok(())
    }
}
