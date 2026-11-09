import { invoke } from "@tauri-apps/api/core";

export const SCRATCH = "scratch";

export type NoteMeta = {
  name: string;
  title: string;
  modified: number;
  /** First body line after the title ("" if none). */
  preview: string;
};

export type SearchHit = {
  name: string;
  title: string;
  line: number;
  snippet: string;
};

export type TagCount = {
  tag: string;
  notes: string[];
};

export type Todo = {
  text: string;
  done: boolean;
  created: string; // ISO timestamp (when added)
  deadline: string; // YYYY-MM-DD, optional; used for ordering
  subject: string; // optional grouping label
  description: string; // optional note (hidden in list, shown on board)
};

export type Settings = {
  autosave_ms: number;
  global_shortcut: string;
  hide_on_blur: boolean;
  last_note: string;
  close_to_tray: boolean;
  styled_default: boolean;
  keybindings: Record<string, string>;
  subject_colors: Record<string, string>; // subject -> swatch name (subjects.ts)
  focus_mode: boolean; // fade paragraphs other than the current one
  typewriter: boolean; // keep the typing line vertically centred
  open_tabs: string[]; // editor tabs, in order (restored on launch)
  view_only_notes: string[]; // notes locked in Viewing (read-only) mode
  zoom: number; // page zoom, 1 = 100%
};

// Notes ------------------------------------------------------------------
export const listNotes = () => invoke<NoteMeta[]>("list_notes");
export const readNote = (name: string) => invoke<string>("read_note", { name });
export const noteModified = (name: string) => invoke<number>("note_modified", { name });
export const saveNote = (name: string, content: string) =>
  invoke<void>("save_note", { name, content });
export const createNote = (name: string) => invoke<void>("create_note", { name });
export const deleteNote = (name: string) => invoke<string>("delete_note", { name });
export const duplicateNote = (name: string) => invoke<string>("duplicate_note", { name });
export const revealNote = (name: string) => invoke<void>("reveal_note", { name });

/** A finished backup: where it went, how many files, total bytes before zipping. */
export type BackupSummary = { path: string; files: number; bytes: number };
/** Zip every note, project, task, image and config file into `path`. */
export const exportBackup = (path: string, includeTrash: boolean) =>
  invoke<BackupSummary>("export_backup", { path, includeTrash });
// Terminal ---------------------------------------------------------------------
export type TermSpawned = { id: number; cwd: string; shell: string };
/** Start a shell on a PTY; output arrives as `term-data` {id, data}, the end as `term-exit` {id, code}. */
export const termSpawn = (cols: number, rows: number, cwd?: string) =>
  invoke<TermSpawned>("term_spawn", { cols, rows, cwd: cwd || null });
export const termWrite = (id: number, data: string, binary = false) =>
  invoke<void>("term_write", { id, data, binary });
export const termResize = (id: number, cols: number, rows: number) =>
  invoke<void>("term_resize", { id, cols, rows });
export const termKill = (id: number) => invoke<void>("term_kill", { id });

/** What's inside a backup zip (for the confirm step). */
export type BackupInfo = {
  exported: string; // RFC 3339
  version: string;
  notes: number;
  projects: number;
  images: number;
  tasks: number;
  has_settings: boolean;
  files: number;
};
export type ImportSummary = {
  added: number;
  skipped: number;
  renamed: number;
  kept: number;
  tasks_added: number;
  snapshot: string; // zip of your data from just before the import
};
export const inspectBackup = (path: string) => invoke<BackupInfo>("inspect_backup", { path });
export const importBackup = (path: string, mode: "merge" | "replace") =>
  invoke<ImportSummary>("import_backup", { path, mode });
/** Show a file (e.g. an exported backup) in the OS file manager. */
export const revealFile = (path: string) => invoke<void>("reveal_file", { path });
export const renameNote = (from: string, to: string) =>
  invoke<void>("rename_note", { from, to });
export const searchNotes = (query: string) =>
  invoke<SearchHit[]>("search_notes", { query });
export const fileText = (content: string) => invoke<string>("file_text", { content });
export const scanTags = () => invoke<TagCount[]>("scan_tags");
/** Notes linking to `name` via [[name]], one hit per linking line. */
export const backlinks = (name: string) => invoke<SearchHit[]>("backlinks", { name });
export const listTrash = () => invoke<NoteMeta[]>("list_trash");
export const restoreNote = (name: string) => invoke<string>("restore_note", { name });

// Images -----------------------------------------------------------------
export const assetsPath = () => invoke<string>("assets_path");
/** Save pasted bytes into assets/; returns the `../assets/<file>` link path. */
export const saveImage = (bytes: Uint8Array, ext: string) =>
  invoke<string>("save_image", bytes, { headers: { ext } });
export const importImage = (path: string) => invoke<string>("import_image", { path });
export const unusedImages = () => invoke<number>("unused_images");
export const cleanUnusedImages = () => invoke<number>("clean_unused_images");

// Storage organizer --------------------------------------------------------
export type NoteInfo = {
  name: string;
  title: string;
  bytes: number;
  words: number;
  images: number;
  modified: number;
  protected: boolean;
};
export type ImageInfo = {
  file: string;
  bytes: number;
  modified: number;
  used_by: string[]; // live notes linking it
  used_in_trash: number; // deleted notes linking it
  used_by_projects: string[]; // projects using it as their logo
};
/** A live project's footprint: its file + logo + linked notes. */
export type ProjectInfo = { name: string; bytes: number; modified: number };
export type TrashItem = {
  kind: "note" | "image" | "project" | "task";
  id: string; // restore id: note stem / image file / project folder / "<stamp>#<n>" task
  title: string;
  detail: string; // project: "3 tasks"; task: its subject
  bytes: number;
  modified: number;
};
export type StorageReport = { notes: NoteInfo[]; images: ImageInfo[]; projects: ProjectInfo[]; trash: TrashItem[] };
export type NoteText = { name: string; content: string };

export const storageReport = () => invoke<StorageReport>("storage_report");
/** Move images into assets/.trash; returns their trash names (for undo). */
export const trashImages = (files: string[]) => invoke<string[]>("trash_images", { files });
export const restoreImage = (id: string) => invoke<string>("restore_image", { id });
/** Permanently delete trashed items; returns bytes freed. */
export const deleteForever = (items: { kind: string; id: string }[]) =>
  invoke<number>("delete_forever", { items });
export const emptyTrash = () => invoke<number>("empty_trash");
/** Strip #tag from every note; returns each changed note's previous text. */
export const removeTag = (tag: string) => invoke<NoteText[]>("remove_tag", { tag });

// Projects ---------------------------------------------------------------
/** A to-do subject promoted with a page (projects/<slug>.md). Its tasks are
 *  the to-dos whose subject equals `name`; progress is computed, not stored. */
export type Project = {
  name: string;
  logo: string; // ../assets/<file>, or ""
  created: string; // YYYY-MM-DD
  goal: string;
  description: string;
  notes: string[]; // note names (phase 2)
  modified: number; // file mtime, unix secs (read-only)
};
export const listProjects = () => invoke<Project[]>("list_projects");
export const createProject = (name: string) => invoke<Project>("create_project", { name });
export const updateProject = (project: Project) => invoke<void>("update_project", { project });
/** Returns the trash stem of a merged-away project file ("" if none). */
export const renameProject = (from: string, to: string) =>
  invoke<string>("rename_project", { from, to });
/** Trash a project (trash/projects/<folder>/) with its tasks and colour; returns the folder. */
export const deleteProject = (name: string, tasks: Todo[] = [], colour = "") =>
  invoke<string>("delete_project", { name, tasks, colour });
/** Restore a trashed project; hands back the tasks + colour that were deleted with it. */
export const restoreProject = (stem: string) =>
  invoke<{ tasks: Todo[]; colour: string }>("restore_project", { stem });
/** Keep deleted tasks in trash/tasks.md; returns the group stamp (for Undo). */
export const trashTasks = (tasks: Todo[]) => invoke<string>("trash_tasks", { tasks });
export const untrashTasks = (stamp: string) => invoke<void>("untrash_tasks", { stamp });
/** Take tasks out of the trash ("<stamp>#<n>" ids); the caller appends them. */
export const restoreTasks = (ids: string[]) => invoke<Todo[]>("restore_tasks", { ids });
/** notes/<project>/ (created if needed), the folder its linked notes live in. */
export const projectFolder = (name: string) => invoke<string>("project_folder", { name });
export const openProjectFolder = (name: string) => invoke<void>("open_project_folder", { name });
/** Re-match project folders and front matter; true if anything moved or was linked. */
export const syncProjectFolders = () => invoke<boolean>("sync_project_folders");

// To-dos -----------------------------------------------------------------
export const loadTodos = () => invoke<Todo[]>("load_todos");
export const saveTodos = (todos: Todo[]) => invoke<void>("save_todos", { todos });

// Config -----------------------------------------------------------------
export const loadSettings = () => invoke<Settings>("load_settings");
export const saveSettings = (settings: Settings) =>
  invoke<void>("save_settings", { settings });
export const loadTheme = () => invoke<string>("load_theme");
export const saveTheme = (css: string) => invoke<void>("save_theme", { css });
