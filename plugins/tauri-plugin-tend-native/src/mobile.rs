use serde::de::DeserializeOwned;
use tauri::{
    plugin::{PluginApi, PluginHandle},
    AppHandle, Runtime,
};

use crate::models::*;

#[cfg(target_os = "ios")]
compile_error!("tauri-plugin-tend-native has no iOS implementation yet");

pub fn init<R: Runtime, C: DeserializeOwned>(
    _app: &AppHandle<R>,
    api: PluginApi<R, C>,
) -> crate::Result<TendNative<R>> {
    #[cfg(target_os = "android")]
    let handle = api.register_android_plugin("com.tend.native", "TendNativePlugin")?;
    Ok(TendNative(handle))
}

/// Access to the Tend native APIs.
pub struct TendNative<R: Runtime>(PluginHandle<R>);

impl<R: Runtime> TendNative<R> {
    pub fn set_state(&self, state: NativeState) -> crate::Result<()> {
        self.0
            .run_mobile_plugin::<serde_json::Value>("setState", SetStateArgs { state })
            .map(|_| ())
            .map_err(Into::into)
    }

    pub fn get_permissions(&self) -> crate::Result<Permissions> {
        self.0
            .run_mobile_plugin("getPermissions", ())
            .map_err(Into::into)
    }

    pub fn request_permission(&self, kind: PermissionKind) -> crate::Result<Permissions> {
        self.0
            .run_mobile_plugin("requestPermission", RequestPermissionArgs { kind })
            .map_err(Into::into)
    }

    pub fn take_launch_action(&self) -> crate::Result<LaunchAction> {
        self.0
            .run_mobile_plugin("takeLaunchAction", ())
            .map_err(Into::into)
    }

    pub fn take_pending_actions(&self) -> crate::Result<PendingActions> {
        self.0
            .run_mobile_plugin("takePendingActions", ())
            .map_err(Into::into)
    }

    pub fn download_update(&self, url: String) -> crate::Result<()> {
        self.0
            .run_mobile_plugin::<serde_json::Value>("downloadUpdate", DownloadUpdateArgs { url })
            .map(|_| ())
            .map_err(Into::into)
    }

    pub fn install_update(&self) -> crate::Result<()> {
        self.0
            .run_mobile_plugin::<serde_json::Value>("installUpdate", ())
            .map(|_| ())
            .map_err(Into::into)
    }
}
