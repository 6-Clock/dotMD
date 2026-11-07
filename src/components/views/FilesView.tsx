import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, MoreHorizontal, RotateCcw, Search, Trash2, ChevronRight, X } from "lucide-react";
import { useStore } from "../../store";
import { Eyes } from "../Eyes";
import { SCRATCH, type NoteMeta } from "../../api";
import { focusEditor } from "../Editor";
import { ContextMenu, type MenuItem } from "../ContextMenu";
import { subjectStyle } from "../../subjects";

const DAY = 86_400_000;

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** Recency bucket for a modified time (rendered as a small ruled label). */
function sectionOf(secs: number, today: number): string {
  const t = secs * 1000;
  if (t >= today) return "Today";
  if (t >= today - DAY) return "Yesterday";
  if (t >= today - 7 * DAY) return "This week";
  if (t >= today - 30 * DAY) return "This month";
  const d = new Date(t);
  if (d.getFullYear() === new Date(today).getFullYear())
    return d.toLocaleDateString(undefined, { month: "long" });
  return String(d.getFullYear());
}

/** Compact right-column stamp: time today, weekday this week, else a short date. */
function fmtWhen(secs: number, today: number): string {
  if (!secs) return "";
  const d = new Date(secs * 1000);
  const t = d.getTime();
  if (t >= today) return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (t >= today - 6 * DAY) return d.toLocaleDateString(undefined, { weekday: "short" });
  if (d.getFullYear() === new Date(today).getFullYear())
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

const isProtected = (name: string) => name === SCRATCH;

export function FilesView() {
  const notes = useStore((s) => s.notes);
  const currentNote = useStore((s) => s.currentNote);
  const openNote = useStore((s) => s.openNote);
  const newNote = useStore((s) => s.newNote);
  const removeNote = useStore((s) => s.removeNote);
  const removeNotes = useStore((s) => s.removeNotes);
  const duplicateNote = useStore((s) => s.duplicateNote);
  const revealNote = useStore((s) => s.revealNote);
  const renameNote = useStore((s) => s.renameNote);
  const tags = useStore((s) => s.tags);
  const activeTag = useStore((s) => s.activeTag);
  const setActiveTag = useStore((s) => s.setActiveTag);
  const trash = useStore((s) => s.trash);
  const restoreNote = useStore((s) => s.restoreNote);
  const projects = useStore((s) => s.projects);
  const subjectColors = useStore((s) => s.settings?.subject_colors);
  const linkNote = useStore((s) => s.linkNote);
  const unlinkNote = useStore((s) => s.unlinkNote);

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameTo, setRenameTo] = useState("");
  const [showTrash, setShowTrash] = useState(false);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; names: string[] } | null>(null);
  // Second menu: "Add to project…" → the project list, ✓ = every name is in it.
  const [projMenu, setProjMenu] = useState<{ x: number; y: number; names: string[] } | null>(null);

  // note -> the projects it belongs to, for the row's colour dots.
  const noteProjects = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const p of projects) for (const n of p.notes) m.set(n, [...(m.get(n) ?? []), p.name]);
    return m;
  }, [projects]);

  const projectItems = (names: string[]): MenuItem[] =>
    projects.length === 0
      ? [{ label: "No projects yet", disabled: true }]
      : projects.map((p) => {
          const all = names.every((n) => p.notes.includes(n));
          return {
            label: all ? `✓ ${p.name}` : p.name,
            onClick: () => names.forEach((n) => (all ? unlinkNote(p.name, n) : linkNote(p.name, n))),
          };
        });
  const toProjects = (names: string[]): MenuItem => ({
    label: "Add to project…",
    onClick: () => menu && setTimeout(() => setProjMenu({ x: menu.x, y: menu.y, names }), 0),
  });

  // note -> its #tags, for the row subtitle.
  const noteTags = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const t of tags) for (const n of t.notes) m.set(n, [...(m.get(n) ?? []), t.tag]);
    return m;
  }, [tags]);

  // Tag filter + name filter, newest first. This order is also the range order
  // for Shift-click, so it has to match what's rendered.
  const visibleNotes = useMemo(() => {
    const tagNotes = activeTag
      ? new Set(tags.find((t) => t.tag === activeTag)?.notes ?? [])
      : null;
    const q = filter.trim().toLowerCase();
    return notes
      .filter((n) => !tagNotes || tagNotes.has(n.name))
      .filter((n) => !q || n.name.toLowerCase().includes(q) || n.title.toLowerCase().includes(q))
      .sort((a, b) => b.modified - a.modified);
  }, [notes, tags, activeTag, filter]);

  const today = startOfDay(new Date());
  const sections = useMemo(() => {
    const out: { label: string; items: NoteMeta[] }[] = [];
    for (const n of visibleNotes) {
      const label = sectionOf(n.modified, today);
      const last = out[out.length - 1];
      if (last && last.label === label) last.items.push(n);
      else out.push({ label, items: [n] });
    }
    return out;
  }, [visibleNotes, today]);

  const commitNew = async () => {
    const n = newName.trim();
    setCreating(false);
    setNewName("");
    if (n) {
      await newNote(n);
      focusEditor();
    }
  };

  const startRename = (name: string) => {
    setRenaming(name);
    setRenameTo(name);
  };

  const commitRename = async (from: string) => {
    const to = renameTo.trim();
    setRenaming(null);
    if (to && to !== from) await renameNote(from, to);
  };

  const selectRange = (from: string, to: string) => {
    const names = visibleNotes.map((n) => n.name);
    const i = names.indexOf(from);
    const j = names.indexOf(to);
    if (i < 0 || j < 0) return;
    const [a, b] = i < j ? [i, j] : [j, i];
    setSelected(new Set(names.slice(a, b + 1)));
  };

  const onRowClick = (e: React.MouseEvent, name: string) => {
    if (renaming) return;
    if (e.metaKey || e.ctrlKey) {
      setSelected((prev) => {
        const s = new Set(prev);
        s.has(name) ? s.delete(name) : s.add(name);
        return s;
      });
      setAnchor(name);
    } else if (e.shiftKey && anchor) {
      selectRange(anchor, name);
    } else {
      setSelected(new Set([name]));
      setAnchor(name);
      openNote(name);
    }
  };

  // Build the menu for either a multi-selection or a single row.
  const menuItems = (names: string[]): MenuItem[] => {
    if (names.length > 1) {
      const deletable = names.filter((n) => !isProtected(n));
      return [
        toProjects(deletable),
        { label: "-" },
        {
          label: `Delete ${deletable.length} notes`,
          danger: true,
          disabled: deletable.length === 0,
          onClick: () => {
            removeNotes(deletable);
            setSelected(new Set());
          },
        },
      ];
    }
    const name = names[0];
    if (isProtected(name)) {
      return [
        { label: "Open", onClick: () => openNote(name, "pin") },
        { label: "Duplicate", onClick: () => duplicateNote(name) },
        { label: "Reveal in file explorer", onClick: () => revealNote(name) },
      ];
    }
    return [
      { label: "Open", onClick: () => openNote(name, "pin") },
      { label: "Rename", onClick: () => startRename(name) },
      { label: "Duplicate", onClick: () => duplicateNote(name) },
      { label: "Reveal in file explorer", onClick: () => revealNote(name) },
      toProjects([name]),
      { label: "-" },
      { label: "Delete", danger: true, onClick: () => removeNote(name) },
    ];
  };

  const openMenu = (e: React.MouseEvent, name: string) => {
    e.preventDefault();
    e.stopPropagation();
    // Act on the whole selection if this row is part of a multi-selection,
    // otherwise select just this row.
    let names: string[];
    if (selected.has(name) && selected.size > 1) {
      names = [...selected];
    } else {
      setSelected(new Set([name]));
      setAnchor(name);
      names = [name];
    }
    setMenu({ x: e.clientX, y: e.clientY, names });
  };

  // F2 = rename, Delete = delete selection. Window-level so it works without a
  // focused row; ignored while typing or when the context menu is open.
  const selRef = useRef(selected);
  selRef.current = selected;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (menu) return;
      const sel = [...selRef.current];
      if (e.key === "F2" && sel.length === 1 && !isProtected(sel[0])) {
        e.preventDefault();
        startRename(sel[0]);
      } else if (e.key === "Delete" && sel.length) {
        const del = sel.filter((n) => !isProtected(n));
        if (del.length) {
          e.preventDefault();
          removeNotes(del);
          setSelected(new Set());
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu, removeNotes]);

  const count = visibleNotes.length;

  return (
    <div className="files-view">
      <header className="files-head">
        <h1>Files</h1>
        <span className="files-count" aria-label={`${notes.length} notes`}>
          {notes.length}
        </span>
        <button className="files-new" title="New note" onClick={() => setCreating(true)}>
          <Plus size={14} strokeWidth={2.4} />
          New
        </button>
      </header>

      <div className="search-field">
        <Search size={15} strokeWidth={2} />
        <input
          value={filter}
          placeholder="Filter notes"
          onChange={(e) => setFilter(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setFilter("");
              focusEditor();
            }
          }}
        />
        {filter && (
          <button className="search-clear" title="Clear" onClick={() => setFilter("")}>
            <X size={11} strokeWidth={3} />
          </button>
        )}
      </div>

      {tags.length > 0 && (
        <div className="tag-row">
          {tags.map((t) => (
            <button
              key={t.tag}
              className={`tag-chip ${activeTag === t.tag ? "active" : ""}`}
              onClick={() => setActiveTag(t.tag)}
            >
              #{t.tag}
              <span className="tag-count">{t.notes.length}</span>
            </button>
          ))}
        </div>
      )}

      <div className="files-list">
        {creating && (
          <div className="list-group">
            <input
              className="row-input"
              autoFocus
              value={newName}
              placeholder="New note name"
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitNew();
                if (e.key === "Escape") {
                  setCreating(false);
                  setNewName("");
                }
              }}
              onBlur={commitNew}
            />
          </div>
        )}

        {sections.map((sec) => (
          <section key={sec.label}>
            <h2 className="list-section">{sec.label}</h2>
            <div className="list-group">
              {sec.items.map((n) => {
                const active = n.name === currentNote;
                const isSel = selected.has(n.name);
                const rowTags = noteTags.get(n.name) ?? [];
                return (
                  <div
                    key={n.name}
                    className={`note-row ${active ? "active" : ""} ${isSel ? "selected" : ""}`}
                    onClick={(e) => (renaming === n.name ? undefined : onRowClick(e, n.name))}
                    onDoubleClick={() => renaming !== n.name && openNote(n.name, "pin")}
                    onContextMenu={(e) => openMenu(e, n.name)}
                  >
                    {renaming === n.name ? (
                      <input
                        className="row-input"
                        autoFocus
                        value={renameTo}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setRenameTo(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitRename(n.name);
                          if (e.key === "Escape") setRenaming(null);
                        }}
                        onBlur={() => commitRename(n.name)}
                      />
                    ) : (
                      <>
                        <span className="note-name" title={n.title && n.title !== n.name ? n.title : undefined}>
                          {n.name}
                        </span>
                        {(noteProjects.get(n.name) ?? []).slice(0, 3).map((p) => (
                          <span
                            key={p}
                            className="note-proj"
                            style={subjectStyle(p, subjectColors)}
                            title={`In project ${p}`}
                          />
                        ))}
                        {rowTags[0] && <span className="note-tag">#{rowTags[0]}</span>}
                        {/* The stamp and the ⋯ share one slot; hover swaps them. */}
                        <span className="note-end">
                          <span className="note-when">{fmtWhen(n.modified, today)}</span>
                          <button
                            className="row-more"
                            title="Actions"
                            aria-label={`Actions for ${n.name}`}
                            onClick={(e) => openMenu(e, n.name)}
                          >
                            <MoreHorizontal size={15} />
                          </button>
                        </span>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}

        {count === 0 && !creating && (
          <div className="list-empty">
            <Eyes />
            {filter || activeTag ? (
              <>
                <strong>No results</strong>
                <span>No notes match {filter ? `“${filter.trim()}”` : `#${activeTag}`}.</span>
              </>
            ) : (
              <>
                <strong>No notes yet</strong>
                <span>Write in Untitled and press Ctrl+Enter to file it here.</span>
              </>
            )}
          </div>
        )}

      </div>

      {trash.length > 0 && (
        <footer className={`files-foot ${showTrash ? "open" : ""}`}>
          {showTrash && (
            <div className="trash-list">
              {trash.map((n) => (
                <div className="note-row trash-row" key={n.name}>
                  <span className="note-name">{n.title}</span>
                  <button className="restore-btn" title="Restore" onClick={() => restoreNote(n.name)}>
                    <RotateCcw size={12} strokeWidth={2.2} /> Restore
                  </button>
                </div>
              ))}
            </div>
          )}
          <button
            className="trash-toggle"
            onClick={() => setShowTrash((v) => !v)}
            aria-expanded={showTrash}
          >
            <Trash2 size={14} strokeWidth={2} />
            <span className="trash-label">Trash</span>
            <span className="trash-count">{trash.length}</span>
            <ChevronRight className="trash-chevron" size={14} strokeWidth={2.2} />
          </button>
        </footer>
      )}

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems(menu.names)}
          onClose={() => setMenu(null)}
        />
      )}
      {projMenu && (
        <ContextMenu
          x={projMenu.x}
          y={projMenu.y}
          items={projectItems(projMenu.names)}
          onClose={() => setProjMenu(null)}
        />
      )}
    </div>
  );
}
