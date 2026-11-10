// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // WebKitGTK flickers the editor while typing under Wayland (seen on GNOME
    // with fractional scaling); running through XWayland draws cleanly. Must be
    // set before GTK starts. A GDK_BACKEND the user set themselves wins.
    // Only when XWayland is running (DISPLAY set), else GTK couldn't open a window.
    #[cfg(target_os = "linux")]
    if std::env::var_os("GDK_BACKEND").is_none()
        && std::env::var_os("WAYLAND_DISPLAY").is_some()
        && std::env::var_os("DISPLAY").is_some()
    {
        std::env::set_var("GDK_BACKEND", "x11");
    }
    dotmd_lib::run()
}
