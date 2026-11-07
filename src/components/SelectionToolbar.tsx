import type { EditorView } from "@codemirror/view";
import { Bold, Code, Heading2, Highlighter, Italic, Link, ListTodo, Strikethrough } from "lucide-react";
import { insertLink, toggleHeading, toggleHighlight, toggleTask, toggleWrap } from "../editor/format";

export type ToolbarPos = { top: number; left: number; below: boolean };

const BUTTONS = [
  { label: "Bold", icon: Bold, run: (v: EditorView) => toggleWrap(v, "**") },
  { label: "Italic", icon: Italic, run: (v: EditorView) => toggleWrap(v, "*") },
  { label: "Strikethrough", icon: Strikethrough, run: (v: EditorView) => toggleWrap(v, "~~") },
  { label: "Highlight", icon: Highlighter, run: toggleHighlight },
  { label: "Code", icon: Code, run: (v: EditorView) => toggleWrap(v, "`") },
  { label: "Link", icon: Link, run: insertLink },
  // Line-level formats after the separator.
  { label: "Heading", icon: Heading2, run: toggleHeading },
  { label: "To-do", icon: ListTodo, run: toggleTask },
];

/** Floating format bar over a text selection. Positioned in the page-scroll
    container's content coordinates, so it scrolls with the text. */
export function SelectionToolbar({ view, pos }: { view: EditorView | null; pos: ToolbarPos }) {
  return (
    <div
      className={`sel-toolbar ${pos.below ? "below" : ""}`}
      style={{ top: pos.top, left: pos.left }}
      role="toolbar"
      aria-label="Format"
      // Keep the editor focused and the selection intact.
      onMouseDown={(e) => e.preventDefault()}
    >
      {BUTTONS.map(({ label, icon: Icon, run }, i) => (
        <span key={label} className="sel-item">
          {i === 6 && <span className="sel-sep" />}
          <button title={label} aria-label={label} onClick={() => view && run(view)}>
            <Icon size={15} strokeWidth={2.2} />
          </button>
        </span>
      ))}
    </div>
  );
}
