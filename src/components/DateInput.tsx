import { useEffect, useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import { formatTyped, maskDate, parseIso, parseTyped } from "../dates";

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
 *  written-out confirmation beside it and a ▦ button for the native picker. */
export function DateInput({ value, onChange, onValidity, onEnter }: Props) {
  const [text, setText] = useState(() => formatTyped(value));
  const [focused, setFocused] = useState(false);
  const pickRef = useRef<HTMLInputElement>(null);
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

  return (
    <div className="date-input">
      <div className={`di-box ${bad ? "bad" : ""}`}>
        <input
          className="di-field"
          value={text}
          inputMode="numeric"
          placeholder="MM / DD / YYYY"
          aria-label="Due date, month / day / year"
          aria-invalid={bad}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(e) => {
            const raw = e.target.value;
            const deleting = (e.nativeEvent as InputEvent).inputType?.startsWith("delete");
            // Only auto-format when typing at the end. Editing in the middle
            // (e.g. retyping the month) must keep the text and caret as typed,
            // or "1" gets padded to "01" and the caret jumps past the year.
            const atEnd = e.target.selectionStart === raw.length;
            accept(deleting || !atEnd ? raw : maskDate(raw));
          }}
          onKeyDown={(e) => {
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
          onClick={() => {
            const el = pickRef.current;
            if (!el) return;
            el.value = value;
            try {
              el.showPicker();
            } catch {
              el.focus();
            }
          }}
        >
          <CalendarDays size={14} strokeWidth={2.1} />
        </button>
        <input
          ref={pickRef}
          type="date"
          className="di-hidden"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            if (e.target.value) accept(formatTyped(e.target.value));
          }}
        />
      </div>
      <span className={`di-preview ${bad ? "bad" : ""}`} aria-live="polite">
        {parsed.kind === "ok" ? longLabel(parsed.iso) : bad ? "Not a date" : ""}
      </span>
    </div>
  );
}
