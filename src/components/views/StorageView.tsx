import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Check, ChevronLeft, ChevronRight, Eye, FileText, Image as ImageIcon, ListChecks, Mountain, RefreshCw, RotateCcw, Trash2, X } from "lucide-react";
import { todoKey, useStore } from "../../store";
import * as api from "../../api";
import { SCRATCH } from "../../api";
import { subjectStyle } from "../../subjects";
import { Eyes } from "../Eyes";
import { ContextMenu, type MenuItem } from "../ContextMenu";
import { dueLabel, ymd } from "../../dates";
import { monogram, openTerminalHere } from "./ProjectsView";

type Section = "images" | "notes" | "tasks" | "projects" | "subjects" | "tags" | "trash";
type SortKey = "size" | "date" | "name";
type TaskFilter = "all" | "open" | "done";
type TaskSort = "due" | "created" | "name";
type TrashKind = "all" | api.TrashItem["kind"];
const TRASH_KINDS: { key: TrashKind; label: string }[] = [
  { key: "all", label: "All" },
  { key: "note", label: "Notes" },
  { key: "image", label: "Images" },
  { key: "project", label: "Projects" },
  { key: "task", label: "Tasks" },
];
/** A right-click menu: which list it came from and the rows it acts on.
 *  "image-notes" is the Images "Open note it's used in ›" second step. */
type Menu = { x: number; y: number; kind: Section | "image-notes"; ids: string[] };

const SECTIONS: { key: Section; label: string }[] = [
  { key: "images", label: "Images" },
  { key: "notes", label: "Notes" },
  { key: "tasks", label: "Tasks" },
  { key: "projects", label: "Projects" },
  { key: "subjects", label: "Subjects" },
  { key: "tags", label: "Tags" },
  { key: "trash", label: "Trash" },
];

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

const fmtDate = (secs: number) => {
  if (!secs) return "";
  const d = new Date(secs * 1000);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
};

/** Nothing links it: no live note, no deleted note, no project logo. */
const isUnused = (i: api.ImageInfo) => !i.used_by.length && !i.used_in_trash && !i.used_by_projects?.length;

const noteLabel = (name: string) => (name === SCRATCH ? "Untitled" : name);
const sum = (xs: { bytes: number }[]) => xs.reduce((a, x) => a + x.bytes, 0);

/** A destructive button that needs a second click within 3s ("are you sure"
 *  without a dialog). `armed` is owned by the parent so the Delete key can
 *  arm / fire the same button. */
function ConfirmButton({
  id,
  armed,
  setArmed,
  label,
  confirmLabel = "Click again to delete forever",
  onConfirm,
  disabled,
  small,
}: {
  id: string;
  armed: string | null;
  setArmed: (id: string | null) => void;
  label: React.ReactNode;
  confirmLabel?: string;
  onConfirm: () => void;
  disabled?: boolean;
  small?: boolean;
}) {
  const on = armed === id;
  return (
    <button
      className={`st-btn danger ${on ? "armed" : ""} ${small ? "small" : ""}`}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        if (on) {
          setArmed(null);
          onConfirm();
        } else setArmed(id);
      }}
    >
      {on ? confirmLabel : label}
    </button>
  );
}

/** Storage → Images preview: one big image, its details, and a filmstrip.
 *  ←/→ or ↑/↓ step through `images` (the list as filtered + sorted), Home /
 *  End jump, Delete trashes the shown image, Esc / ✕ / backdrop close. */
function ImagePreview({
  images,
  index,
  setIndex,
  srcFor,
  onClose,
  onTrash,
  onOpenNote,
}: {
  images: api.ImageInfo[];
  index: number;
  setIndex: (i: number) => void;
  srcFor: (file: string) => string;
  onClose: () => void;
  onTrash: (file: string) => void;
  onOpenNote: (name: string) => void;
}) {
  const img = images[index];
  const stripRef = useRef<HTMLDivElement>(null);
  const last = images.length - 1;
  const go = (i: number) => setIndex(Math.max(0, Math.min(last, i)));

  // Keys (the list's own shortcuts stand down while this is open).
  const state = useRef({ index, last, img });
  state.current = { index, last, img };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const { index, last, img } = state.current;
      const step: Record<string, number> = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 };
      if (e.key in step) setIndex(Math.max(0, Math.min(last, index + step[e.key])));
      else if (e.key === "Home") setIndex(0);
      else if (e.key === "End") setIndex(last);
      else if (e.key === "Escape") onClose();
      else if (e.key === "Delete" && img) onTrash(img.file);
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [setIndex, onClose, onTrash]);

  // Keep the current thumbnail in view; warm the neighbours so arrowing is instant.
  useEffect(() => {
    stripRef.current
      ?.querySelector<HTMLElement>(".pv-thumb.on")
      ?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
    for (const j of [index - 1, index + 1, index + 2]) {
      if (images[j]) new Image().src = srcFor(images[j].file);
    }
  }, [index, images, srcFor]);

  if (!img) return null;
  const unused = isUnused(img);

  return (
    <div className="preview" role="dialog" aria-label="Image preview" onMouseDown={onClose}>
      <div className="pv-frame" onMouseDown={(e) => e.stopPropagation()}>
        <div className="pv-stage">
          <button className="pv-nav" aria-label="Previous image" disabled={index === 0} onClick={() => go(index - 1)}>
            <ChevronLeft size={22} strokeWidth={2.2} />
          </button>
          <img key={img.file} className="pv-img" src={srcFor(img.file)} alt={img.file} />
          <button className="pv-nav" aria-label="Next image" disabled={index === last} onClick={() => go(index + 1)}>
            <ChevronRight size={22} strokeWidth={2.2} />
          </button>
        </div>

        <aside className="pv-info">
          <button className="pv-close" aria-label="Close preview" onClick={onClose}>
            <X size={16} strokeWidth={2.4} />
          </button>
          <span className="pv-count">
            {index + 1} / {images.length}
          </span>
          <h2 className="pv-name">{img.file}</h2>
          <span className="pv-meta">
            {fmtBytes(img.bytes)} · {fmtDate(img.modified)}
          </span>
          <span className="pv-label">Used in</span>
          <div className="pv-uses">
            {img.used_by.map((n) => (
              <button key={n} className="st-link" onClick={() => onOpenNote(n)}>
                {noteLabel(n)}
              </button>
            ))}
            {img.used_by_projects?.map((n) => (
              <span key={`p:${n}`} className="st-dim">
                Logo of {n}
              </span>
            ))}
            {!img.used_by.length && !img.used_by_projects?.length && img.used_in_trash > 0 && (
              <span className="st-dim">Only in deleted notes</span>
            )}
            {unused && <span className="st-badge">Unused</span>}
          </div>
          <button className="st-btn danger pv-trash" onClick={() => onTrash(img.file)}>
            <Trash2 size={13} strokeWidth={2.2} /> Move to trash <kbd>Del</kbd>
          </button>
          <span className="pv-keys">
            <kbd>←</kbd>
            <kbd>→</kbd> browse · <kbd>Esc</kbd> close
          </span>
        </aside>

        <div className="pv-strip" ref={stripRef}>
          {images.map((m, i) => (
            <button
              key={m.file}
              className={`pv-thumb ${i === index ? "on" : ""}`}
              aria-label={m.file}
              onClick={() => setIndex(i)}
            >
              <img src={srcFor(m.file)} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function StorageView() {
  const notesList = useStore((s) => s.notes);
  const tags = useStore((s) => s.tags);
  const todos = useStore((s) => s.todos);
  const colors = useStore((s) => s.settings?.subject_colors);
  const openNote = useStore((s) => s.openNote);
  const removeNotes = useStore((s) => s.removeNotes);
  const restoreNote = useStore((s) => s.restoreNote);
  const refreshTrash = useStore((s) => s.refreshTrash);
  const unassignSubject = useStore((s) => s.unassignSubject);
  const deleteSubject = useStore((s) => s.deleteSubject);
  const removeTag = useStore((s) => s.removeTag);
  const showUndo = useStore((s) => s.showUndo);
  const toggleTodoAt = useStore((s) => s.toggleTodoAt);
  const deleteTodosAt = useStore((s) => s.deleteTodosAt);
  const setDoneAt = useStore((s) => s.setDoneAt);
  const setEditingTodo = useStore((s) => s.setEditingTodo);
  const storeProjects = useStore((s) => s.projects);
  const deleteProject = useStore((s) => s.deleteProject);

  const [report, setReport] = useState<api.StorageReport | null>(null);
  const [assetsDir, setAssetsDir] = useState("");
  const [section, setSection] = useState<Section>("images");
  const [sort, setSort] = useState<SortKey>("size");
  const [unusedOnly, setUnusedOnly] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  const [armed, setArmedState] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [preview, setPreview] = useState<number | null>(null); // index into `images`
  const [taskFilter, setTaskFilter] = useState<TaskFilter>("all");
  const [taskSort, setTaskSort] = useState<TaskSort>("due");
  const [trashKind, setTrashKind] = useState<TrashKind>("all");
  const [menu, setMenu] = useState<Menu | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const armTimer = useRef<number | undefined>(undefined);

  const load = useCallback(async () => {
    const r = await api.storageReport().catch(() => null);
    if (r) setReport(r);
  }, []);

  // Fresh numbers on open, and whenever notes, tags, projects or the trash
  // change. Trash goes by `trashSeq` alone (the trash/ watcher bumps it for
  // every delete/restore, in the app or outside it), so one change = one scan.
  // Tasks aren't in the report, so toggling or editing one doesn't rescan.
  const trashSeq = useStore((s) => s.trashSeq);
  useEffect(() => {
    load();
  }, [load, notesList, tags, storeProjects, trashSeq]);

  // The ↻ button: re-read everything Storage shows, from disk.
  const [refreshing, setRefreshing] = useState(false);
  const refreshAll = async () => {
    if (refreshing) return;
    setRefreshing(true);
    const st = useStore.getState();
    const minSpin = new Promise((r) => window.setTimeout(r, 450));
    await Promise.all([
      st.refreshNotes(),
      st.refreshTrash(),
      st.refreshProjects(),
      st.reloadTodos(),
      load(),
      minSpin,
    ]).catch((e) => console.error("refresh failed", e));
    setRefreshing(false);
  };

  useEffect(() => {
    api.assetsPath().then(setAssetsDir).catch(() => {});
    rootRef.current?.focus();
  }, []);

  const setArmed = (id: string | null) => {
    window.clearTimeout(armTimer.current);
    setArmedState(id);
    if (id) armTimer.current = window.setTimeout(() => setArmedState(null), 3000);
  };

  const switchTo = (s: Section) => {
    setSection(s);
    setSelected(new Set());
    setAnchor(null);
    setArmed(null);
  };

  const flash = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice((n) => (n === msg ? null : n)), 5000);
  };

  const srcFor = useCallback(
    (file: string) => {
      const sep = assetsDir.includes("\\") ? "\\" : "/";
      return convertFileSrc(`${assetsDir}${sep}${file}`);
    },
    [assetsDir],
  );

  const order = <T,>(xs: T[], size: (x: T) => number, date: (x: T) => number, name: (x: T) => string) =>
    [...xs].sort((a, b) =>
      sort === "size"
        ? size(b) - size(a)
        : sort === "date"
          ? date(b) - date(a)
          : name(a).localeCompare(name(b), undefined, { sensitivity: "base" }),
    );

  const allNotes = useMemo(() => (report?.notes ?? []).filter((n) => n.name !== SCRATCH), [report]);
  const images = useMemo(() => {
    const xs = (report?.images ?? []).filter((i) => !unusedOnly || isUnused(i));
    return order(xs, (x) => x.bytes, (x) => x.modified, (x) => x.file);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report, unusedOnly, sort]);
  const notes = useMemo(
    // Untitled (scratch) is the inbox, not a note: left out here like in Files.
    () => order(allNotes, (x) => x.bytes, (x) => x.modified, (x) => noteLabel(x.name)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [report, sort],
  );
  const trash = useMemo(
    () =>
      order(
        (report?.trash ?? []).filter((x) => trashKind === "all" || x.kind === trashKind),
        (x) => x.bytes,
        (x) => x.modified,
        (x) => x.title,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [report, sort, trashKind],
  );
  const trashCount = (k: TrashKind) => (report?.trash ?? []).filter((x) => k === "all" || x.kind === k).length;
  const subjects = useMemo(() => {
    const m = new Map<string, { open: number; done: number }>();
    for (const t of todos) {
      if (!t.subject) continue;
      const e = m.get(t.subject) ?? { open: 0, done: 0 };
      t.done ? e.done++ : e.open++;
      m.set(t.subject, e);
    }
    return [...m.entries()].map(([name, c]) => ({ name, ...c }));
  }, [todos]);
  // Tasks with no subject get their own row, so they're never invisible here.
  const unsubjected = useMemo(() => {
    const c = { open: 0, done: 0 };
    for (const t of todos) if (!t.subject) t.done ? c.done++ : c.open++;
    return c;
  }, [todos]);
  const taskCount = (n: number) => `${n} ${n === 1 ? "task" : "tasks"}`;

  // Every task, done ones included (faded); ids are `todoKey`s, not indices,
  // so a selection survives todo.md reloading underneath it.
  const tasks = useMemo(() => {
    const due = (d: string) => d || "9999-99-99";
    return todos
      .map((todo, index) => ({ todo, index }))
      .filter(({ todo }) => taskFilter === "all" || (taskFilter === "done") === todo.done)
      .sort((a, b) =>
        taskSort === "due"
          ? due(a.todo.deadline).localeCompare(due(b.todo.deadline)) || a.index - b.index
          : taskSort === "created"
            ? b.todo.created.localeCompare(a.todo.created)
            : a.todo.text.localeCompare(b.todo.text, undefined, { sensitivity: "base" }),
      );
  }, [todos, taskFilter, taskSort]);
  const doneCount = todos.filter((x) => x.done).length;

  // Projects: the store's list (logo, linked notes) + sizes from the report.
  const projects = useMemo(() => {
    const info = new Map((report?.projects ?? []).map((p) => [p.name, p]));
    const rows = storeProjects.map((p) => {
      const mine = todos.filter((x) => x.subject === p.name);
      return {
        project: p,
        name: p.name,
        bytes: info.get(p.name)?.bytes ?? 0,
        modified: info.get(p.name)?.modified ?? p.modified,
        done: mine.filter((x) => x.done).length,
        total: mine.length,
      };
    });
    return order(rows, (x) => x.bytes, (x) => x.modified, (x) => x.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report, storeProjects, todos, sort]);
  const today = ymd(new Date());

  const unusedCount = (report?.images ?? []).filter(isUnused).length;
  const imgBytes = sum(report?.images ?? []);
  const noteBytes = sum(allNotes);
  const trashBytes = sum(report?.trash ?? []);
  const total = imgBytes + noteBytes + trashBytes;

  // Row ids for the current list, in display order (Shift-click ranges).
  const ids: string[] =
    section === "images"
      ? images.map((i) => i.file)
      : section === "notes"
        ? notes.filter((n) => !n.protected).map((n) => n.name)
        : section === "tasks"
          ? tasks.map((x) => todoKey(x.todo))
          : section === "projects"
            ? projects.map((x) => x.name)
          : section === "subjects"
            ? [...subjects.map((s) => s.name), ...(unsubjected.open + unsubjected.done ? [""] : [])]
            : section === "tags"
              ? tags.map((x) => x.tag)
              : section === "trash"
                ? trash.map((t) => `${t.kind}:${t.id}`)
                : [];

  const pick = (e: React.MouseEvent, id: string) => {
    if (e.ctrlKey || e.metaKey) {
      setSelected((prev) => {
        const s = new Set(prev);
        s.has(id) ? s.delete(id) : s.add(id);
        return s;
      });
      setAnchor(id);
    } else if (e.shiftKey && anchor) {
      const a = ids.indexOf(anchor);
      const b = ids.indexOf(id);
      if (a >= 0 && b >= 0) setSelected(new Set(ids.slice(Math.min(a, b), Math.max(a, b) + 1)));
    } else {
      setSelected(new Set([id]));
      setAnchor(id);
    }
  };

  // --- actions ---------------------------------------------------------------

  const trashSelectedImages = async (files: string[]) => {
    if (!files.length) return;
    const moved = await api.trashImages(files).catch(() => [] as string[]);
    setSelected(new Set());
    await load();
    if (moved.length)
      showUndo(`Moved ${moved.length} ${moved.length === 1 ? "image" : "images"} to trash`, async () => {
        for (const id of moved) await api.restoreImage(id).catch(() => {});
        await load();
      });
  };

  const trashSelectedNotes = async (names: string[]) => {
    const del = names.filter((n) => n !== SCRATCH);
    if (!del.length) return;
    await removeNotes(del);
    setSelected(new Set());
    await load();
  };

  const parseTrashId = (key: string) => {
    const i = key.indexOf(":");
    return { kind: key.slice(0, i) as api.TrashItem["kind"], id: key.slice(i + 1) };
  };

  const restoreTrash = async (keys: string[]) => {
    const failed: string[] = [];
    const st = useStore.getState();
    const taskIds: string[] = [];
    for (const k of keys) {
      const { kind, id } = parseTrashId(k);
      if (kind === "note") await restoreNote(id);
      else if (kind === "task") taskIds.push(id);
      else if (kind === "project") {
        // The project comes back with the tasks (and colour) deleted with it.
        const name = report?.trash.find((x) => x.kind === "project" && x.id === id)?.title ?? "";
        const back = await api.restoreProject(id).catch((e) => {
          failed.push(String(e));
          return null;
        });
        if (back) st.restoreTrashedTasks(back.tasks, { subject: name, swatch: back.colour });
      } else await api.restoreImage(id).catch((e) => failed.push(String(e)));
    }
    if (taskIds.length) {
      const back = await api.restoreTasks(taskIds).catch((e) => {
        failed.push(String(e));
        return [] as api.Todo[];
      });
      st.restoreTrashedTasks(back);
    }
    setSelected(new Set());
    await refreshTrash();
    if (keys.some((k) => k.startsWith("project:"))) await useStore.getState().refreshProjects();
    await load();
    if (failed.length) flash(failed[0]);
  };

  const deleteForever = async (keys: string[]) => {
    if (!keys.length) return;
    const freed = await api.deleteForever(keys.map(parseTrashId)).catch(() => 0);
    setSelected(new Set());
    await refreshTrash();
    await load();
    flash(`Freed ${fmtBytes(freed)}`);
  };

  const emptyAll = async () => {
    const freed = await api.emptyTrash().catch(() => 0);
    setSelected(new Set());
    await refreshTrash();
    await load();
    flash(`Trash emptied · freed ${fmtBytes(freed)}`);
  };

  // Tasks: ids are `todoKey`s, looked up in the current list at action time.
  // These read the store directly: the window key handler holds on to the
  // first render's closures.
  const taskIdx = (keys: string[]) => {
    const want = new Set(keys);
    return useStore.getState().todos.flatMap((x, i) => (want.has(todoKey(x)) ? [i] : []));
  };
  const allDone = (keys: string[]) => taskIdx(keys).every((i) => useStore.getState().todos[i]?.done);
  const markTasks = (keys: string[]) => {
    const is = taskIdx(keys);
    if (is.length) setDoneAt(is, !allDone(keys));
  };
  const editTask = (key: string) => {
    const [i] = taskIdx([key]);
    if (i !== undefined) setEditingTodo(i);
  };
  const deleteTasks = (keys: string[]) => {
    deleteTodosAt(taskIdx(keys));
    setSelected(new Set());
  };
  const clearDone = () => {
    deleteTodosAt(useStore.getState().todos.flatMap((x, i) => (x.done ? [i] : [])));
    setSelected(new Set());
  };

  // Right-click: act on the selection if the row is part of it, else select
  // just this row. Subjects and tags act on one row at a time.
  const openMenu = (e: React.MouseEvent, kind: Section, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    let ids: string[];
    if (selected.has(id) && selected.size > 1 && kind !== "subjects" && kind !== "tags" && kind !== "projects")
      ids = [...selected];
    else {
      setSelected(new Set([id]));
      setAnchor(id);
      ids = [id];
    }
    setArmed(null);
    setMenu({ x: e.clientX, y: e.clientY, kind, ids });
  };
  const closeMenu = useCallback(() => {
    setMenu(null);
    setArmedState((a) => (a === "menu" ? null : a));
  }, []);

  /** A permanent / big action in a menu: first click arms it (the menu stays
   *  open, row turns red), the second runs it. */
  const armedItem = (label: string, confirm: string, run: () => void): MenuItem =>
    armed === "menu"
      ? { label: confirm, danger: true, armed: true, onClick: () => { setArmed(null); run(); } }
      : { label, danger: true, keepOpen: true, onClick: () => setArmed("menu") };

  const menuItems = (m: Menu): MenuItem[] => {
    const n = m.ids.length;
    const many = n > 1 ? ` ${n}` : "";
    const one = m.ids[0];
    switch (m.kind) {
      case "images": {
        const img = images.find((i) => i.file === one);
        const notesIn = n === 1 && img ? img.used_by : [];
        const logos = n === 1 && img ? (img.used_by_projects ?? []) : [];
        const items: MenuItem[] = [
          { label: "Preview", disabled: n !== 1, onClick: () => setPreview(Math.max(0, images.findIndex((i) => i.file === one))) },
        ];
        if (notesIn.length + logos.length === 1) {
          items.push(
            notesIn.length
              ? { label: `Open "${noteLabel(notesIn[0])}"`, onClick: () => openFromHere(notesIn[0]) }
              : { label: `Open project "${logos[0]}"`, onClick: () => useStore.getState().openProject(logos[0]) },
          );
        } else if (notesIn.length + logos.length > 1) {
          items.push({ label: "Open note it's used in ›", keepOpen: true, onClick: () => setMenu({ ...m, kind: "image-notes" }) });
        }
        items.push({ label: "-" }, { label: `Move${many} to trash`, danger: true, onClick: () => trashSelectedImages(m.ids) });
        return items;
      }
      case "image-notes": {
        const img = images.find((i) => i.file === one);
        return [
          ...(img?.used_by ?? []).map((name) => ({ label: noteLabel(name), onClick: () => openFromHere(name) })),
          ...(img?.used_by_projects ?? []).map((p) => ({
            label: `${p} (project logo)`,
            onClick: () => useStore.getState().openProject(p),
          })),
        ];
      }
      case "notes":
        return [
          { label: "Open", disabled: n !== 1, onClick: () => openFromHere(one) },
          { label: "Show in folder", disabled: n !== 1, onClick: () => useStore.getState().revealNote(one) },
          { label: "-" },
          { label: `Move${many} to trash`, danger: true, onClick: () => trashSelectedNotes(m.ids) },
        ];
      case "tasks":
        return [
          { label: allDone(m.ids) ? `Mark${many} not done` : `Mark${many} done`, onClick: () => markTasks(m.ids) },
          { label: "Edit…", disabled: n !== 1, onClick: () => editTask(one) },
          { label: "-" },
          { label: n > 1 ? `Delete ${n} tasks` : "Delete", danger: true, onClick: () => deleteTasks(m.ids) },
        ];
      case "projects": {
        const p = projects.find((x) => x.name === one);
        return [
          { label: "Open", onClick: () => useStore.getState().openProject(one) },
          { label: "Show folder", onClick: () => api.openProjectFolder(one).catch(() => {}) },
          { label: "Open terminal here", onClick: () => openTerminalHere(one) },
          { label: "-" },
          armedItem(`Delete project + ${taskCount(p?.total ?? 0)}`, "Click again to delete", () => deleteProject(one)),
        ];
      }
      case "subjects": {
        const s = subjects.find((x) => x.name === one);
        const count = s ? s.open + s.done : unsubjected.open + unsubjected.done;
        return [
          { label: "Show on Board", onClick: () => useStore.getState().setView("board") },
          ...(one ? [{ label: "-" }, armedItem("Remove subject", "Click again to remove", () => unassignSubject(one))] : [{ label: "-" }]),
          armedItem(`Delete + ${taskCount(count)}`, "Click again to delete", () => deleteSubject(one)),
        ];
      }
      case "tags":
        return [
          {
            label: "Show notes with this tag",
            onClick: () => {
              useStore.getState().setActiveTag(one);
              useStore.getState().setView("files");
            },
          },
          { label: "-" },
          armedItem("Delete tag", "Click again to delete", () => removeTag(one)),
        ];
      case "trash":
        return [
          { label: `Restore${many}`, onClick: () => restoreTrash(m.ids) },
          { label: "-" },
          armedItem(`Delete${many} forever`, "Click again to delete forever", () => deleteForever(m.ids)),
        ];
    }
  };

  // Close the viewer, leaving the image it ended on selected in the list.
  const closePreview = useCallback(() => {
    const file = preview !== null ? images[Math.min(preview, images.length - 1)]?.file : undefined;
    if (file) {
      setSelected(new Set([file]));
      setAnchor(file);
    }
    setPreview(null);
    rootRef.current?.focus();
  }, [images, preview]);

  // Trash the shown image; the list shrinks and the same index shows the next one.
  const trashFromPreview = useCallback(
    (file: string) => {
      trashSelectedImages([file]);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Clamp / close the viewer when the list it walks changes size.
  useEffect(() => {
    if (preview === null) return;
    if (!images.length) setPreview(null);
    else if (preview > images.length - 1) setPreview(images.length - 1);
  }, [images, preview]);

  const openFromHere = (name: string) => {
    openNote(name, "pin");
    useStore.setState({ activeView: null });
  };

  // --- keyboard: 1-6 sections, arrows move, Ctrl+A all, Delete acts on the selection

  const sel = [...selected];
  const scrollToRow = (id: string) =>
    rootRef.current?.querySelector(`[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: "nearest" });
  const keyState = useRef({ section, sel, ids, armed, preview, anchor, menu });
  keyState.current = { section, sel, ids, armed, preview, anchor, menu };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (useStore.getState().editingTodo !== null) return;
      const { section, sel, ids, armed, preview, anchor, menu } = keyState.current;
      if (preview !== null || menu) return; // the viewer / a menu owns the keys
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setSelected(new Set(ids));
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const n = Number(e.key);
      if (n >= 1 && n <= SECTIONS.length) {
        e.preventDefault();
        switchTo(SECTIONS[n - 1].key);
      } else if ((e.key === "ArrowDown" || e.key === "ArrowUp") && ids.length) {
        e.preventDefault();
        const at = anchor !== null ? ids.indexOf(anchor) : -1;
        const next = ids[at < 0 ? 0 : Math.max(0, Math.min(ids.length - 1, at + (e.key === "ArrowDown" ? 1 : -1)))];
        setSelected(new Set([next]));
        setAnchor(next);
        setArmed(null);
        scrollToRow(next);
      } else if (section === "tasks" && e.key === " " && sel.length) {
        e.preventDefault();
        markTasks(sel);
      } else if (section === "projects" && e.key === "Enter" && sel.length === 1) {
        e.preventDefault();
        useStore.getState().openProject(sel[0]);
      } else if (section === "tasks" && e.key === "Enter" && sel.length === 1) {
        e.preventDefault();
        editTask(sel[0]);
      } else if (e.key === "Escape") {
        setSelected(new Set());
        setArmed(null);
      } else if ((e.key === "Enter" || e.key === " ") && section === "images" && ids.length) {
        e.preventDefault();
        const i = sel.length ? ids.indexOf(sel[0]) : 0;
        setPreview(Math.max(0, i));
      } else if (e.key === "Delete" && sel.length) {
        e.preventDefault();
        if (section === "images") trashSelectedImages(sel);
        else if (section === "notes") trashSelectedNotes(sel);
        else if (section === "tasks") deleteTasks(sel);
        else if ((section === "subjects" || section === "tags" || section === "projects") && sel.length === 1) {
          // Arms the row's own button; a second Delete fires it.
          const id = `${{ subjects: "subj-delete", tags: "tag-delete", projects: "proj-delete" }[section]}:${sel[0]}`;
          if (armed === id) {
            setArmed(null);
            if (section === "subjects") deleteSubject(sel[0]);
            else if (section === "projects") deleteProject(sel[0]);
            else removeTag(sel[0]);
          } else setArmed(id);
        } else if (section === "trash") {
          // Same two-step as the button: first Delete arms, second deletes.
          if (armed === "sel-forever") {
            setArmed(null);
            deleteForever(sel);
          } else setArmed("sel-forever");
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- render ----------------------------------------------------------------

  const counts: Record<Section, number> = {
    images: report?.images.length ?? 0,
    notes: allNotes.length,
    tasks: todos.length,
    projects: storeProjects.length,
    subjects: subjects.length + (unsubjected.open + unsubjected.done ? 1 : 0),
    tags: tags.length,
    trash: report?.trash.length ?? 0,
  };

  const sortBar = (
    <div className="st-seg" role="group" aria-label="Sort">
      {(["size", "date", "name"] as SortKey[]).map((k) => (
        <button key={k} className={sort === k ? "on" : ""} onClick={() => setSort(k)}>
          {k === "size" ? "Size" : k === "date" ? "Date" : "Name"}
        </button>
      ))}
    </div>
  );

  const pct = (b: number) => `${total ? (b / total) * 100 : 0}%`;

  return (
    <div className="storage" ref={rootRef} tabIndex={0}>
      <header className="st-head">
        <h1>Storage</h1>
        <span className="st-total">{report ? `${fmtBytes(total)} on disk` : "Measuring…"}</span>
        <button
          className={`st-refresh ${refreshing ? "spinning" : ""}`}
          title="Refresh"
          aria-label="Refresh storage"
          disabled={refreshing}
          onClick={refreshAll}
        >
          <RefreshCw size={15} strokeWidth={2.2} />
        </button>
      </header>

      <div className="st-meter" aria-hidden>
        <span className="seg images" style={{ width: pct(imgBytes) }} />
        <span className="seg notes" style={{ width: pct(noteBytes) }} />
        <span className="seg trash" style={{ width: pct(trashBytes) }} />
      </div>
      <div className="st-legend">
        <span>
          <i className="images" /> Images {fmtBytes(imgBytes)}
        </span>
        <span>
          <i className="notes" /> Notes {fmtBytes(noteBytes)}
        </span>
        <span>
          <i className="trash" /> Trash {fmtBytes(trashBytes)}
        </span>
      </div>

      <nav className="st-tabs" role="tablist">
        {SECTIONS.map((s, i) => (
          <button
            key={s.key}
            role="tab"
            aria-selected={section === s.key}
            className={section === s.key ? "on" : ""}
            title={`${s.label} (${i + 1})`}
            onClick={() => switchTo(s.key)}
          >
            {s.label} <span className="st-count">{counts[s.key]}</span>
          </button>
        ))}
        {notice && <span className="st-notice">{notice}</span>}
      </nav>

      {section === "images" && (
        <>
          <div className="st-bar">
            <div className="st-seg" role="group" aria-label="Filter">
              <button className={!unusedOnly ? "on" : ""} onClick={() => setUnusedOnly(false)}>
                All
              </button>
              <button className={unusedOnly ? "on" : ""} onClick={() => setUnusedOnly(true)}>
                Unused {unusedCount}
              </button>
            </div>
            {sortBar}
            <button
              className="st-btn"
              disabled={!images.length}
              onClick={() => {
                const i = sel.length ? images.findIndex((m) => m.file === sel[0]) : 0;
                setPreview(Math.max(0, i));
              }}
            >
              <Eye size={13} strokeWidth={2.2} /> Preview
            </button>
            <button
              className="st-btn danger"
              disabled={!sel.length}
              onClick={() => trashSelectedImages(sel)}
            >
              <Trash2 size={13} strokeWidth={2.2} /> Move {sel.length || ""} to trash
            </button>
          </div>
          <div className="st-list">
            {images.length === 0 && (
              <div className="view-empty">
                <Eyes size={34} />
                <strong>{unusedOnly ? "No unused images" : "No images yet"}</strong>
                <span>{unusedOnly ? "Every image is linked from a note." : "Paste an image into a note to add one."}</span>
              </div>
            )}
            {images.map((img, i) => {
              return (
                <div
                  key={img.file}
                  className={`st-row ${selected.has(img.file) ? "sel" : ""}`}
                  data-id={img.file}
                  onClick={(e) => pick(e, img.file)}
                  onContextMenu={(e) => openMenu(e, "images", img.file)}
                >
                  <button
                    className="st-thumb"
                    title="Preview"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPreview(i);
                    }}
                  >
                    {assetsDir && <img src={srcFor(img.file)} alt="" loading="lazy" />}
                  </button>
                  <span className="st-name">{img.file}</span>
                  <span className="st-use">
                    {img.used_by.length > 0 || img.used_by_projects?.length ? (
                      <>
                        <span className="st-dim">Used in</span>
                        {img.used_by_projects?.map((n) => (
                          <button
                            key={`p:${n}`}
                            className="st-link"
                            onClick={(e) => {
                              e.stopPropagation();
                              useStore.getState().openProject(n);
                            }}
                          >
                            {n} logo
                          </button>
                        ))}
                        {img.used_by.map((n) => (
                          <button
                            key={n}
                            className="st-link"
                            onClick={(e) => {
                              e.stopPropagation();
                              openFromHere(n);
                            }}
                          >
                            {noteLabel(n)}
                          </button>
                        ))}
                      </>
                    ) : img.used_in_trash ? (
                      <span className="st-dim">Only in deleted notes</span>
                    ) : (
                      <span className="st-badge">Unused</span>
                    )}
                  </span>
                  <span className="st-date">{fmtDate(img.modified)}</span>
                  <span className="st-size">{fmtBytes(img.bytes)}</span>
                </div>
              );
            })}
          </div>
        </>
      )}

      {section === "notes" && (
        <>
          <div className="st-bar">
            {sortBar}
            <button
              className="st-btn danger"
              disabled={!sel.length}
              onClick={() => trashSelectedNotes(sel)}
            >
              <Trash2 size={13} strokeWidth={2.2} /> Move {sel.length || ""} to trash
            </button>
          </div>
          <div className="st-list">
            {notes.map((n) => (
              <div
                key={n.name}
                className={`st-row ${selected.has(n.name) ? "sel" : ""} ${n.protected ? "locked" : ""}`}
                data-id={n.name}
                onClick={(e) => !n.protected && pick(e, n.name)}
                onDoubleClick={() => openFromHere(n.name)}
                onContextMenu={(e) => !n.protected && openMenu(e, "notes", n.name)}
              >
                <span className="st-icon">
                  <FileText size={15} strokeWidth={2} />
                </span>
                <span className="st-name">
                  {noteLabel(n.name)}
                  {n.protected && <span className="st-dim"> · built-in</span>}
                </span>
                <span className="st-use st-dim">
                  {n.words.toLocaleString()} words
                  {n.images > 0 && ` · ${n.images} ${n.images === 1 ? "image" : "images"}`}
                </span>
                <span className="st-date">{fmtDate(n.modified)}</span>
                <span className="st-size">{fmtBytes(n.bytes)}</span>
                <button
                  className="st-btn small"
                  onClick={(e) => {
                    e.stopPropagation();
                    openFromHere(n.name);
                  }}
                >
                  Open
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {section === "tasks" && (
        <>
          <div className="st-bar">
            <div className="st-seg" role="group" aria-label="Filter">
              {(["all", "open", "done"] as TaskFilter[]).map((k) => (
                <button key={k} className={taskFilter === k ? "on" : ""} onClick={() => setTaskFilter(k)}>
                  {k === "all" ? `All ${todos.length}` : k === "open" ? `Open ${todos.length - doneCount}` : `Done ${doneCount}`}
                </button>
              ))}
            </div>
            <div className="st-seg" role="group" aria-label="Sort">
              {(["due", "created", "name"] as TaskSort[]).map((k) => (
                <button key={k} className={taskSort === k ? "on" : ""} onClick={() => setTaskSort(k)}>
                  {k === "due" ? "Due" : k === "created" ? "Created" : "Name"}
                </button>
              ))}
            </div>
            <button className="st-btn" disabled={!sel.length} onClick={() => markTasks(sel)}>
              <Check size={13} strokeWidth={2.4} /> {sel.length && allDone(sel) ? "Mark not done" : "Mark done"}
            </button>
            <button className="st-btn danger" disabled={!sel.length} onClick={() => deleteTasks(sel)}>
              <Trash2 size={13} strokeWidth={2.2} /> Delete {sel.length || ""}
            </button>
            <button className="st-btn danger" disabled={!doneCount} onClick={clearDone}>
              Clear {doneCount || ""} done
            </button>
          </div>
          <div className="st-list">
            {tasks.length === 0 && (
              <div className="view-empty">
                <Eyes size={34} />
                <strong>{taskFilter === "done" ? "Nothing done yet" : taskFilter === "open" ? "All clear" : "No tasks yet"}</strong>
                <span>Add tasks from the To-do panel or the Calendar.</span>
              </div>
            )}
            {tasks.map(({ todo, index }) => {
              const id = todoKey(todo);
              const late = !!todo.deadline && !todo.done && todo.deadline < today;
              const created = Date.parse(todo.created);
              return (
                <div
                  key={index}
                  data-id={id}
                  className={`st-row st-task ${todo.done ? "done" : ""} ${selected.has(id) ? "sel" : ""}`}
                  style={subjectStyle(todo.subject, colors)}
                  onClick={(e) => pick(e, id)}
                  onDoubleClick={() => setEditingTodo(index)}
                  onContextMenu={(e) => openMenu(e, "tasks", id)}
                >
                  <input
                    type="checkbox"
                    className="check"
                    checked={todo.done}
                    aria-label={todo.done ? "Mark as not done" : "Mark as done"}
                    onChange={() => toggleTodoAt(index)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <span className="st-name">{todo.text}</span>
                  <span className="st-use">
                    {todo.subject ? (
                      <>
                        <span className="st-dot" />
                        <span className="st-dim">{todo.subject}</span>
                      </>
                    ) : (
                      <span className="st-dim st-none">No subject</span>
                    )}
                  </span>
                  <span className={`st-date st-due ${late ? "late" : ""}`}>
                    {todo.deadline ? (late ? `Overdue · ${dueLabel(todo.deadline)}` : dueLabel(todo.deadline)) : "No date"}
                  </span>
                  <span className="st-date st-created" title="Created">
                    {created ? fmtDate(created / 1000) : ""}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}

      {section === "projects" && (
        <>
          <div className="st-bar">
            {sortBar}
            <button
              className="st-btn"
              disabled={sel.length !== 1}
              onClick={() => useStore.getState().openProject(sel[0])}
            >
              <Mountain size={13} strokeWidth={2.2} /> Open
            </button>
            <ConfirmButton
              id={`proj-delete:${sel[0] ?? ""}`}
              armed={armed}
              setArmed={setArmed}
              disabled={sel.length !== 1}
              label={
                <>
                  <Trash2 size={13} strokeWidth={2.2} /> Delete project
                </>
              }
              confirmLabel={`Click again to delete it + ${taskCount(projects.find((x) => x.name === sel[0])?.total ?? 0)}`}
              onConfirm={() => deleteProject(sel[0])}
            />
          </div>
          <div className="st-list">
            {projects.length === 0 && (
              <div className="view-empty">
                <Eyes size={34} />
                <strong>No projects yet</strong>
                <span>Start one from the Projects view.</span>
              </div>
            )}
            {projects.map((p) => {
              const logoFile = p.project.logo.split(/[\\/]/).pop() ?? "";
              return (
                <div
                  key={p.name}
                  data-id={p.name}
                  className={`st-row ${selected.has(p.name) ? "sel" : ""}`}
                  style={subjectStyle(p.name, colors)}
                  onClick={(e) => pick(e, p.name)}
                  onDoubleClick={() => useStore.getState().openProject(p.name)}
                  onContextMenu={(e) => openMenu(e, "projects", p.name)}
                >
                  {logoFile && assetsDir ? (
                    <span className="st-thumb">
                      <img src={srcFor(logoFile)} alt="" loading="lazy" />
                    </span>
                  ) : (
                    <span className="st-thumb st-mono">{monogram(p.name)}</span>
                  )}
                  <span className="st-name">{p.name}</span>
                  <span className="st-use st-dim">
                    {p.done}/{p.total} tasks · {p.project.notes.length}{" "}
                    {p.project.notes.length === 1 ? "note" : "notes"}
                  </span>
                  <span className="st-date">{fmtDate(p.modified)}</span>
                  <span className="st-size">{fmtBytes(p.bytes)}</span>
                </div>
              );
            })}
          </div>
        </>
      )}

      {section === "subjects" && (
        <>
          <div className="st-bar">
            <span className="st-hint">Remove keeps the tasks without a subject. Delete removes them too, with Undo.</span>
          </div>
          <div className="st-list">
            {subjects.length === 0 && unsubjected.open + unsubjected.done === 0 && (
              <div className="view-empty">
                <Eyes size={34} />
                <strong>No subjects yet</strong>
                <span>Give a task a subject to group it on the Board.</span>
              </div>
            )}
            {subjects.map((s) => (
              <div
                key={s.name}
                data-id={s.name}
                className={`st-row static ${selected.has(s.name) ? "sel" : ""}`}
                style={subjectStyle(s.name, colors)}
                onClick={(e) => pick(e, s.name)}
                onDoubleClick={() => useStore.getState().setView("board")}
                onContextMenu={(e) => openMenu(e, "subjects", s.name)}
              >
                <span className="st-dot" />
                <span className="st-name">{s.name}</span>
                <span className="st-use st-dim">
                  {s.open} open · {s.done} done
                </span>
                <ConfirmButton
                  id={`subj-remove:${s.name}`}
                  armed={armed}
                  setArmed={setArmed}
                  small
                  label="Remove subject"
                  confirmLabel="Click again to remove"
                  onConfirm={() => unassignSubject(s.name)}
                />
                <ConfirmButton
                  id={`subj-delete:${s.name}`}
                  armed={armed}
                  setArmed={setArmed}
                  small
                  label={`Delete + ${taskCount(s.open + s.done)}`}
                  confirmLabel="Click again to delete"
                  onConfirm={() => deleteSubject(s.name)}
                />
              </div>
            ))}
            {unsubjected.open + unsubjected.done > 0 && (
              <div
                data-id=""
                className={`st-row st-nosubj ${selected.has("") ? "sel" : ""}`}
                title="Double-click to show these tasks in the To-do panel"
                onClick={(e) => pick(e, "")}
                onDoubleClick={() => useStore.getState().setView("todo")}
                onContextMenu={(e) => openMenu(e, "subjects", "")}
              >
                <span className="st-dot hollow" />
                <span className="st-name">No subject</span>
                <span className="st-use st-dim">
                  {unsubjected.open} open · {unsubjected.done} done
                </span>
                <ConfirmButton
                  id="subj-delete:"
                  armed={armed}
                  setArmed={setArmed}
                  small
                  label={`Delete + ${taskCount(unsubjected.open + unsubjected.done)}`}
                  confirmLabel="Click again to delete"
                  onConfirm={() => deleteSubject("")}
                />
              </div>
            )}
          </div>
        </>
      )}

      {section === "tags" && (
        <>
          <div className="st-bar">
            <span className="st-hint">Deleting a tag removes every #tag from your notes. Undo puts them back.</span>
          </div>
          <div className="st-list">
            {tags.length === 0 && (
              <div className="view-empty">
                <Eyes size={34} />
                <strong>No tags yet</strong>
                <span>Type #something in a note to tag it.</span>
              </div>
            )}
            {tags.map((x) => (
              <div
                key={x.tag}
                data-id={x.tag}
                className={`st-row static st-tag ${selected.has(x.tag) ? "sel" : ""}`}
                onClick={(e) => pick(e, x.tag)}
                onDoubleClick={() => {
                  useStore.getState().setActiveTag(x.tag);
                  useStore.getState().setView("files");
                }}
                onContextMenu={(e) => openMenu(e, "tags", x.tag)}
              >
                <span className="st-name">#{x.tag}</span>
                <span className="st-use st-dim" title={x.notes.join(", ")}>
                  {x.notes.length} {x.notes.length === 1 ? "note" : "notes"}
                </span>
                <ConfirmButton
                  id={`tag-delete:${x.tag}`}
                  armed={armed}
                  setArmed={setArmed}
                  small
                  label="Delete tag"
                  confirmLabel="Click again to delete"
                  onConfirm={() => removeTag(x.tag)}
                />
              </div>
            ))}
          </div>
        </>
      )}

      {section === "trash" && (
        <>
          <div className="st-bar">
            <div className="st-seg" role="group" aria-label="Show">
              {TRASH_KINDS.map((k) => (
                <button
                  key={k.key}
                  className={trashKind === k.key ? "on" : ""}
                  onClick={() => {
                    setTrashKind(k.key);
                    setSelected(new Set());
                  }}
                >
                  {k.label} {trashCount(k.key) || ""}
                </button>
              ))}
            </div>
            {sortBar}
            <button className="st-btn" disabled={!sel.length} onClick={() => restoreTrash(sel)}>
              <RotateCcw size={13} strokeWidth={2.2} /> Restore {sel.length || ""}
            </button>
            <ConfirmButton
              id="sel-forever"
              armed={armed}
              setArmed={setArmed}
              disabled={!sel.length}
              label={`Delete ${sel.length || ""} forever`}
              onConfirm={() => deleteForever(sel)}
            />
            <ConfirmButton
              id="empty"
              armed={armed}
              setArmed={setArmed}
              disabled={!trash.length}
              label={`Empty trash · ${fmtBytes(trashBytes)}`}
              confirmLabel={`Click again to free ${fmtBytes(trashBytes)}`}
              onConfirm={emptyAll}
            />
          </div>
          <div className="st-list">
            {trash.length === 0 && (
              <div className="view-empty">
                <Eyes size={34} />
                <strong>
                  {trashKind === "all"
                    ? "Trash is empty"
                    : `No deleted ${TRASH_KINDS.find((k) => k.key === trashKind)?.label.toLowerCase()}`}
                </strong>
                <span>Deleted notes, images, projects and tasks wait here until you empty it.</span>
              </div>
            )}
            {trash.map((t) => {
              const key = `${t.kind}:${t.id}`;
              return (
                <div
                  key={key}
                  className={`st-row ${selected.has(key) ? "sel" : ""}`}
                  data-id={key}
                  onClick={(e) => pick(e, key)}
                  onContextMenu={(e) => openMenu(e, "trash", key)}
                >
                  <span className="st-icon">
                    {t.kind === "note" ? (
                      <FileText size={15} strokeWidth={2} />
                    ) : t.kind === "project" ? (
                      <Mountain size={15} strokeWidth={2} />
                    ) : t.kind === "task" ? (
                      <ListChecks size={15} strokeWidth={2} />
                    ) : (
                      <ImageIcon size={15} strokeWidth={2} />
                    )}
                  </span>
                  <span className="st-name">{t.title}</span>
                  <span className="st-use st-dim">
                    {t.kind === "note"
                      ? "Note"
                      : t.kind === "project"
                        ? `Project · ${t.detail}`
                        : t.kind === "task"
                          ? t.detail
                            ? `Task · ${t.detail}`
                            : "Task"
                          : "Image"}
                  </span>
                  <span className="st-date">{fmtDate(t.modified)}</span>
                  <span className="st-size">{fmtBytes(t.bytes)}</span>
                  <button
                    className="st-btn small"
                    onClick={(e) => {
                      e.stopPropagation();
                      restoreTrash([key]);
                    }}
                  >
                    Restore
                  </button>
                  <ConfirmButton
                    id={`row:${key}`}
                    armed={armed}
                    setArmed={setArmed}
                    small
                    label="Delete forever"
                    confirmLabel="Click again"
                    onConfirm={() => deleteForever([key])}
                  />
                </div>
              );
            })}
          </div>
        </>
      )}

      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems(menu)} onClose={closeMenu} />}

      {preview !== null && section === "images" && (
        <ImagePreview
          images={images}
          index={Math.min(preview, images.length - 1)}
          setIndex={setPreview}
          srcFor={srcFor}
          onClose={closePreview}
          onTrash={trashFromPreview}
          onOpenNote={(n) => {
            setPreview(null);
            openFromHere(n);
          }}
        />
      )}
    </div>
  );
}
