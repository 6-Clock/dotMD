import { syntaxTree } from "@codemirror/language";
import { type EditorState, RangeSetBuilder } from "@codemirror/state";
import type { SyntaxNode } from "@lezer/common";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";
import { isConcealed, revealedLines, setRendered, setViewing } from "./conceal";

// `==text==` on one line, not starting or ending with a space (Obsidian-style).
// Lezer-Markdown doesn't parse it, so it's matched by regex like tags.ts.
const HIGHLIGHT_RE = /==(?!\s)([^=\n]+?)(?<!\s)==/g;

const markText = Decoration.mark({ class: "cm-highlight" });
const markMarker = Decoration.mark({ class: "cm-highlight-mark" });
const hidden = Decoration.replace({});

const CODE = new Set(["InlineCode", "FencedCode", "CodeBlock"]);

function inCode(state: EditorState, pos: number) {
  let n: SyntaxNode | null = syntaxTree(state).resolveInner(pos, 1);
  for (; n; n = n.parent) if (CODE.has(n.name)) return true;
  return false;
}

function build(view: EditorView): DecorationSet {
  const { state } = view;
  const conceal = isConcealed(state);
  const active = revealedLines(state);
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    const text = state.doc.sliceString(from, to);
    HIGHLIGHT_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = HIGHLIGHT_RE.exec(text))) {
      const start = from + m.index;
      const end = start + m[0].length;
      if (inCode(state, start)) continue;
      // Markers hide in styled view, except on the line being edited.
      const marker = conceal && !active.has(state.doc.lineAt(start).number) ? hidden : markMarker;
      builder.add(start, start + 2, marker);
      builder.add(start + 2, end - 2, markText);
      builder.add(end - 2, end, marker);
    }
  }
  return builder.finish();
}

/** Render `==highlighted==` text with an accent wash. */
export const highlightMarks = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = build(view);
    }
    update(u: ViewUpdate) {
      const toggled = u.transactions.some((t) =>
        t.effects.some((e) => e.is(setRendered) || e.is(setViewing)),
      );
      if (u.docChanged || u.viewportChanged || u.selectionSet || toggled) {
        this.decorations = build(u.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);
