use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, WebviewWindow,
};

/// The warm, always-alive main window. Summoning never cold-starts; it just
/// shows this window and focuses it.
pub fn main_window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window("main")
}

pub fn show_window(app: &AppHandle) {
    if let Some(w) = main_window(app) {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

#[allow(dead_code)] // kept as part of the window-control surface
pub fn hide_window(app: &AppHandle) {
    if let Some(w) = main_window(app) {
        let _ = w.hide();
    }
}

/// Global-shortcut / tray-click behavior: visible+focused → hide, otherwise
/// show. One gesture is both summon and dismiss. Returns `true` when it showed
/// the window (so callers can land the summon on the scratch note).
pub fn toggle_window(app: &AppHandle) -> bool {
    if let Some(w) = main_window(app) {
        let visible = w.is_visible().unwrap_or(false);
        let focused = w.is_focused().unwrap_or(false);
        if visible && focused {
            let _ = w.hide();
            false
        } else {
            let _ = w.show();
            let _ = w.unminimize();
            let _ = w.set_focus();
            true
        }
    } else {
        false
    }
}

/// System tray with Open / Quit and left-click-to-toggle.
pub fn build_tray(app: &AppHandle) -> Result<(), String> {
    let open = MenuItem::with_id(app, "open", "Open dotMD", true, None::<&str>)
        .map_err(|e| e.to_string())?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)
        .map_err(|e| e.to_string())?;
    let menu = Menu::with_items(app, &[&open, &quit]).map_err(|e| e.to_string())?;

    TrayIconBuilder::with_id("main")
        .icon(app.default_window_icon().unwrap().clone())
        .tooltip("dotMD")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_window(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                ..
            } = event
            {
                toggle_window(tray.app_handle());
            }
        })
        .build(app)
        .map_err(|e| e.to_string())?;
    Ok(())
}
