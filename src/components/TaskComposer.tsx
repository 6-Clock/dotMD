import { useRef, useState } from "react";
import { Plus } from "lucide-react";
import { useStore } from "../store";
import { parseIso } from "../dates";
import { SubjectInput } from "./SubjectInput";
import { DateInput } from "./DateInput";

type Props = {
  /** Calendar: the day is already chosen, so the Due row is a fixed label. */
  fixedDate?: string;
  /** Project page: the subject is the project, shown as a fixed label. */
  fixedSubject?: string;
  onClose: () => void;
};

/** The one add-task composer, shared by the To-do panel and the Calendar:
 *  title, subject type-ahead, typed due date, optional note. Enter adds and
 *  keeps it open (subject / due / note box stay); Esc closes; clicking away
 *  adds then closes. Keys never leak to the panel's or calendar's shortcuts. */
export function TaskComposer({ fixedDate, fixedSubject, onClose }: Props) {
  const addTodo = useStore((s) => s.addTodo);

  const [title, setTitle] = useState("");
  const [subj, setSubj] = useState(fixedSubject ?? "");
  const [due, setDue] = useState("");
  const [dueOk, setDueOk] = useState(true);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const titleRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const submit = (close: boolean) => {
    const t = title.trim();
    if (t && !dueOk) {
      // An unreadable date never gets silently dropped: stay and point at it.
      boxRef.current?.querySelector<HTMLInputElement>(".di-field")?.focus();
      return;
    }
    if (t) addTodo(t, { subject: subj.trim(), deadline: fixedDate ?? due, description: note.trim() });
    setTitle("");
    setNote("");
    if (close || !t) onClose();
    else titleRef.current?.focus();
  };

  return (
    <div
      ref={boxRef}
      className="composer"
      // A click on the box's own padding / labels would otherwise move focus
      // to the focusable panel behind it, which reads as "clicked away" and
      // closes the composer. Keep focus where it is instead.
      onMouseDown={(e) => {
        if (!(e.target as HTMLElement).closest("input, textarea, button")) e.preventDefault();
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") onClose();
      }}
      onBlur={(e) => {
        // Wait a tick so focus moving between the composer's own fields
        // doesn't count as clicking away.
        const box = e.currentTarget;
        window.setTimeout(() => {
          if (!box.contains(document.activeElement)) submit(true);
        }, 0);
      }}
    >
      <input
        ref={titleRef}
        className="composer-title"
        autoFocus
        value={title}
        placeholder="New task"
        aria-label="Task title"
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit(false);
        }}
      />

      <div className="composer-rows">
        <span className="composer-label">Subject</span>
        {fixedSubject ? (
          <span className="composer-fixed">{fixedSubject}</span>
        ) : (
          <SubjectInput value={subj} onChange={setSubj} onEnter={() => submit(false)} />
        )}

        <span className="composer-label">Due</span>
        {fixedDate ? (
          <span className="composer-fixed">
            {parseIso(fixedDate).toLocaleDateString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}
          </span>
        ) : (
          <DateInput value={due} onChange={setDue} onValidity={setDueOk} onEnter={() => submit(false)} />
        )}
      </div>

      {noteOpen && (
        <textarea
          className="composer-note"
          autoFocus
          rows={2}
          value={note}
          placeholder="Note (Shift+Enter for a new line)"
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit(false);
            }
          }}
        />
      )}

      <div className="composer-foot">
        {!noteOpen && (
          <button className="chip-pick new" onClick={() => setNoteOpen(true)}>
            <Plus size={12} strokeWidth={2.6} /> Note
          </button>
        )}
        <button
          className="btn-primary composer-add"
          onClick={() => submit(false)}
          disabled={!title.trim() || !dueOk}
        >
          Add <kbd>↵</kbd>
        </button>
      </div>
    </div>
  );
}
