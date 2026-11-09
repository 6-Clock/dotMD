import { create } from "zustand";
import * as api from "./api";
import { SCRATCH } from "./api";
import { nextSwatch } from "./subjects";

type Overlay = "none" | "switcher" | "search";
export type ViewId = "files" | "todo" | "board" | "calendar" | "projects" | "search" | "storage" | "terminal" | "settings";

/** Views that take the whole main area (no side panel, editor hidden). */
export const isFullView = (v: ViewId | null) =>
  v === "board" || v === "calendar" || v === "projects" || v === "storage" || v === "terminal";

// Activity-bar order for Ctrl+T keyboard navigation.
const TOOLBAR_ORDER = ["files", "todo", "board", "calendar", "projects", "search", "storage", "terminal", "settings"] as const;

export type TodoFields = { subject?: string; deadline?: string; description?: string };

/** "preview" reuses the italic preview tab (VS Code); "pin" opens a kept tab. */
export type OpenMode = "preview" | "pin";

/** Docs-style document mode: Editing (styled), Markdown (raw), Viewing (read-only). */
export type DocMode = "editing" | "markdown" | "viewing";

/** Page zoom steps (Google Docs-like). */
/** A task's identity that survives reloads (its index doesn't). */
export const todoKey = (t: api.Todo) => `${t.created}${t.subject}${t.text}`;
/** Where `t` is in `todos` now: the same object, else the same key; -1 if gone. */
export function todoIndex(todos: api.Todo[], t: api.Todo): number {
  const same = todos.indexOf(t);
  if (same >= 0) return same;
  const k = todoKey(t);
  return todos.findIndex((x) => todoKey(x) === k);
}

export const ZOOM_STEPS = [0.5, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 2];

type FiledToast = { name: string; prevContent: string };
type DeletedToast = { titles: string[]; stems: string[] };

type AppState = {
  currentNote: string;
  content: string;
  lastSaved: string; // dirty = content !== lastSaved
  notes: api.NoteMeta[];
  tags: api.TagCount[]; // #tags across all notes, busiest first
  activeTag: string | null; // Files panel filter
  trash: api.NoteMeta[]; // deleted notes, newest first
  todos: api.Todo[];
  projects: api.Project[]; // projects/*.md, by name
  activeProject: string | null; // Projects view: open project page (null = index)
  activeView: ViewId | null; // null = sidebar collapsed
  lastView: ViewId; // remembered view for toggle-sidebar
  toolbarNav: boolean; // activity-bar keyboard nav mode (Ctrl+T)
  toolbarIndex: number; // highlighted item while navigating the toolbar
  toolbarNavSeq: number; // bumps on every Ctrl+T, so the entry animation replays each time
  rendered: boolean; // styled (markers concealed) vs raw Markdown
  settings: api.Settings | null;
  overlay: Overlay;
  filed: FiledToast | null;
  deleted: DeletedToast | null; // undo-delete toast
  deletedSubject: DeletedSubject | null; // undo toast for Board → Delete subject
  undo: UndoToast | null; // generic undo toast (Storage view actions)
  recording: string | null; // keybind capture in progress (settings UI)
  editingTodo: number | null; // index of todo open in the editor modal
  lightbox: { src: string; alt: string } | null; // enlarged editor image
  taskMenu: { x: number; y: number; todo: api.Todo } | null; // right-click menu on a task card
  trashSeq: number; // bumped when trash/ changes on disk (Storage reloads on it)
  tabs: string[]; // open editor tabs (note names), in order
  previewTab: string | null; // the one tab the next preview open replaces

  init: () => Promise<void>;
  setContent: (c: string) => void;
  isDirty: () => boolean;
  save: () => Promise<void>;
  refreshNotes: () => Promise<void>;
  refreshTrash: () => Promise<void>;
  syncExternalNotes: () => Promise<void>;
  reloadTodos: () => Promise<void>;
  setActiveTag: (tag: string | null) => void;
  openNote: (name: string, mode?: OpenMode) => Promise<void>;
  closeTab: (name: string) => Promise<void>;
  cycleTab: (delta: number) => void;
  moveTab: (name: string, to: number) => void;
  pinTab: (name: string) => void;
  createNote: () => Promise<boolean>;
  newNote: (name: string) => Promise<void>;
  removeNote: (name: string) => Promise<void>;
  removeNotes: (names: string[]) => Promise<void>;
  duplicateNote: (name: string) => Promise<void>;
  revealNote: (name: string) => void;
  restoreNote: (trashName: string) => Promise<void>;
  /** Resolves to an error message, or null on success. */
  renameNote: (from: string, to: string) => Promise<string | null>;
  fileAndClear: () => Promise<void>;
  undoFile: () => Promise<void>;
  undoDelete: () => Promise<void>;
  dismissToast: () => void;
  dismissDeleted: () => void;

  setView: (v: ViewId) => void;
  enterToolbarNav: () => void;
  exitToolbarNav: () => void;
  cycleToolbar: (delta: number) => void;
  toggleSidebar: () => void;
  toggleRendered: () => void;
  /** The current note's mode (Viewing is per note, the rest app-wide). */
  docMode: () => DocMode;
  setDocMode: (m: DocMode) => void;
  toggleViewOnly: () => void;
  /** +1 / -1 steps through ZOOM_STEPS; 0 resets to 100%. */
  zoomBy: (dir: 1 | -1 | 0) => void;
  setOverlay: (o: Overlay) => void;

  updateSettings: (patch: Partial<api.Settings>) => void;
  setKeybind: (actionId: string, combo: string) => void;
  resetKeybind: (actionId: string) => void;
  setRecording: (r: string | null) => void;

  addTodo: (text: string, fields?: TodoFields) => void;
  toggleTodoAt: (i: number) => void;
  deleteTodoAt: (i: number) => void;
  /** Delete several tasks; one undo toast puts them all back in place. */
  deleteTodosAt: (is: number[]) => void;
  /** Append tasks coming back from the trash (and give a project its colour back). */
  restoreTrashedTasks: (todos: api.Todo[], colour?: { subject: string; swatch: string }) => void;
  setDoneAt: (is: number[], done: boolean) => void;
  updateTodoAt: (i: number, patch: Partial<api.Todo>) => void;
  setEditingTodo: (i: number | null) => void;
  setLightbox: (l: { src: string; alt: string } | null) => void;
  setTaskMenu: (m: { x: number; y: number; index: number } | null) => void;
  ensureSubjectColors: () => void;
  setSubjectColor: (subject: string, swatch: string) => void;
  renameSubject: (from: string, to: string) => void;
  deleteSubject: (subject: string) => void;
  undoDeleteSubject: () => void;
  dismissDeletedSubject: () => void;
  showUndo: (message: string, run: () => void | Promise<void>) => void;
  runUndo: () => Promise<void>;
  dismissUndo: () => void;
  unassignSubject: (subject: string) => void;
  removeTag: (tag: string) => Promise<number>;

  refreshProjects: () => Promise<void>;
  /** Open a project's page in the Projects view (null = the index). */
  openProject: (name: string | null) => void;
  /** Create (or just open, if it exists) a project for this subject name. */
  createProject: (name: string) => Promise<void>;
  updateProject: (project: api.Project) => void;
  deleteProject: (name: string) => Promise<void>;
  /** Add / remove a note from a project's `notes:` list (no-op if already so). */
  linkNote: (project: string, note: string) => void;
  unlinkNote: (project: string, note: string) => void;
  /** Create a new note, link it to the project and open it. */
  newProjectNote: (project: string, name: string) => Promise<string | null>;
};

/** A one-off undo toast: the message and how to put things back. */
type UndoToast = { message: string; run: () => void | Promise<void> };

/** What Board → Delete subject removed, so Undo can put it back exactly. */
type DeletedSubject = {
  subject: string;
  removed: { index: number; todo: api.Todo }[]; // original positions, ascending
  swatch?: string;
  projectStem?: string; // the subject's project file, trashed with it
  tasksStamp?: Promise<string>; // trash/tasks.md group (non-project subjects)
};

/** Pull every task of `subject` out of `todos`, remembering where each sat. */
function splitOut(todos: api.Todo[], subject: string) {
  const removed: DeletedSubject["removed"] = [];
  const kept = todos.filter((todo, index) => {
    if (todo.subject !== subject) return true;
    removed.push({ index, todo });
    return false;
  });
  return { kept, removed };
}

/** Put removed tasks back at their old positions (ascending index order). */
function putBack(todos: api.Todo[], removed: DeletedSubject["removed"]) {
  const out = [...todos];
  for (const { index, todo } of removed) out.splice(Math.min(index, out.length), 0, todo);
  return out;
}

async function persistTodos(todos: api.Todo[]) {
  try {
    await api.saveTodos(todos);
  } catch (e) {
    console.error("save todos failed", e);
  }
}

export const useStore = create<AppState>((set, get) => ({
  currentNote: SCRATCH,
  content: "",
  lastSaved: "",
  notes: [],
  tags: [],
  activeTag: null,
  trash: [],
  todos: [],
  projects: [],
  activeProject: null,
  activeView: null,
  lastView: "files",
  toolbarNav: false,
  toolbarIndex: 0,
  toolbarNavSeq: 0,
  rendered: true,
  settings: null,
  overlay: "none",
  filed: null,
  deleted: null,
  deletedSubject: null,
  undo: null,
  recording: null,
  editingTodo: null,
  lightbox: null,
  taskMenu: null,
  trashSeq: 0,
  tabs: [SCRATCH],
  previewTab: null,

  init: async () => {
    const settings = await api.loadSettings().catch(() => null);
    // "" = every tab was closed: start on the empty background. A first run
    // (Rust defaults last_note to scratch) lands in Untitled.
    const saved = settings ? settings.open_tabs : [SCRATCH];
    const start = settings ? settings.last_note || saved[0] || "" : SCRATCH;
    const [content, todos] = await Promise.all([
      start ? api.readNote(start).catch(() => "") : "",
      api.loadTodos().catch(() => []),
    ]);
    set({
      settings,
      currentNote: start,
      content,
      lastSaved: content,
      todos,
      rendered: settings?.styled_default ?? true,
      tabs: !start || saved.includes(start) ? saved : [...saved, start],
    });
    await get().refreshProjects();
    get().ensureSubjectColors();
    await get().refreshNotes();
    get().refreshTrash();
    // Drop restored tabs whose notes vanished while dotMD was closed; a name
    // that only differs in case (the old "daily" page is now the note
    // "Daily") follows the note.
    const known = new Set(get().notes.map((n) => n.name));
    const byLower = new Map(get().notes.map((n) => [n.name.toLowerCase(), n.name]));
    const fix = (t: string) =>
      t === SCRATCH || known.has(t) ? t : (byLower.get(t.toLowerCase()) ?? "");
    const tabs = [...new Set(get().tabs.map(fix).filter(Boolean))];
    const cur = get().currentNote;
    if (cur && fix(cur) !== cur) {
      const next = fix(cur) || tabs[0];
      if (next) await loadNote(next);
      else closeEditor();
    }
    setTabs(tabs);
  },

  // A real edit keeps the preview tab (VS Code: typing pins it).
  setContent: (c) =>
    set((s) =>
      !s.currentNote
        ? {} // no note open: nothing to edit
        : c !== s.content && s.previewTab === s.currentNote
        ? { content: c, previewTab: null }
        : { content: c },
    ),

  isDirty: () => get().content !== get().lastSaved,

  save: async () => {
    const { currentNote, content, lastSaved } = get();
    if (!currentNote || content === lastSaved) return;
    await api.saveNote(currentNote, content);
    set({ lastSaved: content });
    get().refreshNotes();
  },

  refreshNotes: async () => {
    const [notes, tags] = await Promise.all([
      api.listNotes().catch(() => []),
      api.scanTags().catch(() => []),
    ]);
    set({ notes, tags });
  },

  refreshTrash: async () => {
    const trash = await api.listTrash().catch(() => []);
    set({ trash });
  },

  // An external file change (from the Rust watcher): refresh the lists and sync
  // the open editor, VS Code-style — reload the open note if it changed on disk
  // and the buffer is clean, fall back to scratch if it was deleted, and never
  // clobber unsaved edits.
  syncExternalNotes: async () => {
    // A note dropped into a project folder (e.g. by Claude Code) joins it.
    if (await api.syncProjectFolders().catch(() => false)) await get().refreshProjects();
    await get().refreshNotes();
    await get().refreshTrash();
    const { currentNote, content, lastSaved, notes } = get();
    // Close tabs (other than the open one) whose notes were deleted on disk.
    const known = new Set(notes.map((n) => n.name));
    const live = (t: string) => t === SCRATCH || t === currentNote || known.has(t);
    if (!get().tabs.every(live)) setTabs(get().tabs.filter(live));
    if (!currentNote || content !== lastSaved) return; // unsaved edits win — leave the buffer alone
    // scratch lives in system/ (not the notes list) but always exists.
    const exists = currentNote === SCRATCH || notes.some((n) => n.name === currentNote);
    if (!exists) {
      await get().closeTab(currentNote); // open note deleted on disk & clean
      return;
    }
    const disk = await api.readNote(currentNote).catch(() => null);
    if (disk !== null && disk !== content) {
      set({ content: disk, lastSaved: disk });
    }
  },

  // External todo.md change: reload, unless a to-do edit modal is open.
  reloadTodos: async () => {
    if (get().editingTodo !== null) return;
    const todos = await api.loadTodos().catch(() => null);
    if (todos) set({ todos });
    get().ensureSubjectColors();
  },

  setActiveTag: (tag) => set((s) => ({ activeTag: s.activeTag === tag ? null : tag })),

  // Open a note in a tab. Already open → switch to it. Otherwise "preview"
  // replaces the current preview tab (or adds one next to the active tab) and
  // "pin" adds a kept tab. Scratch always opens pinned.
  openNote: async (name, mode = "preview") => {
    if (name === SCRATCH) mode = "pin";
    const { tabs, previewTab, currentNote } = get();
    let next = tabs;
    let preview = previewTab;
    if (tabs.includes(name)) {
      if (mode === "pin" && previewTab === name) preview = null;
    } else if (mode === "preview" && previewTab && tabs.includes(previewTab)) {
      next = tabs.map((t) => (t === previewTab ? name : t));
      preview = name;
    } else {
      const at = tabs.indexOf(currentNote) + 1 || tabs.length;
      next = [...tabs.slice(0, at), name, ...tabs.slice(at)];
      preview = mode === "preview" ? name : null;
    }
    await loadNote(name);
    set({ previewTab: preview });
    setTabs(next);
  },

  closeTab: async (name) => {
    const { tabs, currentNote, previewTab } = get();
    const i = tabs.indexOf(name);
    if (i < 0) return;
    const rest = tabs.filter((t) => t !== name);
    if (previewTab === name) set({ previewTab: null });
    if (name === currentNote) {
      await get().save();
      // Neighbour to the left, else the right; the last tab leaves the empty
      // background (EmptyEditor), VS Code style.
      const target = rest[Math.max(0, i - 1)];
      if (target) await loadNote(target);
      else closeEditor();
    }
    setTabs(rest);
  },

  cycleTab: (delta) => {
    const { tabs, currentNote } = get();
    if (tabs.length < 2) return;
    const i = tabs.indexOf(currentNote);
    get().openNote(tabs[(i + delta + tabs.length) % tabs.length]); // switching never pins
  },

  moveTab: (name, to) => {
    const rest = get().tabs.filter((t) => t !== name);
    rest.splice(Math.max(0, Math.min(to, rest.length)), 0, name);
    setTabs(rest);
  },

  pinTab: (name) => {
    if (get().previewTab === name) set({ previewTab: null });
  },

  // Ctrl+N: a fresh note named "New note" (then "New note 2", …).
  createNote: async () => {
    const taken = new Set(get().notes.map((n) => n.name.toLowerCase()));
    let name = "New note";
    for (let n = 2; taken.has(name.toLowerCase()); n++) name = `New note ${n}`;
    return get()
      .newNote(name)
      .then(() => true)
      .catch((e) => {
        console.error(e);
        return false;
      });
  },

  newNote: async (name) => {
    await api.createNote(name);
    await get().refreshNotes();
    await get().openNote(name, "pin");
  },

  removeNote: async (name) => {
    await get().removeNotes([name]);
  },

  // Batch delete: move each note to trash, remembering the exact trash stems so
  // undo restores precisely these (not whatever happens to be newest in trash).
  removeNotes: async (names) => {
    const titles: string[] = [];
    const stems: string[] = [];
    let hitCurrent = false;
    for (const name of names) {
      if (name === SCRATCH) continue;
      const stem = await api.deleteNote(name).catch((e) => {
        console.error(e);
        return "";
      });
      if (stem) {
        titles.push(name);
        stems.push(stem);
      }
      if (get().currentNote === name) hitCurrent = true;
    }
    const gone = new Set(titles);
    const locked = get().settings?.view_only_notes ?? [];
    if (locked.some((n) => gone.has(n))) {
      get().updateSettings({ view_only_notes: locked.filter((n) => !gone.has(n)) });
    }
    if (hitCurrent) {
      set({ lastSaved: get().content }); // don't let closeTab's save recreate it
      await get().closeTab(get().currentNote);
    }
    setTabs(get().tabs.filter((t) => !gone.has(t)));
    await get().refreshNotes();
    await get().refreshTrash();
    if (stems.length) set({ deleted: { titles, stems } });
  },

  duplicateNote: async (name) => {
    const newName = await api.duplicateNote(name).catch((e) => {
      console.error(e);
      return null;
    });
    await get().refreshNotes();
    if (newName) await get().openNote(newName, "pin");
  },

  revealNote: (name) => {
    api.revealNote(name).catch((e) => console.error(e));
  },

  // Restore a trashed note by its trash-file stem.
  restoreNote: async (trashName) => {
    await api.restoreNote(trashName).catch((e) => console.error(e));
    await get().refreshNotes();
    await get().refreshTrash();
  },

  // Undo the last delete: restore exactly the notes that were just trashed.
  undoDelete: async () => {
    const { deleted } = get();
    set({ deleted: null });
    if (!deleted) return;
    for (const stem of deleted.stems) {
      await api.restoreNote(stem).catch((e) => console.error(e));
    }
    await get().refreshNotes();
    await get().refreshTrash();
  },

  renameNote: async (from, to) => {
    // Flush first: a dirty `from` would be recreated by the next save, and the
    // rename rewrites [[links]] on disk, which must not race unsaved edits.
    await get().save();
    try {
      await api.renameNote(from, to);
    } catch (e) {
      console.error(e);
      return String(e);
    }
    const { tabs, previewTab, currentNote, settings } = get();
    setTabs(tabs.map((t) => (t === from ? to : t)));
    if (settings?.view_only_notes?.includes(from)) {
      get().updateSettings({ view_only_notes: settings.view_only_notes.map((n) => (n === from ? to : n)) });
    }
    if (previewTab === from) set({ previewTab: to });
    if (currentNote === from) await loadNote(to);
    else {
      // The open note may have had its [[from]] links rewritten.
      const disk = await api.readNote(currentNote).catch(() => null);
      if (disk !== null && get().content === get().lastSaved) set({ content: disk, lastSaved: disk });
    }
    await get().refreshNotes();
    await get().refreshProjects(); // [[from]] in project files was rewritten too
    return null;
  },

  // "File & clear": stash the current buffer as its own note and empty the
  // current one. Keeps the scratch note from becoming an infinite junk drawer.
  fileAndClear: async () => {
    const { content, currentNote } = get();
    if (!currentNote || !content.trim()) return;
    const name = await api.fileText(content);
    set({ content: "", filed: { name, prevContent: content } });
    await api.saveNote(currentNote, "");
    set({ lastSaved: "" });
    await get().refreshNotes();
  },

  undoFile: async () => {
    const { filed, currentNote } = get();
    if (!filed || !currentNote) return;
    await api.deleteNote(filed.name).catch(() => {});
    set({ content: filed.prevContent, filed: null });
    await api.saveNote(currentNote, filed.prevContent);
    set({ lastSaved: filed.prevContent });
    await get().refreshNotes();
  },

  dismissToast: () => set({ filed: null }),
  dismissDeleted: () => set({ deleted: null }),

  // Click a view: open it, or collapse if it's already the active one.
  setView: (v) =>
    set((s) => (s.activeView === v ? { activeView: null } : { activeView: v, lastView: v })),

  // Ctrl+T: enter activity-bar keyboard nav, highlighting the current view.
  enterToolbarNav: () => {
    const { activeView } = get();
    const idx = activeView
      ? Math.max(0, (TOOLBAR_ORDER as readonly string[]).indexOf(activeView))
      : 0;
    set({ toolbarNav: true, toolbarIndex: idx, toolbarNavSeq: get().toolbarNavSeq + 1 });
  },
  exitToolbarNav: () => set({ toolbarNav: false }),
  // Shift+↑/↓: move through the toolbar (wrapping) and switch to that view.
  cycleToolbar: (delta) => {
    const n = TOOLBAR_ORDER.length;
    const i = (get().toolbarIndex + delta + n) % n;
    set({ toolbarIndex: i });
    const key = TOOLBAR_ORDER[i];
    set({ activeView: key as ViewId, lastView: key as ViewId });
  },

  toggleSidebar: () =>
    set((s) => ({ activeView: s.activeView ? null : s.lastView })),
  toggleRendered: () => set((s) => ({ rendered: !s.rendered })),

  docMode: () => {
    const { settings, currentNote, rendered } = get();
    if (settings?.view_only_notes?.includes(currentNote)) return "viewing";
    return rendered ? "editing" : "markdown";
  },

  setDocMode: (m) => {
    const { settings, currentNote } = get();
    if (!currentNote) {
      if (m !== "viewing") set({ rendered: m === "editing" }); // Viewing needs a note
      return;
    }
    const locked = settings?.view_only_notes ?? [];
    if (m === "viewing") {
      if (!locked.includes(currentNote)) {
        get().save();
        get().updateSettings({ view_only_notes: [...locked, currentNote] });
      }
      return;
    }
    if (locked.includes(currentNote)) {
      get().updateSettings({ view_only_notes: locked.filter((n) => n !== currentNote) });
    }
    set({ rendered: m === "editing" });
  },

  toggleViewOnly: () => {
    const s = get();
    s.setDocMode(s.docMode() === "viewing" ? (s.rendered ? "editing" : "markdown") : "viewing");
  },

  zoomBy: (dir) => {
    const cur = get().settings?.zoom ?? 1;
    let next = 1;
    if (dir === 1) next = ZOOM_STEPS.find((z) => z > cur + 0.001) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1];
    if (dir === -1) next = [...ZOOM_STEPS].reverse().find((z) => z < cur - 0.001) ?? ZOOM_STEPS[0];
    if (next !== cur) get().updateSettings({ zoom: next });
  },
  setOverlay: (o) => set({ overlay: o }),

  updateSettings: (patch) => {
    const current = get().settings;
    if (!current) return;
    const next = { ...current, ...patch };
    set({ settings: next });
    api.saveSettings(next).catch((e) => console.error("save settings failed", e));
  },

  setKeybind: (actionId, combo) => {
    const current = get().settings;
    if (!current) return;
    get().updateSettings({
      keybindings: { ...current.keybindings, [actionId]: combo },
    });
  },

  resetKeybind: (actionId) => {
    const current = get().settings;
    if (!current) return;
    const kb = { ...current.keybindings };
    delete kb[actionId];
    get().updateSettings({ keybindings: kb });
  },

  setRecording: (r) => set({ recording: r }),

  addTodo: (text, fields = {}) => {
    const t = text.trim();
    if (!t) return;
    const todos = [
      ...get().todos,
      {
        text: t,
        done: false,
        created: new Date().toISOString(),
        deadline: fields.deadline ?? "",
        subject: (fields.subject ?? "").trim(),
        description: fields.description ?? "",
      },
    ];
    set({ todos });
    persistTodos(todos);
    get().ensureSubjectColors();
  },

  toggleTodoAt: (i) => {
    const todos = get().todos.map((t, j) => (j === i ? { ...t, done: !t.done } : t));
    set({ todos });
    persistTodos(todos);
  },

  deleteTodoAt: (i) => get().deleteTodosAt([i]),

  deleteTodosAt: (is) => {
    const all = get().todos;
    const drop = new Set(is.filter((i) => i >= 0 && i < all.length));
    if (!drop.size) return;
    const gone = [...drop].sort((a, b) => a - b).map((i) => ({ i, todo: all[i] }));
    const todos = all.filter((_, j) => !drop.has(j));
    set({ todos });
    persistTodos(todos);
    // Kept in trash/tasks.md, so Storage → Trash can bring them back later.
    const stamp = api.trashTasks(gone.map((g) => g.todo)).catch(() => "");
    const msg = gone.length === 1 ? `Deleted "${gone[0].todo.text}"` : `Deleted ${gone.length} tasks`;
    // Undo puts each back where it was (ascending, so earlier inserts don't
    // shift later ones) and drops the trash copy.
    get().showUndo(msg, async () => {
      const now = [...get().todos];
      for (const { i, todo } of gone) now.splice(Math.min(i, now.length), 0, todo);
      set({ todos: now });
      persistTodos(now);
      const s = await stamp;
      if (s) api.untrashTasks(s).catch(() => {});
    });
  },

  restoreTrashedTasks: (back, colour) => {
    if (back.length) {
      const todos = [...get().todos, ...back];
      set({ todos });
      persistTodos(todos);
    }
    const s = get().settings;
    if (s && colour?.swatch && !s.subject_colors?.[colour.subject]) {
      get().updateSettings({ subject_colors: { ...(s.subject_colors ?? {}), [colour.subject]: colour.swatch } });
    }
    get().ensureSubjectColors();
  },

  setDoneAt: (is, done) => {
    const pick = new Set(is);
    const todos = get().todos.map((t, j) => (pick.has(j) ? { ...t, done } : t));
    set({ todos });
    persistTodos(todos);
  },

  updateTodoAt: (i, patch) => {
    const todos = get().todos.map((t, j) => (j === i ? { ...t, ...patch } : t));
    set({ todos });
    persistTodos(todos);
    get().ensureSubjectColors();
  },

  setEditingTodo: (i) => set({ editingTodo: i }),
  setLightbox: (l) => set({ lightbox: l }),
  // The menu remembers the task, not its index, so a reload can't retarget it.
  setTaskMenu: (m) => {
    const todo = m ? get().todos[m.index] : undefined;
    set({ taskMenu: m && todo ? { x: m.x, y: m.y, todo } : null });
  },

  // Give every subject that has no colour yet the next free iOS swatch.
  ensureSubjectColors: () => {
    const s = get().settings;
    if (!s) return;
    const map = { ...(s.subject_colors ?? {}) };
    let changed = false;
    const names = [...get().todos.map((t) => t.subject), ...get().projects.map((p) => p.name)];
    for (const name of names) {
      if (name && !map[name]) {
        map[name] = nextSwatch(map);
        changed = true;
      }
    }
    if (changed) get().updateSettings({ subject_colors: map });
  },

  setSubjectColor: (subject, swatch) => {
    const s = get().settings;
    if (!s || !subject) return;
    get().updateSettings({ subject_colors: { ...(s.subject_colors ?? {}), [subject]: swatch } });
  },

  // Rename a subject on every task. Renaming onto an existing subject merges
  // into it (its colour wins); otherwise the colour moves with the name.
  renameSubject: (from, to) => {
    const name = to.trim();
    if (!from || !name || name === from) return;
    const todos = get().todos.map((t) => (t.subject === from ? { ...t, subject: name } : t));
    set({ todos });
    persistTodos(todos);
    const s = get().settings;
    if (s) {
      const map = { ...(s.subject_colors ?? {}) };
      if (!map[name] && map[from]) map[name] = map[from];
      delete map[from];
      get().updateSettings({ subject_colors: map });
    }
    // A project follows its subject (merging into an existing one).
    if (get().projects.some((p) => p.name === from)) {
      if (get().activeProject === from) set({ activeProject: name });
      api
        .renameProject(from, name)
        .catch((e) => console.error("rename project failed", e))
        .then(() => get().refreshProjects());
    }
    get().ensureSubjectColors();
  },

  // Remove every task in a subject (and its colour); Undo restores both.
  // "" = the tasks with no subject (Storage → "No subject" row).
  deleteSubject: (subject) => {
    const { kept: todos, removed } = splitOut(get().todos, subject);
    if (!removed.length) return;
    const s = get().settings;
    const swatch = s?.subject_colors?.[subject];
    const isProject = get().projects.some((p) => p.name === subject);
    // Plain subjects: the tasks go to trash/tasks.md. A project keeps its tasks
    // in its own trash folder instead (below).
    const tasksStamp = isProject ? undefined : api.trashTasks(removed.map((r) => r.todo)).catch(() => "");
    set({ todos, deletedSubject: { subject, removed, swatch, tasksStamp }, editingTodo: null });
    persistTodos(todos);
    if (s && swatch) {
      const map = { ...(s.subject_colors ?? {}) };
      delete map[subject];
      get().updateSettings({ subject_colors: map });
    }
    // A project's subject takes its page with it (Undo brings both back).
    if (isProject) {
      if (get().activeProject === subject) set({ activeProject: null });
      api
        .deleteProject(subject, removed.map((r) => r.todo), swatch ?? "")
        .then((projectStem) => {
          const d = get().deletedSubject;
          if (d && d.subject === subject) set({ deletedSubject: { ...d, projectStem } });
        })
        .catch((e) => console.error("delete project failed", e))
        .then(() => get().refreshProjects());
    }
  },

  undoDeleteSubject: () => {
    const d = get().deletedSubject;
    set({ deletedSubject: null });
    if (!d) return;
    const todos = putBack(get().todos, d.removed);
    set({ todos });
    persistTodos(todos);
    const s = get().settings;
    if (s && d.swatch && !s.subject_colors?.[d.subject]) {
      get().updateSettings({ subject_colors: { ...(s.subject_colors ?? {}), [d.subject]: d.swatch } });
    }
    if (d.tasksStamp) {
      d.tasksStamp.then((s) => {
        if (s) api.untrashTasks(s).catch(() => {});
      });
    }
    if (d.projectStem) {
      api
        .restoreProject(d.projectStem)
        .catch((e) => console.error("restore project failed", e))
        .then(() => get().refreshProjects());
    }
    get().ensureSubjectColors();
  },

  dismissDeletedSubject: () => set({ deletedSubject: null }),

  showUndo: (message, run) => set({ undo: { message, run } }),
  runUndo: async () => {
    const u = get().undo;
    set({ undo: null });
    if (u) await u.run();
  },
  dismissUndo: () => set({ undo: null }),

  // Storage → Remove subject: tasks stay (now "No subject"), the colour goes.
  unassignSubject: (subject) => {
    if (!subject) return;
    const hit = get()
      .todos.map((t, i) => (t.subject === subject ? i : -1))
      .filter((i) => i >= 0);
    if (!hit.length) return;
    const todos = get().todos.map((t) => (t.subject === subject ? { ...t, subject: "" } : t));
    set({ todos });
    persistTodos(todos);
    const s = get().settings;
    const swatch = s?.subject_colors?.[subject];
    if (s && swatch) {
      const map = { ...(s.subject_colors ?? {}) };
      delete map[subject];
      get().updateSettings({ subject_colors: map });
    }
    get().showUndo(`Removed ${subject} from ${hit.length} ${hit.length === 1 ? "task" : "tasks"}`, () => {
      const cur = [...get().todos];
      for (const i of hit) if (cur[i] && !cur[i].subject) cur[i] = { ...cur[i], subject };
      set({ todos: cur });
      persistTodos(cur);
      const st = get().settings;
      if (st && swatch && !st.subject_colors?.[subject]) {
        get().updateSettings({ subject_colors: { ...(st.subject_colors ?? {}), [subject]: swatch } });
      }
      get().ensureSubjectColors();
    });
  },

  // Storage → Delete tag: strip #tag from every note (saving the open buffer
  // first so nothing unsaved is lost or clobbered); Undo writes the old text back.
  refreshProjects: async () => {
    const projects = await api.listProjects().catch(() => null);
    if (!projects) return;
    set({ projects });
    const open = get().activeProject;
    if (open && !projects.some((p) => p.name === open)) set({ activeProject: null });
  },

  openProject: (name) => set({ activeView: "projects", lastView: "projects", activeProject: name }),

  createProject: async (name) => {
    const n = name.trim();
    if (!n) return;
    // Snap to an existing subject's spelling so "cmpt361" joins "CMPT361".
    const known = [...get().todos.map((t) => t.subject), ...get().projects.map((p) => p.name)].find(
      (s) => s && s.toLowerCase() === n.toLowerCase(),
    );
    const p = await api.createProject(known ?? n);
    await get().refreshProjects();
    get().ensureSubjectColors();
    get().openProject(p.name);
  },

  // Optimistic: the page edits fields inline; the file write follows.
  updateProject: (project) => {
    set({ projects: get().projects.map((p) => (p.name === project.name ? project : p)) });
    api.updateProject(project).catch((e) => console.error("save project failed", e));
  },

  linkNote: (project, note) => {
    const p = get().projects.find((x) => x.name === project);
    if (!p || p.notes.includes(note)) return;
    get().updateProject({ ...p, notes: [...p.notes, note] });
  },

  unlinkNote: (project, note) => {
    const p = get().projects.find((x) => x.name === project);
    if (!p || !p.notes.includes(note)) return;
    get().updateProject({ ...p, notes: p.notes.filter((n) => n !== note) });
  },

  newProjectNote: async (project, name) => {
    const n = name.trim();
    if (!n) return null;
    try {
      await api.createNote(n);
    } catch (e) {
      return String(e);
    }
    get().linkNote(project, n);
    await get().refreshNotes();
    await get().openNote(n, "pin");
    return null;
  },

  // Delete a project and all its tasks (file → projects/.trash, colour
  // dropped); one Undo restores the file, the tasks at their old positions,
  // and the colour.
  deleteProject: async (name) => {
    const { kept, removed } = splitOut(get().todos, name);
    const st = get().settings;
    const swatch = st?.subject_colors?.[name];
    set({ todos: kept, editingTodo: null, activeProject: get().activeProject === name ? null : get().activeProject });
    if (removed.length) persistTodos(kept);
    if (st && swatch) {
      const map = { ...(st.subject_colors ?? {}) };
      delete map[name];
      get().updateSettings({ subject_colors: map });
    }
    // Its tasks + colour go into the project's trash folder, so restoring it
    // from Storage → Trash brings them back too.
    const stem = await api.deleteProject(name, removed.map((r) => r.todo), swatch ?? "").catch((e) => {
      console.error("delete project failed", e);
      return "";
    });
    await get().refreshProjects();
    const n = removed.length;
    get().showUndo(`Deleted ${name} · ${n} ${n === 1 ? "task" : "tasks"}`, async () => {
      if (stem) await api.restoreProject(stem).catch((e) => console.error("restore project failed", e));
      if (n) {
        const todos = putBack(get().todos, removed);
        set({ todos });
        persistTodos(todos);
      }
      const cur = get().settings;
      if (cur && swatch && !cur.subject_colors?.[name]) {
        get().updateSettings({ subject_colors: { ...(cur.subject_colors ?? {}), [name]: swatch } });
      }
      await get().refreshProjects();
      get().ensureSubjectColors();
    });
  },

  removeTag: async (tag) => {
    await get().save();
    const changed = await api.removeTag(tag);
    await get().syncExternalNotes();
    if (get().activeTag === tag) set({ activeTag: null });
    if (changed.length) {
      get().showUndo(`Removed #${tag} from ${changed.length} ${changed.length === 1 ? "note" : "notes"}`, async () => {
        await get().save();
        for (const n of changed) await api.saveNote(n.name, n.content);
        await get().syncExternalNotes();
      });
    }
    return changed.length;
  },
}));

// Swap the editor buffer to `name`, saving the current note first.
async function loadNote(name: string) {
  await useStore.getState().save();
  const content = await api.readNote(name).catch(() => "");
  useStore.setState({ currentNote: name, content, lastSaved: content, overlay: "none" });
  useStore.getState().updateSettings({ last_note: name });
}

// Nothing open: the editor shows the empty background. The buffer was saved
// by the caller; "" persists as last_note so a relaunch starts empty too.
function closeEditor() {
  useStore.setState({ currentNote: "", content: "", lastSaved: "", previewTab: null });
  useStore.getState().updateSettings({ last_note: "" });
}


// Replace the tab list and persist it (restored on launch).
function setTabs(tabs: string[]) {
  useStore.setState({ tabs });
  useStore.getState().updateSettings({ open_tabs: tabs });
}
