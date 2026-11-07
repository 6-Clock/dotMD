import { useState } from "react";
import { CalendarDays, Tag, X } from "lucide-react";
import { useStore } from "../store";
import { SwatchPicker } from "./SwatchPicker";
import { nextSwatch, subjectStyle } from "../subjects";
import { SubjectInput } from "./SubjectInput";
import { DateInput } from "./DateInput";

export function EditTodoModal() {
  const index = useStore((s) => s.editingTodo);
  const todos = useStore((s) => s.todos);
  const updateTodoAt = useStore((s) => s.updateTodoAt);
  const deleteTodoAt = useStore((s) => s.deleteTodoAt);
  const setEditingTodo = useStore((s) => s.setEditingTodo);
  const colors = useStore((s) => s.settings?.subject_colors);
  const setSubjectColor = useStore((s) => s.setSubjectColor);

  const todo = index != null ? todos[index] : undefined;

  const [text, setText] = useState(todo?.text ?? "");
  const [subject, setSubject] = useState(todo?.subject ?? "");
  const [deadline, setDeadline] = useState(todo?.deadline ?? "");
  const [description, setDescription] = useState(todo?.description ?? "");
  const [done, setDone] = useState(todo?.done ?? false);
  const [dueOk, setDueOk] = useState(true);
  // Colour picked for a subject that doesn't exist yet; applied on save.
  const [pendingColor, setPendingColor] = useState<string | null>(null);

  if (index == null || !todo) return null;

  const subj = subject.trim();
  const swatch = pendingColor ?? (subj ? colors?.[subj] ?? nextSwatch(colors ?? {}) : undefined);

  const close = () => setEditingTodo(null);

  const save = () => {
    if (!dueOk) return; // the Due field already says "Not a date"
    if (subj && swatch && colors?.[subj] !== swatch) setSubjectColor(subj, swatch);
    updateTodoAt(index, {
      text: text.trim() || todo.text,
      subject: subj,
      deadline,
      description,
      done,
    });
    close();
  };

  const remove = () => {
    deleteTodoAt(index);
    close();
  };

  return (
    <div
      className="overlay-backdrop sheet-backdrop"
      onMouseDown={close}
      onKeyDown={(e) => {
        if (e.key === "Escape") close();
      }}
    >
      <div
        className="sheet"
        role="dialog"
        aria-label="Edit task"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="sheet-bar">
          <button className="bar-btn" onClick={close}>
            Cancel
          </button>
          <span className="sheet-title">Details</span>
          <button className="bar-btn strong" onClick={save} disabled={!dueOk}>
            Done
          </button>
        </div>

        <div className="sheet-body">
          <div className="form-group">
            <input
              className="form-title"
              autoFocus
              value={text}
              placeholder="Title"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
              }}
            />
            <textarea
              className="form-notes"
              rows={4}
              value={description}
              placeholder="Notes"
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="form-group">
            <div className="form-row">
              <span className="form-icon" style={subjectStyle(subj, swatch ? { [subj]: swatch } : colors)}>
                <Tag size={14} strokeWidth={2.2} />
              </span>
              <span className="form-label">Subject</span>
              <SubjectInput
                value={subject}
                onChange={(v) => {
                  setSubject(v);
                  setPendingColor(null);
                }}
              />
            </div>
            {subj && (
              <div className="form-row column">
                <span className="form-hint">
                  Colour for every “{subj}” task
                </span>
                <SwatchPicker value={swatch} onChange={setPendingColor} />
              </div>
            )}
            <div className="form-row">
              <span className="form-icon due">
                <CalendarDays size={14} strokeWidth={2.2} />
              </span>
              <span className="form-label">Due</span>
              <DateInput value={deadline} onChange={setDeadline} onValidity={setDueOk} onEnter={save} />
              {deadline && (
                <button
                  className="clear-btn"
                  title="Remove due date"
                  onClick={(e) => {
                    e.preventDefault();
                    setDeadline("");
                  }}
                >
                  <X size={11} strokeWidth={3} />
                </button>
              )}
            </div>
          </div>

          <div className="form-group">
            <label className="form-row">
              <span className="form-label grow">Completed</span>
              <input
                type="checkbox"
                className="switch"
                checked={done}
                onChange={(e) => setDone(e.target.checked)}
              />
            </label>
          </div>

          <div className="form-group">
            <button className="form-row danger-row" onClick={remove}>
              Delete Task
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
