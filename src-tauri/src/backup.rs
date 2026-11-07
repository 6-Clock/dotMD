//! Export a backup: every note, Untitled/Daily, project, image, `todo.md` and
//! the user's config (`settings.json`, `theme.css`) zipped into one file the
//! user picks. Read-only on the data dir. The zip mirrors the data dir's own
//! layout (notes/, system/, projects/, assets/, todo.md, …) so unzipping it
//! into `%APPDATA%\com.dotmd.app\` restores everything; a `dotmd-backup.json`
//! manifest at the root says what it is.

use std::fs::{self, File};
use std::io::{self, Write};
use std::path::{Path, PathBuf};

use chrono::{DateTime, Datelike, Local, Timelike};
use serde::Serialize;
use tauri::AppHandle;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipWriter};

use crate::storage::{data_dir, reveal_path, TRASH};

/// Folders and files that hold the user's data. Anything else in the data dir
/// (window state, temp files) is machine-specific and stays out.
const DIRS: &[&str] = &["notes", "system", "projects", "assets"];
const FILES: &[&str] = &["todo.md", "settings.json", "theme.css"];
pub const MANIFEST: &str = "dotmd-backup.json";

#[derive(Serialize)]
pub struct BackupSummary {
    pub path: String,
    pub files: usize,
    pub bytes: u64,
}

#[derive(Serialize)]
struct Manifest<'a> {
    app: &'a str,
    format: u32,
    version: &'a str,
    exported: String,
    files: usize,
    bytes: u64,
    include_trash: bool,
}

/// Every data file under `root/rel`, as paths relative to `root`. Skips
/// `.trash/` folders unless asked, atomic-write temps, and symlinks.
fn collect(root: &Path, rel: &Path, trash: bool, out: &mut Vec<PathBuf>) -> io::Result<()> {
    let dir = root.join(rel);
    if !dir.is_dir() {
        return Ok(());
    }
    let mut entries: Vec<_> = fs::read_dir(&dir)?.collect::<Result<_, _>>()?;
    entries.sort_by_key(|e| e.file_name());
    for entry in entries {
        let name = entry.file_name();
        let name_s = name.to_string_lossy();
        let kind = entry.file_type()?;
        let path = rel.join(&name);
        if kind.is_dir() {
            if name_s == TRASH && !trash {
                continue;
            }
            collect(root, &path, trash, out)?;
        } else if kind.is_file() && !name_s.ends_with(".tmp") {
            out.push(path);
        }
    }
    Ok(())
}

/// The files a backup would hold, relative to the data dir, in a stable order.
pub(crate) fn backup_files(root: &Path, trash: bool) -> io::Result<Vec<PathBuf>> {
    let mut out = Vec::new();
    for d in DIRS {
        collect(root, Path::new(d), trash, &mut out)?;
    }
    for f in FILES {
        if root.join(f).is_file() {
            out.push(PathBuf::from(f));
        }
    }
    Ok(out)
}

/// Zip entry name: forward slashes on every platform.
fn entry_name(rel: &Path) -> String {
    rel.components()
        .map(|c| c.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("/")
}

/// Keep each file's modified time, so "Edited …" labels survive a restore.
fn zip_time(path: &Path) -> Option<zip::DateTime> {
    let t: DateTime<Local> = fs::metadata(path).ok()?.modified().ok()?.into();
    zip::DateTime::from_date_and_time(
        u16::try_from(t.year()).ok()?,
        t.month() as u8,
        t.day() as u8,
        t.hour() as u8,
        t.minute() as u8,
        t.second() as u8,
    )
    .ok()
}

fn write_zip(root: &Path, dest: &Path, trash: bool) -> Result<BackupSummary, String> {
    let files = backup_files(root, trash).map_err(|e| e.to_string())?;
    // Write next to the destination, then rename: a failed export never
    // leaves a half-written zip under the chosen name.
    let tmp = dest.with_extension("zip.tmp");
    let result = (|| -> Result<u64, String> {
        let mut zip = ZipWriter::new(File::create(&tmp).map_err(|e| e.to_string())?);
        let base = SimpleFileOptions::default()
            .compression_method(CompressionMethod::Deflated)
            .large_file(true);
        let mut bytes = 0u64;
        for rel in &files {
            let src = root.join(rel);
            let opts = match zip_time(&src) {
                Some(t) => base.last_modified_time(t),
                None => base,
            };
            zip.start_file(entry_name(rel), opts).map_err(|e| e.to_string())?;
            let mut f = File::open(&src).map_err(|e| format!("{}: {e}", rel.display()))?;
            bytes += io::copy(&mut f, &mut zip).map_err(|e| e.to_string())?;
        }
        let manifest = Manifest {
            app: "dotMD",
            format: 1,
            version: env!("CARGO_PKG_VERSION"),
            exported: Local::now().to_rfc3339(),
            files: files.len(),
            bytes,
            include_trash: trash,
        };
        zip.start_file(MANIFEST, base).map_err(|e| e.to_string())?;
        let json = serde_json::to_vec_pretty(&manifest).map_err(|e| e.to_string())?;
        zip.write_all(&json).map_err(|e| e.to_string())?;
        zip.finish().map_err(|e| e.to_string())?;
        Ok(bytes)
    })();
    match result {
        Ok(bytes) => {
            fs::rename(&tmp, dest).map_err(|e| {
                let _ = fs::remove_file(&tmp);
                e.to_string()
            })?;
            Ok(BackupSummary {
                path: dest.display().to_string(),
                files: files.len(),
                bytes,
            })
        }
        Err(e) => {
            let _ = fs::remove_file(&tmp);
            Err(e)
        }
    }
}

/// Zip all user data into `path` (a `.zip` is added if missing).
#[tauri::command]
pub async fn export_backup(app: AppHandle, path: String, include_trash: bool) -> Result<BackupSummary, String> {
    let root = data_dir(&app)?;
    let mut dest = PathBuf::from(path.trim());
    if dest.as_os_str().is_empty() {
        return Err("No file chosen".into());
    }
    if !dest
        .extension()
        .is_some_and(|e| e.eq_ignore_ascii_case("zip"))
    {
        dest.set_extension("zip");
    }
    tauri::async_runtime::spawn_blocking(move || write_zip(&root, &dest, include_trash))
        .await
        .map_err(|e| e.to_string())?
}

// Import ------------------------------------------------------------------
//
// Two modes. **Merge** never overwrites: files you don't have are added,
// identical ones skipped, a note that differs comes in as "<name> (imported)",
// Untitled/Daily that differ come in as "Untitled (imported)" / "Daily
// (imported)" notes, differing projects/images/trash are left as yours, tasks
// not already in todo.md are appended, settings only gain subject colours and
// view-only notes. **Replace** swaps every data file for the backup's. Both
// first zip the current data to `backups/before-import-<stamp>.zip`.

#[derive(Serialize)]
pub struct BackupInfo {
    pub exported: String,
    pub version: String,
    pub notes: usize,
    pub projects: usize,
    pub images: usize,
    pub tasks: usize,
    pub has_settings: bool,
    pub files: usize,
}

#[derive(Serialize, Default)]
pub struct ImportSummary {
    /// Files written that weren't there before.
    pub added: usize,
    /// Identical to what you have.
    pub skipped: usize,
    /// Differed from yours, so came in under a new "(imported)" name.
    pub renamed: usize,
    /// Differed from yours, and yours was kept (projects, images, trash, theme).
    pub kept: usize,
    pub tasks_added: usize,
    /// Zip of the data as it was just before the import.
    pub snapshot: String,
}

const STAGING: &str = ".import-staging";

fn open_backup(path: &Path) -> Result<zip::ZipArchive<File>, String> {
    let file = File::open(path).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipArchive::new(file).map_err(|_| "That file isn't a zip archive".to_string())?;
    let manifest: serde_json::Value = {
        let mut f = zip
            .by_name(MANIFEST)
            .map_err(|_| "Not a dotMD backup (no dotmd-backup.json inside)".to_string())?;
        let mut s = String::new();
        io::Read::read_to_string(&mut f, &mut s).map_err(|e| e.to_string())?;
        serde_json::from_str(&s).map_err(|_| "The backup's manifest is damaged".to_string())?
    };
    if manifest.get("app").and_then(|v| v.as_str()) != Some("dotMD") {
        return Err("Not a dotMD backup".into());
    }
    Ok(zip)
}

/// A zip entry we're willing to write: plain relative components, under one of
/// the data folders (or one of the top-level data files). Blocks zip-slip.
fn allowed(rel: &Path) -> bool {
    use std::path::Component;
    let parts: Vec<String> = match rel
        .components()
        .map(|c| match c {
            Component::Normal(s) => Some(s.to_string_lossy().into_owned()),
            _ => None,
        })
        .collect::<Option<Vec<_>>>()
    {
        Some(p) if !p.is_empty() => p,
        _ => return false,
    };
    if parts.last().is_some_and(|n| n.ends_with(".tmp")) {
        return false;
    }
    if parts.len() == 1 {
        FILES.contains(&parts[0].as_str())
    } else {
        DIRS.contains(&parts[0].as_str())
    }
}

/// Walk the backup's data entries one at a time: (relative path, bytes, mtime).
fn each_entry(
    zip: &mut zip::ZipArchive<File>,
    mut f: impl FnMut(PathBuf, Vec<u8>, Option<std::time::SystemTime>) -> Result<(), String>,
) -> Result<(), String> {
    for i in 0..zip.len() {
        let mut entry = zip.by_index(i).map_err(|e| e.to_string())?;
        if entry.is_dir() {
            continue;
        }
        let Some(rel) = entry.enclosed_name().map(|p| p.to_path_buf()) else {
            continue;
        };
        if !allowed(&rel) {
            continue;
        }
        let when = entry.last_modified().and_then(system_time);
        let mut buf = Vec::with_capacity(entry.size() as usize);
        io::Read::read_to_end(&mut entry, &mut buf).map_err(|e| e.to_string())?;
        f(rel, buf, when)?;
    }
    Ok(())
}

fn system_time(t: zip::DateTime) -> Option<std::time::SystemTime> {
    use chrono::TimeZone;
    let dt = Local
        .with_ymd_and_hms(
            t.year() as i32,
            t.month() as u32,
            t.day() as u32,
            t.hour() as u32,
            t.minute() as u32,
            t.second() as u32,
        )
        .single()?;
    Some(dt.into())
}

/// Write a file (creating folders) and give it the backup's modified time.
fn put(dest: &Path, bytes: &[u8], when: Option<std::time::SystemTime>) -> Result<(), String> {
    if let Some(dir) = dest.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    fs::write(dest, bytes).map_err(|e| format!("{}: {e}", dest.display()))?;
    if let Some(t) = when {
        if let Ok(f) = File::options().write(true).open(dest) {
            let _ = f.set_modified(t);
        }
    }
    Ok(())
}

/// "<stem> (imported).md", then "(imported 2)", … — the first free name in `dir`.
fn imported_name(dir: &Path, stem: &str, ext: &str) -> PathBuf {
    let mut n = 1;
    loop {
        let label = if n == 1 { "(imported)".to_string() } else { format!("(imported {n})") };
        let p = dir.join(format!("{stem} {label}.{ext}"));
        if !p.exists() {
            return p;
        }
        n += 1;
    }
}

fn is_trash(rel: &Path) -> bool {
    rel.components().any(|c| c.as_os_str() == TRASH)
}

fn merge_todos(dest: &Path, theirs: &[u8]) -> Result<usize, String> {
    use crate::todo::{parse, render};
    let mut mine = if dest.exists() {
        parse(&fs::read_to_string(dest).map_err(|e| e.to_string())?)
    } else {
        Vec::new()
    };
    let key = |t: &crate::todo::Todo| (t.text.clone(), t.subject.clone(), t.created.clone());
    let have: std::collections::HashSet<_> = mine.iter().map(key).collect();
    let new: Vec<_> = parse(&String::from_utf8_lossy(theirs))
        .into_iter()
        .filter(|t| !have.contains(&key(t)))
        .collect();
    let added = new.len();
    if added > 0 {
        mine.extend(new);
        put(dest, render(&mine).as_bytes(), None)?;
    }
    Ok(added)
}

/// Keep your settings; only gain the backup's subject colours (for subjects
/// you don't have yet) and its view-only notes.
fn merge_settings(dest: &Path, theirs: &[u8]) -> Result<bool, String> {
    use serde_json::Value;
    let Ok(theirs) = serde_json::from_slice::<Value>(theirs) else {
        return Ok(false);
    };
    let mut mine: Value = match fs::read(dest) {
        Ok(b) => serde_json::from_slice(&b).unwrap_or(Value::Object(Default::default())),
        Err(_) => Value::Object(Default::default()),
    };
    let Some(obj) = mine.as_object_mut() else {
        return Ok(false);
    };
    let mut changed = false;
    if let Some(cols) = theirs.get("subject_colors").and_then(|v| v.as_object()) {
        let slot = obj
            .entry("subject_colors")
            .or_insert_with(|| Value::Object(Default::default()));
        if let Some(m) = slot.as_object_mut() {
            for (k, v) in cols {
                if !m.contains_key(k) {
                    m.insert(k.clone(), v.clone());
                    changed = true;
                }
            }
        }
    }
    if let Some(list) = theirs.get("view_only_notes").and_then(|v| v.as_array()) {
        let slot = obj.entry("view_only_notes").or_insert_with(|| Value::Array(Vec::new()));
        if let Some(a) = slot.as_array_mut() {
            for v in list {
                if !a.contains(v) {
                    a.push(v.clone());
                    changed = true;
                }
            }
        }
    }
    if changed {
        let json = serde_json::to_vec_pretty(&mine).map_err(|e| e.to_string())?;
        put(dest, &json, None)?;
    }
    Ok(changed)
}

fn merge_into(root: &Path, zip: &mut zip::ZipArchive<File>) -> Result<ImportSummary, String> {
    let mut sum = ImportSummary::default();
    each_entry(zip, |rel, bytes, when| {
        let dest = root.join(&rel);
        let top = rel.components().next().map(|c| c.as_os_str().to_string_lossy().into_owned());
        let top = top.as_deref().unwrap_or("");
        match top {
            "todo.md" => sum.tasks_added += merge_todos(&dest, &bytes)?,
            "settings.json" => {
                if !dest.exists() {
                    put(&dest, &bytes, when)?;
                    sum.added += 1;
                } else if !merge_settings(&dest, &bytes)? {
                    sum.skipped += 1;
                }
            }
            _ if !dest.exists() => {
                put(&dest, &bytes, when)?;
                sum.added += 1;
            }
            _ if fs::read(&dest).map(|b| b == bytes).unwrap_or(false) => sum.skipped += 1,
            "notes" if !is_trash(&rel) => {
                let stem = rel.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
                let ext = rel.extension().map(|s| s.to_string_lossy().into_owned()).unwrap_or("md".into());
                let dir = dest.parent().unwrap_or(root).to_path_buf();
                put(&imported_name(&dir, &stem, &ext), &bytes, when)?;
                sum.renamed += 1;
            }
            "system" => {
                let stem = rel.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
                let label = match stem.as_str() {
                    "scratch" => "Untitled".to_string(),
                    "daily" => "Daily".to_string(),
                    other => other.to_string(),
                };
                let dir = root.join("notes");
                put(&imported_name(&dir, &label, "md"), &bytes, when)?;
                sum.renamed += 1;
            }
            // Projects, images, trash and theme that differ: yours win.
            _ => sum.kept += 1,
        }
        Ok(())
    })?;
    Ok(sum)
}

/// Empty a folder without removing the folder itself (the watcher holds it).
fn clear_dir(dir: &Path) -> Result<(), String> {
    if !dir.is_dir() {
        return Ok(());
    }
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let p = entry.map_err(|e| e.to_string())?.path();
        if p.is_dir() {
            fs::remove_dir_all(&p).map_err(|e| e.to_string())?;
        } else {
            fs::remove_file(&p).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn replace_with(root: &Path, zip: &mut zip::ZipArchive<File>) -> Result<ImportSummary, String> {
    // Unpack fully into staging first: a bad archive fails before anything of
    // yours is touched.
    let staging = root.join(STAGING);
    let _ = fs::remove_dir_all(&staging);
    let mut count = 0;
    let unpacked = each_entry(zip, |rel, bytes, when| {
        put(&staging.join(rel), &bytes, when)?;
        count += 1;
        Ok(())
    });
    if let Err(e) = unpacked {
        let _ = fs::remove_dir_all(&staging);
        return Err(e);
    }
    for d in DIRS {
        clear_dir(&root.join(d))?;
    }
    for f in FILES {
        let p = root.join(f);
        if p.exists() {
            fs::remove_file(&p).map_err(|e| e.to_string())?;
        }
    }
    for d in DIRS {
        let from = staging.join(d);
        if !from.is_dir() {
            continue;
        }
        let to = root.join(d);
        fs::create_dir_all(&to).map_err(|e| e.to_string())?;
        for entry in fs::read_dir(&from).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            fs::rename(entry.path(), to.join(entry.file_name())).map_err(|e| e.to_string())?;
        }
    }
    for f in FILES {
        let from = staging.join(f);
        if from.exists() {
            fs::rename(&from, root.join(f)).map_err(|e| e.to_string())?;
        }
    }
    let _ = fs::remove_dir_all(&staging);
    Ok(ImportSummary {
        added: count,
        ..Default::default()
    })
}

fn inspect(path: &Path) -> Result<BackupInfo, String> {
    let mut zip = open_backup(path)?;
    let manifest: serde_json::Value = {
        let mut s = String::new();
        io::Read::read_to_string(&mut zip.by_name(MANIFEST).map_err(|e| e.to_string())?, &mut s)
            .map_err(|e| e.to_string())?;
        serde_json::from_str(&s).unwrap_or_default()
    };
    let text = |k: &str| manifest.get(k).and_then(|v| v.as_str()).unwrap_or("").to_string();
    let mut info = BackupInfo {
        exported: text("exported"),
        version: text("version"),
        notes: 0,
        projects: 0,
        images: 0,
        tasks: 0,
        has_settings: false,
        files: 0,
    };
    each_entry(&mut zip, |rel, bytes, _| {
        info.files += 1;
        let top = rel.components().next().map(|c| c.as_os_str().to_string_lossy().into_owned());
        let md = rel.extension().is_some_and(|e| e == "md");
        if is_trash(&rel) {
            return Ok(());
        }
        match top.as_deref() {
            Some("notes") if md => info.notes += 1,
            Some("projects") if md => info.projects += 1,
            Some("assets") => info.images += 1,
            Some("todo.md") => info.tasks = crate::todo::parse(&String::from_utf8_lossy(&bytes)).len(),
            Some("settings.json") => info.has_settings = true,
            _ => {}
        }
        Ok(())
    })?;
    Ok(info)
}

fn import(root: &Path, path: &Path, replace: bool) -> Result<ImportSummary, String> {
    let mut zip = open_backup(path)?;
    let snap_dir = root.join("backups");
    fs::create_dir_all(&snap_dir).map_err(|e| e.to_string())?;
    let snap = snap_dir.join(format!("before-import-{}.zip", Local::now().format("%Y%m%d-%H%M%S")));
    write_zip(root, &snap, true).map_err(|e| format!("Couldn't save a snapshot first, nothing was imported: {e}"))?;
    let mut sum = if replace {
        replace_with(root, &mut zip)?
    } else {
        merge_into(root, &mut zip)?
    };
    sum.snapshot = snap.display().to_string();
    Ok(sum)
}

/// What's inside a backup, for the confirm step.
#[tauri::command]
pub async fn inspect_backup(path: String) -> Result<BackupInfo, String> {
    tauri::async_runtime::spawn_blocking(move || inspect(Path::new(&path)))
        .await
        .map_err(|e| e.to_string())?
}

/// Bring a backup in. `mode` is "merge" or "replace".
#[tauri::command]
pub async fn import_backup(app: AppHandle, path: String, mode: String) -> Result<ImportSummary, String> {
    let root = data_dir(&app)?;
    let replace = match mode.as_str() {
        "merge" => false,
        "replace" => true,
        _ => return Err("Unknown import mode".into()),
    };
    tauri::async_runtime::spawn_blocking(move || import(&root, Path::new(&path), replace))
        .await
        .map_err(|e| e.to_string())?
}

/// Show an exported backup in the OS file manager.
#[tauri::command]
pub fn reveal_file(path: String) -> Result<(), String> {
    let p = PathBuf::from(path);
    if !p.is_file() {
        return Err("File does not exist".into());
    }
    reveal_path(&p)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Read;

    fn scratch_dir(tag: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("dotmd-backup-{tag}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    fn seed(root: &Path) {
        for d in ["notes/.trash", "system", "projects", "assets"] {
            fs::create_dir_all(root.join(d)).unwrap();
        }
        fs::write(root.join("notes/a.md"), "# A").unwrap();
        fs::write(root.join("notes/b.md.tmp"), "half").unwrap();
        fs::write(root.join("notes/.trash/1__old.md"), "old").unwrap();
        fs::write(root.join("system/scratch.md"), "jot").unwrap();
        fs::write(root.join("assets/x.png"), [1u8, 2, 3]).unwrap();
        fs::write(root.join("todo.md"), "- [ ] t").unwrap();
        fs::write(root.join(".window-state.json"), "{}").unwrap();
    }

    #[test]
    fn picks_data_files_only() {
        let root = scratch_dir("pick");
        seed(&root);
        let names: Vec<String> = backup_files(&root, false).unwrap().iter().map(|p| entry_name(p)).collect();
        assert_eq!(names, ["notes/a.md", "system/scratch.md", "assets/x.png", "todo.md"]);
        let with_trash: Vec<String> = backup_files(&root, true).unwrap().iter().map(|p| entry_name(p)).collect();
        assert!(with_trash.contains(&"notes/.trash/1__old.md".to_string()));
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn zip_round_trips() {
        let root = scratch_dir("zip");
        seed(&root);
        let dest = root.join("out.zip");
        let sum = write_zip(&root, &dest, false).unwrap();
        assert_eq!(sum.files, 4);
        assert!(!root.join("out.zip.tmp").exists());
        let mut zip = zip::ZipArchive::new(File::open(&dest).unwrap()).unwrap();
        let mut s = String::new();
        zip.by_name("notes/a.md").unwrap().read_to_string(&mut s).unwrap();
        assert_eq!(s, "# A");
        assert!(zip.by_name(MANIFEST).is_ok());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn only_data_paths_allowed() {
        assert!(allowed(Path::new("notes/a.md")));
        assert!(allowed(Path::new("todo.md")));
        assert!(allowed(Path::new("assets/.trash/1__x.png")));
        assert!(!allowed(Path::new("../evil.md")));
        assert!(!allowed(Path::new("notes/../../evil.md")));
        assert!(!allowed(Path::new("random.txt")));
        assert!(!allowed(Path::new("todo.md/x")));
        assert!(!allowed(Path::new("notes/a.md.tmp")));
        assert!(!allowed(Path::new("backups/x.zip")));
    }

    #[test]
    fn merge_never_overwrites() {
        let src = scratch_dir("msrc");
        seed(&src);
        let zip_path = src.join("b.zip");
        write_zip(&src, &zip_path, false).unwrap();

        let dst = scratch_dir("mdst");
        fs::create_dir_all(dst.join("notes")).unwrap();
        fs::create_dir_all(dst.join("system")).unwrap();
        fs::write(dst.join("notes/a.md"), "# mine").unwrap();
        fs::write(dst.join("system/scratch.md"), "jot").unwrap();
        fs::write(dst.join("todo.md"), "- [ ] mine\n").unwrap();

        let sum = import(&dst, &zip_path, false).unwrap();
        assert_eq!(fs::read_to_string(dst.join("notes/a.md")).unwrap(), "# mine");
        assert_eq!(fs::read_to_string(dst.join("notes/a (imported).md")).unwrap(), "# A");
        assert!(dst.join("assets/x.png").exists());
        assert_eq!(sum.renamed, 1);
        assert_eq!(sum.skipped, 1); // identical scratch
        assert_eq!(sum.tasks_added, 1);
        let todo = fs::read_to_string(dst.join("todo.md")).unwrap();
        assert!(todo.contains("mine") && todo.contains("- [ ] t"));
        assert!(Path::new(&sum.snapshot).exists());
        let _ = fs::remove_dir_all(&src);
        let _ = fs::remove_dir_all(&dst);
    }

    #[test]
    fn replace_swaps_data() {
        let src = scratch_dir("rsrc");
        seed(&src);
        let zip_path = src.join("b.zip");
        write_zip(&src, &zip_path, false).unwrap();

        let dst = scratch_dir("rdst");
        fs::create_dir_all(dst.join("notes")).unwrap();
        fs::write(dst.join("notes/only-mine.md"), "x").unwrap();
        import(&dst, &zip_path, true).unwrap();
        assert!(!dst.join("notes/only-mine.md").exists());
        assert_eq!(fs::read_to_string(dst.join("notes/a.md")).unwrap(), "# A");
        assert!(!dst.join(STAGING).exists());
        let _ = fs::remove_dir_all(&src);
        let _ = fs::remove_dir_all(&dst);
    }
}
