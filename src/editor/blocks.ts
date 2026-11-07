import { syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import { EditorView, ViewPlugin } from "@codemirror/view";

/* Block handles: hover a block and a ⋮⋮ handle appears in the page's left
   padding. Click → block menu (rendered by Editor.tsx); drag → move the block
   with a drop line showing where it lands. A block is a paragraph (contiguous
   lines), one list item with its indented children, a heading, or a whole
   fenced code block. Every change is one transaction, so Ctrl+Z undoes it. */

/** Inclusive line-number range. */
export type Block = { from: number; to: number };

const LIST_RE = /^(\s*)([-*+]|\d+[.)])\s/;
const HEADING_RE = /^#{1,6}\s/;
const indentOf = (t: string) => /^\s*/.exec(t)![0].length;

export function blockAt(state: EditorState, lineNo: number): Block | null {
  const { doc } = state;
  const line = doc.line(lineNo);
  // Inside a fenced code block: the whole fence.
  const node = syntaxTree(state).resolveInner(line.from, 1);
  for (let n: typeof node | null = node; n; n = n.parent) {
    if (n.name === "FencedCode") {
      return { from: doc.lineAt(n.from).number, to: doc.lineAt(n.to).number };
    }
  }
  if (!line.text.trim()) return null;
  if (HEADING_RE.test(line.text)) return { from: lineNo, to: lineNo };
  if (LIST_RE.test(line.text)) {
    const base = indentOf(line.text);
    let to = lineNo;
    while (to < doc.lines) {
      const next = doc.line(to + 1).text;
      if (!next.trim() || indentOf(next) <= base) break;
      to++;
    }
    return { from: lineNo, to };
  }
  // Paragraph: grow through plain non-blank lines.
  const plain = (t: string) => !!t.trim() && !HEADING_RE.test(t) && !LIST_RE.test(t) && !/^\s*(```|~~~)/.test(t);
  let from = lineNo;
  let to = lineNo;
  while (from > 1 && plain(doc.line(from - 1).text)) from--;
  while (to < doc.lines && plain(doc.line(to + 1).text)) to++;
  return { from, to };
}

/** Delete `b` with its line break (the one after it, or before if last). */
function deletion(state: EditorState, b: Block) {
  const { doc } = state;
  const start = doc.line(b.from).from;
  const end = doc.line(b.to).to;
  return end < doc.length ? { from: start, to: end + 1 } : { from: Math.max(0, start - 1), to: end };
}

export function deleteBlock(view: EditorView, b: Block) {
  view.dispatch({ changes: deletion(view.state, b), userEvent: "delete.block" });
  view.focus();
}

export function duplicateBlock(view: EditorView, b: Block) {
  const { doc } = view.state;
  const text = doc.sliceString(doc.line(b.from).from, doc.line(b.to).to);
  const at = doc.line(b.to).to;
  view.dispatch({
    changes: { from: at, insert: `\n${text}` },
    selection: { anchor: at + 1 },
    userEvent: "input.block",
  });
  view.focus();
}

/** Move block `b` before line `before` (or to the end when past the last line). */
export function moveBlock(view: EditorView, b: Block, before: number) {
  const { state } = view;
  const { doc } = state;
  if (before >= b.from && before <= b.to + 1) return; // lands where it is
  const text = doc.sliceString(doc.line(b.from).from, doc.line(b.to).to);
  const del = deletion(state, b);
  const ins =
    before > doc.lines
      ? { from: doc.length, insert: `\n${text}` }
      : { from: doc.line(before).from, insert: `${text}\n` };
  const changes = [del, ins].sort((x, y) => x.from - y.from);
  view.dispatch({ changes, userEvent: "move.block" });
  view.focus();
}

export type BlockKind = "text" | "h1" | "h2" | "h3" | "bullet" | "todo" | "quote" | "code";

const PREFIX: Record<Exclude<BlockKind, "code">, string> = {
  text: "",
  h1: "# ",
  h2: "## ",
  h3: "### ",
  bullet: "- ",
  todo: "- [ ] ",
  quote: "> ",
};
const MARKER_RE = /^(\s*)(#{1,6}\s+|[-*+]\s+\[[ xX]\]\s+|[-*+]\s+|\d+[.)]\s+|>\s?)?/;

/** Turn a block into another kind (headings take the block's first line). */
export function convertBlock(view: EditorView, b: Block, kind: BlockKind) {
  const { doc } = view.state;
  const from = doc.line(b.from).from;
  const to = doc.line(b.to).to;
  const lines = doc.sliceString(from, to).split("\n");
  const fenced = /^\s*(```|~~~)/.test(lines[0]) && lines.length > 1;
  const body = fenced ? lines.slice(1, /^\s*(```|~~~)/.test(lines[lines.length - 1]) ? -1 : undefined) : lines;
  let out: string;
  if (kind === "code") {
    out = fenced ? lines.join("\n") : ["```", ...body, "```"].join("\n");
  } else {
    const prefix = PREFIX[kind];
    out = body
      .map((l) => {
        const m = MARKER_RE.exec(l)!;
        return `${m[1]}${prefix}${l.slice(m[0].length)}`;
      })
      .join("\n");
  }
  view.dispatch({ changes: { from, to, insert: out }, userEvent: "input.block" });
  view.focus();
}

const GRIP =
  '<svg width="10" height="16" viewBox="0 0 10 16" aria-hidden="true">' +
  [3, 8, 13].map((y) => `<circle cx="2.5" cy="${y}" r="1.4"/><circle cx="7.5" cy="${y}" r="1.4"/>`).join("") +
  "</svg>";

/** The hover handle + drag-to-move. `openMenu` shows the block menu at a
    viewport point (Editor.tsx renders it with ContextMenu). */
export function blockHandles(openMenu: (x: number, y: number, block: Block) => void) {
  return ViewPlugin.fromClass(
    class {
      handle: HTMLDivElement;
      dropLine: HTMLDivElement;
      block: Block | null = null;
      drag: { block: Block; x: number; y: number; moved: boolean; before: number | null } | null = null;

      constructor(readonly view: EditorView) {
        this.handle = document.createElement("div");
        this.handle.className = "cm-block-handle";
        this.handle.innerHTML = GRIP;
        this.handle.title = "Click for options, drag to move";
        this.handle.hidden = true;
        this.dropLine = document.createElement("div");
        this.dropLine.className = "cm-drop-line";
        this.dropLine.hidden = true;
        view.dom.append(this.handle, this.dropLine);

        view.dom.addEventListener("mousemove", this.onHover);
        view.dom.addEventListener("mouseleave", this.onLeave);
        view.contentDOM.addEventListener("keydown", this.onKey);
        this.handle.addEventListener("pointerdown", this.onDown);
      }

      /** Editor-relative y of a document position's line centre. */
      lineMid(pos: number) {
        const c = this.view.coordsAtPos(pos);
        const top = this.view.dom.getBoundingClientRect().top;
        return c ? (c.top + c.bottom) / 2 - top : null;
      }

      blockAtY(clientY: number): Block | null {
        const { view } = this;
        const lb = view.lineBlockAtHeight(clientY - view.documentTop);
        const line = view.state.doc.lineAt(lb.from);
        return blockAt(view.state, line.number);
      }

      show(block: Block) {
        const { view } = this;
        const mid = this.lineMid(view.state.doc.line(block.from).from);
        if (mid == null) return;
        const pad = parseFloat(getComputedStyle(view.contentDOM).paddingLeft) || 0;
        const left = view.contentDOM.getBoundingClientRect().left - view.dom.getBoundingClientRect().left;
        this.block = block;
        this.handle.style.top = `${mid - 12}px`;
        this.handle.style.left = `${left + pad - 26}px`;
        this.handle.hidden = false;
      }

      hide = () => {
        if (this.drag) return;
        this.handle.hidden = true;
        this.block = null;
      };

      onHover = (e: MouseEvent) => {
        if (this.drag || e.target === this.handle || this.handle.contains(e.target as Node)) return;
        if (this.view.state.readOnly) return this.hide(); // Viewing mode: no handles
        const block = this.blockAtY(e.clientY);
        if (block) this.show(block);
        else this.hide();
      };

      onLeave = () => this.hide();
      onKey = () => this.hide();

      onDown = (e: PointerEvent) => {
        if (!this.block || e.button !== 0) return;
        e.preventDefault();
        this.handle.setPointerCapture(e.pointerId);
        this.drag = { block: this.block, x: e.clientX, y: e.clientY, moved: false, before: null };
        this.handle.addEventListener("pointermove", this.onMove);
        this.handle.addEventListener("pointerup", this.onUp);
      };

      onMove = (e: PointerEvent) => {
        const d = this.drag;
        if (!d) return;
        if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 4) return;
        d.moved = true;
        this.view.dom.classList.add("cm-block-dragging");
        const { view } = this;
        const { doc } = view.state;
        // Drop before the hovered block, or after it when in its lower half.
        const lb = view.lineBlockAtHeight(e.clientY - view.documentTop);
        const target = blockAt(view.state, doc.lineAt(lb.from).number);
        let before: number;
        if (!target) before = doc.lineAt(lb.from).number;
        else {
          const top = view.coordsAtPos(doc.line(target.from).from)?.top ?? 0;
          const bottom = view.coordsAtPos(doc.line(target.to).to)?.bottom ?? top;
          before = e.clientY < (top + bottom) / 2 ? target.from : target.to + 1;
        }
        d.before = before;
        const edgeTop = view.dom.getBoundingClientRect().top;
        const y =
          before > doc.lines
            ? (view.coordsAtPos(doc.length)?.bottom ?? 0) - edgeTop
            : (view.coordsAtPos(doc.line(before).from)?.top ?? 0) - edgeTop;
        const content = view.contentDOM.getBoundingClientRect();
        const pad = parseFloat(getComputedStyle(view.contentDOM).paddingLeft) || 0;
        const left = content.left - view.dom.getBoundingClientRect().left + pad;
        this.dropLine.style.top = `${y - 1}px`;
        this.dropLine.style.left = `${left}px`;
        this.dropLine.style.width = `${content.width - pad * 2}px`;
        this.dropLine.hidden = false;
      };

      onUp = (e: PointerEvent) => {
        const d = this.drag;
        this.handle.removeEventListener("pointermove", this.onMove);
        this.handle.removeEventListener("pointerup", this.onUp);
        this.handle.releasePointerCapture(e.pointerId);
        this.drag = null;
        this.dropLine.hidden = true;
        this.view.dom.classList.remove("cm-block-dragging");
        if (!d) return;
        if (!d.moved) {
          const r = this.handle.getBoundingClientRect();
          openMenu(r.left, r.bottom + 4, d.block);
          return;
        }
        if (d.before != null) moveBlock(this.view, d.block, d.before);
        this.hide();
      };

      update() {
        // Text shifted under the handle: re-anchor on next hover.
        if (!this.drag) this.hide();
      }

      destroy() {
        this.view.dom.removeEventListener("mousemove", this.onHover);
        this.view.dom.removeEventListener("mouseleave", this.onLeave);
        this.view.contentDOM.removeEventListener("keydown", this.onKey);
        this.handle.remove();
        this.dropLine.remove();
      }
    },
  );
}
