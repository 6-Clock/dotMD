import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { useStore } from "../store";
import * as api from "../api";
import { focusEditor } from "./Editor";

export function SearchOverlay() {
  const openNote = useStore((s) => s.openNote);
  const setOverlay = useStore((s) => s.setOverlay);

  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<api.SearchHit[]>([]);
  const [sel, setSel] = useState(0);
  const timer = useRef<number | null>(null);

  // Debounced full-text search against the Rust backend.
  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current);
    if (!query.trim()) {
      setHits([]);
      return;
    }
    timer.current = window.setTimeout(async () => {
      const res = await api.searchNotes(query).catch(() => []);
      setHits(res);
      setSel(0);
    }, 120);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [query]);

  const close = () => {
    setOverlay("none");
    focusEditor();
  };

  const choose = async (i: number) => {
    if (hits[i]) {
      await openNote(hits[i].name);
      focusEditor();
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((i) => Math.min(hits.length - 1, i + 1));
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
          <Search size={19} strokeWidth={1.9} />
          <input
            autoFocus
            value={query}
            placeholder="Search all notes"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
          />
        </div>
        <div className="overlay-list">
          {hits.map((h, i) => (
            <div
              key={`${h.name}:${h.line}`}
              className={`overlay-row ${i === sel ? "selected" : ""}`}
              onMouseEnter={() => setSel(i)}
              onClick={() => choose(i)}
            >
              <span className="primary">{h.snippet}</span>
              <span className="secondary">
                {h.title || h.name} · line {h.line}
              </span>
            </div>
          ))}
          {query.trim() && hits.length === 0 && (
            <div className="overlay-empty">No matches.</div>
          )}
        </div>
      </div>
    </div>
  );
}
