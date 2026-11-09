//! `[[note name]]` links between notes (optionally `[[note name|label]]`).
//! Renames rewrite them everywhere; `backlinks` finds the notes linking in.

use std::fs;
use std::path::PathBuf;

use tauri::AppHandle;

use crate::storage::{self, SearchHit};

/// Every `.md` that may hold links, with its note name: notes/, system/
/// (scratch, daily), and deleted notes (so a restore keeps working links).
fn link_files(app: &AppHandle) -> Result<Vec<(String, PathBuf)>, String> {
    let notes = storage::notes_dir(app)?;
    // Live notes, including project folders.
    let mut files = storage::note_files(&notes);
    for dir in [storage::system_dir(app)?, storage::trash_dir(app)?] {
        let Ok(entries) = fs::read_dir(&dir) else { continue };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("md") {
                continue;
            }
            if let Some(name) = path.file_stem().and_then(|s| s.to_str()) {
                files.push((name.to_string(), path.clone()));
            }
        }
    }
    Ok(files)
}

/// Replace `[[from]]` / `[[from|` with `to`. None if nothing changed.
fn rewrite(content: &str, from: &str, to: &str) -> Option<String> {
    let plain = format!("[[{from}]]");
    let label = format!("[[{from}|");
    if !content.contains(&plain) && !content.contains(&label) {
        return None;
    }
    Some(
        content
            .replace(&plain, &format!("[[{to}]]"))
            .replace(&label, &format!("[[{to}|")),
    )
}

/// After a rename, point every link at the new name.
pub fn rewrite_links(app: &AppHandle, from: &str, to: &str) -> Result<(), String> {
    // Project files list their notes as [[links]] in front matter, so a note
    // rename keeps its project membership.
    let projects = crate::projects::project_files(app);
    for path in link_files(app)?.into_iter().map(|(_, p)| p).chain(projects) {
        let Ok(content) = fs::read_to_string(&path) else { continue };
        if let Some(next) = rewrite(&content, from, to) {
            storage::write_atomic(&path, &next)?;
        }
    }
    Ok(())
}

/// Live notes (not deleted ones) that link to `name`, one hit per linking
/// line, the note itself excluded.
#[tauri::command]
pub fn backlinks(app: AppHandle, name: String) -> Result<Vec<SearchHit>, String> {
    let plain = format!("[[{name}]]");
    let label = format!("[[{name}|");
    let trash = storage::trash_dir(&app)?;
    let mut hits = Vec::new();
    for (note, path) in link_files(&app)? {
        if note == name || path.starts_with(&trash) {
            continue;
        }
        let Ok(content) = fs::read_to_string(&path) else { continue };
        for (i, line) in content.lines().enumerate() {
            if line.contains(&plain) || line.contains(&label) {
                hits.push(SearchHit {
                    name: note.clone(),
                    title: note.clone(),
                    line: i + 1,
                    snippet: line.trim().chars().take(140).collect(),
                });
            }
        }
    }
    Ok(hits)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rewrites_plain_and_labelled_links_only() {
        let src = "see [[Old]] and [[Old|that one]] but not [[Older]] or [Old]";
        assert_eq!(
            rewrite(src, "Old", "New").unwrap(),
            "see [[New]] and [[New|that one]] but not [[Older]] or [Old]"
        );
        assert!(rewrite("nothing here", "Old", "New").is_none());
    }
}
