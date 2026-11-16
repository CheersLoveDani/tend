//! The desktop's corner glance: one calm, see-through card listing what's waiting (doses, tasks,
//! the weather check-in), shown instead of a pile of notifications.
//!
//! Kept light: the window only exists while it's on screen and is closed (not hidden) when it goes,
//! and the fullscreen check is a couple of cheap Win32 calls. While a game or fullscreen app is in
//! front, it waits and appears once that's gone.

use std::sync::atomic::{AtomicBool, AtomicI64, Ordering};
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindowBuilder};

use crate::db::now_ms;

pub const GLANCE: &str = "glance";
const WIDTH: f64 = 400.0;
const MARGIN: f64 = 16.0;

/// Wanted on screen, but something was fullscreen.
static PENDING: AtomicBool = AtomicBool::new(false);
static CREATING: AtomicBool = AtomicBool::new(false);
static LAST_SHOWN: AtomicI64 = AtomicI64::new(0);

/// Asks for the glance to appear: now, or once nothing fullscreen is in front.
pub fn request(app: &AppHandle) {
    if fullscreen_in_front() {
        PENDING.store(true, Ordering::SeqCst);
    } else {
        open(app);
    }
}

/// Called from the scheduler tick: shows a glance that waited for a fullscreen app to go.
pub fn on_tick(app: &AppHandle) {
    if PENDING.load(Ordering::SeqCst) && !fullscreen_in_front() {
        PENDING.store(false, Ordering::SeqCst);
        open(app);
    }
}

pub fn last_shown() -> i64 {
    LAST_SHOWN.load(Ordering::SeqCst)
}

fn open(app: &AppHandle) {
    LAST_SHOWN.store(now_ms(), Ordering::SeqCst);
    if let Some(w) = app.get_webview_window(GLANCE) {
        // Already up: let it reload what's waiting.
        let _ = w.emit("glance-shown", ());
        return;
    }
    if CREATING.swap(true, Ordering::SeqCst) {
        return;
    }
    let app = app.clone();
    // Building a webview from inside an event handler can deadlock on Windows; use a thread.
    std::thread::spawn(move || {
        let built = WebviewWindowBuilder::new(&app, GLANCE, WebviewUrl::App("index.html?glance=1".into()))
            .title("Tend")
            .inner_size(WIDTH, 200.0)
            .resizable(false)
            .maximizable(false)
            .minimizable(false)
            .decorations(false)
            .transparent(true)
            .shadow(false)
            .always_on_top(true)
            .skip_taskbar(true)
            // Clicks work, but it never takes focus from what you're doing.
            .focusable(false)
            .focused(false)
            // The page sizes, places and shows it once it has drawn (glance_fit).
            .visible(false)
            .build();
        CREATING.store(false, Ordering::SeqCst);
        match built {
            Ok(_) => watch_fullscreen(app),
            Err(e) => log::warn!("couldn't open the glance: {e}"),
        }
    });
}

/// While the glance is up, step aside as soon as a game or fullscreen app comes to the front.
fn watch_fullscreen(app: AppHandle) {
    std::thread::spawn(move || {
        loop {
            std::thread::sleep(Duration::from_secs(1));
            let Some(w) = app.get_webview_window(GLANCE) else { return };
            if fullscreen_in_front() {
                let _ = w.close();
                PENDING.store(true, Ordering::SeqCst);
                return;
            }
        }
    });
}

fn ui_setting(app: &AppHandle, key: &str) -> Option<serde_json::Value> {
    let state = app.state::<crate::AppState>();
    let db = state.db.lock().unwrap();
    let ui: serde_json::Value = db.setting("ui").ok().flatten().and_then(|s| serde_json::from_str(&s).ok())?;
    ui.get(key).cloned()
}

/// Sizes the glance to its content and tucks it into the bottom-right of the chosen screen.
#[tauri::command]
pub fn glance_fit(app: AppHandle, height: f64) {
    let Some(w) = app.get_webview_window(GLANCE) else { return };
    let choice = ui_setting(&app, "overlayMonitor").and_then(|v| v.as_str().map(String::from)).unwrap_or_default();
    let monitors = app.available_monitors().unwrap_or_default();
    let monitor = match choice.as_str() {
        "cursor" => app.cursor_position().ok().and_then(|p| app.monitor_from_point(p.x, p.y).ok().flatten()),
        "" | "primary" => None,
        name => monitors.iter().find(|m| m.name().is_some_and(|n| n == name)).cloned(),
    }
    .or_else(|| app.primary_monitor().ok().flatten())
    .or_else(|| monitors.first().cloned());
    let Some(m) = monitor else { return };
    let f = m.scale_factor();
    let area = m.work_area();
    let (w_px, h_px, margin) = ((WIDTH * f).round(), (height * f).round(), (MARGIN * f).round());
    let _ = w.set_size(PhysicalSize::new(w_px as u32, h_px as u32));
    let x = area.position.x as f64 + area.size.width as f64 - w_px - margin;
    let y = area.position.y as f64 + area.size.height as f64 - h_px - margin;
    let _ = w.set_position(PhysicalPosition::new(x as i32, y as i32));
    let _ = w.show();
}

/// "Show it now" in Settings: appears straight away.
#[tauri::command]
pub fn glance_preview(app: AppHandle) {
    open(&app);
}

#[tauri::command]
pub fn glance_close(app: AppHandle) {
    if let Some(w) = app.get_webview_window(GLANCE) {
        let _ = w.close();
    }
}

#[tauri::command]
pub fn glance_open_main(app: AppHandle) {
    glance_close(app.clone());
    crate::desktop::show_main(&app);
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorInfo {
    name: String,
    width: u32,
    height: u32,
    primary: bool,
}

/// Screens for the "Show on" setting.
#[tauri::command]
pub fn list_monitors(app: AppHandle) -> Vec<MonitorInfo> {
    let primary = app.primary_monitor().ok().flatten().and_then(|m| m.name().cloned());
    app.available_monitors()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|m| {
            let name = m.name()?.clone();
            Some(MonitorInfo { primary: primary.as_ref() == Some(&name), width: m.size().width, height: m.size().height, name })
        })
        .collect()
}

/// True while a game, video or presentation fills the screen, or Windows says it's busy.
#[cfg(windows)]
pub fn fullscreen_in_front() -> bool {
    use windows_sys::Win32::Foundation::RECT;
    use windows_sys::Win32::Graphics::Gdi::{GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST};
    use windows_sys::Win32::UI::Shell::{
        SHQueryUserNotificationState, QUNS_BUSY, QUNS_PRESENTATION_MODE, QUNS_RUNNING_D3D_FULL_SCREEN,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetClassNameW, GetForegroundWindow, GetWindowLongW, GetWindowRect, IsZoomed, GWL_STYLE, WS_CAPTION,
    };
    unsafe {
        let mut state = 0;
        if SHQueryUserNotificationState(&mut state) == 0
            && matches!(state, QUNS_BUSY | QUNS_RUNNING_D3D_FULL_SCREEN | QUNS_PRESENTATION_MODE)
        {
            return true;
        }
        // Borderless "fullscreen" games often don't tell Windows, so look at the front window too.
        let fg = GetForegroundWindow();
        if fg.is_null() {
            return false;
        }
        let mut class = [0u16; 32];
        let n = GetClassNameW(fg, class.as_mut_ptr(), class.len() as i32).max(0) as usize;
        let class = String::from_utf16_lossy(&class[..n]);
        // The desktop and taskbar cover the screen too, but aren't "in the way".
        if matches!(class.as_str(), "Progman" | "WorkerW" | "Shell_TrayWnd" | "Shell_SecondaryTrayWnd") {
            return false;
        }
        // Maximised windows (even ones drawing their own title bar) and anything with a title bar
        // aren't fullscreen.
        if IsZoomed(fg) != 0 || (GetWindowLongW(fg, GWL_STYLE) as u32) & WS_CAPTION == WS_CAPTION {
            return false;
        }
        let mut r: RECT = std::mem::zeroed();
        if GetWindowRect(fg, &mut r) == 0 {
            return false;
        }
        let mut mi: MONITORINFO = std::mem::zeroed();
        mi.cbSize = std::mem::size_of::<MONITORINFO>() as u32;
        if GetMonitorInfoW(MonitorFromWindow(fg, MONITOR_DEFAULTTONEAREST), &mut mi) == 0 {
            return false;
        }
        let m = mi.rcMonitor;
        r.left <= m.left && r.top <= m.top && r.right >= m.right && r.bottom >= m.bottom
    }
}

#[cfg(not(windows))]
pub fn fullscreen_in_front() -> bool {
    false
}
