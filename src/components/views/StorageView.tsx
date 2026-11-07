import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { ChevronLeft, ChevronRight, Eye, FileText, Image as ImageIcon, RotateCcw, Trash2, X } from "lucide-react";
import { useStore } from "../../store";
import * as api from "../../api";
import { SCRATCH } from "../../api";
import { subjectStyle } from "../../subjects";
import { Eyes } from "../Eyes";

type Section = "images" | "notes" | "subjects" | "trash";
type SortKey = "size" | "date" | "name";

const SECTIONS: { key: Section; label: string }[] = [
  { key: "images", label: "Images" },
  { key: "notes", label: "Notes" },
  { key: "subjects", label: "Subjects & tags" },
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
  const storeTrash = useStore((s) => s.trash);
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
  const rootRef = useRef<HTMLDivElement>(null);
  const armTimer = useRef<number | undefined>(undefined);

  const load = useCallback(async () => {
    const r = await api.storageReport().catch(() => null);
    if (r) setReport(r);
  }, []);

  // Fresh numbers on open, and whenever notes / trash / tags change on disk.
  useEffect(() => {
    load();
  }, [load, notesList, storeTrash, tags]);

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

  const images = useMemo(() => {
    const xs = (report?.images ?? []).filter((i) => !unusedOnly || isUnused(i));
    return order(xs, (x) => x.bytes, (x) => x.modified, (x) => x.file);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report, unusedOnly, sort]);
  const notes = useMemo(
    () => order(report?.notes ?? [], (x) => x.bytes, (x) => x.modified, (x) => noteLabel(x.name)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [report, sort],
  );
  const trash = useMemo(
    () => order(report?.trash ?? [], (x) => x.bytes, (x) => x.modified, (x) => x.title),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [report, sort],
  );
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

  const unusedCount = (report?.images ?? []).filter(isUnused).length;
  const imgBytes = sum(report?.images ?? []);
  const noteBytes = sum(report?.notes ?? []);
  const trashBytes = sum(report?.trash ?? []);
  const total = imgBytes + noteBytes + trashBytes;

  // Row ids for the current list, in display order (Shift-click ranges).
  const ids: string[] =
    section === "images"
      ? images.map((i) => i.file)
      : section === "notes"
        ? notes.filter((n) => !n.protected).map((n) => n.name)
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
    return { kind: key.slice(0, i) as "note" | "image", id: key.slice(i + 1) };
  };

  const restoreTrash = async (keys: string[]) => {
    const failed: string[] = [];
    for (const k of keys) {
      const { kind, id } = parseTrashId(k);
      if (kind === "note") await restoreNote(id);
      else await api.restoreImage(id).catch((e) => failed.push(String(e)));
    }
    setSelected(new Set());
    await refreshTrash();
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

  // --- keyboard: 1-4 sections, Ctrl+A all, Delete acts on the selection ------

  const sel = [...selected];
  const keyState = useRef({ section, sel, ids, armed, preview });
  keyState.current = { section, sel, ids, armed, preview };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (useStore.getState().editingTodo !== null) return;
      const { section, sel, ids, armed, preview } = keyState.current;
      if (preview !== null) return; // the viewer owns the keys
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setSelected(new Set(ids));
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const n = Number(e.key);
      if (n >= 1 && n <= 4) {
        e.preventDefault();
        switchTo(SECTIONS[n - 1].key);
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
        else if (section === "trash") {
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
    notes: report?.notes.length ?? 0,
    subjects: subjects.length + tags.length,
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
                  onClick={(e) => pick(e, img.file)}
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
                onClick={(e) => !n.protected && pick(e, n.name)}
                onDoubleClick={() => openFromHere(n.name)}
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

      {section === "subjects" && (
        <div className="st-cols">
          <section>
            <h2 className="cal-label">
              To-do subjects <span className="cal-label-count">{subjects.length}</span>
            </h2>
            <div className="st-list">
              {subjects.length === 0 && <p className="st-empty">No subjects yet.</p>}
              {subjects.map((s) => (
                <div key={s.name} className="st-row static" style={subjectStyle(s.name, colors)}>
                  <span className="st-dot" />
                  <span className="st-name">{s.name}</span>
                  <span className="st-use st-dim">
                    {s.open} open · {s.done} done
                  </span>
                  <button className="st-btn small" onClick={() => unassignSubject(s.name)}>
                    Remove subject
                  </button>
                  <button className="st-btn small danger" onClick={() => deleteSubject(s.name)}>
                    Delete + {s.open + s.done} {s.open + s.done === 1 ? "task" : "tasks"}
                  </button>
                </div>
              ))}
            </div>
          </section>
          <section>
            <h2 className="cal-label">
              Note tags <span className="cal-label-count">{tags.length}</span>
            </h2>
            <div className="st-list">
              {tags.length === 0 && <p className="st-empty">No #tags in your notes.</p>}
              {tags.map((t) => (
                <div key={t.tag} className="st-row static">
                  <span className="st-name">#{t.tag}</span>
                  <span className="st-use st-dim" title={t.notes.join(", ")}>
                    {t.notes.length} {t.notes.length === 1 ? "note" : "notes"}
                  </span>
                  <button className="st-btn small danger" onClick={() => removeTag(t.tag)}>
                    Delete tag
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {section === "trash" && (
        <>
          <div className="st-bar">
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
                <strong>Trash is empty</strong>
                <span>Deleted notes and images wait here until you empty it.</span>
              </div>
            )}
            {trash.map((t) => {
              const key = `${t.kind}:${t.id}`;
              return (
                <div
                  key={key}
                  className={`st-row ${selected.has(key) ? "sel" : ""}`}
                  onClick={(e) => pick(e, key)}
                >
                  <span className="st-icon">
                    {t.kind === "note" ? (
                      <FileText size={15} strokeWidth={2} />
                    ) : (
                      <ImageIcon size={15} strokeWidth={2} />
                    )}
                  </span>
                  <span className="st-name">{t.title}</span>
                  <span className="st-use st-dim">{t.kind === "note" ? "Note" : "Image"}</span>
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
