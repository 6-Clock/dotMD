//! Projects: a to-do subject promoted with a page. One readable Markdown file
//! per project in `projects/`, a small front-matter block the app owns, and a
//! body the app never touches:
//!
//! ```md
//! ---
//! name: "CMPT 361: Graphics"
//! logo: ../assets/cmpt361.png
//! created: 2026-11-03
//! goal: Final demo, Dec 5
//! description: Ray tracer + report
//! notes:
//!   - "[[Ray tracer notes]]"
//! ---
//!
//! Anything you write here is yours.
//! ```
//!
//! The project's tasks are the to-dos whose subject equals `name` (todo.md);
//! progress is computed from them, never stored. Files are named by a slug of
//! the name (subjects may hold `:` or `/`), so lookups always go by `name`.
//! Delete moves the file to `projects/.trash/` like notes.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::storage::{self, TRASH};

#[derive(Serialize, Deserialize, Clone, Default, Debug, PartialEq)]
pub struct Project {
    pub name: String,
    #[serde(default)]
    pub logo: String, // ../assets/<file>, or ""
    #[serde(default)]
    pub created: String, // YYYY-MM-DD
    #[serde(default)]
    pub goal: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub notes: Vec<String>, // note names (stored as [[links]])
    /// File mtime (unix secs). Read-only: filled on list, never written.
    #[serde(default)]
    pub modified: u64,
}

pub(crate) fn projects_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = storage::data_dir(app)?.join("projects");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn trash_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = projects_dir(app)?.join(TRASH);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

// Front matter -----------------------------------------------------------

/// Plain YAML scalars when safe, JSON-quoted (a valid YAML string) otherwise.
/// Line breaks (multi-line descriptions) survive as `\n` inside the quotes.
fn scalar(v: &str) -> String {
    let v = v.replace("\r\n", "\n").replace('\r', "\n");
    let risky = v.is_empty()
        || v.contains('\n')
        || v.contains(": ")
        || v.contains(" #")
        || v.ends_with(':')
        || v.starts_with(|c: char| c.is_whitespace() || "\"'[]{}>|*&!%@`#,?-".contains(c))
        || v.ends_with(char::is_whitespace);
    if risky {
        serde_json::to_string(&v).unwrap_or_default()
    } else {
        v
    }
}

fn unquote(v: &str) -> String {
    let v = v.trim();
    if v.starts_with('"') {
        if let Ok(s) = serde_json::from_str::<String>(v) {
            return s;
        }
    }
    if v.len() >= 2 && v.starts_with('\'') && v.ends_with('\'') {
        return v[1..v.len() - 1].replace("''", "'");
    }
    v.to_string()
}

/// `[[name]]` / `[[name|label]]` → name; anything else as-is.
fn link_target(v: &str) -> String {
    let v = v.trim();
    if let Some(inner) = v.strip_prefix("[[").and_then(|s| s.strip_suffix("]]")) {
        return inner.split('|').next().unwrap_or("").trim().to_string();
    }
    v.to_string()
}

/// Split a file into (front-matter lines, body). No front matter → ("", all).
fn split_front(content: &str) -> (Option<&str>, &str) {
    let rest = match content.strip_prefix("---\n").or_else(|| content.strip_prefix("---\r\n")) {
        Some(r) => r,
        None => return (None, content),
    };
    let mut at = 0;
    for line in rest.split_inclusive('\n') {
        if line.trim_end() == "---" {
            let body = &rest[at + line.len()..];
            return (Some(&rest[..at]), body);
        }
        at += line.len();
    }
    (None, content)
}

pub(crate) fn parse(content: &str, fallback_name: &str) -> (Project, String) {
    let (front, body) = split_front(content);
    let mut p = Project::default();
    let mut in_notes = false;
    for line in front.unwrap_or("").lines() {
        if in_notes {
            if let Some(item) = line.trim_start().strip_prefix("- ") {
                let name = link_target(&unquote(item));
                if !name.is_empty() {
                    p.notes.push(name);
                }
                continue;
            }
            if line.starts_with(char::is_whitespace) || line.trim().is_empty() {
                continue;
            }
            in_notes = false;
        }
        let Some((key, value)) = line.split_once(':') else { continue };
        let value = unquote(value);
        match key.trim() {
            "name" => p.name = value,
            "logo" => p.logo = value,
            "created" => p.created = value,
            "goal" => p.goal = value,
            "description" => p.description = value,
            "notes" => in_notes = true,
            _ => {}
        }
    }
    if p.name.trim().is_empty() {
        p.name = fallback_name.to_string();
    }
    (p, body.to_string())
}

pub(crate) fn render(p: &Project, body: &str) -> String {
    let mut out = String::from("---\n");
    out.push_str(&format!("name: {}\n", scalar(&p.name)));
    for (key, value) in [
        ("logo", &p.logo),
        ("created", &p.created),
        ("goal", &p.goal),
        ("description", &p.description),
    ] {
        if !value.trim().is_empty() {
            out.push_str(&format!("{key}: {}\n", scalar(value)));
        }
    }
    if !p.notes.is_empty() {
        out.push_str("notes:\n");
        for n in &p.notes {
            out.push_str(&format!("  - {}\n", scalar(&format!("[[{n}]]"))));
        }
    }
    out.push_str("---\n");
    if body.trim().is_empty() {
        out.push_str(&format!("\n# {}\n", p.name));
    } else {
        out.push_str(body);
    }
    out
}

/// File stem for a project name: separators and reserved characters become
/// `-`, so "CMPT/361: Graphics" → "CMPT-361- Graphics".
pub(crate) fn slug(name: &str) -> String {
    let s: String = name
        .trim()
        .chars()
        .map(|c| if c.is_control() || "<>:\"/\\|?*".contains(c) { '-' } else { c })
        .collect();
    let s = s.replace("..", "-");
    let s = s.trim_matches(|c: char| c == '.' || c.is_whitespace()).to_string();
    let s: String = s.chars().take(100).collect();
    if s.is_empty() { "project".into() } else { s }
}

// Files ------------------------------------------------------------------

fn md_files(dir: &Path) -> Vec<PathBuf> {
    let Ok(entries) = fs::read_dir(dir) else { return Vec::new() };
    entries
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.extension().and_then(|e| e.to_str()) == Some("md"))
        .collect()
}

/// Every live project with its path and body.
fn all(app: &AppHandle) -> Result<Vec<(PathBuf, Project, String)>, String> {
    let mut out = Vec::new();
    for path in md_files(&projects_dir(app)?) {
        let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("").to_string();
        let Ok(content) = fs::read_to_string(&path) else { continue };
        let (mut p, body) = parse(&content, &stem);
        p.modified = storage::modified_secs(&path);
        out.push((path, p, body));
    }
    Ok(out)
}

fn find(app: &AppHandle, name: &str) -> Result<Option<(PathBuf, Project, String)>, String> {
    Ok(all(app)?.into_iter().find(|(_, p, _)| p.name == name))
}

fn free_path(dir: &Path, name: &str) -> PathBuf {
    let base = slug(name);
    let mut path = dir.join(format!("{base}.md"));
    let mut n = 2;
    while path.exists() {
        path = dir.join(format!("{base} {n}.md"));
        n += 1;
    }
    path
}

/// Every `.md` in projects/ and its trash — for link rewrites and image scans.
pub(crate) fn project_files(app: &AppHandle) -> Vec<PathBuf> {
    let Ok(dir) = projects_dir(app) else { return Vec::new() };
    let mut files = md_files(&dir);
    files.extend(md_files(&dir.join(TRASH)));
    files
}

// Commands ---------------------------------------------------------------

#[tauri::command]
pub fn list_projects(app: AppHandle) -> Result<Vec<Project>, String> {
    let mut list: Vec<Project> = all(&app)?.into_iter().map(|(_, p, _)| p).collect();
    list.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    list.dedup_by(|a, b| a.name == b.name);
    Ok(list)
}

#[tauri::command]
pub fn create_project(app: AppHandle, name: String) -> Result<Project, String> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("Project name cannot be empty".into());
    }
    if let Some((_, p, _)) = find(&app, &name)? {
        return Ok(p); // already a project: just open it
    }
    let p = Project {
        name: name.clone(),
        created: chrono::Local::now().format("%Y-%m-%d").to_string(),
        ..Default::default()
    };
    let path = free_path(&projects_dir(&app)?, &name);
    storage::write_atomic(&path, &render(&p, ""))?;
    Ok(p)
}

/// Rewrite a project's front matter (the body is kept as-is). Matched by name;
/// renames go through `rename_project`.
#[tauri::command]
pub fn update_project(app: AppHandle, project: Project) -> Result<(), String> {
    let Some((path, _, body)) = find(&app, &project.name)? else {
        return Err("Project not found".into());
    };
    storage::write_atomic(&path, &render(&project, &body))
}

/// Rename a project (called when its subject is renamed). Renaming onto an
/// existing project merges: the target keeps its own fields, fills blanks from
/// the source, gains the source's notes, and the source file goes to trash.
/// Returns the trash stem of a merged-away file ("" otherwise) for undo.
#[tauri::command]
pub fn rename_project(app: AppHandle, from: String, to: String) -> Result<String, String> {
    let to = to.trim().to_string();
    if to.is_empty() || to == from {
        return Ok(String::new());
    }
    let Some((src_path, src, src_body)) = find(&app, &from)? else {
        return Ok(String::new()); // a plain subject: nothing to do
    };
    if let Some((dst_path, mut dst, dst_body)) = find(&app, &to)? {
        for (mine, theirs) in [
            (&mut dst.logo, &src.logo),
            (&mut dst.goal, &src.goal),
            (&mut dst.description, &src.description),
            (&mut dst.created, &src.created),
        ] {
            if mine.trim().is_empty() {
                *mine = theirs.clone();
            }
        }
        for n in &src.notes {
            if !dst.notes.contains(n) {
                dst.notes.push(n.clone());
            }
        }
        storage::write_atomic(&dst_path, &render(&dst, &dst_body))?;
        return to_trash(&app, &src_path, &src.name);
    }
    let renamed = Project { name: to.clone(), ..src };
    let dir = projects_dir(&app)?;
    // Keep the file name when it still fits the new slug; else move it.
    let wanted = dir.join(format!("{}.md", slug(&to)));
    let target = if wanted == src_path || !wanted.exists() { wanted } else { free_path(&dir, &to) };
    // A body still holding only the seeded "# Old name" follows the rename.
    let body = if src_body.trim() == format!("# {from}") { String::new() } else { src_body };
    storage::write_atomic(&target, &render(&renamed, &body))?;
    if target != src_path {
        let _ = fs::remove_file(&src_path);
    }
    Ok(String::new())
}

fn to_trash(app: &AppHandle, path: &Path, name: &str) -> Result<String, String> {
    let trash = trash_dir(app)?;
    let stamp = chrono::Local::now().timestamp();
    let base = slug(name);
    let mut stem = format!("{stamp}__{base}");
    let mut n = 1;
    while trash.join(format!("{stem}.md")).exists() {
        stem = format!("{stamp}-{n}__{base}");
        n += 1;
    }
    fs::rename(path, trash.join(format!("{stem}.md"))).map_err(|e| e.to_string())?;
    Ok(stem)
}

/// Move the project file to projects/.trash/. Only the file: the frontend
/// removes the project's tasks from todo.md itself (and undoes both).
/// Returns the trash stem for undo.
#[tauri::command]
pub fn delete_project(app: AppHandle, name: String) -> Result<String, String> {
    match find(&app, &name)? {
        Some((path, p, _)) => to_trash(&app, &path, &p.name),
        None => Ok(String::new()),
    }
}

#[tauri::command]
pub fn restore_project(app: AppHandle, stem: String) -> Result<(), String> {
    if stem.is_empty() || stem.contains("..") || stem.contains('/') || stem.contains('\\') {
        return Err("Invalid trash id".into());
    }
    let src = trash_dir(&app)?.join(format!("{stem}.md"));
    if !src.is_file() {
        return Err("Trashed project not found".into());
    }
    let content = fs::read_to_string(&src).map_err(|e| e.to_string())?;
    let (p, _) = parse(&content, &storage::original_from_trash(&stem));
    if find(&app, &p.name)?.is_some() {
        return Err(format!("A project named {} already exists", p.name));
    }
    fs::rename(&src, free_path(&projects_dir(&app)?, &p.name)).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips_front_matter_and_keeps_body() {
        let p = Project {
            name: "CMPT 361: Graphics".into(),
            logo: "../assets/x.png".into(),
            created: "2026-11-03".into(),
            goal: "Demo, Dec 5".into(),
            description: "Ray tracer\nand report".into(),
            notes: vec!["Ray tracer notes".into(), "Lecture 12".into()],
            modified: 0,
        };
        let body = "\nMy own words — # not a key: really.\n";
        let text = render(&p, body);
        let (back, kept) = parse(&text, "fallback");
        assert_eq!(back.name, p.name);
        assert_eq!(back.logo, p.logo);
        assert_eq!(back.goal, p.goal);
        assert_eq!(back.description, p.description);
        assert_eq!(back.notes, p.notes);
        assert_eq!(kept, body);
    }

    #[test]
    fn hand_written_file_parses() {
        let text = "---\nname: Thesis\nnotes:\n  - [[Lit review|lit]]\n  - \"[[Draft]]\"\ngoal: 'Submit it'\n---\nbody";
        let (p, body) = parse(text, "x");
        assert_eq!(p.name, "Thesis");
        assert_eq!(p.notes, vec!["Lit review".to_string(), "Draft".to_string()]);
        assert_eq!(p.goal, "Submit it");
        assert_eq!(body, "body");
    }

    #[test]
    fn missing_front_matter_uses_file_name() {
        let (p, body) = parse("# Just notes", "My project");
        assert_eq!(p.name, "My project");
        assert_eq!(body, "# Just notes");
    }

    #[test]
    fn slug_is_file_safe() {
        assert_eq!(slug("CMPT/361: Graphics"), "CMPT-361- Graphics");
        let s = slug("../..");
        assert!(!s.contains("..") && !s.contains('/'));
        assert_eq!(slug("  "), "project");
    }

    #[test]
    fn note_links_in_front_matter_are_rename_friendly() {
        let text = render(&Project { name: "P".into(), notes: vec!["Old".into()], ..Default::default() }, "");
        assert!(text.contains("\"[[Old]]\""));
    }
}
