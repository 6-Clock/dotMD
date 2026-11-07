import { useEffect, useRef, useState } from "react";
import { Eye, X } from "lucide-react";
import { useStore } from "../store";
import { displayName } from "./TitleBar";
import { focusEditor } from "./Editor";
import { ModeMenu } from "./ModeMenu";

/** VS Code-style editor tabs above the page. The italic tab is the preview
    tab (replaced by the next preview open); double-click or edit to keep it.
    Middle-click closes; drag to reorder. */
export function TabBar() {
  const tabs = useStore((s) => s.tabs);
  const current = useStore((s) => s.currentNote);
  const previewTab = useStore((s) => s.previewTab);
  const dirty = useStore((s) => s.content !== s.lastSaved);
  const openNote = useStore((s) => s.openNote);
  const closeTab = useStore((s) => s.closeTab);
  const moveTab = useStore((s) => s.moveTab);
  const pinTab = useStore((s) => s.pinTab);
  const locked = useStore((s) => s.settings?.view_only_notes);

  const barRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);

  // Keep the active tab in view when it changes.
  useEffect(() => {
    barRef.current
      ?.querySelector(".tab.active")
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [current, tabs]);

  const close = (e: React.MouseEvent, name: string) => {
    e.stopPropagation();
    closeTab(name).then(focusEditor);
  };

  return (
    <div className="tab-bar">
      <div
        className="tab-strip"
        ref={barRef}
        role="tablist"
        onWheel={(e) => {
          // Vertical wheel scrolls the strip sideways.
          if (barRef.current && e.deltaY) barRef.current.scrollLeft += e.deltaY;
        }}
        onDragOver={(e) => dragging && e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (dragging && dropAt != null) {
            const from = tabs.indexOf(dragging);
            moveTab(dragging, dropAt > from ? dropAt - 1 : dropAt);
          }
          setDragging(null);
          setDropAt(null);
        }}
      >
        {tabs.map((name, i) => {
          const active = name === current;
          return (
            <div
              key={name}
              role="tab"
              aria-selected={active}
              title={name}
              className={[
                "tab",
                active ? "active" : "",
                previewTab === name ? "preview" : "",
                dragging === name ? "dragging" : "",
                dropAt === i ? "drop-before" : "",
                dropAt === i + 1 && i === tabs.length - 1 ? "drop-after" : "",
              ].join(" ")}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "move";
                setDragging(name);
              }}
              onDragOver={(e) => {
                if (!dragging) return;
                e.preventDefault();
                const r = e.currentTarget.getBoundingClientRect();
                setDropAt(e.clientX < r.left + r.width / 2 ? i : i + 1);
              }}
              onDragEnd={() => {
                setDragging(null);
                setDropAt(null);
              }}
              onMouseDown={(e) => {
                if (e.button === 1) e.preventDefault(); // no autoscroll cursor
              }}
              onAuxClick={(e) => e.button === 1 && close(e, name)}
              onClick={() => {
                if (!active) openNote(name).then(focusEditor);
              }}
              onDoubleClick={() => pinTab(name)}
            >
              {locked?.includes(name) && (
                <Eye size={12} strokeWidth={2.2} className="tab-lock" aria-label="View only" />
              )}
              <span className="tab-name">{displayName(name)}</span>
              <button
                className={`tab-close ${active && dirty ? "dirty" : ""}`}
                aria-label={`Close ${displayName(name)}`}
                onClick={(e) => close(e, name)}
              >
                <span className="tab-dot" />
                <X size={12} strokeWidth={2.4} />
              </button>
            </div>
          );
        })}
      </div>
      <ModeMenu />
    </div>
  );
}
