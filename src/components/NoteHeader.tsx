import { useEffect, useMemo, useRef, useState } from "react";
import { Eye } from "lucide-react";
import { useStore } from "../store";
import * as api from "../api";
import { SCRATCH } from "../api";
import { resolveBindings } from "../actions";
import { TAG_RE } from "../editor/tags";
import { focusEditor } from "./Editor";
import { Eyes } from "./Eyes";

const FIXED_TITLES: Record<string, string> = { [SCRATCH]: "Untitled" };

function wordCount(text: string): number {
  const m = text.trim().match(/\S+/g);
  return m ? m.length : 0;
}

/** "25 October 2026 at 14:30" */
function stamp(secs: number): string {
  const d = new Date(secs * 1000);
  const date = d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return `${date} at ${time}`;
}

/** Top of the page: modified date, the note's name as an editable title, and
    a meta row (words, reading time, tags; the inbox hint on Untitled (scratch)). */
// Set just before a new note opens (Ctrl+N): its title starts focused and
// selected, so typing names it and Enter moves on to the body.
let titlePending = false;
export const editTitleOnOpen = (on = true) => {
  titlePending = on;
};

export function NoteHeader() {
  const currentNote = useStore((s) => s.currentNote);
  const content = useStore((s) => s.content);
  const lastSaved = useStore((s) => s.lastSaved);
  const keybindings = useStore((s) => s.settings?.keybindings);
  const renameNote = useStore((s) => s.renameNote);
  const setActiveTag = useStore((s) => s.setActiveTag);
  const setView = useStore((s) => s.setView);
  const viewing = useStore((s) => !!s.settings?.view_only_notes?.includes(s.currentNote));

  const [modified, setModified] = useState(0);
  const [draft, setDraft] = useState(currentNote);
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement | null>(null);
  const cancelled = useRef(false); // Esc: the blur that follows must not rename

  // Re-read the file time on note switch and after every save.
  useEffect(() => {
    api.noteModified(currentNote).then(setModified).catch(() => setModified(0));
  }, [currentNote, lastSaved]);

  useEffect(() => {
    setDraft(currentNote);
    setError(null);
    if (!titlePending || !currentNote) return;
    titlePending = false;
    requestAnimationFrame(() => {
      titleRef.current?.focus();
      titleRef.current?.select();
    });
  }, [currentNote]);

  useEffect(() => {
    if (!error) return;
    const id = window.setTimeout(() => setError(null), 3200);
    return () => window.clearTimeout(id);
  }, [error]);

  const tags = useMemo(() => {
    const found = new Set<string>();
    for (const m of content.matchAll(TAG_RE)) found.add(m[2]);
    return [...found];
  }, [content]);

  const words = wordCount(content);
  const minutes = Math.max(1, Math.round(words / 230));
  const fixed = FIXED_TITLES[currentNote];

  const commit = async () => {
    const to = cancelled.current ? "" : draft.trim();
    cancelled.current = false;
    if (!to || to === currentNote) {
      setDraft(currentNote);
      return;
    }
    const err = await renameNote(currentNote, to);
    if (err) {
      setError(err.replace(/^Error:\s*/, ""));
      setDraft(currentNote);
    }
  };

  const openTag = (tag: string) => {
    if (useStore.getState().activeTag !== tag) setActiveTag(tag);
    setView("files");
  };

  return (
    <header className="note-header">
      {(modified > 0 || viewing) && (
        <div className="note-date">
          {modified > 0 && stamp(modified)}
          {viewing && (
            <span className="view-badge">
              <Eye size={11} strokeWidth={2.4} />
              View only
            </span>
          )}
        </div>
      )}

      {fixed || viewing ? (
        <h1 className="note-heading">{fixed ?? currentNote}</h1>
      ) : (
        <input
          ref={titleRef}
          className="note-heading"
          value={draft}
          spellCheck={false}
          aria-label="Note name"
          title="Rename note"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              titleRef.current?.blur(); // commits via onBlur
              focusEditor();
            } else if (e.key === "Escape") {
              e.preventDefault();
              cancelled.current = true;
              focusEditor();
            }
          }}
        />
      )}
      {error && <div className="note-error">{error}</div>}

      <div className="note-meta-row">
        <span>
          {words} {words === 1 ? "word" : "words"}
        </span>
        {words > 0 && <span>{minutes} min read</span>}
        {currentNote === SCRATCH && (
          <span className="inbox-hint">
            <Eyes size={17} /> Inbox · <kbd>{resolveBindings(keybindings ?? {}).fileAndClear}</kbd> files this into a note
          </span>
        )}
        {tags.length > 0 && (
          <span className="note-tags">
            {tags.map((t) => (
              <button key={t} className="tag-chip" onClick={() => openTag(t)}>
                #{t}
              </button>
            ))}
          </span>
        )}
      </div>
    </header>
  );
}
