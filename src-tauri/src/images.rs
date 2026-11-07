//! Images embedded in notes. Files live in one shared `assets/` folder at the
//! data root and notes link them as `../assets/<file>`, which resolves from
//! both `notes/` and `system/` (each is one level down), so links survive
//! file-&-clear, renames, and opening the folder in another Markdown editor.

use std::fs;
use std::path::{Path, PathBuf};

use tauri::ipc::{InvokeBody, Request};
use tauri::AppHandle;

use crate::storage::{self, TRASH};

const EXTS: &[&str] = &["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif"];

/// assets/ folder, created on demand.
pub(crate) fn assets_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = storage::data_dir(app)?.join("assets");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn clean_ext(ext: &str) -> Result<String, String> {
    let ext = ext.trim().trim_start_matches('.').to_lowercase();
    if EXTS.contains(&ext.as_str()) {
        Ok(ext)
    } else {
        Err(format!("Unsupported image type: .{ext}"))
    }
}

/// Filename-safe stem: anything outside [A-Za-z0-9_-] becomes `-`, so links
/// never need URL-encoding and the unused-image scan can match plain text.
fn clean_stem(stem: &str) -> String {
    let s: String = stem
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '_' || c == '-' { c } else { '-' })
        .collect();
    let s = s.split('-').filter(|p| !p.is_empty()).collect::<Vec<_>>().join("-");
    let s: String = s.chars().take(60).collect();
    if s.is_empty() {
        "image".into()
    } else {
        s
    }
}

/// `<stem>.<ext>`, or `<stem>-2.<ext>`… if taken.
pub(crate) fn unique_file(dir: &Path, stem: &str, ext: &str) -> PathBuf {
    let mut path = dir.join(format!("{stem}.{ext}"));
    let mut n = 2;
    while path.exists() {
        path = dir.join(format!("{stem}-{n}.{ext}"));
        n += 1;
    }
    path
}

/// The Markdown link path for a file in assets/.
fn link_for(path: &Path) -> String {
    let file = path.file_name().and_then(|n| n.to_str()).unwrap_or_default();
    format!("../assets/{file}")
}

/// Absolute assets/ path, so the frontend can build asset-protocol URLs.
#[tauri::command]
pub fn assets_path(app: AppHandle) -> Result<String, String> {
    Ok(assets_dir(&app)?.to_string_lossy().into_owned())
}

/// Save pasted image bytes (raw invoke body; extension in the `ext` header).
/// Returns the link path to put in the note.
#[tauri::command]
pub fn save_image(app: AppHandle, request: Request<'_>) -> Result<String, String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("Expected raw image bytes".into());
    };
    let ext = request
        .headers()
        .get("ext")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("png");
    let ext = clean_ext(ext)?;
    let stem = chrono::Local::now().format("%Y-%m-%d-%H%M%S").to_string();
    let path = unique_file(&assets_dir(&app)?, &stem, &ext);
    fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(link_for(&path))
}

/// Copy an image picked from disk into assets/. Returns the link path.
#[tauri::command]
pub fn import_image(app: AppHandle, path: String) -> Result<String, String> {
    let src = PathBuf::from(&path);
    let ext = clean_ext(src.extension().and_then(|e| e.to_str()).unwrap_or(""))?;
    let stem = clean_stem(src.file_stem().and_then(|s| s.to_str()).unwrap_or(""));
    let dest = unique_file(&assets_dir(&app)?, &stem, &ext);
    fs::copy(&src, &dest).map_err(|e| e.to_string())?;
    Ok(link_for(&dest))
}

/// Text of every note that can link an image: notes/, deleted notes (so a
/// restore never comes back with missing pictures), and system/.
fn all_note_text(app: &AppHandle) -> Result<String, String> {
    let notes = storage::notes_dir(app)?;
    let dirs = [notes.clone(), notes.join(TRASH), storage::system_dir(app)?];
    let mut text = String::new();
    // Project logos (projects/*.md front matter) count as links too.
    for path in crate::projects::project_files(app) {
        text.push_str(&fs::read_to_string(&path).unwrap_or_default());
        text.push('\n');
    }
    for dir in dirs {
        let Ok(entries) = fs::read_dir(&dir) else { continue };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("md") {
                text.push_str(&fs::read_to_string(&path).unwrap_or_default());
                text.push('\n');
            }
        }
    }
    Ok(text)
}

/// Image files in assets/ that no note links to.
fn find_unused(app: &AppHandle) -> Result<Vec<PathBuf>, String> {
    let text = all_note_text(app)?;
    let mut unused = Vec::new();
    for entry in fs::read_dir(assets_dir(app)?).map_err(|e| e.to_string())?.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let Some(name) = path.file_name().and_then(|n| n.to_str()) else { continue };
        if !text.contains(&format!("assets/{name}")) {
            unused.push(path);
        }
    }
    Ok(unused)
}

#[tauri::command]
pub fn unused_images(app: AppHandle) -> Result<usize, String> {
    Ok(find_unused(&app)?.len())
}

/// Move unused images into assets/.trash/ (never a hard delete). Returns how
/// many were moved.
#[tauri::command]
pub fn clean_unused_images(app: AppHandle) -> Result<usize, String> {
    let unused = find_unused(&app)?;
    let trash = assets_dir(&app)?.join(TRASH);
    fs::create_dir_all(&trash).map_err(|e| e.to_string())?;
    for path in &unused {
        let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("image");
        let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("png");
        fs::rename(path, unique_file(&trash, stem, ext)).map_err(|e| e.to_string())?;
    }
    Ok(unused.len())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stems_are_link_safe() {
        assert_eq!(clean_stem("My Photo (1)"), "My-Photo-1");
        assert_eq!(clean_stem("../../etc"), "etc");
        assert_eq!(clean_stem("日本"), "image");
    }

    #[test]
    fn only_image_extensions() {
        assert_eq!(clean_ext(".PNG").unwrap(), "png");
        assert!(clean_ext("exe").is_err());
    }
}
