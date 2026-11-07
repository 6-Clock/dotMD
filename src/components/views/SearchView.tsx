import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { useStore } from "../../store";
import { Eyes } from "../Eyes";
import * as api from "../../api";
import { focusEditor } from "../Editor";
import { PanelHeader } from "../PanelHeader";

export function SearchView() {
  const openNote = useStore((s) => s.openNote);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<api.SearchHit[]>([]);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current);
    if (!query.trim()) {
      setHits([]);
      return;
    }
    timer.current = window.setTimeout(async () => {
      setHits(await api.searchNotes(query).catch(() => []));
    }, 120);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [query]);

  return (
    <div className="search-view">
      <PanelHeader title="Search" sub={query.trim() ? `${hits.length} ${hits.length === 1 ? "match" : "matches"}` : undefined} />
      <div className="search-field">
        <Search size={15} strokeWidth={2} />
        <input
          autoFocus
          value={query}
          placeholder="Search all notes"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") focusEditor();
          }}
        />
        {query && (
          <button className="search-clear" title="Clear" onClick={() => setQuery("")}>
            <X size={11} strokeWidth={3} />
          </button>
        )}
      </div>
      <div className="files-list">
        {hits.length > 0 && (
          <div className="list-group">
            {hits.map((h) => (
              <div
                key={`${h.name}:${h.line}`}
                className="note-row"
                onClick={async () => {
                  await openNote(h.name);
                  focusEditor();
                }}
              >
                <div className="note-text">
                  <span className="note-name wrap">{h.snippet}</span>
                  <span className="note-meta">
                    <span className="note-when">{h.name}</span>
                    <span className="note-title">Line {h.line}</span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
        {query.trim() && hits.length === 0 && (
          <div className="list-empty">
            <Eyes />
            <strong>No results</strong>
            <span>Nothing matches “{query.trim()}”.</span>
          </div>
        )}
        {!query.trim() && (
          <div className="list-empty">
            <span>Full-text search across every note. Untitled isn't included.</span>
          </div>
        )}
      </div>
    </div>
  );
}
