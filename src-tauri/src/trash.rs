//! The trash: one `trash/` folder in the data dir, laid out like the app.
//!
//! ```text
//! trash/
//!   notes/      <stamp>__<note name>.md
//!   images/     <stamp>__<file>
//!   projects/   <stamp>__<slug>/
//!                 project.md   the project page, as it was
//!                 tasks.md     its tasks (todo.md lines; `<!-- colour: … -->`)
//!   tasks.md    single deleted tasks, grouped under `## <stamp>` headings
//! ```
//!
//! `<stamp>` is the local delete time, `YYYY-MM-DD HH.MM.SS` (plus `-N` on a
//! clash), so File Explorer sorts by date and the original name follows `__`.
//! Restore ids: note file stem, image file name, project folder name, and
//! `<stamp>#<n>` for the n-th task of a group. Older builds kept a `.trash/`
//! inside notes/, assets/ and projects/; `migrate_layout` moves those here.

use std::fs;
use std::path::{Path, PathBuf};

use chrono::{Local, NaiveDateTime, TimeZone};
use tauri::AppHandle;

use crate::storage;
use crate::todo::{self, Todo};

pub const ROOT: &str = "trash";
/// The old per-folder trash name (notes/.trash, assets/.trash, projects/.trash).
pub const OLD: &str = ".trash";

const STAMP_FMT: &str = "%Y-%m-%d %H.%M.%S";

fn sub(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    let dir = storage::data_dir(app)?.join(ROOT).join(name);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// trash/notes/, created on demand.
pub(crate) fn notes_dir(app: &AppHandle) -> Result<PathBuf, String> {
    sub(app, "notes")
}
/// trash/images/, created on demand.
pub(crate) fn images_dir(app: &AppHandle) -> Result<PathBuf, String> {
    sub(app, "images")
}
/// trash/projects/, created on demand. One folder per deleted project.
pub(crate) fn projects_dir(app: &AppHandle) -> Result<PathBuf, String> {
    sub(app, "projects")
}
/// trash/tasks.md (not created).
pub(crate) fn tasks_file(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = storage::data_dir(app)?.join(ROOT);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("tasks.md"))
}

/// Now, as a trash stamp.
pub(crate) fn stamp() -> String {
    Local::now().format(STAMP_FMT).to_string()
}

/// A free `<stamp>__<base>` stem in `dir` for a file ending in `ext` (".md",
/// ".png", or "" for a folder); `<stamp>-2__…` and so on when taken.
pub(crate) fn free_stem(dir: &Path, base: &str, ext: &str) -> String {
    let s = stamp();
    let mut stem = format!("{s}__{base}");
    let mut n = 2;
    while dir.join(format!("{stem}{ext}")).exists() {
        stem = format!("{s}-{n}__{base}");
        n += 1;
    }
    stem
}

/// When an item was trashed (unix secs), read from its stamp prefix.
pub(crate) fn deleted_at(id: &str) -> Option<u64> {
    let stamp = id.split_once("__").map(|(s, _)| s).unwrap_or(id);
    let stamp = stamp.split('#').next().unwrap_or(stamp);
    let naive = NaiveDateTime::parse_from_str(stamp.get(..19)?, STAMP_FMT).ok()?;
    let when = Local.from_local_datetime(&naive).earliest()?;
    u64::try_from(when.timestamp()).ok()
}

/// Total bytes of the files in a folder (one level; project folders are flat).
pub(crate) fn dir_bytes(dir: &Path) -> u64 {
    fs::read_dir(dir)
        .map(|es| es.flatten().filter_map(|e| e.metadata().ok()).filter(|m| m.is_file()).map(|m| m.len()).sum())
        .unwrap_or(0)
}

// Deleted projects ---------------------------------------------------------

/// What a trashed project folder holds besides its page.
pub(crate) struct ProjectExtras {
    pub tasks: Vec<Todo>,
    pub colour: String,
}

pub(crate) fn write_project_tasks(folder: &Path, name: &str, tasks: &[Todo], colour: &str) -> Result<(), String> {
    if tasks.is_empty() && colour.is_empty() {
        return Ok(());
    }
    let mut out = format!("# Tasks of {name}\n\n");
    if !colour.is_empty() {
        out.push_str(&format!("<!-- colour: {colour} -->\n\n"));
    }
    out.push_str(&todo::render(tasks));
    storage::write_atomic(&folder.join("tasks.md"), &out)
}

pub(crate) fn read_project_tasks(folder: &Path) -> ProjectExtras {
    let text = fs::read_to_string(folder.join("tasks.md")).unwrap_or_default();
    let colour = text
        .lines()
        .find_map(|l| l.trim().strip_prefix("<!-- colour:")?.strip_suffix("-->").map(|c| c.trim().to_string()))
        .unwrap_or_default();
    ProjectExtras { tasks: todo::parse(&text), colour }
}

// Deleted tasks (trash/tasks.md) -------------------------------------------

/// One delete: the tasks removed together, under their stamp.
pub(crate) struct Group {
    pub stamp: String,
    pub tasks: Vec<Todo>,
}

pub(crate) fn read_groups(path: &Path) -> Vec<Group> {
    let text = fs::read_to_string(path).unwrap_or_default();
    let mut groups: Vec<Group> = Vec::new();
    for line in text.lines() {
        if let Some(s) = line.trim().strip_prefix("## ") {
            groups.push(Group { stamp: s.trim().to_string(), tasks: Vec::new() });
        } else if let Some(t) = todo::parse(line).pop() {
            if groups.is_empty() {
                groups.push(Group { stamp: String::new(), tasks: Vec::new() });
            }
            groups.last_mut().unwrap().tasks.push(t);
        }
    }
    groups
}

pub(crate) fn write_groups(path: &Path, groups: &[Group]) -> Result<(), String> {
    let live: Vec<&Group> = groups.iter().filter(|g| !g.tasks.is_empty()).collect();
    if live.is_empty() {
        if path.exists() {
            fs::remove_file(path).map_err(|e| e.to_string())?;
        }
        return Ok(());
    }
    let mut out = String::from("# Deleted tasks\n\nRestore them from dotMD: Storage → Trash.\n");
    for g in live {
        out.push_str(&format!("\n## {}\n", g.stamp));
        out.push_str(&todo::render(&g.tasks));
    }
    storage::write_atomic(path, &out)
}

/// Take tasks out of the trash by `<stamp>#<n>` id; returns them in id order.
pub(crate) fn take_tasks(app: &AppHandle, ids: &[String]) -> Result<Vec<Todo>, String> {
    let path = tasks_file(app)?;
    let mut groups = read_groups(&path);
    let mut out = Vec::new();
    for id in ids {
        let Some((stamp, n)) = id.rsplit_once('#') else { continue };
        let Ok(n) = n.parse::<usize>() else { continue };
        if let Some(t) = groups.iter().find(|g| g.stamp == stamp).and_then(|g| g.tasks.get(n)) {
            out.push(t.clone());
        }
    }
    // Remove after reading, so indices stay valid for every id.
    for g in groups.iter_mut() {
        let mut i = 0;
        g.tasks.retain(|_| {
            let keep = !ids.contains(&format!("{}#{i}", g.stamp));
            i += 1;
            keep
        });
    }
    write_groups(&path, &groups)?;
    Ok(out)
}

/// Keep deleted tasks in trash/tasks.md. Returns the group stamp ("" if none),
/// which Undo hands back to `untrash_tasks`.
#[tauri::command]
pub fn trash_tasks(app: AppHandle, tasks: Vec<Todo>) -> Result<String, String> {
    if tasks.is_empty() {
        return Ok(String::new());
    }
    let path = tasks_file(&app)?;
    let mut groups = read_groups(&path);
    let base = stamp();
    let mut s = base.clone();
    let mut n = 2;
    while groups.iter().any(|g| g.stamp == s) {
        s = format!("{base}-{n}");
        n += 1;
    }
    groups.push(Group { stamp: s.clone(), tasks });
    write_groups(&path, &groups)?;
    Ok(s)
}

/// Undo: drop a whole group (the app already put those tasks back).
#[tauri::command]
pub fn untrash_tasks(app: AppHandle, stamp: String) -> Result<(), String> {
    let path = tasks_file(&app)?;
    let mut groups = read_groups(&path);
    groups.retain(|g| g.stamp != stamp);
    write_groups(&path, &groups)
}

/// Storage → Trash → Restore: hand the tasks back (the app appends them).
#[tauri::command]
pub fn restore_tasks(app: AppHandle, ids: Vec<String>) -> Result<Vec<Todo>, String> {
    take_tasks(&app, &ids)
}

// Migration from the per-folder .trash layout -------------------------------

/// `<unix-secs>[-n]__rest` → `<readable stamp>[-n]__rest`; anything else as is.
fn restamp(name: &str) -> String {
    let Some((prefix, rest)) = name.split_once("__") else { return name.to_string() };
    let (secs, n) = prefix.split_once('-').unwrap_or((prefix, ""));
    let Some(when) = secs.parse::<i64>().ok().and_then(|s| Local.timestamp_opt(s, 0).single()) else {
        return name.to_string();
    };
    let suffix = if n.is_empty() { String::new() } else { format!("-{n}") };
    format!("{}{suffix}__{rest}", when.format(STAMP_FMT))
}

/// A path in `dir` for `name` that doesn't exist yet. A stamped name gets
/// `-2`… on its stamp (`<stamp>-2__rest`, so the date still reads); anything
/// else gets " (2)"… before the extension.
fn free_in(dir: &Path, name: &str) -> PathBuf {
    let p = dir.join(name);
    if !p.exists() {
        return p;
    }
    if let Some((stamp, rest)) = name.split_once("__") {
        let base = stamp.get(..19).unwrap_or(stamp);
        let mut n = 2;
        loop {
            let p = dir.join(format!("{base}-{n}__{rest}"));
            if !p.exists() {
                return p;
            }
            n += 1;
        }
    }
    let (stem, ext) = match name.rsplit_once('.') {
        Some((s, e)) => (s.to_string(), format!(".{e}")),
        None => (name.to_string(), String::new()),
    };
    let mut n = 2;
    loop {
        let p = dir.join(format!("{stem} ({n}){ext}"));
        if !p.exists() {
            return p;
        }
        n += 1;
    }
}

/// Move old `notes/.trash`, `assets/.trash` and `projects/.trash` into
/// `trash/`, renaming stamps to the readable form. Old project files become
/// project folders (without tasks: older builds never kept them). Safe to run
/// every startup; does nothing once the old folders are gone.
pub fn migrate_layout(data: &Path) -> Result<(), String> {
    let root = data.join(ROOT);
    for (old, new) in [("notes", "notes"), ("assets", "images")] {
        let from = data.join(old).join(OLD);
        let Ok(entries) = fs::read_dir(&from) else { continue };
        let to = root.join(new);
        fs::create_dir_all(&to).map_err(|e| e.to_string())?;
        for e in entries.flatten() {
            let path = e.path();
            if !path.is_file() {
                continue;
            }
            let name = e.file_name().to_string_lossy().into_owned();
            fs::rename(&path, free_in(&to, &restamp(&name))).map_err(|e| e.to_string())?;
        }
        let _ = fs::remove_dir(&from);
    }
    let from = data.join("projects").join(OLD);
    if let Ok(entries) = fs::read_dir(&from) {
        let to = root.join("projects");
        fs::create_dir_all(&to).map_err(|e| e.to_string())?;
        for e in entries.flatten() {
            let path = e.path();
            if path.extension().and_then(|x| x.to_str()) != Some("md") {
                continue;
            }
            let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("project");
            let folder = free_in(&to, &restamp(stem));
            fs::create_dir_all(&folder).map_err(|e| e.to_string())?;
            fs::rename(&path, folder.join("project.md")).map_err(|e| e.to_string())?;
        }
        let _ = fs::remove_dir(&from);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn restamps_old_names() {
        let s = restamp("1700000000__Launch plan.md");
        assert!(s.ends_with("__Launch plan.md"));
        assert!(deleted_at(&s).is_some());
        assert!(restamp("1700000000-2__x.png").contains("-2__x.png"));
        assert_eq!(restamp("weird.md"), "weird.md");
        assert_eq!(restamp("abc__x.md"), "abc__x.md");
    }

    #[test]
    fn task_groups_round_trip() {
        let dir = std::env::temp_dir().join(format!("dotmd-trash-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("tasks.md");
        let t = |text: &str| Todo {
            text: text.into(),
            done: false,
            created: "2026-11-08T10:00:00Z".into(),
            deadline: String::new(),
            subject: "Web".into(),
            description: "a | b\nc".into(),
        };
        let groups = vec![
            Group { stamp: "2026-11-08 10.00.00".into(), tasks: vec![t("one"), t("two")] },
            Group { stamp: "2026-11-08 11.00.00".into(), tasks: vec![t("three")] },
        ];
        write_groups(&path, &groups).unwrap();
        let back = read_groups(&path);
        assert_eq!(back.len(), 2);
        assert_eq!(back[0].tasks[1].text, "two");
        assert_eq!(back[0].tasks[0].description, "a | b\nc");
        assert_eq!(back[1].stamp, "2026-11-08 11.00.00");
        write_groups(&path, &[]).unwrap();
        assert!(!path.exists());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn migrates_old_trash_folders() {
        let data = std::env::temp_dir().join(format!("dotmd-trash-mig-{}", std::process::id()));
        let _ = fs::remove_dir_all(&data);
        for d in ["notes/.trash", "assets/.trash", "projects/.trash"] {
            fs::create_dir_all(data.join(d)).unwrap();
        }
        fs::write(data.join("notes/.trash/1700000000__a.md"), "a").unwrap();
        fs::write(data.join("assets/.trash/1700000000__x.png"), [1u8]).unwrap();
        fs::write(data.join("projects/.trash/1700000000__web.md"), "---\nname: Web\n---\n").unwrap();
        migrate_layout(&data).unwrap();
        assert!(!data.join("notes/.trash").exists());
        let notes: Vec<_> = fs::read_dir(data.join("trash/notes")).unwrap().flatten().collect();
        assert_eq!(notes.len(), 1);
        assert!(notes[0].file_name().to_string_lossy().ends_with("__a.md"));
        assert_eq!(fs::read_dir(data.join("trash/images")).unwrap().count(), 1);
        let proj: Vec<_> = fs::read_dir(data.join("trash/projects")).unwrap().flatten().collect();
        assert!(proj[0].path().join("project.md").is_file());
        migrate_layout(&data).unwrap(); // idempotent
        let _ = fs::remove_dir_all(&data);
    }
}
