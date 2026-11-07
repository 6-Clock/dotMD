import { RangeSetBuilder, StateEffect } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  hoverTooltip,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";
import type { Completion, CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import * as api from "../api";
import { SCRATCH } from "../api";
import { useStore } from "../store";
import { isConcealed, revealedLines, viewingField } from "./conceal";

/* `[[note name]]` / `[[note name|label]]` links between notes (links.rs on
   the Rust side). Styled view shows just the name (or label) as a link off
   the active line; clicking opens the note, creating it if it doesn't exist.
   Hover shows a preview card; typing `[[` (or `/con`) opens a note picker. */

const LINK_RE = /\[\[([^[\]\n|]+)(?:\|([^[\]\n]+))?\]\]/g;

/** Re-check link targets (dispatched when the notes list changes). */
export const refreshLinks = StateEffect.define<null>();

function noteNames(): string[] {
  return useStore.getState().notes.map((n) => n.name);
}

/** The real note name for a link target (case-insensitive, like the disk). */
function resolve(target: string): string | null {
  const t = target.trim().toLowerCase();
  if (t === SCRATCH) return t;
  return noteNames().find((n) => n.toLowerCase() === t) ?? null;
}

const hidden = Decoration.replace({});
const bracket = Decoration.mark({ class: "cm-wikilink-bracket" });

function build(view: EditorView): DecorationSet {
  const { state } = view;
  const styled = isConcealed(state);
  const active = revealedLines(state);
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    const text = state.doc.sliceString(from, to);
    for (const m of text.matchAll(LINK_RE)) {
      const start = from + m.index!;
      const end = start + m[0].length;
      const target = m[1];
      const textFrom = m[2] ? start + 2 + target.length + 1 : start + 2;
      const textTo = end - 2;
      const conceal = styled && !active.has(state.doc.lineAt(start).number);
      const mark = Decoration.mark({
        class: resolve(target) ? "cm-wikilink" : "cm-wikilink missing",
        attributes: { "data-note": target.trim() },
      });
      builder.add(start, textFrom, conceal ? hidden : bracket);
      builder.add(textFrom, textTo, mark);
      builder.add(textTo, end, conceal ? hidden : bracket);
    }
  }
  return builder.finish();
}

const linkDecorations = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = build(view);
    }
    update(u: ViewUpdate) {
      const refreshed = u.transactions.some((t) => t.effects.length > 0);
      if (u.docChanged || u.viewportChanged || u.selectionSet || refreshed) {
        this.decorations = build(u.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

/** Open (or create) the note a link points at. */
export async function followLink(target: string) {
  const st = useStore.getState();
  const name = resolve(target);
  if (name) {
    await st.openNote(name);
    return;
  }
  await st.newNote(target.trim()).catch((e) => console.error("create linked note failed", e));
}

// Styled view: a plain click on a link (off the line being edited) follows it.
// Raw view, or the active line: Ctrl/Cmd+click, so the text stays editable.
const linkClicks = EditorView.domEventHandlers({
  mousedown(event, view) {
    if (event.button !== 0) return false;
    const el = (event.target as HTMLElement).closest<HTMLElement>(".cm-wikilink");
    if (!el?.dataset.note) return false;
    const pos = view.posAtDOM(el);
    const onActive =
      !view.state.field(viewingField) &&
      view.state.doc.lineAt(view.state.selection.main.head).number === view.state.doc.lineAt(pos).number;
    const plain = isConcealed(view.state) && !onActive;
    if (!plain && !(event.ctrlKey || event.metaKey)) return false;
    event.preventDefault();
    followLink(el.dataset.note);
    return true;
  },
});

/** First lines of a note as plain-ish text for the hover card. */
function excerpt(md: string): string {
  return md
    .split("\n")
    .map((l) => l.replace(/^#{1,6}\s+|^\s*[-*+]\s+(\[[ xX]\]\s+)?|^>\s?/g, "").trim())
    .filter(Boolean)
    .slice(0, 6)
    .join("\n")
    .replace(/[*_`~]/g, "")
    .slice(0, 360);
}

const linkHover = hoverTooltip(
  (view, pos) => {
    const line = view.state.doc.lineAt(pos);
    for (const m of line.text.matchAll(LINK_RE)) {
      const from = line.from + m.index!;
      const to = from + m[0].length;
      if (pos < from || pos > to) continue;
      const target = m[1].trim();
      return {
        pos: from,
        end: to,
        above: true,
        create: () => {
          const dom = document.createElement("div");
          dom.className = "link-preview";
          const title = document.createElement("div");
          title.className = "link-preview-title";
          const body = document.createElement("div");
          body.className = "link-preview-body";
          const name = resolve(target);
          title.textContent = name === SCRATCH ? "Untitled" : (name ?? target);
          if (!name) {
            body.textContent = "No note yet. Click to create it.";
            dom.classList.add("missing");
          } else {
            body.textContent = "…";
            api
              .readNote(name)
              .then((md) => (body.textContent = excerpt(md) || "Empty note"))
              .catch(() => (body.textContent = ""));
          }
          dom.append(title, body);
          return { dom };
        },
      };
    }
    return null;
  },
  { hoverTime: 400 },
);

/** Autocomplete inside `[[…`: existing notes, plus "Create" for a new name. */
export function linkSource(context: CompletionContext): CompletionResult | null {
  const m = context.matchBefore(/\[\[[^[\]\n|]*/);
  if (!m) return null;
  const from = m.from + 2;
  const query = context.state.sliceDoc(from, context.pos).trim();
  const current = useStore.getState().currentNote;
  // Consume a `]]` already sitting after the caret so we don't double it.
  const closeTo = context.state.sliceDoc(context.pos, context.pos + 2) === "]]" ? context.pos + 2 : context.pos;
  const pick = (name: string) => (view: EditorView, _c: Completion, f: number) => {
    const insert = `${name}]]`;
    view.dispatch({ changes: { from: f, to: closeTo, insert }, selection: { anchor: f + insert.length } });
  };
  const options: Completion[] = noteNames()
    .filter((n) => n !== current)
    .map((n) => ({ label: n, type: "text", apply: pick(n) }));
  if (query && !resolve(query)) {
    options.push({ label: query, detail: "Create note", type: "keyword", boost: -50, apply: pick(query) });
  }
  return { from, to: context.pos, options, filter: true };
}

export const wikiLinks = [linkDecorations, linkClicks, linkHover];
