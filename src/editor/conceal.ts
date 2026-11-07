import { syntaxTree } from "@codemirror/language";
import { type EditorState, RangeSetBuilder, StateEffect, StateField } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";
import { assetFile } from "./images";

/** Flip the styled ("rendered") view on or off. */
export const setRendered = StateEffect.define<boolean>();

/** Whether Markdown markers are concealed to show a rendered look. */
export const renderedField = StateField.define<boolean>({
  create: () => false,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setRendered)) value = e.value;
    return value;
  },
});

/** Flip Viewing (read-only) mode on or off. */
export const setViewing = StateEffect.define<boolean>();

/** Viewing mode: always concealed, nothing revealed on the caret's line. */
export const viewingField = StateField.define<boolean>({
  create: () => false,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setViewing)) value = e.value;
    return value;
  },
});

/** Whether markers are hidden at all (styled view, or Viewing). */
export const isConcealed = (state: EditorState) =>
  state.field(renderedField) || state.field(viewingField);

/** Line numbers kept raw for editing: the caret's lines (none in Viewing). */
export function revealedLines(state: EditorState): Set<number> {
  const active = new Set<number>();
  if (state.field(viewingField)) return active;
  for (const r of state.selection.ranges) {
    const from = state.doc.lineAt(r.from).number;
    const to = state.doc.lineAt(r.to).number;
    for (let n = from; n <= to; n++) active.add(n);
  }
  return active;
}

// Lezer-Markdown node names for the punctuation we hide in rendered mode:
// `**`/`*`/`_`, `#`, backticks + code-fence info, and `~~`. Hiding
// EmphasisMark covers both bold and italic (strong = two EmphasisMarks).
const CONCEAL = new Set([
  "HeaderMark",
  "EmphasisMark",
  "CodeMark",
  "CodeInfo",
  "StrikethroughMark",
]);

const hidden = Decoration.replace({});

function buildDecorations(view: EditorView): DecorationSet {
  if (!isConcealed(view.state)) return Decoration.none;

  // Keep the line(s) under the cursor raw, so markers reappear while you edit
  // there — the standard live-preview behavior.
  const active = revealedLines(view.state);

  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        // A rendered image (images.ts) hides its whole `![alt](path)` link off
        // the active line; the picture below it stands in for the text.
        if (node.name === "Image") {
          const url = node.node.getChild("URL");
          if (!url || !assetFile(view.state.sliceDoc(url.from, url.to))) return;
          if (!active.has(view.state.doc.lineAt(node.from).number)) {
            builder.add(node.from, node.to, hidden);
          }
          return false;
        }
        if (node.from === node.to || !CONCEAL.has(node.name)) return;
        // Code-fence marks and the info string are block-level: always hide
        // them, even when the caret is on that line — otherwise a stray ```
        // lingers when the cursor rests on the closing fence. Inline marks
        // (bold/italic/heading/inline-code) still reveal on the active line so
        // they stay editable.
        const isFence =
          node.name === "CodeInfo" ||
          (node.name === "CodeMark" && node.matchContext(["FencedCode"]));
        if (!isFence && active.has(view.state.doc.lineAt(node.from).number)) return;
        builder.add(node.from, node.to, hidden);
      },
    });
  }
  return builder.finish();
}

export const conceal = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }
    update(update: ViewUpdate) {
      const toggled = update.transactions.some((t) =>
        t.effects.some((e) => e.is(setRendered) || e.is(setViewing)),
      );
      if (update.docChanged || update.viewportChanged || update.selectionSet || toggled) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);
