//! Tend native helpers (Android): persistent "still to do" notification, reminder alarms
//! with Done/Snooze actions, boot restore and an optional "you still have this to do"
//! screen on unlock. Desktop builds get no-op implementations.
//!
//! JS: `invoke('plugin:tend-native|set_state', { state })` etc.
//! Events: `addPluginListener('tend-native', 'action' | 'pending-actions', cb)`.

use tauri::{
    plugin::{Builder, TauriPlugin},
    Manager, Runtime,
};

pub use models::*;

#[cfg(desktop)]
mod desktop;
#[cfg(mobile)]
mod mobile;

mod commands;
mod error;
mod models;

pub use error::{Error, Result};

#[cfg(desktop)]
pub use desktop::TendNative;
#[cfg(mobile)]
pub use mobile::TendNative;

/// Extension to access the Tend native APIs from Rust.
pub trait TendNativeExt<R: Runtime> {
    fn tend_native(&self) -> &TendNative<R>;
}

impl<R: Runtime, T: Manager<R>> TendNativeExt<R> for T {
    fn tend_native(&self) -> &TendNative<R> {
        self.state::<TendNative<R>>().inner()
    }
}

/// Initializes the plugin.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("tend-native")
        .invoke_handler(tauri::generate_handler![
            commands::set_state,
            commands::get_permissions,
            commands::request_permission,
            commands::take_launch_action,
            commands::take_pending_actions,
            commands::download_update,
            commands::install_update,
        ])
        .setup(|app, api| {
            #[cfg(mobile)]
            let tend = mobile::init(app, api)?;
            #[cfg(desktop)]
            let tend = desktop::init(app, api)?;
            app.manage(tend);
            Ok(())
        })
        .build()
}
