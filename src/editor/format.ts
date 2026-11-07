import { EditorSelection } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

/* Markdown formatting commands for the selection toolbar. Each one toggles:
   applying it to already-formatted text removes the formatting. */

/** Wrap each selection in `mark` (e.g. `**`), or unwrap it if it already is
    — whether the marks sit just outside the selection or inside its edges.
    A bare caret inside a word acts on that word. */
export function toggleWrap(view: EditorView, mark: string) {
  const { state } = view;
  const n = mark.length;
  view.dispatch(
    state.changeByRange((sel) => {
      const word = sel.empty ? state.wordAt(sel.head) : null;
      const r = word ?? sel;
      const outside =
        state.sliceDoc(r.from - n, r.from) === mark && state.sliceDoc(r.to, r.to + n) === mark;
      if (outside) {
        return {
          changes: [
            { from: r.from - n, to: r.from },
            { from: r.to, to: r.to + n },
          ],
          range: EditorSelection.range(r.from - n, r.to - n),
        };
      }
      const text = state.sliceDoc(r.from, r.to);
      if (text.length >= 2 * n && text.startsWith(mark) && text.endsWith(mark)) {
        return {
          changes: { from: r.from, to: r.to, insert: text.slice(n, -n) },
          range: EditorSelection.range(r.from, r.to - 2 * n),
        };
      }
      return {
        changes: [
          { from: r.from, insert: mark },
          { from: r.to, insert: mark },
        ],
        range: EditorSelection.range(r.from + n, r.to + n),
      };
    }),
    { userEvent: "input.format" },
  );
  view.focus();
}

/** Toggle a `==highlight==` (rendered by editor/highlight.ts). */
export const toggleHighlight = (view: EditorView) => toggleWrap(view, "==");

/** Apply `edit` to the start of every line the selection touches. */
function editLines(view: EditorView, edit: (text: string) => { cut: number; insert: string }) {
  const { state } = view;
  const changes = [];
  const seen = new Set<number>();
  for (const r of state.selection.ranges) {
    for (let pos = r.from; pos <= r.to; ) {
      const line = state.doc.lineAt(pos);
      if (!seen.has(line.number)) {
        seen.add(line.number);
        const { cut, insert } = edit(line.text);
        changes.push({ from: line.from, to: line.from + cut, insert });
      }
      pos = line.to + 1;
    }
  }
  view.dispatch({ changes, userEvent: "input.format" });
  view.focus();
}

/** Toggle `## ` on the selected lines (any existing heading level is removed). */
export function toggleHeading(view: EditorView) {
  editLines(view, (text) => {
    const m = /^#{1,6}\s+/.exec(text);
    return m ? { cut: m[0].length, insert: "" } : { cut: 0, insert: "## " };
  });
}

/** Toggle `- [ ] ` on the selected lines; a plain `- ` bullet becomes a task. */
export function toggleTask(view: EditorView) {
  editLines(view, (text) => {
    const task = /^(\s*)- \[[ xX]\] /.exec(text);
    if (task) return { cut: task[0].length, insert: task[1] };
    const bullet = /^(\s*)[-*+] /.exec(text);
    if (bullet) return { cut: bullet[0].length, insert: `${bullet[1]}- [ ] ` };
    const indent = /^\s*/.exec(text)![0];
    return { cut: indent.length, insert: `${indent}- [ ] ` };
  });
}

/** `[selection](url)` with `url` selected, ready to paste over. */
export function insertLink(view: EditorView) {
  const { state } = view;
  view.dispatch(
    state.changeByRange((r) => {
      const text = state.sliceDoc(r.from, r.to);
      const insert = `[${text}](url)`;
      const urlFrom = r.from + text.length + 3;
      return {
        changes: { from: r.from, to: r.to, insert },
        range: EditorSelection.range(urlFrom, urlFrom + 3),
      };
    }),
    { userEvent: "input.format" },
  );
  view.focus();
}
