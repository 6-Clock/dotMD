import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { parseIso, ymd } from "../dates";

const LETTERS = ["S", "M", "T", "W", "T", "F", "S"];
const WIDTH = 252;
const HEIGHT = 300; // close enough to flip above when there's no room below

type Props = {
  /** The field the calendar hangs under (positions it, and clicks there don't close it). */
  anchor: HTMLElement;
  /** Committed date (YYYY-MM-DD) or "". */
  value: string;
  /** Keyboard-highlighted day; the field owns the keys (focus never leaves it). */
  active: string;
  onPick: (iso: string) => void;
  onClose: () => void;
};

/** dotMD's date picker: the same month grid as the Calendar and project rail
 *  (today = sticker, picked day = ink ring), on a floating paper card.
 *  Rendered into <body> so no sheet or panel clips it; it never takes focus
 *  (mousedown is prevented), so the field keeps typing and the arrow keys. */
export function DatePopover({ anchor, value, active, onPick, onClose }: Props) {
  const today = ymd(new Date());
  const [cursor, setCursor] = useState(() => monthOf(active || value || today));
  const [pos, setPos] = useState<{ left: number; top: number; up: boolean } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // The month follows the keyboard highlight.
  useEffect(() => {
    if (active) setCursor(monthOf(active));
  }, [active]);

  useLayoutEffect(() => {
    const r = anchor.getBoundingClientRect();
    const up = r.bottom + 6 + HEIGHT > window.innerHeight && r.top - 6 - HEIGHT > 0;
    setPos({
      left: Math.max(8, Math.min(r.left, window.innerWidth - WIDTH - 8)),
      top: up ? r.top - 6 : r.bottom + 6,
      up,
    });
  }, [anchor]);

  // Close on a click outside (the field itself excepted), scrolling, resizing.
  useEffect(() => {
    const outside = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!cardRef.current?.contains(t) && !anchor.contains(t)) onClose();
    };
    const scrolled = (e: Event) => {
      if (!cardRef.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener("mousedown", outside, true);
    window.addEventListener("scroll", scrolled, true);
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("mousedown", outside, true);
      window.removeEventListener("scroll", scrolled, true);
      window.removeEventListener("resize", onClose);
    };
  }, [anchor, onClose]);

  if (!pos) return null;
  const first = new Date(cursor.y, cursor.m, 1);
  const days = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array.from({ length: first.getDay() }, () => null),
    ...Array.from({ length: days }, (_, i) => new Date(cursor.y, cursor.m, i + 1)),
  ];
  const shift = (n: number) =>
    setCursor(({ y, m }) => {
      const d = new Date(y, m + n, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });

  return createPortal(
    <div
      ref={cardRef}
      className={`date-pop ${pos.up ? "up" : ""}`}
      style={{ left: pos.left, top: pos.top }}
      role="dialog"
      aria-label="Pick a due date"
      // Keep focus (and typing) in the field.
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="mini-head">
        <span className="mini-title">
          {first.toLocaleDateString(undefined, { month: "long" })} <span className="dp-year">{cursor.y}</span>
        </span>
        <button className="icon-btn" tabIndex={-1} aria-label="Previous month" onClick={() => shift(-1)}>
          <ChevronLeft size={15} strokeWidth={2.2} />
        </button>
        <button className="icon-btn" tabIndex={-1} aria-label="Next month" onClick={() => shift(1)}>
          <ChevronRight size={15} strokeWidth={2.2} />
        </button>
      </div>
      <div className="mini-grid">
        {LETTERS.map((l, i) => (
          <span key={i} className="mini-wd">
            {l}
          </span>
        ))}
        {cells.map((d, i) => {
          if (!d) return <span key={`e${i}`} className="mini-day empty" />;
          const iso = ymd(d);
          return (
            <button
              key={iso}
              tabIndex={-1}
              className={[
                "mini-day",
                iso === today && "cal-today",
                iso === value && "selected",
                iso === active && "active",
                iso < today && "past",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-pressed={iso === value}
              aria-label={d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
              onClick={() => onPick(iso)}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>,
    document.body,
  );
}

function monthOf(iso: string) {
  const d = parseIso(iso);
  return { y: d.getFullYear(), m: d.getMonth() };
}

/** Move a YYYY-MM-DD by days or months (months clamp to the month's last day). */
export function stepDate(iso: string, days: number, months = 0): string {
  const d = parseIso(iso);
  if (months) {
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + months);
    d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  }
  d.setDate(d.getDate() + days);
  return ymd(d);
}
