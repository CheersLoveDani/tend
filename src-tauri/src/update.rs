//! Desktop updates from a chosen manifest, so the app can follow either channel: stable
//! (`releases/latest/download/latest.json`, which skips pre-releases) or unstable (the newest
//! release's own `latest.json`, pre-releases included). The frontend picks the URL; it must be one
//! of this project's own release downloads. Android updates through the APK instead (updater.ts).

#[cfg(desktop)]
use std::sync::Mutex;
use tauri::AppHandle;

/// Manifests are only ever read from this project's releases.
#[cfg(desktop)]
const RELEASES: &str = "https://github.com/CheersLoveDani/tend/releases/";

#[cfg(desktop)]
#[derive(Default)]
pub struct Pending {
    update: Option<tauri_plugin_updater::Update>,
    bytes: Option<Vec<u8>>,
}

#[cfg(desktop)]
static PENDING: Mutex<Option<Pending>> = Mutex::new(None);

/// Looks for an update in the manifest at `url`. Returns its version, or None.
#[tauri::command]
pub async fn update_check(app: AppHandle, url: String) -> Result<Option<String>, String> {
    #[cfg(desktop)]
    {
        use tauri_plugin_updater::UpdaterExt;
        if !url.starts_with(RELEASES) || !url.ends_with("/latest.json") {
            return Err("Updates only come from Tend's own releases".into());
        }
        let endpoint = url.parse().map_err(|e| format!("{e}"))?;
        let updater = app
            .updater_builder()
            .endpoints(vec![endpoint])
            .map_err(|e| e.to_string())?
            .build()
            .map_err(|e| e.to_string())?;
        let found = updater.check().await.map_err(|e| e.to_string())?;
        let version = found.as_ref().map(|u| u.version.clone());
        *PENDING.lock().unwrap() = Some(Pending { update: found, bytes: None });
        Ok(version)
    }
    #[cfg(mobile)]
    {
        let _ = (app, url);
        Err("Not on this device".into())
    }
}

/// Downloads (and verifies) the update found by `update_check`.
#[tauri::command]
pub async fn update_download() -> Result<(), String> {
    #[cfg(desktop)]
    {
        let update = PENDING.lock().unwrap().as_ref().and_then(|p| p.update.clone()).ok_or("No update to download")?;
        let bytes = update.download(|_, _| {}, || {}).await.map_err(|e| e.to_string())?;
        if let Some(p) = PENDING.lock().unwrap().as_mut() {
            p.bytes = Some(bytes);
        }
        Ok(())
    }
    #[cfg(mobile)]
    Err("Not on this device".into())
}

/// Installs the downloaded update, then restarts into it.
#[tauri::command]
pub async fn update_install(app: AppHandle) -> Result<(), String> {
    #[cfg(desktop)]
    {
        let (update, bytes) = {
            let mut guard = PENDING.lock().unwrap();
            let p = guard.as_mut().ok_or("No update to install")?;
            (p.update.clone().ok_or("No update to install")?, p.bytes.take().ok_or("The update isn't downloaded yet")?)
        };
        update.install(bytes).map_err(|e| e.to_string())?;
        app.restart();
    }
    #[cfg(mobile)]
    {
        let _ = app;
        Err("Not on this device".into())
    }
}
