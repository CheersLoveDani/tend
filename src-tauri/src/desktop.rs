//! Desktop-only: tray icon, close-to-tray, and a tiny scheduler that fires due reminders.

use std::time::Duration;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{App, AppHandle, Manager, WindowEvent};
use tauri_plugin_notification::NotificationExt;

use crate::AppState;
use crate::actions::today;
use crate::db::now_ms;

pub fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

pub fn setup(app: &mut App) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open Tend", true, None::<&str>)?;
    let sync = MenuItem::with_id(app, "sync", "Sync now", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &sync, &quit])?;
    TrayIconBuilder::with_id("tray")
        .icon(app.default_window_icon().cloned().expect("app icon"))
        .tooltip("Tend")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, e| match e.id().as_ref() {
            "open" => show_main(app),
            "sync" => {
                let app = app.clone();
                tauri::async_runtime::spawn(async move {
                    let _ = crate::run_sync(app).await;
                });
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, e| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = e {
                show_main(tray.app_handle());
            }
        })
        .build(app)?;

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

fn in_quiet_hours(ui: &serde_json::Value) -> bool {
    let Some(q) = ui.get("quietHours").filter(|q| !q.is_null()) else { return false };
    let (Some(start), Some(end)) = (q.get("start").and_then(|v| v.as_str()), q.get("end").and_then(|v| v.as_str()))
    else {
        return false;
    };
    let now = chrono::Local::now().format("%H:%M").to_string();
    if start <= end { now.as_str() >= start && now.as_str() < end } else { now.as_str() >= start || now.as_str() < end }
}

fn tick(app: &AppHandle) {
    let state = app.state::<AppState>();
    let db = state.db.lock().unwrap();
    let today = today();
    let now = chrono::Local::now();
    let hm = now.format("%H:%M").to_string();
    let Ok(all) = db.reminders_live(&today) else { return };
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
    if in_quiet_hours(&ui) {
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

    // Gentle periodic nudge while things are waiting (off when 0).
    let every_h = ui.get("desktopNudgeHours").and_then(|v| v.as_f64()).unwrap_or(3.0);
    if every_h > 0.0 && !waiting.is_empty() {
        let last: i64 = db.setting("lastNudge").ok().flatten().and_then(|s| s.parse().ok()).unwrap_or(0);
        if now_ms() - last > (every_h * 3_600_000.0) as i64 {
            let _ = db.set_setting("lastNudge", &now_ms().to_string());
            if last != 0 {
                let title = match waiting.len() {
                    1 => "One thing is still waiting".to_string(),
                    n => format!("{n} things are still waiting"),
                };
                let names: Vec<&str> = waiting.iter().take(3).map(|r| r.title.as_str()).collect();
                let _ = app.notification().builder().title(title).body(names.join(" · ")).show();
            }
        }
    }
}
