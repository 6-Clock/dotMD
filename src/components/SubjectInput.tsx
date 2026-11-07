import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { useStore } from "../store";
import { subjectStyle } from "../subjects";

type Props = {
  value: string;
  onChange: (subject: string) => void;
  /** Enter with the list closed (e.g. the composer adds the task). */
  onEnter?: () => void;
  placeholder?: string;
};

type Option = { name: string; create?: boolean };

/** Subject type-ahead: existing subjects starting with the text (any case),
 *  "+ Create" when nothing matches exactly. Typing an existing name in another
 *  case snaps to it on pick / blur, so "cmpt300" never forks "CMPT300". */
export function SubjectInput({ value, onChange, onEnter, placeholder = "None" }: Props) {
  const todos = useStore((s) => s.todos);
  const projects = useStore((s) => s.projects);
  const colors = useStore((s) => s.settings?.subject_colors);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);

  const subjects = useMemo(
    () =>
      Array.from(
        new Set([...todos.map((t) => t.subject), ...projects.map((p) => p.name)].filter(Boolean)),
      ),
    [todos, projects],
  );

  const q = value.trim();
  const lower = q.toLowerCase();
  const exact = subjects.find((s) => s.toLowerCase() === lower);
  const options: Option[] = [
    ...subjects.filter((s) => s.toLowerCase().startsWith(lower)).map((name) => ({ name })),
    ...(q && !exact ? [{ name: q, create: true }] : []),
  ];
  const known = exact ?? "";

  const pick = (o: Option) => {
    onChange(o.name);
    setOpen(false);
  };

  return (
    <div className="subject-input">
      <div className={`si-box ${known ? "known" : ""}`} style={subjectStyle(known, colors)}>
        <input
          className="si-field"
          value={value}
          placeholder={placeholder}
          aria-label="Subject"
          role="combobox"
          aria-expanded={open && options.length > 0}
          aria-autocomplete="list"
          onFocus={() => {
            setOpen(true);
            // Nothing typed → nothing highlighted, so Enter still means "add".
            setHi(q ? 0 : -1);
          }}
          onBlur={() => {
            setOpen(false);
            if (exact && exact !== value) onChange(exact);
          }}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
            setHi(e.target.value.trim() ? 0 : -1);
          }}
          onKeyDown={(e) => {
            const listed = open && options.length > 0;
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              if (!open) return setOpen(true);
              const n = options.length;
              if (n) setHi((i) => (e.key === "ArrowDown" ? (i + 1) % n : i <= 0 ? n - 1 : i - 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              if (listed && hi >= 0) pick(options[Math.min(hi, options.length - 1)]);
              else onEnter?.();
            } else if (e.key === "Escape" && listed) {
              // First Esc closes the list; the next one reaches the form.
              e.stopPropagation();
              setOpen(false);
            }
          }}
        />
      </div>
      {open && options.length > 0 && (
        <div className="si-menu" role="listbox">
          {options.map((o, i) => (
            <button
              key={(o.create ? "+" : "") + o.name}
              type="button"
              role="option"
              aria-selected={i === hi}
              tabIndex={-1}
              className={`si-opt ${i === hi ? "hi" : ""} ${o.create ? "create" : ""}`}
              style={o.create ? undefined : subjectStyle(o.name, colors)}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setHi(i)}
              onClick={() => pick(o)}
            >
              {o.create ? (
                <>
                  <Plus size={13} strokeWidth={2.6} /> Create “{o.name}”
                </>
              ) : (
                o.name
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
