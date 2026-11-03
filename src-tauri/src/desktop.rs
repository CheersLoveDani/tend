//! Desktop-only: tray icon with today's list, close-to-tray, a quick-add window on a global
//! hotkey, and a tiny scheduler that fires due reminders.

use std::sync::atomic::{AtomicBool, AtomicI64, Ordering};
use std::time::Duration;

use tauri::menu::{IsMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{App, AppHandle, Emitter, Manager, Runtime, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use tauri_plugin_notification::NotificationExt;

use crate::AppState;
use crate::actions::today;
use crate::db::now_ms;
use crate::model::Reminder;

/// How many of today's reminders the tray menu lists.
const TRAY_ITEMS: usize = 8;
const QUICK: &str = "quick";

pub fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

pub fn setup(app: &mut App) -> tauri::Result<()> {
    let menu = build_menu(app.handle(), &[])?;
    TrayIconBuilder::with_id("tray")
        .icon(app.default_window_icon().cloned().expect("app icon"))
        .tooltip("Tend")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, e| match e.id().as_ref() {
            "open" => show_main(app),
            "quick" => toggle_quick(app),
            "sync" => {
                let app = app.clone();
                tauri::async_runtime::spawn(async move {
                    let _ = crate::run_sync(app).await;
                });
            }
            "quit" => app.exit(0),
            id => {
                if let Some(rid) = id.strip_prefix("done:") {
                    complete_from_tray(app, rid);
                }
            }
        })
        .on_tray_icon_event(|tray, e| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = e {
                show_main(tray.app_handle());
            }
        })
        .build(app)?;
    refresh_tray(app.handle());

    if let Some(w) = app.get_webview_window("main") {
        let hidden = std::env::args().any(|a| a == "--hidden");
        if !hidden {
            let _ = w.show();
        }
        let w2 = w.clone();
        w.on_window_event(move |e| {
            if let WindowEvent::CloseRequested { api, .. } = e {
                api.prevent_close();
                let _ = w2.hide();
            }
        });
    }

    // Ctrl+Alt+Space opens quick add from anywhere. Another app may already own the combo;
    // that's not worth failing startup over.
    let quick_key = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::Space);
    app.handle().plugin(
        tauri_plugin_global_shortcut::Builder::new()
            .with_handler(move |app, shortcut, event| {
                if event.state == ShortcutState::Pressed && shortcut == &quick_key {
                    toggle_quick(app);
                }
            })
            .build(),
    )?;
    if let Err(e) = app.global_shortcut().register(quick_key) {
        log::warn!("couldn't register the quick-add shortcut: {e}");
    }

    let handle = app.handle().clone();
    std::thread::spawn(move || {
        loop {
            tick(&handle);
            std::thread::sleep(Duration::from_secs(30));
        }
    });
    let handle = app.handle().clone();
    // Background sync every 5 minutes so phone edits show up even when idle.
    std::thread::spawn(move || {
        loop {
            std::thread::sleep(Duration::from_secs(300));
            let _ = tauri::async_runtime::block_on(crate::run_sync(handle.clone()));
        }
    });
    Ok(())
}

// ---------- tray menu ----------

/// Today's and overdue open reminders, today's first. Someday ones never show here.
fn tray_reminders(app: &AppHandle) -> Vec<Reminder> {
    let state = app.state::<AppState>();
    let today = today();
    let Ok(all) = state.db.lock().unwrap().reminders_live(&today) else { return vec![] };
    let mut open: Vec<Reminder> = all.into_iter().filter(|r| r.status == "open" && r.date <= today).collect();
    // Stable sort keeps the date/time order within each group.
    open.sort_by_key(|r| r.date != today);
    open.truncate(TRAY_ITEMS);
    open
}

fn menu_label(r: &Reminder) -> String {
    let mut title: String = r.title.chars().take(40).collect();
    if r.title.chars().count() > 40 {
        title.push('…');
    }
    // Windows menus treat a lone `&` as a mnemonic marker.
    let title = title.replace('&', "&&");
    match r.time.as_deref() {
        Some(t) if r.date == today() => format!("○  {title}  ·  {t}"),
        _ => format!("○  {title}"),
    }
}

fn build_menu<R: Runtime>(app: &AppHandle<R>, items: &[Reminder]) -> tauri::Result<Menu<R>> {
    let mut owned: Vec<Box<dyn IsMenuItem<R>>> = Vec::new();
    if items.is_empty() {
        owned.push(Box::new(MenuItem::with_id(app, "none", "Nothing waiting today", false, None::<&str>)?));
    } else {
        owned.push(Box::new(MenuItem::with_id(app, "hint", "Click one to mark it done", false, None::<&str>)?));
        for r in items {
            owned.push(Box::new(MenuItem::with_id(app, format!("done:{}", r.id), menu_label(r), true, None::<&str>)?));
        }
    }
    owned.push(Box::new(PredefinedMenuItem::separator(app)?));
    owned.push(Box::new(MenuItem::with_id(app, "quick", "Quick add (Ctrl+Alt+Space)", true, None::<&str>)?));
    owned.push(Box::new(MenuItem::with_id(app, "open", "Open Tend", true, None::<&str>)?));
    owned.push(Box::new(MenuItem::with_id(app, "sync", "Sync now", true, None::<&str>)?));
    owned.push(Box::new(MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?));
    let refs: Vec<&dyn IsMenuItem<R>> = owned.iter().map(|b| b.as_ref()).collect();
    Menu::with_items(app, &refs)
}

/// Rebuilds the tray menu from the database. Runs off the caller's thread, so it's safe to call
/// while holding the database lock.
pub fn refresh_tray(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || {
        let items = tray_reminders(&app);
        let Some(tray) = app.tray_by_id("tray") else { return };
        match build_menu(&app, &items) {
            Ok(menu) => {
                let _ = tray.set_menu(Some(menu));
            }
            Err(e) => log::warn!("couldn't rebuild the tray menu: {e}"),
        }
    });
}

fn complete_from_tray(app: &AppHandle, id: &str) {
    let state = app.state::<AppState>();
    let db = state.db.lock().unwrap();
    let done = crate::actions::complete(&db, id, crate::surprise_enabled(&db));
    drop(db);
    match done {
        Ok(_) => {
            crate::notify_changed(app);
            crate::after_local_change(app);
        }
        Err(e) => log::warn!("couldn't complete {id} from the tray: {e}"),
    }
}

// ---------- quick add window ----------

static QUICK_CREATING: AtomicBool = AtomicBool::new(false);
static QUICK_SHOWN_AT: AtomicI64 = AtomicI64::new(0);

fn show_quick(w: &tauri::WebviewWindow) {
    QUICK_SHOWN_AT.store(now_ms(), Ordering::Relaxed);
    let _ = w.center();
    let _ = w.show();
    let _ = w.set_focus();
    // Lets the page clear and focus its input each time it appears.
    let _ = w.emit("quick-shown", ());
}

/// Shows the small quick-add window, or hides it if it's already up. It's created on first use
/// and then kept (hidden) so later presses are instant.
pub fn toggle_quick(app: &AppHandle) {
    if let Some(w) = app.get_webview_window(QUICK) {
        if w.is_visible().unwrap_or(false) {
            let _ = w.hide();
        } else {
            show_quick(&w);
        }
        return;
    }
    if QUICK_CREATING.swap(true, Ordering::SeqCst) {
        return;
    }
    // Building a webview from inside an event handler can deadlock on Windows; use a thread.
    let app = app.clone();
    std::thread::spawn(move || {
        let built = WebviewWindowBuilder::new(&app, QUICK, WebviewUrl::App("index.html?quick=1".into()))
            .title("Quick add")
            .inner_size(460.0, 120.0)
            .resizable(false)
            .maximizable(false)
            .minimizable(false)
            .decorations(false)
            // The page draws its own rounded card on a transparent background.
            .transparent(true)
            .shadow(false)
            .always_on_top(true)
            .skip_taskbar(true)
            .center()
            .visible(false)
            .build();
        QUICK_CREATING.store(false, Ordering::SeqCst);
        match built {
            Ok(w) => {
                let w2 = w.clone();
                w.on_window_event(move |e| match e {
                    // Clicking elsewhere puts it away. Ignore the focus shuffle right after showing.
                    WindowEvent::Focused(false) if now_ms() - QUICK_SHOWN_AT.load(Ordering::Relaxed) > 400 => {
                        let _ = w2.hide();
                    }
                    WindowEvent::CloseRequested { api, .. } => {
                        api.prevent_close();
                        let _ = w2.hide();
                    }
                    _ => {}
                });
                show_quick(&w);
            }
            Err(e) => log::warn!("couldn't open quick add: {e}"),
        }
    });
}

// ---------- scheduler ----------

fn in_quiet_hours(ui: &serde_json::Value) -> bool {
    let Some(q) = ui.get("quietHours").filter(|q| !q.is_null()) else { return false };
    let (Some(start), Some(end)) = (q.get("start").and_then(|v| v.as_str()), q.get("end").and_then(|v| v.as_str()))
    else {
        return false;
    };
    let now = chrono::Local::now().format("%H:%M").to_string();
    if start <= end { now.as_str() >= start && now.as_str() < end } else { now.as_str() >= start || now.as_str() < end }
}

/// "Quiet for today": the UI stores an epoch-ms `pausedUntil` in its settings.
fn paused(ui: &serde_json::Value) -> bool {
    ui.get("pausedUntil").and_then(|v| v.as_f64()).is_some_and(|until| until > now_ms() as f64)
}

static TRAY_DAY: std::sync::Mutex<String> = std::sync::Mutex::new(String::new());

fn tick(app: &AppHandle) {
    let state = app.state::<AppState>();
    let db = state.db.lock().unwrap();
    // Past midnight, unfinished habits move on to today.
    if crate::actions::roll_forward(&db).unwrap_or(0) > 0 {
        let app = app.clone();
        std::thread::spawn(move || {
            crate::notify_changed(&app);
            crate::after_local_change(&app);
        });
    }
    let today = today();
    {
        // A new day means a different list in the tray.
        let mut day = TRAY_DAY.lock().unwrap();
        if *day != today {
            day.clone_from(&today);
            refresh_tray(app);
        }
    }
    let now = chrono::Local::now();
    let hm = now.format("%H:%M").to_string();
    let Ok(all) = db.reminders_live(&today) else { return };
    // Someday reminders are dated 9999-12-31, so they never count as waiting.
    let waiting: Vec<_> = all.iter().filter(|r| r.status == "open" && r.date <= today).collect();

    if let Some(tray) = app.tray_by_id("tray") {
        let tip = match waiting.len() {
            0 => "Tend — all clear".to_string(),
            1 => format!("Tend — \"{}\" is waiting", waiting[0].title),
            n => format!("Tend — {n} things waiting"),
        };
        let _ = tray.set_tooltip(Some(tip));
    }

    let ui: serde_json::Value = db
        .setting("ui")
        .ok()
        .flatten()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();
    let quiet = in_quiet_hours(&ui);
    let doses: Vec<_> = crate::meds::today_slots(&db)
        .unwrap_or_default()
        .into_iter()
        .filter(|s| s.status == "due" && !s.extra)
        .collect();

    // Medication first. Critical meds still remind during quiet hours; "Quiet for today"
    // never silences doses.
    for s in doses.iter().filter(|s| !quiet || s.critical) {
        let key = format!("dose:{}", s.id);
        if db.was_notified(&key).unwrap_or(true) {
            continue;
        }
        let _ = db.mark_notified(&key);
        let amount = if s.amount.fract() == 0.0 { format!("{}", s.amount as i64) } else { s.amount.to_string() };
        let _ = app
            .notification()
            .builder()
            .title(format!("Time for {}", s.name))
            .body(format!("{amount} {} at {}. Mark it in Tend once it's taken.", s.form, s.time))
            .show();
    }
    if quiet || paused(&ui) {
        return;
    }

    for r in &waiting {
        let Some(time) = r.time.as_deref() else { continue };
        if r.date < today || time > hm.as_str() {
            continue;
        }
        let key = format!("{}@{}", r.id, r.date);
        if db.was_notified(&key).unwrap_or(true) {
            continue;
        }
        let _ = db.mark_notified(&key);
        let body = if r.steps.is_empty() {
            format!("Worth {} seeds whenever you're ready.", r.reward)
        } else {
            let done = r.steps.iter().filter(|s| s.done).count();
            let next = r.steps.iter().find(|s| !s.done).map(|s| s.title.as_str()).unwrap_or("");
            format!("{done}/{} steps. Next tiny step: {next}", r.steps.len())
        };
        let _ = app.notification().builder().title(&r.title).body(body).show();
    }

    // Gentle periodic chime while things are waiting (off when 0).
    let every_min = ui.get("chimeMinutes").and_then(|v| v.as_f64()).unwrap_or(60.0);
    if every_min > 0.0 && (!waiting.is_empty() || !doses.is_empty()) {
        let last: i64 = db.setting("lastNudge").ok().flatten().and_then(|s| s.parse().ok()).unwrap_or(0);
        if now_ms() - last > (every_min * 60_000.0) as i64 {
            let _ = db.set_setting("lastNudge", &now_ms().to_string());
            if last != 0 {
                let title = match (doses.len(), waiting.len()) {
                    (0, 1) => "One thing is still waiting".to_string(),
                    (0, n) => format!("{n} things are still waiting"),
                    (1, _) => format!("{} hasn't been taken yet", doses[0].name),
                    (n, _) => format!("{n} doses haven't been taken yet"),
                };
                let names: Vec<&str> =
                    doses.iter().map(|s| s.name.as_str()).chain(waiting.iter().map(|r| r.title.as_str())).take(3).collect();
                let _ = app.notification().builder().title(title).body(names.join(" · ")).show();
            }
        }
    }
}
