import { RangeSetBuilder } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";

// `#tag` at a word boundary, starting with a letter. The capture group 1 is the
// leading boundary char (or empty at line start) so we can offset to the `#`.
// Mirrors the Rust `extract_tags` rule so the editor and Files filter agree.
export const TAG_RE = /(^|[\s([])#([A-Za-z][\w-]*)/g;

const tagMark = Decoration.mark({ class: "cm-tag" });

function build(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to);
    TAG_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = TAG_RE.exec(text))) {
      const start = from + m.index + m[1].length; // the '#'
      const end = start + 1 + m[2].length;
      builder.add(start, end, tagMark);
    }
  }
  return builder.finish();
}

/** Colour `#tag` tokens in the editor regardless of styled/raw view. */
export const tagHighlight = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = build(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged) this.decorations = build(u.view);
    }
  },
  { decorations: (v) => v.decorations },
);
