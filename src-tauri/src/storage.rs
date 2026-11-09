use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

/// The always-present home note that summoning lands on.
pub const SCRATCH: &str = "scratch";

/// The old per-folder trash name. Still skipped by scans (dot-folders), and
/// moved into `trash/` at startup by `trash::migrate_layout`.
pub const TRASH: &str = crate::trash::OLD;

#[derive(Serialize, Deserialize, Clone)]
pub struct NoteMeta {
    pub name: String,
    pub title: String,
    pub modified: u64, // seconds since UNIX epoch
    /// First line of body text after the title line ("" if none).
    #[serde(default)]
    pub preview: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct SearchHit {
    pub name: String,
    pub title: String,
    pub line: usize,
    pub snippet: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct TagCount {
    pub tag: String,
    pub notes: Vec<String>,
}

/// Where the data folder lives, without creating it.
///
/// - `DOTMD_DATA_DIR` set → that folder (e.g. point a dev run at your real notes).
/// - Debug builds (`npm run tauri dev`) → `<repo>/dev-data/`, git-ignored, so
///   testing never touches the notes you actually use.
/// - Release builds → `%APPDATA%\com.dotmd.app\`.
pub(crate) fn data_root(app: &AppHandle) -> Result<PathBuf, String> {
    if let Some(dir) = std::env::var_os("DOTMD_DATA_DIR").filter(|d| !d.is_empty()) {
        return Ok(PathBuf::from(dir));
    }
    if cfg!(debug_assertions) {
        if let Some(repo) = Path::new(env!("CARGO_MANIFEST_DIR")).parent() {
            return Ok(repo.join("dev-data"));
        }
    }
    app.path().app_data_dir().map_err(|e| e.to_string())
}

/// Root data folder (see `data_root`), created on demand.
pub(crate) fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = data_root(app)?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// notes/ subfolder, created on demand.
pub fn notes_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = data_dir(app)?.join("notes");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Where deleted notes rest: trash/notes/ (see `trash`), created on demand.
pub(crate) fn trash_dir(app: &AppHandle) -> Result<PathBuf, String> {
    crate::trash::notes_dir(app)
}

/// system/ subfolder for the app-managed scratch note (Untitled). Kept out
/// of notes/ so they never appear in the Files list, quick-open, search, or
/// tag scans — those all iterate notes/ only.
pub(crate) fn system_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = data_dir(app)?.join("system");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Strip an optional `.md`, trim, and reject anything that could escape the
/// notes folder or be an invalid filename. The frontend never touches disk,
/// so this is the single gate for all note names.
pub(crate) fn clean_name(name: &str) -> Result<String, String> {
    let name = name.trim().trim_end_matches(".md").trim();
    if name.is_empty() {
        return Err("Note name cannot be empty".into());
    }
    if name.len() > 120 {
        return Err("Note name is too long".into());
    }
    if name.contains("..") || name.contains('/') || name.contains('\\') {
        return Err("Note name cannot contain path separators".into());
    }
    if name
        .chars()
        .any(|c| c.is_control() || "<>:\"|?*".contains(c))
    {
        return Err("Note name contains invalid characters".into());
    }
    Ok(name.to_string())
}

/// A trash id (`<stamp>__<name>`): the same rules as a note name, but room
/// for the 21-character stamp on top of a full-length name.
pub(crate) fn clean_trash_id(id: &str) -> Result<String, String> {
    let id = id.trim().trim_end_matches(".md").trim();
    if id.is_empty() || id.len() > 160 {
        return Err("Invalid trash id".into());
    }
    if id.contains("..") || id.contains('/') || id.contains('\\')
        || id.chars().any(|c| c.is_control() || "<>:\"|?*".contains(c))
    {
        return Err("Invalid trash id".into());
    }
    Ok(id.to_string())
}

/// Every live note: `.md` files in notes/ and one level of folders under it
/// (project folders, `notes/<Project>/`), skipping dot-folders like .trash.
/// Names stay unique across folders, so a note is still found by name alone.
pub(crate) fn note_files(notes: &Path) -> Vec<(String, PathBuf)> {
    let mut out = Vec::new();
    for dir in std::iter::once(notes.to_path_buf()).chain(note_folders(notes)) {
        let Ok(entries) = fs::read_dir(&dir) else { continue };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() && path.extension().and_then(|e| e.to_str()) == Some("md") {
                if let Some(name) = path.file_stem().and_then(|s| s.to_str()) {
                    out.push((name.to_string(), path.clone()));
                }
            }
        }
    }
    out
}

/// Folders directly under notes/ that hold notes (not .trash or other dot-folders).
pub(crate) fn note_folders(notes: &Path) -> Vec<PathBuf> {
    let Ok(entries) = fs::read_dir(notes) else { return Vec::new() };
    entries
        .flatten()
        .map(|e| e.path())
        .filter(|p| {
            p.is_dir() && !p.file_name().and_then(|n| n.to_str()).unwrap_or(".").starts_with('.')
        })
        .collect()
}

/// Where note `name` lives right now: notes/ first, then its folders.
pub(crate) fn find_note(notes: &Path, name: &str) -> Option<PathBuf> {
    let file = format!("{name}.md");
    let root = notes.join(&file);
    if root.exists() {
        return Some(root);
    }
    note_folders(notes).into_iter().map(|d| d.join(&file)).find(|p| p.exists())
}

/// Path of note `name`: its current file in any folder, or notes/<name>.md
/// for a note that doesn't exist yet.
pub(crate) fn note_path(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    let name = clean_name(name)?;
    // The protected scratch note lives in system/, everything else in notes/.
    if name == SCRATCH {
        return Ok(system_dir(app)?.join(format!("{name}.md")));
    }
    let notes = notes_dir(app)?;
    Ok(find_note(&notes, &name).unwrap_or_else(|| notes.join(format!("{name}.md"))))
}

/// Whether a live note called `name` exists in notes/ or any of its folders.
pub(crate) fn taken(notes: &Path, name: &str) -> bool {
    find_note(notes, name).is_some()
}

/// One-time move of a legacy scratch from notes/ into system/. Preserves
/// the file's content; no-op once it already lives in system/.
fn migrate_to_system(app: &AppHandle, name: &str) -> Result<(), String> {
    let new_path = note_path(app, name)?; // system/<name>.md
    if new_path.exists() {
        return Ok(());
    }
    let old_path = notes_dir(app)?.join(format!("{name}.md"));
    if old_path.exists() {
        fs::rename(&old_path, &new_path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Crash-safe write: write to a temp file then rename over the target, so an
/// interrupted save never leaves a half-written note.
pub(crate) fn write_atomic(path: &Path, content: &str) -> Result<(), String> {
    let mut tmp = path.to_path_buf();
    tmp.set_extension("md.tmp");
    fs::write(&tmp, content).map_err(|e| e.to_string())?;
    fs::rename(&tmp, path).map_err(|e| e.to_string())?;
    Ok(())
}

/// First meaningful line, with heading/list markers stripped, as a display title.
pub(crate) fn title_from(content: &str, fallback: &str) -> String {
    for line in content.lines() {
        let t = line.trim();
        if t.is_empty() {
            continue;
        }
        let t = t.trim_start_matches('#').trim_start_matches("- ").trim();
        if !t.is_empty() {
            return t.chars().take(80).collect();
        }
    }
    fallback.to_string()
}

/// The first non-empty line after the one `title_from` picked, cleaned the
/// same way: a one-line preview for list rows.
pub(crate) fn preview_from(content: &str) -> String {
    let clean = |l: &str| {
        l.trim()
            .trim_start_matches('#')
            .trim_start_matches("- [ ] ")
            .trim_start_matches("- [x] ")
            .trim_start_matches("- ")
            .trim()
            .to_string()
    };
    content
        .lines()
        .map(clean)
        .filter(|t| !t.is_empty())
        .nth(1)
        .map(|t| t.chars().take(120).collect())
        .unwrap_or_default()
}

pub(crate) fn modified_secs(path: &Path) -> u64 {
    fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// Make sure the scratch note exists so summon never hits an empty state.
pub fn ensure_scratch(app: &AppHandle) -> Result<(), String> {
    migrate_to_system(app, SCRATCH)?;
    let path = note_path(app, SCRATCH)?;
    if !path.exists() {
        write_atomic(&path, "")?;
    }
    Ok(())
}

/// The Daily page feature was removed. A system/daily.md with real text
/// becomes an ordinary note ("Daily", or "Daily 2"… if taken), keeping its
/// file time; a blank or just-seeded one is moved to the trash.
pub fn retire_daily(app: &AppHandle) -> Result<(), String> {
    let old = system_dir(app)?.join("daily.md");
    if !old.exists() {
        return Ok(());
    }
    let text = fs::read_to_string(&old).unwrap_or_default();
    let blank = matches!(text.trim(), "" | "# Daily");
    let dest = if blank {
        let trash = trash_dir(app)?;
        let stem = crate::trash::free_stem(&trash, "Daily", ".md");
        trash.join(format!("{stem}.md"))
    } else {
        let dir = notes_dir(app)?;
        let name = unique_name("Daily", |cand| taken(&dir, cand));
        dir.join(format!("{name}.md"))
    };
    fs::rename(&old, &dest).map_err(|e| e.to_string())
}

// ---- Commands -------------------------------------------------------------

#[tauri::command]
pub fn list_notes(app: AppHandle) -> Result<Vec<NoteMeta>, String> {
    let dir = notes_dir(&app)?;
    let mut notes = Vec::new();
    for (name, path) in note_files(&dir) {
        let content = fs::read_to_string(&path).unwrap_or_default();
        notes.push(NoteMeta {
            title: title_from(&content, &name),
            preview: preview_from(&content),
            modified: modified_secs(&path),
            name,
        });
    }
    // Most recently modified first; scratch always pinned to the top.
    notes.sort_by(|a, b| b.modified.cmp(&a.modified));
    notes.sort_by_key(|n| n.name != SCRATCH);
    Ok(notes)
}

#[tauri::command]
pub fn read_note(app: AppHandle, name: String) -> Result<String, String> {
    let path = note_path(&app, &name)?;
    if !path.exists() {
        return Ok(String::new());
    }
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

/// Last-modified time (unix secs) of one note, 0 if it doesn't exist yet.
/// Covers scratch/daily too, which list_notes doesn't.
#[tauri::command]
pub fn note_modified(app: AppHandle, name: String) -> Result<u64, String> {
    Ok(modified_secs(&note_path(&app, &name)?))
}

#[tauri::command]
pub fn save_note(app: AppHandle, name: String, content: String) -> Result<(), String> {
    let path = note_path(&app, &name)?;
    write_atomic(&path, &content)
}

#[tauri::command]
pub fn create_note(app: AppHandle, name: String) -> Result<(), String> {
    let path = note_path(&app, &name)?;
    if path.exists() {
        return Err("A note with that name already exists".into());
    }
    write_atomic(&path, "")
}

/// Delete = move the note into trash/notes/ (restorable), not a hard remove.
/// The file is stored as `<YYYY-MM-DD HH.MM.SS>__<name>.md` so the original
/// name can be recovered and same-second deletes don't collide. Returns the
/// trash file stem (empty if the note didn't exist) so callers can undo exactly.
#[tauri::command]
pub fn delete_note(app: AppHandle, name: String) -> Result<String, String> {
    let clean = clean_name(&name)?;
    if clean == SCRATCH {
        return Err("The scratch note cannot be deleted".into());
    }
    let path = note_path(&app, &name)?;
    if !path.exists() {
        return Ok(String::new());
    }
    let trash = trash_dir(&app)?;
    let stem = crate::trash::free_stem(&trash, &clean, ".md");
    fs::rename(&path, trash.join(format!("{stem}.md"))).map_err(|e| e.to_string())?;
    Ok(stem)
}

/// Pick a free name by appending " 2", " 3", … to `base` when taken.
fn unique_name(base: &str, exists: impl Fn(&str) -> bool) -> String {
    if !exists(base) {
        return base.to_string();
    }
    let mut n = 2;
    loop {
        let cand = format!("{base} {n}");
        if !exists(&cand) {
            return cand;
        }
        n += 1;
    }
}

/// Copy a note's content into a uniquified "<name> copy" and return the new name.
#[tauri::command]
pub fn duplicate_note(app: AppHandle, name: String) -> Result<String, String> {
    let src = note_path(&app, &name)?;
    if !src.exists() {
        return Err("Note does not exist".into());
    }
    let content = fs::read_to_string(&src).map_err(|e| e.to_string())?;
    let clean = clean_name(&name)?;
    let notes = notes_dir(&app)?;
    let base = format!("{clean} copy");
    let target = unique_name(&base, |cand| taken(&notes, cand));
    // The copy sits next to the original (same project folder).
    let dir = src.parent().map(Path::to_path_buf).unwrap_or(notes);
    write_atomic(&dir.join(format!("{target}.md")), &content)?;
    Ok(target)
}

/// Open the OS file manager with the note's `.md` file selected.
#[tauri::command]
pub fn reveal_note(app: AppHandle, name: String) -> Result<(), String> {
    let path = note_path(&app, &name)?;
    if !path.exists() {
        return Err("Note does not exist".into());
    }
    reveal_path(&path)
}

/// Open the OS file manager with `path` selected (Linux: its folder). Only
/// spawns; Windows `explorer /select,` exits non-zero even on success.
pub(crate) fn reveal_path(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    std::process::Command::new("explorer")
        .arg(format!("/select,{}", path.display()))
        .spawn()
        .map_err(|e| e.to_string())?;
    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .args(["-R".as_ref(), path.as_os_str()])
        .spawn()
        .map_err(|e| e.to_string())?;
    #[cfg(target_os = "linux")]
    {
        let dir = path.parent().ok_or("No parent directory")?;
        std::process::Command::new("xdg-open")
            .arg(dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// The original note name encoded in a trash file stem (`<stamp>__<name>`).
pub(crate) fn original_from_trash(stem: &str) -> String {
    match stem.split_once("__") {
        Some((_, rest)) => rest.to_string(),
        None => stem.to_string(),
    }
}

/// List trashed notes, newest first. `name` is the trash file stem (used for
/// restore); `title` is the original note name shown to the user.
#[tauri::command]
pub fn list_trash(app: AppHandle) -> Result<Vec<NoteMeta>, String> {
    let dir = trash_dir(&app)?;
    let mut out = Vec::new();
    for entry in fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("md") {
            continue;
        }
        let stem = match path.file_stem().and_then(|s| s.to_str()) {
            Some(s) => s.to_string(),
            None => continue,
        };
        out.push(NoteMeta {
            title: original_from_trash(&stem),
            preview: String::new(),
            modified: modified_secs(&path),
            name: stem,
        });
    }
    out.sort_by(|a, b| b.modified.cmp(&a.modified));
    Ok(out)
}

/// Restore a trashed note (identified by its trash file stem) back into notes/,
/// uniquifying the name if one already exists. Returns the restored note name.
#[tauri::command]
pub fn restore_note(app: AppHandle, name: String) -> Result<String, String> {
    let stem = clean_trash_id(&name)?;
    let src = trash_dir(&app)?.join(format!("{stem}.md"));
    if !src.exists() {
        return Err("Trashed note not found".into());
    }
    let original = clean_name(&original_from_trash(&stem))?;
    let dir = notes_dir(&app)?;
    let mut target = original.clone();
    let mut n = 1;
    while taken(&dir, &target) {
        target = format!("{original}-{n}");
        n += 1;
    }
    fs::rename(&src, dir.join(format!("{target}.md"))).map_err(|e| e.to_string())?;
    Ok(target)
}

/// Pull out `#tag` tokens: a `#` at a word boundary, followed by a letter and
/// then word chars / hyphens. Headings (`# `, `## `) don't match because the
/// `#` there is followed by a space or another `#`. Returns lowercased tags.
pub(crate) fn extract_tags(content: &str) -> Vec<String> {
    let chars: Vec<char> = content.chars().collect();
    let mut tags = Vec::new();
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
                tags.push(chars[i + 1..j].iter().collect::<String>().to_lowercase());
                i = j;
                continue;
            }
        }
        i += 1;
    }
    tags
}

/// Scan every note for `#tags` and return tag → note names, busiest tag first.
#[tauri::command]
pub fn scan_tags(app: AppHandle) -> Result<Vec<TagCount>, String> {
    use std::collections::{BTreeMap, HashSet};
    let dir = notes_dir(&app)?;
    let mut map: BTreeMap<String, Vec<String>> = BTreeMap::new();
    for (name, path) in note_files(&dir) {
        let content = fs::read_to_string(&path).unwrap_or_default();
        let mut seen = HashSet::new();
        for tag in extract_tags(&content) {
            if seen.insert(tag.clone()) {
                map.entry(tag).or_default().push(name.clone());
            }
        }
    }
    let mut out: Vec<TagCount> = map
        .into_iter()
        .map(|(tag, notes)| TagCount { tag, notes })
        .collect();
    out.sort_by(|a, b| b.notes.len().cmp(&a.notes.len()).then(a.tag.cmp(&b.tag)));
    Ok(out)
}

#[tauri::command]
pub fn rename_note(app: AppHandle, from: String, to: String) -> Result<(), String> {
    let from_clean = clean_name(&from)?;
    if from_clean == SCRATCH {
        return Err("The scratch note cannot be renamed".into());
    }
    let to_clean = clean_name(&to)?;
    let notes = notes_dir(&app)?;
    let from_path = note_path(&app, &from)?;
    if !from_path.exists() {
        return Err("Note does not exist".into());
    }
    if to_clean == SCRATCH || taken(&notes, &to_clean) {
        return Err("A note with that name already exists".into());
    }
    // A renamed note stays in its folder.
    let to_path = from_path
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or(notes)
        .join(format!("{to_clean}.md"));
    fs::rename(&from_path, &to_path).map_err(|e| e.to_string())?;
    // Keep [[links]] pointing at the note under its new name.
    crate::links::rewrite_links(&app, &from_clean, &clean_name(&to)?)
}

/// Simple case-insensitive full-text scan. No index — fine for thousands of
/// notes and keeps the scratchpad dependency-free.
#[tauri::command]
pub fn search_notes(app: AppHandle, query: String) -> Result<Vec<SearchHit>, String> {
    let needle = query.trim().to_lowercase();
    if needle.is_empty() {
        return Ok(Vec::new());
    }
    let dir = notes_dir(&app)?;
    let mut hits = Vec::new();
    for (name, path) in note_files(&dir) {
        let content = fs::read_to_string(&path).unwrap_or_default();
        let title = title_from(&content, &name);
        for (i, line) in content.lines().enumerate() {
            if line.to_lowercase().contains(&needle) {
                hits.push(SearchHit {
                    name: name.clone(),
                    title: title.clone(),
                    line: i + 1,
                    snippet: line.trim().chars().take(160).collect(),
                });
                if hits.len() >= 200 {
                    return Ok(hits);
                }
            }
        }
    }
    Ok(hits)
}

/// "File & clear": persist `content` as a new note named after its first line
/// (or a timestamp), guaranteeing a unique name. Returns the created name so
/// the frontend can offer undo.
#[tauri::command]
pub fn file_text(app: AppHandle, content: String) -> Result<String, String> {
    let base = slug_from(&content);
    let dir = notes_dir(&app)?;
    let mut name = base.clone();
    let mut n = 1;
    while taken(&dir, &name) {
        name = format!("{base}-{n}");
        n += 1;
    }
    write_atomic(&dir.join(format!("{name}.md")), &content)?;
    Ok(name)
}

/// Drop a project folder under notes/ once its last note has left it.
pub(crate) fn remove_if_empty(notes: &Path, dir: Option<&Path>) {
    if let Some(dir) = dir {
        if dir != notes && dir.starts_with(notes) {
            let _ = fs::remove_dir(dir); // fails (and is ignored) if not empty
        }
    }
}

fn slug_from(content: &str) -> String {
    let first = content
        .lines()
        .map(|l| l.trim_start_matches('#').trim_start_matches("- ").trim())
        .find(|l| !l.is_empty())
        .unwrap_or("");
    let slug: String = first
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect();
    let slug = slug.trim_matches('-').to_string();
    let slug: String = slug.split('-').filter(|s| !s.is_empty()).collect::<Vec<_>>().join("-");
    if slug.is_empty() {
        chrono::Local::now().format("%Y-%m-%d-%H%M").to_string()
    } else {
        slug.chars().take(60).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_traversal_and_separators() {
        assert!(clean_name("../x").is_err());
        assert!(clean_name("a/b").is_err());
        assert!(clean_name("a\\b").is_err());
        assert!(clean_name("").is_err());
        assert!(clean_name("  ").is_err());
    }

    #[test]
    fn accepts_and_strips_md() {
        assert_eq!(clean_name("notes.md").unwrap(), "notes");
        assert_eq!(clean_name("  hello ").unwrap(), "hello");
    }

    #[test]
    fn title_prefers_first_nonempty_line() {
        assert_eq!(title_from("\n\n# Hello\nbody", "x"), "Hello");
        assert_eq!(title_from("- a task", "x"), "a task");
        assert_eq!(title_from("   ", "fallback"), "fallback");
    }

    #[test]
    fn slug_is_filename_safe() {
        assert_eq!(slug_from("# Meeting Notes!"), "meeting-notes");
        assert_eq!(slug_from("Hello, world"), "hello-world");
        assert!(!slug_from("   ").contains(' '));
    }

    #[test]
    fn extracts_inline_tags_not_headings() {
        let got = extract_tags("# Heading\n## Sub\nsome #Work and #idea-2 here\nno#tag inline");
        assert_eq!(got, vec!["work", "idea-2"]);
    }

    #[test]
    fn extracts_tag_after_bracket() {
        assert_eq!(extract_tags("(#a) [#b]"), vec!["a", "b"]);
        assert!(extract_tags("#1 #-x").is_empty()); // must start with a letter
    }

    #[test]
    fn unique_name_appends_counter() {
        use std::collections::HashSet;
        let taken: HashSet<&str> = ["foo copy", "foo copy 2"].into_iter().collect();
        assert_eq!(unique_name("foo copy", |c| taken.contains(c)), "foo copy 3");
        assert_eq!(unique_name("bar copy", |c| taken.contains(c)), "bar copy");
    }

    #[test]
    fn original_name_survives_trash_roundtrip() {
        assert_eq!(original_from_trash("1700000000__foo"), "foo");
        assert_eq!(original_from_trash("1700000000-1__foo"), "foo");
        assert_eq!(original_from_trash("1700000000__a__b"), "a__b");
        assert_eq!(original_from_trash("weird"), "weird");
    }
}
