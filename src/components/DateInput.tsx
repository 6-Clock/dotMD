import { useEffect, useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import { formatTyped, maskDate, parseIso, parseTyped, ymd } from "../dates";
import { DatePopover, stepDate } from "./DatePopover";

type Props = {
  /** Committed deadline (YYYY-MM-DD, "" = none). */
  value: string;
  /** Called only with a readable date (or "" when cleared). */
  onChange: (iso: string) => void;
  /** False while the text isn't a usable date — callers block saving on it. */
  onValidity?: (ok: boolean) => void;
  onEnter?: () => void;
};

const longLabel = (iso: string) => {
  const d = parseIso(iso);
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
};

/** Typed MM / DD / YYYY field (slashes auto-insert, year optional) with a
 *  written-out confirmation beside it and a ▦ button that opens dotMD's own
 *  month picker (`DatePopover`). While it's open the field keeps focus and
 *  owns the keys: arrows ±1 day / ±7, PgUp/PgDn month, Enter picks, Esc closes. */
export function DateInput({ value, onChange, onValidity, onEnter }: Props) {
  const [text, setText] = useState(() => formatTyped(value));
  const [focused, setFocused] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState("");
  const parsed = parseTyped(text);

  // Follow outside changes (picker, a "clear" button) — but never clobber
  // text that already reads as this value.
  useEffect(() => {
    const p = parseTyped(text);
    const current = p.kind === "ok" ? p.iso : p.kind === "empty" ? "" : null;
    if (current !== value) setText(formatTyped(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const accept = (next: string) => {
    setText(next);
    const p = parseTyped(next);
    const ok = p.kind === "ok" || p.kind === "empty";
    onValidity?.(ok);
    if (p.kind === "ok") onChange(p.iso);
    else if (p.kind === "empty") onChange("");
  };

  const bad = parsed.kind === "invalid" || (parsed.kind === "partial" && !focused);

  const openPicker = () => {
    setActive(parsed.kind === "ok" ? parsed.iso : value || ymd(new Date()));
    setOpen(true);
    fieldRef.current?.focus();
  };
  const pick = (iso: string) => {
    accept(formatTyped(iso));
    setOpen(false);
  };
  const STEPS: Record<string, [number, number]> = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [-7, 0],
    ArrowDown: [7, 0],
    PageUp: [0, -1],
    PageDown: [0, 1],
  };

  return (
    <div className="date-input">
      <div ref={boxRef} className={`di-box ${bad ? "bad" : ""} ${open ? "open" : ""}`}>
        <input
          ref={fieldRef}
          className="di-field"
          value={text}
          inputMode="numeric"
          placeholder="MM / DD / YYYY"
          aria-label="Due date, month / day / year"
          aria-invalid={bad}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            setOpen(false);
          }}
          onChange={(e) => {
            const raw = e.target.value;
            const deleting = (e.nativeEvent as InputEvent).inputType?.startsWith("delete");
            // Only auto-format when typing at the end. Editing in the middle
            // (e.g. retyping the month) must keep the text and caret as typed,
            // or "1" gets padded to "01" and the caret jumps past the year.
            const atEnd = e.target.selectionStart === raw.length;
            const next = deleting || !atEnd ? raw : maskDate(raw);
            accept(next);
            const p = parseTyped(next);
            if (p.kind === "ok") setActive(p.iso);
          }}
          onKeyDown={(e) => {
            if (open) {
              const step = STEPS[e.key];
              if (step) {
                e.preventDefault();
                e.stopPropagation();
                setActive((a) => stepDate(a || ymd(new Date()), step[0], step[1]));
                return;
              }
              if (e.key === "Enter" || e.key === "Escape") {
                // Only the calendar closes; the task and its composer stay.
                e.preventDefault();
                e.stopPropagation();
                if (e.key === "Enter" && active) pick(active);
                else setOpen(false);
                return;
              }
            }
            if (e.key === "Enter" && onEnter) {
              e.preventDefault();
              onEnter();
            }
          }}
        />
        <button
          type="button"
          className="di-pick"
          title="Pick a date"
          aria-label="Pick a date"
          aria-expanded={open}
          // Toggling from the field keeps focus there (and doesn't blur-close).
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => (open ? setOpen(false) : openPicker())}
        >
          <CalendarDays size={14} strokeWidth={2.1} />
        </button>
      </div>
      {open && boxRef.current && (
        <DatePopover
          anchor={boxRef.current}
          value={parsed.kind === "ok" ? parsed.iso : value}
          active={active}
          onPick={pick}
          onClose={() => setOpen(false)}
        />
      )}
      <span className={`di-preview ${bad ? "bad" : ""}`} aria-live="polite">
        {parsed.kind === "ok" ? longLabel(parsed.iso) : bad ? "Not a date" : ""}
      </span>
    </div>
  );
}
