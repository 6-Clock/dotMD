import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { Trash2, X } from "lucide-react";
import { isFullView, useStore } from "./store";
import { comboFromEvent, runBinding } from "./actions";
import { TitleBar } from "./components/TitleBar";
import { ActivityBar } from "./components/ActivityBar";
import { SidePanel } from "./components/SidePanel";
import { Editor, focusEditor } from "./components/Editor";
import { StatusBar } from "./components/StatusBar";
import { NoteSwitcher } from "./components/NoteSwitcher";
import { SearchOverlay } from "./components/SearchOverlay";
import { Board } from "./components/views/Board";
import { Calendar } from "./components/views/Calendar";
import { StorageView } from "./components/views/StorageView";
import { ProjectsView } from "./components/views/ProjectsView";
import { TerminalView } from "./components/views/TerminalView";
import { EditTodoModal } from "./components/EditTodoModal";
import { ImageLightbox } from "./components/ImageLightbox";
import { Eyes } from "./components/Eyes";

function Toast() {
  const filed = useStore((s) => s.filed);
  const undoFile = useStore((s) => s.undoFile);
  const dismissToast = useStore((s) => s.dismissToast);
  if (!filed) return null;
  return (
    <div className="toast" role="status">
      <span className="toast-icon">
        <Eyes size={17} blink />
      </span>
      <span className="toast-msg">Filed as {filed.name}</span>
      <button className="toast-action" onClick={undoFile}>Undo</button>
      <button className="toast-close" aria-label="Dismiss" onClick={dismissToast}>
        <X size={13} strokeWidth={2.4} />
      </button>
    </div>
  );
}

function DeletedToast() {
  const deleted = useStore((s) => s.deleted);
  const undoDelete = useStore((s) => s.undoDelete);
  const dismissDeleted = useStore((s) => s.dismissDeleted);
  if (!deleted) return null;
  const msg =
    deleted.titles.length === 1
      ? `Moved “${deleted.titles[0]}” to trash`
      : `Moved ${deleted.titles.length} notes to trash`;
  return (
    <div className="toast toast-raise" role="status">
      <span className="toast-icon danger">
        <Trash2 size={14} strokeWidth={2.2} />
      </span>
      <span className="toast-msg">{msg}</span>
      <button className="toast-action" onClick={undoDelete}>Undo</button>
      <button className="toast-close" aria-label="Dismiss" onClick={dismissDeleted}>
        <X size={13} strokeWidth={2.4} />
      </button>
    </div>
  );
}

function UndoToast() {
  const undo = useStore((s) => s.undo);
  const runUndo = useStore((s) => s.runUndo);
  const dismiss = useStore((s) => s.dismissUndo);
  if (!undo) return null;
  return (
    <div className="toast toast-raise" role="status">
      <span className="toast-icon danger">
        <Trash2 size={14} strokeWidth={2.2} />
      </span>
      <span className="toast-msg">{undo.message}</span>
      <button className="toast-action" onClick={runUndo}>Undo</button>
      <button className="toast-close" aria-label="Dismiss" onClick={dismiss}>
        <X size={13} strokeWidth={2.4} />
      </button>
    </div>
  );
}

function DeletedSubjectToast() {
  const d = useStore((s) => s.deletedSubject);
  const undo = useStore((s) => s.undoDeleteSubject);
  const dismiss = useStore((s) => s.dismissDeletedSubject);
  if (!d) return null;
  const n = d.removed.length;
  return (
    <div className="toast toast-raise" role="status">
      <span className="toast-icon danger">
        <Trash2 size={14} strokeWidth={2.2} />
      </span>
      <span className="toast-msg">
        Deleted {d.subject} · {n} {n === 1 ? "task" : "tasks"}
      </span>
      <button className="toast-action" onClick={undo}>Undo</button>
      <button className="toast-close" aria-label="Dismiss" onClick={dismiss}>
        <X size={13} strokeWidth={2.4} />
      </button>
    </div>
  );
}

export default function App() {
  const overlay = useStore((s) => s.overlay);
  const content = useStore((s) => s.content);
  const filed = useStore((s) => s.filed);
  const activeView = useStore((s) => s.activeView);
  const editingTodo = useStore((s) => s.editingTodo);
  const deleted = useStore((s) => s.deleted);
  const deletedSubject = useStore((s) => s.deletedSubject);
  const undo = useStore((s) => s.undo);

  // Load notes, to-dos and settings once.
  useEffect(() => {
    useStore.getState().init();
  }, []);

  // Watch for external file changes (Rust watcher emits these). Debounce per
  // channel so a burst of raw FS events collapses into one refresh on the
  // settled state.
  useEffect(() => {
    let notesTimer: number | undefined;
    let todoTimer: number | undefined;
    const unNotes = listen("notes-changed", () => {
      window.clearTimeout(notesTimer);
      notesTimer = window.setTimeout(() => useStore.getState().syncExternalNotes(), 200);
    });
    let projectsTimer: number | undefined;
    const unProjects = listen("projects-changed", () => {
      window.clearTimeout(projectsTimer);
      projectsTimer = window.setTimeout(() => useStore.getState().refreshProjects(), 200);
    });
    const unTodo = listen("todo-changed", () => {
      window.clearTimeout(todoTimer);
      todoTimer = window.setTimeout(() => useStore.getState().reloadTodos(), 200);
    });
    // Summoning via the global shortcut brings dotMD back as you left it
    // (your tabs, or the empty background).
    const unSummon = listen("summon", () => focusEditor());
    return () => {
      window.clearTimeout(notesTimer);
      window.clearTimeout(todoTimer);
      unNotes.then((f) => f());
      unTodo.then((f) => f());
      unProjects.then((f) => f());
      window.clearTimeout(projectsTimer);
      unSummon.then((f) => f());
    };
  }, []);

  // Toolbar keyboard nav: Ctrl+T enters (see actions), ↑/↓ cycle views,
  // Esc/Enter/any other key or a click exits. Capture phase + stopPropagation so
  // view handlers (e.g. Calendar's arrows) and the editor don't also react while
  // navigating. Registered before the keybinding handler so it runs first.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = useStore.getState();
      if (!st.toolbarNav) return;
      // Ignore bare modifier presses so they don't count as "other key".
      if (["Shift", "Control", "Alt", "Meta"].includes(e.key)) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        st.cycleToolbar(1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        st.cycleToolbar(-1);
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        st.exitToolbarNav();
        focusEditor();
      } else if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        st.exitToolbarNav();
      } else {
        st.exitToolbarNav(); // leave nav and let the key through
      }
    };
    const onDown = () => {
      if (useStore.getState().toolbarNav) useStore.getState().exitToolbarNav();
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("mousedown", onDown, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("mousedown", onDown, true);
    };
  }, []);

  // Global keybindings, matched against the (user-overridable) binding map.
  // Capture phase so our shortcuts win over CodeMirror; Escape is left to
  // overlays / the autocomplete menu.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = useStore.getState();
      if (st.recording || !st.settings) return; // settings UI is capturing keys
      const combo = comboFromEvent(e);
      if (!combo) return;
      if (runBinding(combo, st.settings.keybindings)) e.preventDefault();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  // Autosave a short while after typing stops.
  useEffect(() => {
    const st = useStore.getState();
    if (content === st.lastSaved) return;
    const ms = st.settings?.autosave_ms ?? 1200;
    const id = window.setTimeout(() => useStore.getState().save(), ms);
    return () => window.clearTimeout(id);
  }, [content]);

  // Flush on blur so "hidden" always means "saved".
  useEffect(() => {
    const un = getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (!focused) useStore.getState().save();
    });
    return () => {
      un.then((f) => f());
    };
  }, []);

  // Auto-dismiss the file-&-clear toast.
  useEffect(() => {
    if (!filed) return;
    const id = window.setTimeout(() => useStore.getState().dismissToast(), 6000);
    return () => window.clearTimeout(id);
  }, [filed]);

  // Auto-dismiss the undo-delete toast.
  useEffect(() => {
    if (!deleted) return;
    const id = window.setTimeout(() => useStore.getState().dismissDeleted(), 6000);
    return () => window.clearTimeout(id);
  }, [deleted]);

  // Auto-dismiss the generic undo toast (Storage actions).
  useEffect(() => {
    if (!undo) return;
    const id = window.setTimeout(() => useStore.getState().dismissUndo(), 8000);
    return () => window.clearTimeout(id);
  }, [undo]);

  // Auto-dismiss the delete-subject toast.
  useEffect(() => {
    if (!deletedSubject) return;
    const id = window.setTimeout(() => useStore.getState().dismissDeletedSubject(), 6000);
    return () => window.clearTimeout(id);
  }, [deletedSubject]);

  // Keep the editor focused when overlays close.
  useEffect(() => {
    if (overlay === "none") focusEditor();
  }, [overlay]);

  return (
    <div className="app">
      <TitleBar />
      <div className="app-body">
        <ActivityBar />
        {!isFullView(activeView) && <SidePanel />}
        <div className="main-area">
          <Editor />
          {activeView === "board" && <Board />}
          {activeView === "calendar" && <Calendar />}
          {activeView === "projects" && <ProjectsView />}
          {activeView === "storage" && <StorageView />}
          {activeView === "terminal" && <TerminalView />}
        </div>
      </div>
      <StatusBar />
      {overlay === "switcher" && <NoteSwitcher />}
      {overlay === "search" && <SearchOverlay />}
      {editingTodo !== null && <EditTodoModal key={editingTodo} />}
      <ImageLightbox />
      <Toast />
      <DeletedToast />
      <DeletedSubjectToast />
      <UndoToast />
    </div>
  );
}
