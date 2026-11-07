import { useLayoutEffect, useRef, useState } from "react";
import { Files, ListTodo, LayoutGrid, CalendarDays, Mountain, Search, HardDrive, Settings, SquareTerminal } from "lucide-react";
import { useStore, type ViewId } from "../store";

type Item = { key: string; label: string; Icon: typeof Files; pinned?: boolean };

// Order must match TOOLBAR_ORDER in store.ts so the Ctrl+T nav highlight
// (toolbarIndex) lines up with the rendered buttons.
const ITEMS: Item[] = [
  { key: "files", label: "Files", Icon: Files },
  { key: "todo", label: "To-do", Icon: ListTodo },
  { key: "board", label: "Board", Icon: LayoutGrid },
  { key: "calendar", label: "Calendar", Icon: CalendarDays },
  { key: "projects", label: "Projects", Icon: Mountain },
  { key: "search", label: "Search", Icon: Search },
  { key: "storage", label: "Storage", Icon: HardDrive },
  { key: "terminal", label: "Terminal", Icon: SquareTerminal },
  { key: "settings", label: "Settings", Icon: Settings, pinned: true },
];

export function ActivityBar() {
  const activeView = useStore((s) => s.activeView);
  const setView = useStore((s) => s.setView);
  const toolbarNav = useStore((s) => s.toolbarNav);
  const toolbarIndex = useStore((s) => s.toolbarIndex);
  const navSeq = useStore((s) => s.toolbarNavSeq);

  // Ctrl+T cursor: one ring that slides between buttons (measured, since
  // Settings sits below a flexible spacer). It lingers briefly on exit so it
  // can fade out instead of vanishing.
  const btns = useRef<(HTMLButtonElement | null)[]>([]);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [leaving, setLeaving] = useState(false);
  useLayoutEffect(() => {
    if (toolbarNav) {
      const b = btns.current[toolbarIndex];
      if (b) setCursor({ x: b.offsetLeft, y: b.offsetTop });
      setLeaving(false);
      return;
    }
    if (!cursor) return;
    setLeaving(true);
    const t = setTimeout(() => {
      setCursor(null);
      setLeaving(false);
    }, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toolbarNav, toolbarIndex]);

  const isActive = (it: Item) => activeView === it.key;
  const activate = (it: Item) => setView(it.key as ViewId);

  const render = (it: Item, idx: number) => (
    <button
      key={it.key}
      ref={(el) => {
        btns.current[idx] = el;
      }}
      className={`activity-btn ${isActive(it) ? "active" : ""} ${
        toolbarNav && toolbarIndex === idx ? "nav" : ""
      }`}
      title={it.label}
      aria-label={it.label}
      aria-pressed={isActive(it)}
      onClick={() => activate(it)}
    >
      <it.Icon size={20} strokeWidth={isActive(it) ? 2.1 : 1.75} />
    </button>
  );

  return (
    <nav className={`activity-bar ${toolbarNav ? "navigating" : ""}`}>
      {toolbarNav && <span key={`sweep${navSeq}`} className="nav-sweep" aria-hidden />}
      {cursor && (
        <span
          key={`cursor${navSeq}`}
          className={`nav-cursor ${leaving ? "out" : ""}`}
          style={{ transform: `translate(${cursor.x}px, ${cursor.y}px)` }}
          aria-hidden
        >
          <i />
        </span>
      )}
      {ITEMS.map((it, idx) => (it.pinned ? null : render(it, idx)))}
      <div className="activity-spacer" />
      {ITEMS.map((it, idx) => (it.pinned ? render(it, idx) : null))}
    </nav>
  );
}
