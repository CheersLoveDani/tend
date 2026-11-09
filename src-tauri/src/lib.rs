mod actions;
mod backup;
mod db;
mod fitness;
mod meds;
mod model;
mod rewards;
mod suggest;
mod sync;
mod update;

use std::sync::{Arc, Mutex};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

use db::Db;
use model::{DayStat, Reminder, ReminderInput, RewardEvent, Snapshot};

pub struct AppState {
    db: Arc<Mutex<Db>>,
    sync: Arc<sync::SyncState>,
    data_dir: std::path::PathBuf,
}

type Res<T> = Result<T, String>;

fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

fn surprise_enabled(db: &Db) -> bool {
    db.setting("surpriseBonuses").ok().flatten().is_none_or(|v| v != "false")
}

/// Tells every window the data changed (sync, tray, notification actions).
fn notify_changed(app: &AppHandle) {
    let _ = app.emit("data-changed", ());
    #[cfg(desktop)]
    desktop::refresh_tray(app);
}

#[tauri::command]
fn snapshot(app: AppHandle, state: State<AppState>) -> Res<Snapshot> {
    let db = state.db.lock().unwrap();
    // Cheap when nothing is overdue; keeps daily habits on today after midnight.
    if actions::roll_forward(&db).map_err(err)? > 0 {
        after_local_change(&app);
    }
    let since = (chrono::Local::now() - chrono::Duration::days(45)).format("%Y-%m-%d").to_string();
    let reminders = db.reminders_live(&since).map_err(err)?;
    let level = rewards::level_info(db.total_xp().map_err(err)?);
    let since_ms = (chrono::Local::now() - chrono::Duration::days(29))
        .date_naive()
        .and_hms_opt(0, 0, 0)
        .unwrap()
        .and_local_timezone(chrono::Local)
        .earliest()
        .map(|d| d.timestamp_millis())
        .unwrap_or(0);
    let mut days: Vec<DayStat> = (0..30)
        .rev()
        .map(|i| DayStat {
            date: (chrono::Local::now() - chrono::Duration::days(i)).format("%Y-%m-%d").to_string(),
            seeds: 0,
            done: 0,
        })
        .collect();
    for (at, amount, kind) in db.day_stats(since_ms).map_err(err)? {
        let date = chrono::DateTime::from_timestamp_millis(at)
            .map(|d| d.with_timezone(&chrono::Local).format("%Y-%m-%d").to_string())
            .unwrap_or_default();
        if let Some(d) = days.iter_mut().find(|d| d.date == date) {
            d.seeds += amount;
            // A skipped dose earns a little but isn't something "done".
            if kind == "finish" || kind == "dose" || kind == "workout" {
                d.done += 1;
            }
        }
    }
    let med_views = meds::meds(&db).and_then(|all| all.into_iter().map(|m| meds::view(&db, m)).collect()).map_err(err)?;
    let entries_since = (chrono::Local::now() - chrono::Duration::days(90)).format("%Y-%m-%d").to_string();
    Ok(Snapshot {
        reminders,
        level,
        days,
        device_id: db.device.clone(),
        meds: med_views,
        doses: meds::today_slots(&db).map_err(err)?,
        dose_alarms: meds::upcoming_slots(&db, 7).map_err(err)?,
        entries: meds::entries(&db, &entries_since).map_err(err)?,
    })
}

// ---- backup ----

#[tauri::command]
fn backup_status(state: State<AppState>) -> Res<backup::Status> {
    backup::status(&state.db.lock().unwrap()).map_err(err)
}

#[tauri::command]
async fn set_backup_passphrase(state: State<'_, AppState>, passphrase: String) -> Res<()> {
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || backup::set_passphrase(&db.lock().unwrap(), &passphrase))
        .await
        .map_err(err)?
        .map_err(err)
}

#[tauri::command]
fn set_backup_dir(state: State<AppState>, dir: String) -> Res<()> {
    backup::set_dir(&state.db.lock().unwrap(), &dir).map_err(err)
}

/// Desktop with a folder: writes the file and returns `{ path }`. Otherwise returns
/// `{ data }` (base64) for the caller to save, then report back with `backup_written`.
#[tauri::command]
async fn backup_now(state: State<'_, AppState>) -> Res<serde_json::Value> {
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let db = db.lock().unwrap();
        let has_dir = backup::status(&db).map(|s| s.dir.is_some()).unwrap_or(false);
        let out = if cfg!(desktop) && has_dir {
            backup::to_dir(&db).map(|p| {
                let _ = backup::record(&db, None);
                serde_json::json!({ "path": p.display().to_string() })
            })
        } else {
            backup::encrypt(&db).map(|b| {
                use base64::Engine;
                serde_json::json!({ "data": base64::engine::general_purpose::STANDARD.encode(b) })
            })
        };
        if let Err(e) = &out {
            let _ = backup::record(&db, Some(&e.to_string()));
        }
        out.map_err(err)
    })
    .await
    .map_err(err)?
}

#[tauri::command]
fn backup_written(state: State<AppState>, error: Option<String>) -> Res<()> {
    backup::record(&state.db.lock().unwrap(), error.as_deref()).map_err(err)
}

#[tauri::command]
async fn restore_backup(
    app: AppHandle,
    state: State<'_, AppState>,
    data: Option<String>,
    path: Option<String>,
    passphrase: String,
) -> Res<backup::Restored> {
    use base64::Engine;
    let bytes = match (data, path) {
        (Some(d), _) => base64::engine::general_purpose::STANDARD.decode(d).map_err(|_| "That file couldn't be read".to_string())?,
        (None, Some(p)) => std::fs::read(p).map_err(err)?,
        _ => return Err("Choose a backup to restore".into()),
    };
    let db = state.db.clone();
    let done = tauri::async_runtime::spawn_blocking(move || backup::restore(&db.lock().unwrap(), &bytes, &passphrase))
        .await
        .map_err(err)?
        .map_err(err)?;
    notify_changed(&app);
    after_local_change(&app);
    Ok(done)
}

// ---- medication ----

#[tauri::command]
fn save_med(app: AppHandle, state: State<AppState>, input: meds::MedInput) -> Res<meds::Med> {
    let m = meds::upsert_med(&state.db.lock().unwrap(), input).map_err(err)?;
    after_local_change(&app);
    Ok(m)
}

#[tauri::command]
fn delete_med(app: AppHandle, state: State<AppState>, id: String) -> Res<()> {
    meds::delete_med(&state.db.lock().unwrap(), &id).map_err(err)?;
    after_local_change(&app);
    Ok(())
}

#[tauri::command]
fn add_med_stock(app: AppHandle, state: State<AppState>, id: String, amount: f64) -> Res<meds::Med> {
    let m = meds::add_stock(&state.db.lock().unwrap(), &id, amount).map_err(err)?;
    after_local_change(&app);
    Ok(m)
}

#[tauri::command]
fn take_dose(app: AppHandle, state: State<AppState>, id: String) -> Res<RewardEvent> {
    let e = meds::take(&state.db.lock().unwrap(), &id).map_err(err)?;
    after_local_change(&app);
    Ok(e)
}

#[tauri::command]
fn take_extra_dose(app: AppHandle, state: State<AppState>, med_id: String, amount: f64) -> Res<RewardEvent> {
    let e = meds::take_extra(&state.db.lock().unwrap(), &med_id, amount).map_err(err)?;
    after_local_change(&app);
    Ok(e)
}

#[tauri::command]
fn skip_dose(app: AppHandle, state: State<AppState>, id: String) -> Res<RewardEvent> {
    let e = meds::skip(&state.db.lock().unwrap(), &id).map_err(err)?;
    after_local_change(&app);
    Ok(e)
}

#[tauri::command]
fn undo_dose(app: AppHandle, state: State<AppState>, id: String) -> Res<RewardEvent> {
    let e = meds::undo(&state.db.lock().unwrap(), &id).map_err(err)?;
    after_local_change(&app);
    Ok(e)
}

#[tauri::command]
fn med_history(state: State<AppState>, id: String, days: i64) -> Res<Vec<meds::DayAdherence>> {
    meds::history(&state.db.lock().unwrap(), &id, days.clamp(1, 366)).map_err(err)
}

#[tauri::command]
fn save_entry(app: AppHandle, state: State<AppState>, entry: meds::Entry) -> Res<RewardEvent> {
    let e = meds::save_entry(&state.db.lock().unwrap(), entry).map_err(err)?;
    after_local_change(&app);
    Ok(e)
}

#[tauri::command]
fn delete_entry(app: AppHandle, state: State<AppState>, id: String) -> Res<()> {
    meds::delete_entry(&state.db.lock().unwrap(), &id).map_err(err)?;
    after_local_change(&app);
    Ok(())
}

/// Pays seeds for steps and workouts read from Health Connect on the phone.
#[tauri::command]
fn fit_award(app: AppHandle, state: State<AppState>, input: fitness::FitInput) -> Res<fitness::FitResult> {
    let db = state.db.lock().unwrap();
    let r = fitness::award(&db, input, surprise_enabled(&db)).map_err(err)?;
    drop(db);
    if r.event.gained > 0 || !r.completed.is_empty() {
        after_local_change(&app);
    }
    Ok(r)
}

#[tauri::command]
fn export_health(state: State<AppState>) -> Res<String> {
    let data = meds::export(&state.db.lock().unwrap()).map_err(err)?;
    serde_json::to_string_pretty(&data).map_err(err)
}

#[tauri::command]
fn import_health(app: AppHandle, state: State<AppState>, json: String) -> Res<(usize, usize, usize)> {
    let data: meds::HealthExport = serde_json::from_str(&json).map_err(|_| "That file isn't a Tend health export".to_string())?;
    let counts = meds::import(&state.db.lock().unwrap(), data).map_err(err)?;
    after_local_change(&app);
    Ok(counts)
}

#[tauri::command]
fn save_reminder(app: AppHandle, state: State<AppState>, input: ReminderInput) -> Res<Reminder> {
    let r = actions::upsert(&state.db.lock().unwrap(), input).map_err(err)?;
    after_local_change(&app);
    Ok(r)
}

#[tauri::command]
fn delete_reminder(app: AppHandle, state: State<AppState>, id: String) -> Res<()> {
    actions::delete(&state.db.lock().unwrap(), &id).map_err(err)?;
    after_local_change(&app);
    Ok(())
}

#[tauri::command]
fn move_reminder(app: AppHandle, state: State<AppState>, id: String, date: String) -> Res<Reminder> {
    let r = actions::move_to(&state.db.lock().unwrap(), &id, &date).map_err(err)?;
    after_local_change(&app);
    Ok(r)
}

/// Moves several reminders at once; `date` may be SOMEDAY ("9999-12-31"). Returns how many moved.
#[tauri::command]
fn move_reminders(app: AppHandle, state: State<AppState>, ids: Vec<String>, date: String) -> Res<usize> {
    let n = actions::move_many(&state.db.lock().unwrap(), &ids, &date).map_err(err)?;
    if n > 0 {
        after_local_change(&app);
    }
    Ok(n)
}

#[tauri::command]
fn toggle_step(app: AppHandle, state: State<AppState>, id: String, step_id: String, done: bool) -> Res<RewardEvent> {
    let db = state.db.lock().unwrap();
    let e = actions::toggle_step(&db, &id, &step_id, done, surprise_enabled(&db)).map_err(err)?;
    drop(db);
    after_local_change(&app);
    Ok(e)
}

#[tauri::command]
fn did_a_bit(app: AppHandle, state: State<AppState>, id: String) -> Res<RewardEvent> {
    let e = actions::did_a_bit(&state.db.lock().unwrap(), &id).map_err(err)?;
    after_local_change(&app);
    Ok(e)
}

#[tauri::command]
fn complete_reminder(app: AppHandle, state: State<AppState>, id: String) -> Res<RewardEvent> {
    let db = state.db.lock().unwrap();
    let e = actions::complete(&db, &id, surprise_enabled(&db)).map_err(err)?;
    drop(db);
    after_local_change(&app);
    Ok(e)
}

#[tauri::command]
fn reopen_reminder(app: AppHandle, state: State<AppState>, id: String) -> Res<RewardEvent> {
    let e = actions::reopen(&state.db.lock().unwrap(), &id).map_err(err)?;
    after_local_change(&app);
    Ok(e)
}

#[tauri::command]
fn get_settings(state: State<AppState>) -> Res<serde_json::Value> {
    let db = state.db.lock().unwrap();
    let raw = db.setting("ui").map_err(err)?.unwrap_or_else(|| "{}".into());
    serde_json::from_str(&raw).map_err(err)
}

#[tauri::command]
fn set_settings(state: State<AppState>, settings: serde_json::Value) -> Res<()> {
    let db = state.db.lock().unwrap();
    let surprise = settings.get("surpriseBonuses").and_then(|v| v.as_bool()).unwrap_or(true);
    db.set_setting("surpriseBonuses", if surprise { "true" } else { "false" }).map_err(err)?;
    db.set_setting("ui", &settings.to_string()).map_err(err)
}

// ---------- suggestions ----------

#[tauri::command]
async fn suggest_reward(
    state: State<'_, AppState>,
    title: String,
    notes: String,
    steps: Vec<String>,
    use_model: Option<bool>,
) -> Res<suggest::Suggestion> {
    let db = state.db.clone();
    let dir = state.data_dir.join("model");
    tauri::async_runtime::spawn_blocking(move || suggest::suggest(&db, &dir, title, notes, steps, use_model.unwrap_or(true)))
        .await
        .map_err(err)?
        .map_err(err)
}

#[tauri::command]
async fn suggest_steps(state: State<'_, AppState>, title: String) -> Res<Vec<tend_llm::StepIdea>> {
    let db = state.db.clone();
    let dir = state.data_dir.join("model");
    tauri::async_runtime::spawn_blocking(move || suggest::steps(&db, &dir, title))
        .await
        .map_err(err)?
        .map_err(err)
}

#[tauri::command]
async fn suggest_emoji(state: State<'_, AppState>, text: String, use_model: bool) -> Res<String> {
    let dir = state.data_dir.join("model");
    tauri::async_runtime::spawn_blocking(move || suggest::emoji(&dir, &text, use_model)).await.map_err(err)
}

#[tauri::command]
fn model_status(state: State<AppState>) -> suggest::ModelStatus {
    suggest::status(&state.data_dir.join("model"))
}

#[tauri::command]
async fn download_model(app: AppHandle, state: State<'_, AppState>) -> Res<()> {
    let dir = state.data_dir.join("model");
    tauri::async_runtime::spawn_blocking(move || {
        suggest::download(&dir, |done, total| {
            let _ = app.emit("model-progress", (done, total));
        })
    })
    .await
    .map_err(err)?
    .map_err(err)
}

#[tauri::command]
fn delete_model(state: State<AppState>) -> Res<()> {
    let dir = state.data_dir.join("model");
    if dir.exists() {
        std::fs::remove_dir_all(dir).map_err(err)?;
    }
    Ok(())
}

// ---------- sync ----------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SyncInfo {
    device_id: String,
    name: String,
    hosting: bool,
    code: String,
    port: u16,
    addresses: Vec<String>,
    peers: Vec<sync::Peer>,
}

/// Accept pairing for the next couple of minutes; the UI calls this while the code is showing.
#[tauri::command]
fn open_pairing(state: State<AppState>) {
    state.sync.open_pairing();
}

#[tauri::command]
fn sync_info(state: State<AppState>) -> Res<SyncInfo> {
    let db = state.db.lock().unwrap();
    Ok(SyncInfo {
        device_id: db.device.clone(),
        name: state.sync.name.clone(),
        hosting: state.sync.hosting,
        code: state.sync.code(),
        port: sync::HTTP_PORT,
        addresses: sync::local_addresses(),
        peers: sync::peers(&db).map_err(err)?,
    })
}

#[tauri::command]
async fn discover_hosts(state: State<'_, AppState>) -> Res<Vec<sync::Hello>> {
    let own = state.db.lock().unwrap().device.clone();
    tauri::async_runtime::spawn_blocking(move || sync::discover(&own)).await.map_err(err)
}

#[tauri::command]
async fn pair_with(app: AppHandle, state: State<'_, AppState>, host: String, port: Option<u16>, code: String) -> Res<sync::Peer> {
    let db = state.db.clone();
    let name = state.sync.name.clone();
    let peer = tauri::async_runtime::spawn_blocking(move || {
        sync::pair(&db, &name, &host, port.unwrap_or(sync::HTTP_PORT), &code)
    })
    .await
    .map_err(err)?
    .map_err(err)?;
    run_sync(app).await?;
    Ok(peer)
}

#[tauri::command]
async fn pair_any(
    app: AppHandle,
    state: State<'_, AppState>,
    hosts: Vec<String>,
    port: u16,
    code: String,
    device: Option<String>,
) -> Res<sync::Peer> {
    let db = state.db.clone();
    let name = state.sync.name.clone();
    let peer = tauri::async_runtime::spawn_blocking(move || {
        sync::pair_any(&db, &name, &hosts, port, &code, device.as_deref())
    })
    .await
    .map_err(err)?
    .map_err(err)?;
    run_sync(app).await?;
    Ok(peer)
}

#[tauri::command]
fn forget_peer(state: State<AppState>, id: String) -> Res<()> {
    sync::forget(&state.db.lock().unwrap(), &id).map_err(err)
}

#[tauri::command]
async fn sync_now(app: AppHandle) -> Res<sync::SyncOutcome> {
    run_sync(app).await
}

async fn run_sync(app: AppHandle) -> Res<sync::SyncOutcome> {
    let db = app.state::<AppState>().db.clone();
    let out = tauri::async_runtime::spawn_blocking(move || sync::sync_all(&db)).await.map_err(err)?;
    if out.changed > 0 {
        notify_changed(&app);
    }
    Ok(out)
}

/// Pushes local edits to paired hosts shortly after they happen.
fn after_local_change(app: &AppHandle) {
    #[cfg(desktop)]
    desktop::refresh_tray(app);
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let _ = run_sync(app).await;
    });
}

#[cfg(desktop)]
mod desktop;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();
    #[cfg(desktop)]
    {
        builder = builder
            .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
                desktop::show_main(app);
            }))
            .plugin(tauri_plugin_autostart::init(
                tauri_plugin_autostart::MacosLauncher::LaunchAgent,
                Some(vec!["--hidden"]),
            ))
            .plugin(tauri_plugin_updater::Builder::new().build())
            .plugin(tauri_plugin_dialog::init())
            .plugin(tauri_plugin_process::init());
    }
    #[cfg(mobile)]
    {
        builder = builder.plugin(tauri_plugin_barcode_scanner::init());
    }
    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_tend_native::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let db = Db::open(&data_dir.join("tend.db"))?;
            if let Err(e) = actions::roll_forward(&db) {
                log::warn!("rolling repeating reminders forward failed: {e}");
            }
            let db = Arc::new(Mutex::new(db));
            let hosting = cfg!(desktop);
            let name = if cfg!(target_os = "android") {
                "Phone".to_string()
            } else {
                std::env::var("COMPUTERNAME")
                    .or_else(|_| std::env::var("HOSTNAME"))
                    .unwrap_or_else(|_| "Computer".into())
            };
            let sync_state = Arc::new(sync::SyncState::new(name, hosting));
            if hosting {
                let handle = app.handle().clone();
                sync::serve(db.clone(), sync_state.clone(), move || notify_changed(&handle));
            }
            app.manage(AppState { db, sync: sync_state, data_dir });
            #[cfg(desktop)]
            desktop::setup(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            snapshot,
            save_reminder,
            delete_reminder,
            move_reminder,
            move_reminders,
            toggle_step,
            did_a_bit,
            complete_reminder,
            reopen_reminder,
            get_settings,
            set_settings,
            suggest_reward,
            suggest_steps,
            suggest_emoji,
            model_status,
            download_model,
            delete_model,
            sync_info,
            open_pairing,
            discover_hosts,
            pair_with,
            pair_any,
            forget_peer,
            sync_now,
            save_med,
            delete_med,
            add_med_stock,
            take_dose,
            take_extra_dose,
            skip_dose,
            undo_dose,
            med_history,
            save_entry,
            delete_entry,
            fit_award,
            export_health,
            import_health,
            backup_status,
            set_backup_passphrase,
            set_backup_dir,
            backup_now,
            backup_written,
            restore_backup,
            update::update_check,
            update::update_download,
            update::update_install,
        ])
        .build(tauri::generate_context!())
        .expect("error while building Tend")
        .run(|_app, _event| {
            #[cfg(desktop)]
            if let tauri::RunEvent::ExitRequested { api, code, .. } = &_event {
                // Closing the window keeps Tend in the tray; only "Quit" exits.
                if code.is_none() {
                    api.prevent_exit();
                }
            }
        });
}
