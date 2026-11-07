import { useEffect, useMemo, useState } from "react";
import { EditorView } from "@codemirror/view";
import { useStore } from "../store";
import * as api from "../api";
import { displayName } from "./TitleBar";

export type Heading = { level: number; text: string; line: number };

/** Headings outside code fences, with inline markers stripped. */
export function headingsOf(md: string): Heading[] {
  const out: Heading[] = [];
  let fence = false;
  md.split("\n").forEach((raw, i) => {
    if (/^\s*(```|~~~)/.test(raw)) fence = !fence;
    if (fence) return;
    const m = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(raw);
    if (!m) return;
    const text = m[2].replace(/\[\[([^\]|]+)\|?([^\]]*)\]\]/g, (_, n, l) => l || n).replace(/[*_`~]/g, "");
    if (text.trim()) out.push({ level: m[1].length, text: text.trim(), line: i + 1 });
  });
  return out;
}

/** Right margin beside the page: Outline (headings, current section lit,
    click to jump) and Linked from (backlinks). Parts hide when empty; the
    whole rail hides on narrow windows (CSS container query). */
export function NoteRail({
  view,
  headings,
  caretLine,
  onPresence,
}: {
  view: EditorView | null;
  headings: Heading[];
  caretLine: number;
  /** Tells the layout whether the rail has anything to show. */
  onPresence: (shown: boolean) => void;
}) {
  const currentNote = useStore((s) => s.currentNote);
  const notes = useStore((s) => s.notes);
  const openNote = useStore((s) => s.openNote);
  const [links, setLinks] = useState<api.SearchHit[]>([]);

  // Refetch on note switch and whenever the notes list refreshes (saves).
  useEffect(() => {
    let live = true;
    if (!currentNote) return setLinks([]);
    api
      .backlinks(currentNote)
      .then((hits) => live && setLinks(hits))
      .catch(() => live && setLinks([]));
    return () => {
      live = false;
    };
  }, [currentNote, notes]);

  // One row per linking note (first linking line as its snippet).
  const linkedFrom = useMemo(() => {
    const seen = new Map<string, api.SearchHit>();
    for (const h of links) if (!seen.has(h.name)) seen.set(h.name, h);
    return [...seen.values()];
  }, [links]);

  // The section the caret is in: the last heading at or above it.
  const currentIdx = useMemo(() => {
    let idx = -1;
    headings.forEach((h, i) => {
      if (h.line <= caretLine) idx = i;
    });
    return idx;
  }, [headings, caretLine]);

  const shown = headings.length > 0 || linkedFrom.length > 0;
  useEffect(() => onPresence(shown), [shown, onPresence]);

  const minLevel = Math.min(...headings.map((h) => h.level), 6);

  const jump = (h: Heading) => {
    if (!view) return;
    const pos = view.state.doc.line(Math.min(h.line, view.state.doc.lines)).from;
    view.dispatch({
      selection: { anchor: pos },
      effects: EditorView.scrollIntoView(pos, { y: "start", yMargin: 80 }),
    });
    view.focus();
  };

  if (!shown) return null;

  return (
    <aside className="note-rail" aria-label="Note outline">
      {headings.length > 0 && (
        <section>
          <h2 className="rail-title">Outline</h2>
          <ul className="outline">
            {headings.map((h, i) => (
              <li key={`${h.line}:${h.text}`}>
                <button
                  className={`outline-item ${i === currentIdx ? "current" : ""}`}
                  style={{ paddingLeft: 8 + (h.level - minLevel) * 12 }}
                  onClick={() => jump(h)}
                  title={h.text}
                >
                  {h.text}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {linkedFrom.length > 0 && (
        <section>
          <h2 className="rail-title">Linked from</h2>
          <ul className="backlinks">
            {linkedFrom.map((h) => (
              <li key={h.name}>
                <button className="backlink" onClick={() => openNote(h.name)}>
                  <span className="backlink-name">{displayName(h.name)}</span>
                  <span className="backlink-snippet">{h.snippet}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  );
}
