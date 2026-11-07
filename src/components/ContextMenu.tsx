import { useEffect } from "react";

export type MenuItem = {
  label: string; // "-" renders a separator
  danger?: boolean;
  disabled?: boolean;
  onClick?: () => void;
};

type Props = {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
};

/** A small fixed-position menu at (x, y). Closes on outside click, Escape,
 *  scroll, or resize. Reusable anywhere (Files rows, later the Board, etc.). */
export function ContextMenu({ x, y, items, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", onClose);
    window.addEventListener("resize", onClose);
    window.addEventListener("scroll", onClose, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("mousedown", onClose);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [onClose]);

  const rows = items.filter((it) => it.label !== "-").length;
  const style: React.CSSProperties = {
    left: Math.min(x, window.innerWidth - 200),
    top: Math.min(y, window.innerHeight - rows * 32 - 16),
  };

  return (
    <div
      className="context-menu"
      style={style}
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((it, i) =>
        it.label === "-" ? (
          <div className="context-sep" key={`sep${i}`} />
        ) : (
          <button
            key={it.label}
            className={`context-item ${it.danger ? "danger" : ""}`}
            disabled={it.disabled}
            onClick={() => {
              it.onClick?.();
              onClose();
            }}
          >
            {it.label}
          </button>
        ),
      )}
    </div>
  );
}
