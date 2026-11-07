import { useStore } from "../store";

const HINTS: [string, string][] = [
  ["Ctrl P", "Switch"],
  ["Ctrl ⇧ F", "Search"],
  ["Ctrl ↵", "File"],
  ["Ctrl T", "Toolbar"],
];

export function StatusBar() {
  const dirty = useStore((s) => s.content !== s.lastSaved);
  const zoom = useStore((s) => s.settings?.zoom ?? 1);
  const zoomBy = useStore((s) => s.zoomBy);

  return (
    <div className="statusbar">
      <span className={`save-state ${dirty ? "dirty" : ""}`}>
        <span className="save-dot" />
        {dirty ? "Editing" : "Saved"}
      </span>
      {Math.abs(zoom - 1) > 0.001 && (
        <button className="zoom-chip" title="Page zoom. Click to reset to 100%" onClick={() => zoomBy(0)}>
          {Math.round(zoom * 100)}%
        </button>
      )}
      <span className="spacer" />
      {HINTS.map(([keys, label]) => (
        <span className="hint" key={label}>
          <kbd>{keys}</kbd>
          {label}
        </span>
      ))}
    </div>
  );
}
