import { useMemo, useState } from "react";
import { FileText } from "lucide-react";
import { useStore } from "../store";
import { focusEditor } from "./Editor";

export function NoteSwitcher() {
  const notes = useStore((s) => s.notes);
  const openNote = useStore((s) => s.openNote);
  const newNote = useStore((s) => s.newNote);
  const setOverlay = useStore((s) => s.setOverlay);

  const [query, setQuery] = useState("");
  const [sel, setSel] = useState(0);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      notes.filter(
        (n) => n.name.toLowerCase().includes(q) || n.title.toLowerCase().includes(q),
      ),
    [notes, q],
  );

  const exact = notes.some((n) => n.name.toLowerCase() === q);
  const canCreate = q.length > 0 && !exact;

  const close = () => {
    setOverlay("none");
    focusEditor();
  };

  const choose = async (i: number) => {
    if (canCreate && i === filtered.length) {
      await newNote(query.trim());
    } else if (filtered[i]) {
      await openNote(filtered[i].name);
    }
    focusEditor();
  };

  const rowCount = filtered.length + (canCreate ? 1 : 0);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((i) => Math.min(rowCount - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(sel);
    }
  };

  return (
    <div className="overlay-backdrop" onMouseDown={close}>
      <div className="overlay" onMouseDown={(e) => e.stopPropagation()}>
        <div className="overlay-search">
          <FileText size={19} strokeWidth={1.9} />
          <input
            autoFocus
            value={query}
            placeholder="Switch or create a note"
            onChange={(e) => {
              setQuery(e.target.value);
              setSel(0);
            }}
            onKeyDown={onKeyDown}
          />
        </div>
        <div className="overlay-list">
          {filtered.map((n, i) => (
            <div
              key={n.name}
              className={`overlay-row ${i === sel ? "selected" : ""}`}
              onMouseEnter={() => setSel(i)}
              onClick={() => choose(i)}
            >
              <span className="primary">{n.name}</span>
              {n.title && n.title !== n.name && (
                <span className="secondary">{n.title}</span>
              )}
            </div>
          ))}
          {canCreate && (
            <div
              className={`overlay-row ${sel === filtered.length ? "selected" : ""}`}
              onMouseEnter={() => setSel(filtered.length)}
              onClick={() => choose(filtered.length)}
            >
              <span className="primary">Create “{query.trim()}”</span>
              <span className="secondary">New note</span>
            </div>
          )}
          {rowCount === 0 && <div className="overlay-empty">No notes.</div>}
        </div>
      </div>
    </div>
  );
}
