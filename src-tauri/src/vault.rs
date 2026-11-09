//! Storage organizer: one report of what's on disk (notes, images, projects,
//! trash) and the clean-up actions behind the Storage view. Images are trashed
//! (not removed) like notes; the only hard deletes live here and are confined
//! to the `trash/` folder (see `trash`).

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::images::assets_dir;
use crate::storage::{
    self, extract_tags, modified_secs, original_from_trash, title_from, trash_dir,
    write_atomic, SCRATCH,
};
use crate::trash;

#[derive(Serialize)]
pub struct NoteInfo {
    pub name: String,
    pub title: String,
    pub bytes: u64,
    pub words: usize,
    pub images: usize,
    pub modified: u64,
    pub protected: bool,
}

#[derive(Serialize)]
pub struct ImageInfo {
    pub file: String,
    pub bytes: u64,
    pub modified: u64,
    /// Live notes (incl. scratch / daily) that link this image.
    pub used_by: Vec<String>,
    /// How many deleted notes still link it (restoring one brings it back).
    pub used_in_trash: usize,
    /// Projects using it as their logo.
    pub used_by_projects: Vec<String>,
}

#[derive(Serialize)]
pub struct ProjectInfo {
    /// Front-matter name (what the app shows and looks up by).
    pub name: String,
    /// Project file + its logo + its linked notes.
    pub bytes: u64,
    /// Project file mtime.
    pub modified: u64,
}

#[derive(Serialize)]
pub struct TrashItem {
    /// "note", "image", "project" or "task".
    pub kind: String,
    /// The restore id: note file stem, image file name, project folder name,
    /// or `<stamp>#<n>` for a task.
    pub id: String,
    /// What the user called it.
    pub title: String,
    /// A second line: a project's task count, a task's subject.
    pub detail: String,
    pub bytes: u64,
    /// When it was deleted (from the stamp), else the file time.
    pub modified: u64,
}

#[derive(Serialize)]
pub struct StorageReport {
    pub notes: Vec<NoteInfo>,
    pub images: Vec<ImageInfo>,
    pub projects: Vec<ProjectInfo>,
    pub trash: Vec<TrashItem>,
}

#[derive(Deserialize)]
pub struct TrashRef {
    pub kind: String,
    pub id: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct NoteText {
    pub name: String,
    pub content: String,
}

fn size_of(path: &Path) -> u64 {
    fs::metadata(path).map(|m| m.len()).unwrap_or(0)
}

fn md_files(dir: &Path) -> Vec<PathBuf> {
    let Ok(entries) = fs::read_dir(dir) else { return Vec::new() };
    entries
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.extension().and_then(|e| e.to_str()) == Some("md"))
        .collect()
}

fn files_in(dir: &Path) -> Vec<PathBuf> {
    let Ok(entries) = fs::read_dir(dir) else { return Vec::new() };
    entries.flatten().map(|e| e.path()).filter(|p| p.is_file()).collect()
}

fn file_name(path: &Path) -> String {
    path.file_name().and_then(|n| n.to_str()).unwrap_or_default().to_string()
}

fn stem(path: &Path) -> String {
    path.file_stem().and_then(|n| n.to_str()).unwrap_or_default().to_string()
}

/// A single file name inside one of our folders: no separators, no `..`.
fn plain_file(name: &str) -> Result<String, String> {
    let n = name.trim();
    if n.is_empty() || n.contains("..") || n.contains('/') || n.contains('\\') {
        return Err("Invalid file name".into());
    }
    Ok(n.to_string())
}

/// Image trash names are `<unix-secs>__<file>`, so a restore puts the file back
/// under the exact name the notes link to.
fn original_image(trash_name: &str) -> String {
    match trash_name.split_once("__") {
        Some((stamp, rest)) if stamp.chars().all(|c| c.is_ascii_digit() || "-. ".contains(c)) => rest.into(),
        _ => trash_name.into(),
    }
}

#[tauri::command]
pub fn storage_report(app: AppHandle) -> Result<StorageReport, String> {
    let notes_dir = storage::notes_dir(&app)?;
    let system = storage::system_dir(&app)?;
    let assets = assets_dir(&app)?;
    let image_files: Vec<String> = files_in(&assets).iter().map(|p| file_name(p)).collect();

    // file -> (live notes linking it, deleted notes linking it)
    let mut uses: HashMap<String, (Vec<String>, usize)> = HashMap::new();
    let links_in = |content: &str| -> Vec<&String> {
        image_files.iter().filter(|f| content.contains(&format!("assets/{f}"))).collect()
    };

    let mut notes = Vec::new();
    let live: Vec<PathBuf> = storage::note_files(&notes_dir).into_iter().map(|(_, p)| p).collect();
    for (paths, is_system) in [(md_files(&system), true), (live, false)] {
        for path in paths {
            let name = stem(&path);
            if is_system && name != SCRATCH {
                continue;
            }
            let content = fs::read_to_string(&path).unwrap_or_default();
            let linked = links_in(&content);
            for f in &linked {
                uses.entry((*f).clone()).or_default().0.push(name.clone());
            }
            notes.push(NoteInfo {
                title: title_from(&content, &name),
                bytes: size_of(&path),
                words: content.split_whitespace().count(),
                images: linked.len(),
                modified: modified_secs(&path),
                protected: is_system,
                name,
            });
        }
    }

    // Project logos: live projects by name, trashed ones like deleted notes.
    // Live projects also get a size (file + logo + linked notes); trashed ones
    // are listed in the trash.
    let note_bytes: HashMap<&str, u64> = notes.iter().map(|n| (n.name.as_str(), n.bytes)).collect();
    let mut logo_of: HashMap<String, Vec<String>> = HashMap::new();
    let project_trash = trash::projects_dir(&app)?;
    let mut projects = Vec::new();
    let mut trash = Vec::new();
    for path in crate::projects::project_files(&app) {
        let content = fs::read_to_string(&path).unwrap_or_default();
        let (project, _) = crate::projects::parse(&content, &stem(&path));
        let in_trash = path.starts_with(&project_trash);
        for f in links_in(&content) {
            if in_trash {
                uses.entry(f.clone()).or_default().1 += 1;
            } else {
                logo_of.entry(f.clone()).or_default().push(project.name.clone());
            }
        }
        if in_trash {
            let folder = path.parent().unwrap_or(&project_trash).to_path_buf();
            let id = file_name(&folder);
            let n = trash::read_project_tasks(&folder).tasks.len();
            trash.push(TrashItem {
                kind: "project".into(),
                title: project.name,
                detail: format!("{n} {}", if n == 1 { "task" } else { "tasks" }),
                bytes: trash::dir_bytes(&folder),
                modified: trash::deleted_at(&id).unwrap_or_else(|| modified_secs(&path)),
                id,
            });
            continue;
        }
        let logo = project
            .logo
            .rsplit(['/', '\\'])
            .next()
            .filter(|f| !f.is_empty())
            .map(|f| size_of(&assets.join(f)))
            .unwrap_or(0);
        let linked: u64 = project.notes.iter().filter_map(|n| note_bytes.get(n.as_str())).sum();
        projects.push(ProjectInfo {
            bytes: size_of(&path) + logo + linked,
            modified: modified_secs(&path),
            name: project.name,
        });
    }

    for path in md_files(&trash_dir(&app)?) {
        let content = fs::read_to_string(&path).unwrap_or_default();
        for f in links_in(&content) {
            uses.entry(f.clone()).or_default().1 += 1;
        }
        let id = stem(&path);
        trash.push(TrashItem {
            kind: "note".into(),
            title: original_from_trash(&id),
            detail: String::new(),
            bytes: size_of(&path),
            modified: trash::deleted_at(&id).unwrap_or_else(|| modified_secs(&path)),
            id,
        });
    }
    for path in files_in(&trash::images_dir(&app)?) {
        let id = file_name(&path);
        trash.push(TrashItem {
            kind: "image".into(),
            title: original_image(&id),
            detail: String::new(),
            bytes: size_of(&path),
            modified: trash::deleted_at(&id).unwrap_or_else(|| modified_secs(&path)),
            id,
        });
    }
    for g in trash::read_groups(&trash::tasks_file(&app)?) {
        let when = trash::deleted_at(&g.stamp).unwrap_or(0);
        for (i, t) in g.tasks.iter().enumerate() {
            trash.push(TrashItem {
                kind: "task".into(),
                id: format!("{}#{i}", g.stamp),
                title: t.text.clone(),
                detail: t.subject.clone(),
                bytes: crate::todo::render(std::slice::from_ref(t)).len() as u64,
                modified: when,
            });
        }
    }
    trash.sort_by(|a, b| b.modified.cmp(&a.modified));

    let images = files_in(&assets)
        .iter()
        .map(|path| {
            let file = file_name(path);
            let (used_by, used_in_trash) = uses.remove(&file).unwrap_or_default();
            ImageInfo {
                used_by_projects: logo_of.remove(&file).unwrap_or_default(),
                bytes: size_of(path),
                modified: modified_secs(path),
                used_by,
                used_in_trash,
                file,
            }
        })
        .collect();

    Ok(StorageReport { notes, images, projects, trash })
}

/// Move images from assets/ into trash/images/ as `<stamp>__<file>`. Returns
/// their trash names, in order, so Undo can put exactly these back.
#[tauri::command]
pub fn trash_images(app: AppHandle, files: Vec<String>) -> Result<Vec<String>, String> {
    let assets = assets_dir(&app)?;
    let bin = trash::images_dir(&app)?;
    let mut out = Vec::new();
    for f in files {
        let f = plain_file(&f)?;
        let src = assets.join(&f);
        if !src.is_file() {
            continue;
        }
        let name = trash::free_stem(&bin, &f, "");
        fs::rename(&src, bin.join(&name)).map_err(|e| e.to_string())?;
        out.push(name);
    }
    Ok(out)
}

/// Put a trashed image back under its original name (links depend on it).
#[tauri::command]
pub fn restore_image(app: AppHandle, id: String) -> Result<String, String> {
    let id = plain_file(&id)?;
    let assets = assets_dir(&app)?;
    let src = trash::images_dir(&app)?.join(&id);
    if !src.is_file() {
        return Err("Trashed image not found".into());
    }
    let original = plain_file(&original_image(&id))?;
    let dest = assets.join(&original);
    if dest.exists() {
        return Err(format!("An image named {original} already exists"));
    }
    fs::rename(&src, &dest).map_err(|e| e.to_string())?;
    Ok(original)
}

fn trash_path(app: &AppHandle, item: &TrashRef) -> Result<PathBuf, String> {
    match item.kind.as_str() {
        "note" => Ok(trash_dir(app)?.join(format!("{}.md", storage::clean_trash_id(&item.id)?))),
        "image" => Ok(trash::images_dir(app)?.join(plain_file(&item.id)?)),
        "project" => Ok(trash::projects_dir(app)?.join(plain_file(&item.id)?)),
        _ => Err("Unknown trash kind".into()),
    }
}

/// Permanently remove trashed items. Only ever touches the trash/ folder.
/// Returns the bytes freed.
#[tauri::command]
pub fn delete_forever(app: AppHandle, items: Vec<TrashRef>) -> Result<u64, String> {
    let mut freed = 0;
    // Tasks live as lines in trash/tasks.md, so they go in one pass.
    let task_ids: Vec<String> = items.iter().filter(|i| i.kind == "task").map(|i| i.id.clone()).collect();
    if !task_ids.is_empty() {
        let gone = trash::take_tasks(&app, &task_ids)?;
        freed += crate::todo::render(&gone).len() as u64;
    }
    for item in items.iter().filter(|i| i.kind != "task") {
        let path = trash_path(&app, item)?;
        if path.is_file() {
            freed += size_of(&path);
            fs::remove_file(&path).map_err(|e| e.to_string())?;
        } else if path.is_dir() {
            // A deleted project's folder (page + tasks.md).
            freed += trash::dir_bytes(&path);
            fs::remove_dir_all(&path).map_err(|e| e.to_string())?;
        }
    }
    Ok(freed)
}

/// Empty the whole trash (notes, images, projects, tasks). Returns the bytes freed.
#[tauri::command]
pub fn empty_trash(app: AppHandle) -> Result<u64, String> {
    let mut freed = 0;
    for dir in [trash_dir(&app)?, trash::images_dir(&app)?] {
        for path in files_in(&dir) {
            freed += size_of(&path);
            fs::remove_file(&path).map_err(|e| e.to_string())?;
        }
    }
    if let Ok(entries) = fs::read_dir(trash::projects_dir(&app)?) {
        for e in entries.flatten().filter(|e| e.path().is_dir()) {
            freed += trash::dir_bytes(&e.path());
            fs::remove_dir_all(e.path()).map_err(|e| e.to_string())?;
        }
    }
    let tasks = trash::tasks_file(&app)?;
    if tasks.is_file() {
        freed += size_of(&tasks);
        fs::remove_file(&tasks).map_err(|e| e.to_string())?;
    }
    Ok(freed)
}

/// Remove every `#tag` token (any case) — the same tokens the tag scan finds —
/// plus one neighbouring space so no double gap is left behind.
fn strip_tag(content: &str, tag: &str) -> String {
    let chars: Vec<char> = content.chars().collect();
    let tag_lower = tag.to_lowercase();
    let mut out: Vec<char> = Vec::with_capacity(chars.len());
    let mut i = 0;
    while i < chars.len() {
        if chars[i] == '#' {
            let prev_ok = i == 0 || {
                let p = chars[i - 1];
                p.is_whitespace() || p == '(' || p == '['
            };
            if prev_ok && i + 1 < chars.len() && chars[i + 1].is_alphabetic() {
                let mut j = i + 1;
                while j < chars.len()
                    && (chars[j].is_alphanumeric() || chars[j] == '-' || chars[j] == '_')
                {
                    j += 1;
                }
                let word: String = chars[i + 1..j].iter().collect();
                if word.to_lowercase() == tag_lower {
                    let next = chars.get(j).copied();
                    let next_gap = matches!(next, Some(' ') | Some('\t'));
                    let next_end = matches!(next, None | Some('\n') | Some('\r'));
                    if out.last() == Some(&' ') && (next_gap || next_end) {
                        out.pop(); // "a #tag b" -> "a b", "a #tag" -> "a"
                    } else if next_gap {
                        j += 1; // "#tag b" at line start -> "b"
                    }
                    i = j;
                    continue;
                }
                out.extend(&chars[i..j]);
                i = j;
                continue;
            }
        }
        out.push(chars[i]);
        i += 1;
    }
    out.into_iter().collect()
}

/// Strip `#tag` from every note in notes/ (where tags are scanned). Returns
/// each changed note's previous text so the frontend can undo exactly.
#[tauri::command]
pub fn remove_tag(app: AppHandle, tag: String) -> Result<Vec<NoteText>, String> {
    let tag = tag.trim().trim_start_matches('#').to_string();
    if tag.is_empty() {
        return Err("No tag given".into());
    }
    let mut changed = Vec::new();
    for (_, path) in storage::note_files(&storage::notes_dir(&app)?) {
        let content = fs::read_to_string(&path).unwrap_or_default();
        if !extract_tags(&content).contains(&tag.to_lowercase()) {
            continue;
        }
        let next = strip_tag(&content, &tag);
        if next != content {
            write_atomic(&path, &next)?;
            changed.push(NoteText { name: stem(&path), content });
        }
    }
    Ok(changed)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_tag_and_one_space() {
        assert_eq!(strip_tag("buy milk #home today", "home"), "buy milk today");
        assert_eq!(strip_tag("buy milk #home", "home"), "buy milk");
        assert_eq!(strip_tag("#home first", "home"), "first");
        assert_eq!(strip_tag("a #Home b", "home"), "a b");
        assert_eq!(strip_tag("(#home)", "home"), "()");
    }

    #[test]
    fn leaves_other_tags_headings_and_longer_words() {
        assert_eq!(strip_tag("# Home\n#homework #home", "home"), "# Home\n#homework");
        assert_eq!(strip_tag("issue#home stays", "home"), "issue#home stays");
        assert_eq!(strip_tag("#work and #home", "home"), "#work and");
    }

    #[test]
    fn image_trash_names_round_trip() {
        assert_eq!(original_image("1730000000__shot.png"), "shot.png");
        assert_eq!(original_image("1730000000__shot-2.png"), "shot-2.png");
        assert_eq!(original_image("old-clean.png"), "old-clean.png");
    }

    #[test]
    fn rejects_paths() {
        assert!(plain_file("../x.png").is_err());
        assert!(plain_file("a/b.png").is_err());
        assert!(plain_file("ok.png").is_ok());
    }
}
