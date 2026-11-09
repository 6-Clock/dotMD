mod backup;
mod config;
mod images;
mod links;
mod migrate;
mod projects;
mod shell;
mod storage;
mod terminal;
mod todo;
mod trash;
mod vault;
mod watcher;

use tauri::{Emitter, Manager, WindowEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    migrate::migrate_identifier();

    let mut builder = tauri::Builder::default();

    // One dotMD at a time: closing hides to the tray, so launching it again
    // from the Start Menu would otherwise start a second copy (second tray
    // icon, two watchers saving the same files). A second launch now just
    // shows the running window and exits. Must be the first plugin.
    // Release builds only: dev and installed builds share the identifier, and
    // a dev run must not be swallowed by an installed dotMD.
    #[cfg(all(desktop, not(debug_assertions)))]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            shell::show_window(app);
            let _ = app.emit("summon", ());
        }));
    }

    builder = builder
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .manage(terminal::Terminals::default());

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_global_shortcut::Builder::new().build());
    }

    builder
        .setup(|app| {
            let handle = app.handle();

            // Make sure the scratch note and config files exist up front, so the
            // frontend never has to handle a cold, empty data folder.
            // tauri.conf.json only allows $APPDATA/assets; a dev or
            // DOTMD_DATA_DIR data folder needs its assets/ allowed here.
            let assets = storage::data_dir(handle)?.join("assets");
            std::fs::create_dir_all(&assets)?;
            app.asset_protocol_scope().allow_directory(&assets, true)?;

            // One trash/ folder laid out like the app (moves old .trash folders).
            if let Err(e) = trash::migrate_layout(&storage::data_dir(handle)?) {
                eprintln!("trash migration failed: {e}");
            }
            storage::ensure_scratch(handle)?;
            storage::retire_daily(handle)?;
            // Linked notes move into their project's notes/<Project>/ folder.
            if let Err(e) = projects::sync_folders(handle) {
                eprintln!("project folder sync failed: {e}");
            }
            let settings = config::read_settings(handle)?;

            // Watch the data folder so external file changes refresh the UI.
            watcher::start(handle);

            // Tray icon (Open / Quit, click-to-toggle).
            shell::build_tray(handle)?;

            // Global shortcut to summon / dismiss from anywhere.
            #[cfg(desktop)]
            {
                use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
                let accel = settings.global_shortcut.clone();
                let _ = app.global_shortcut().on_shortcut(
                    accel.as_str(),
                    move |app, _shortcut, event| {
                        if event.state == ShortcutState::Pressed {
                            // Landing the summon on scratch is the inbox model;
                            // only when we actually showed the window.
                            if shell::toggle_window(app) {
                                let _ = app.emit("summon", ());
                            }
                        }
                    },
                );
            }

            Ok(())
        })
        .on_window_event(|window, event| match event {
            // Closing the window hides to tray instead of quitting (configurable).
            WindowEvent::CloseRequested { api, .. } => {
                let app = window.app_handle();
                let close_to_tray = config::read_settings(app)
                    .map(|s| s.close_to_tray)
                    .unwrap_or(true);
                if close_to_tray {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
            // Optional hide-on-blur (off by default).
            WindowEvent::Focused(false) => {
                let app = window.app_handle();
                let hide = config::read_settings(app)
                    .map(|s| s.hide_on_blur)
                    .unwrap_or(false);
                if hide {
                    let _ = window.hide();
                }
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            storage::list_notes,
            storage::read_note,
            storage::note_modified,
            storage::save_note,
            storage::create_note,
            storage::delete_note,
            storage::rename_note,
            storage::search_notes,
            storage::file_text,
            storage::list_trash,
            storage::restore_note,
            storage::scan_tags,
            storage::duplicate_note,
            storage::reveal_note,
            backup::export_backup,
            backup::reveal_file,
            backup::inspect_backup,
            backup::import_backup,
            terminal::term_spawn,
            terminal::term_write,
            terminal::term_resize,
            terminal::term_kill,
            links::backlinks,
            images::assets_path,
            images::save_image,
            images::import_image,
            images::unused_images,
            images::clean_unused_images,
            vault::storage_report,
            vault::trash_images,
            vault::restore_image,
            vault::delete_forever,
            vault::empty_trash,
            vault::remove_tag,
            projects::list_projects,
            projects::create_project,
            projects::update_project,
            projects::rename_project,
            projects::delete_project,
            projects::restore_project,
            projects::project_folder,
            projects::open_project_folder,
            projects::sync_project_folders,
            todo::load_todos,
            trash::trash_tasks,
            trash::untrash_tasks,
            trash::restore_tasks,
            todo::save_todos,
            config::load_settings,
            config::save_settings,
            config::load_theme,
            config::save_theme,
        ])
        .run(tauri::generate_context!())
        .expect("error while running dotMD");
}
