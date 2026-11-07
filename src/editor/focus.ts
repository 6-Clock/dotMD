import { Compartment, EditorState, type Extension, RangeSetBuilder } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";

/* Focus mode: the paragraph under the caret (contiguous non-blank lines) gets
   `cm-focus-para`; CSS fades every other line while the editor root carries
   `.focus-mode`. Typewriter: caret-moving keyboard transactions also scroll
   the caret to the vertical centre. Both live in compartments so Settings can
   flip them without rebuilding the editor. */

const focusLine = Decoration.line({ class: "cm-focus-para" });

function paragraph(view: EditorView): DecorationSet {
  const { doc } = view.state;
  const head = doc.lineAt(view.state.selection.main.head);
  const builder = new RangeSetBuilder<Decoration>();
  if (!head.text.trim()) {
    builder.add(head.from, head.from, focusLine);
    return builder.finish();
  }
  let first = head.number;
  let last = head.number;
  while (first > 1 && doc.line(first - 1).text.trim()) first--;
  while (last < doc.lines && doc.line(last + 1).text.trim()) last++;
  for (let n = first; n <= last; n++) {
    const line = doc.line(n);
    builder.add(line.from, line.from, focusLine);
  }
  return builder.finish();
}

const focusParagraph = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = paragraph(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.selectionSet) this.decorations = paragraph(u.view);
    }
  },
  { decorations: (v) => v.decorations },
);

const focusExt: Extension = [focusParagraph, EditorView.editorAttributes.of({ class: "focus-mode" })];

// Pointer selections are left alone: a click shouldn't yank the page.
const typewriterExt = EditorState.transactionExtender.of((tr) => {
  if (!tr.selection && !tr.docChanged) return null;
  if (!tr.isUserEvent("input") && !tr.isUserEvent("delete") && !tr.isUserEvent("select")) return null;
  if (tr.isUserEvent("select.pointer")) return null;
  return { effects: EditorView.scrollIntoView(tr.newSelection.main.head, { y: "center" }) };
});

export const focusCompartment = new Compartment();
export const typewriterCompartment = new Compartment();

export const focusFor = (on: boolean) => (on ? focusExt : []);
export const typewriterFor = (on: boolean) => (on ? typewriterExt : []);
