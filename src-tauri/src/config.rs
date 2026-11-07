use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

#[derive(Serialize, Deserialize, Clone)]
pub struct Settings {
    /// Milliseconds of idle after typing before autosaving.
    pub autosave_ms: u64,
    /// Global accelerator used to summon/hide the window from anywhere.
    pub global_shortcut: String,
    /// Hide the window when it loses focus (off by default — surprising for a
    /// full window).
    pub hide_on_blur: bool,
    /// Last note that was open, so summon can restore it if desired.
    pub last_note: String,
    /// Clicking the window close button hides to tray instead of quitting.
    pub close_to_tray: bool,
    /// Whether the styled (markers-concealed) editor view is on by default.
    #[serde(default = "default_true")]
    pub styled_default: bool,
    /// In-app keybinding overrides: action id -> accelerator. Anything not
    /// listed falls back to the frontend defaults.
    #[serde(default)]
    pub keybindings: HashMap<String, String>,
    /// To-do subject -> swatch name (e.g. "blue"), used to colour subjects on
    /// the Board and Calendar. Kept here so todo.md stays plain Markdown.
    #[serde(default)]
    pub subject_colors: HashMap<String, String>,
    /// Editor focus mode: paragraphs other than the current one fade.
    #[serde(default)]
    pub focus_mode: bool,
    /// Typewriter scrolling: the line being typed stays vertically centred.
    #[serde(default)]
    pub typewriter: bool,
    /// Open editor tabs (note names, in order), restored on launch.
    #[serde(default)]
    pub open_tabs: Vec<String>,
    /// Notes locked in Viewing mode (read-only), by name.
    #[serde(default)]
    pub view_only_notes: Vec<String>,
    /// Page zoom (1.0 = 100%); scales the writing page only.
    #[serde(default = "default_zoom")]
    pub zoom: f64,
}

fn default_zoom() -> f64 {
    1.0
}

fn default_true() -> bool {
    true
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            autosave_ms: 1200,
            global_shortcut: "CommandOrControl+Shift+J".into(),
            hide_on_blur: false,
            last_note: crate::storage::SCRATCH.into(),
            close_to_tray: true,
            styled_default: true,
            keybindings: HashMap::new(),
            subject_colors: HashMap::new(),
            focus_mode: false,
            typewriter: false,
            open_tabs: Vec::new(),
            view_only_notes: Vec::new(),
            zoom: 1.0,
        }
    }
}

fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    crate::storage::data_dir(app)
}

pub const DEFAULT_THEME: &str = r#":root {
  --bg: #1e1e1e;
  --panel-bg: #252526;
  --border: #333333;
  --text: #e6e6e6;
  --muted: #8a8a8a;
  --accent: #d97757;
  --heading: #ffffff;
  --code-bg: #2d2d2d;
  --font-ui: "Inter", system-ui, sans-serif;
  --font-editor: "JetBrains Mono", ui-monospace, monospace;
  --radius: 8px;
}
"#;

/// Load settings.json, creating it with defaults if missing. A corrupt file
/// falls back to defaults rather than failing startup.
pub fn read_settings(app: &AppHandle) -> Result<Settings, String> {
    let path = data_dir(app)?.join("settings.json");
    if !path.exists() {
        let settings = Settings::default();
        write_settings(app, &settings)?;
        return Ok(settings);
    }
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    Ok(serde_json::from_str(&content).unwrap_or_default())
}

pub fn write_settings(app: &AppHandle, settings: &Settings) -> Result<(), String> {
    let path = data_dir(app)?.join("settings.json");
    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn load_settings(app: AppHandle) -> Result<Settings, String> {
    read_settings(&app)
}

#[tauri::command]
pub fn save_settings(app: AppHandle, settings: Settings) -> Result<(), String> {
    write_settings(&app, &settings)
}

/// Return the contents of the user's theme.css, creating it from defaults the
/// first time so there is always something to edit.
#[tauri::command]
pub fn load_theme(app: AppHandle) -> Result<String, String> {
    let path = data_dir(&app)?.join("theme.css");
    if !path.exists() {
        fs::write(&path, DEFAULT_THEME).map_err(|e| e.to_string())?;
    }
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

/// Persist the user's theme.css (written by the Appearance settings).
#[tauri::command]
pub fn save_theme(app: AppHandle, css: String) -> Result<(), String> {
    let path = data_dir(&app)?.join("theme.css");
    fs::write(&path, css).map_err(|e| e.to_string())
}
