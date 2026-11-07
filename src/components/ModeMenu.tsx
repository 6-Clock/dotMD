import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Code2, Eye, Pencil } from "lucide-react";
import { type DocMode, useStore } from "../store";
import { resolveBindings } from "../actions";
import { focusEditor } from "./Editor";

const MODES: { id: DocMode; label: string; hint: string; icon: typeof Pencil; action: string }[] = [
  { id: "editing", label: "Editing", hint: "Write with formatting shown", icon: Pencil, action: "toggleRendered" },
  { id: "markdown", label: "Markdown", hint: "Edit the raw Markdown text", icon: Code2, action: "toggleRendered" },
  { id: "viewing", label: "Viewing", hint: "Read only. This note can't be changed", icon: Eye, action: "toggleViewOnly" },
];

/** Google Docs-style mode switcher at the right end of the tab bar.
    Viewing is remembered per note; Editing / Markdown apply app-wide. */
export function ModeMenu() {
  // Subscribe to the inputs docMode() reads, so the pill re-renders.
  useStore((s) => s.rendered);
  useStore((s) => s.currentNote);
  useStore((s) => s.settings?.view_only_notes);
  const keybindings = useStore((s) => s.settings?.keybindings);
  const docMode = useStore((s) => s.docMode);
  const setDocMode = useStore((s) => s.setDocMode);
  const mode = docMode();
  const current = MODES.find((m) => m.id === mode)!;

  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  const bindings = resolveBindings(keybindings ?? {});
  const Icon = current.icon;

  return (
    <div className="mode-menu" ref={ref}>
      <button
        className={`mode-pill ${mode}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon size={14} strokeWidth={2.2} />
        <span className="mode-pill-label">{current.label}</span>
        <ChevronDown size={13} strokeWidth={2.4} className="mode-chevron" />
      </button>
      {open && (
        <div className="mode-pop" role="menu">
          {MODES.map((m) => {
            const MIcon = m.icon;
            return (
              <button
                key={m.id}
                role="menuitemradio"
                aria-checked={m.id === mode}
                className={`mode-item ${m.id === mode ? "on" : ""}`}
                onClick={() => {
                  setDocMode(m.id);
                  setOpen(false);
                  if (m.id !== "viewing") focusEditor();
                }}
              >
                <span className={`mode-icon ${m.id}`}>
                  <MIcon size={15} strokeWidth={2.2} />
                </span>
                <span className="mode-text">
                  <span className="mode-label">{m.label}</span>
                  <span className="mode-hint">{m.hint}</span>
                </span>
                {m.id === mode ? (
                  <Check size={15} strokeWidth={2.6} className="mode-check" />
                ) : (
                  <kbd className="mode-kbd">{bindings[m.action as keyof typeof bindings]}</kbd>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
