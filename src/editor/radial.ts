import type { EditorView } from "@codemirror/view";
import {
  Bold,
  Code,
  Heading2,
  Highlighter,
  Italic,
  Link,
  ListTodo,
  type LucideIcon,
  Strikethrough,
} from "lucide-react";
import { insertLink, toggleHeading, toggleHighlight, toggleTask, toggleWrap } from "./format";

/* The radial wheel (components/RadialWheel.tsx): hold Alt in the editor, point
   at a slice and click (releasing Alt closes). Each ring has four slices laid out
   like the arrow keys; the wheel / Alt+1…9 switch rings. Add a feature by
   filling a slot here. */

export type Dir = "up" | "right" | "down" | "left";
export const DIRS: Dir[] = ["up", "right", "down", "left"];

export type Slice = { label: string; icon: LucideIcon; run: (view: EditorView) => void };
export type Ring = Record<Dir, Slice>;

export const RINGS: Ring[] = [
  {
    up: { label: "Bold", icon: Bold, run: (v) => toggleWrap(v, "**") },
    right: { label: "Highlight", icon: Highlighter, run: toggleHighlight },
    down: { label: "Strikethrough", icon: Strikethrough, run: (v) => toggleWrap(v, "~~") },
    left: { label: "Italic", icon: Italic, run: (v) => toggleWrap(v, "*") },
  },
  {
    up: { label: "Heading", icon: Heading2, run: toggleHeading },
    right: { label: "To-do", icon: ListTodo, run: toggleTask },
    down: { label: "Code", icon: Code, run: (v) => toggleWrap(v, "`") },
    left: { label: "Link", icon: Link, run: insertLink },
  },
];

/** Screen angle (radians, y down) each slice is centred on. */
export const ANGLE: Record<Dir, number> = {
  up: -Math.PI / 2,
  right: 0,
  down: Math.PI / 2,
  left: Math.PI,
};

/** Which slice a pointer offset from the centre points at; null inside the
    dead zone. */
export function dirAt(dx: number, dy: number, deadZone: number): Dir | null {
  if (Math.hypot(dx, dy) < deadZone) return null;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "right" : "left";
  return dy > 0 ? "down" : "up";
}
