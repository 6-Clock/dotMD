//! One-time move from the old app identifier (`com.toc.app`) to `com.dotmd.app`.
//!
//! Runs before the Tauri builder, so it lands before the webview (localStorage)
//! and window-state plugin open their folders. The old folders are copied, not
//! moved, so they stay behind as a backup. Copies go to a temp folder that is
//! renamed into place at the end, so an interrupted copy is retried next launch.

use std::{fs, io, path::Path};

const OLD_ID: &str = "com.toc.app";
const NEW_ID: &str = "com.dotmd.app";

pub fn migrate_identifier() {
    // %APPDATA% = notes, to-dos, settings, theme; %LOCALAPPDATA% = webview data.
    for var in ["APPDATA", "LOCALAPPDATA"] {
        let Some(base) = std::env::var_os(var) else { continue };
        let base = Path::new(&base);
        let (old, new) = (base.join(OLD_ID), base.join(NEW_ID));
        if !old.is_dir() || new.exists() {
            continue;
        }
        let tmp = base.join(format!("{NEW_ID}.migrating"));
        let _ = fs::remove_dir_all(&tmp);
        let result = copy_dir(&old, &tmp).and_then(|_| fs::rename(&tmp, &new));
        if let Err(e) = result {
            eprintln!("migrating {} -> {} failed: {e}", old.display(), new.display());
            let _ = fs::remove_dir_all(&tmp);
        }
    }
}

fn copy_dir(from: &Path, to: &Path) -> io::Result<()> {
    fs::create_dir_all(to)?;
    for entry in fs::read_dir(from)? {
        let entry = entry?;
        let dest = to.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir(&entry.path(), &dest)?;
        } else {
            match fs::copy(entry.path(), &dest) {
                Ok(_) => {}
                // Webview lock/cache files can be held open; they're disposable.
                Err(e) if from.ancestors().any(|p| p.ends_with("EBWebView")) => {
                    eprintln!("skipped {}: {e}", entry.path().display());
                }
                Err(e) => return Err(e),
            }
        }
    }
    Ok(())
}
