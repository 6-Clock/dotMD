import { useEffect, useRef, useState } from "react";
import { isFullView, useStore } from "../store";
import { TodoPanel } from "./TodoPanel";
import { FilesView } from "./views/FilesView";
import { SearchView } from "./views/SearchView";
import { SettingsView } from "./views/SettingsView";

const MIN_W = 220;
const MAX_W = 640;
// Keep in sync with the `.side-panel` sheet breakpoint in globals.css.
const NARROW = "(max-width: 620px)";

export function SidePanel() {
  const activeView = useStore((s) => s.activeView);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(
    () => Number(localStorage.getItem("dotmd-sidebar-w")) || 290,
  );

  // Drag the right edge to resize, VS Code style.
  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    const left = panelRef.current?.getBoundingClientRect().left ?? 0;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMove = (ev: MouseEvent) => {
      const w = Math.min(MAX_W, Math.max(MIN_W, ev.clientX - left));
      setWidth(w);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      localStorage.setItem("dotmd-sidebar-w", String(panelRef.current?.offsetWidth ?? width));
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // Narrow windows: the panel becomes a sheet over the editor (CSS, same
  // breakpoint). Shrinking into that size closes it so the note stays in
  // view, and opening a note from the sheet closes it to show that note.
  useEffect(() => {
    const narrow = window.matchMedia(NARROW);
    const close = () => {
      const v = useStore.getState().activeView;
      if (v && !isFullView(v)) useStore.setState({ activeView: null });
    };
    const onChange = (e: MediaQueryListEvent) => e.matches && close();
    narrow.addEventListener("change", onChange);
    const unsub = useStore.subscribe((s, prev) => {
      if (narrow.matches && s.currentNote !== prev.currentNote) close();
    });
    return () => {
      narrow.removeEventListener("change", onChange);
      unsub();
    };
  }, []);

  if (!activeView || isFullView(activeView)) return null;

  return (
    <aside className="side-panel" ref={panelRef} style={{ width }}>
      <div className="side-panel-body" key={activeView}>
        {activeView === "files" && <FilesView />}
        {activeView === "todo" && <TodoPanel />}
        {activeView === "search" && <SearchView />}
        {activeView === "settings" && <SettingsView />}
      </div>
      <div className="resize-handle" onMouseDown={startDrag} title="Drag to resize" />
    </aside>
  );
}
