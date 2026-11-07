//! Filesystem watcher: keep the UI in sync when notes change on disk from
//! outside the app (deleting a `.md` in Explorer, editing it in another editor).
//!
//! The app's own writes land here too, but they're harmless: refreshes are
//! idempotent, the frontend coalesces bursts, and config writes
//! (`settings.json`, `theme.css`) plus atomic-write temp files (`*.md.tmp`) are
//! filtered out so routine saves don't trigger a storm.

use std::sync::mpsc::channel;

use notify::{EventKind, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter, Manager};

use crate::storage;

/// Emitted when any `.md` under notes/ (incl. .trash/) is created/changed/removed.
const NOTES_EVENT: &str = "notes-changed";
/// Emitted when a project file (projects/*.md) changes.
const PROJECTS_EVENT: &str = "projects-changed";
/// Emitted when todo.md changes on disk.
const TODO_EVENT: &str = "todo-changed";

/// Start watching the data folder. Failures are logged, not fatal — the app
/// still works, it just won't auto-refresh on external changes.
pub fn start(app: &AppHandle) {
    if let Err(e) = try_start(app) {
        eprintln!("file watcher failed to start: {e}");
    }
}

fn try_start(app: &AppHandle) -> Result<(), String> {
    let notes_dir = storage::notes_dir(app)?;
    let projects_dir = crate::projects::projects_dir(app)?;
    let data_dir = storage::data_dir(app)?;

    let (tx, rx) = channel();
    let mut watcher =
        notify::recommended_watcher(move |res| {
            let _ = tx.send(res);
        })
        .map_err(|e| e.to_string())?;

    // notes/ recursively (covers .trash/); the data dir non-recursively for todo.md.
    watcher
        .watch(&notes_dir, RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;
    watcher
        .watch(&projects_dir, RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;
    watcher
        .watch(&data_dir, RecursiveMode::NonRecursive)
        .map_err(|e| e.to_string())?;

    let handle = app.clone();
    std::thread::spawn(move || {
        // Hold the watcher for the life of the thread (and so the app).
        let _watcher = watcher;
        for res in rx {
            let event = match res {
                Ok(e) => e,
                Err(_) => continue,
            };
            if !matches!(
                event.kind,
                EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_)
            ) {
                continue;
            }

            let mut notes = false;
            let mut todo = false;
            let mut projects = false;
            for path in &event.paths {
                match path.file_name().and_then(|n| n.to_str()) {
                    Some("todo.md") => todo = true,
                    // App-written config: ignore so routine saves don't refresh.
                    Some("settings.json") | Some("theme.css") => {}
                    _ => {
                        // Only real notes; `*.md.tmp` has extension "tmp".
                        if path.extension().and_then(|e| e.to_str()) == Some("md") {
                            if path.starts_with(&projects_dir) {
                                projects = true;
                            } else {
                                notes = true;
                            }
                        }
                    }
                }
            }

            // Emit per category; the frontend debounces bursts into one refresh.
            if notes {
                let _ = handle.emit(NOTES_EVENT, ());
            }
            if todo {
                let _ = handle.emit(TODO_EVENT, ());
            }
            if projects {
                let _ = handle.emit(PROJECTS_EVENT, ());
            }
        }
    });

    Ok(())
}
