import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownWideNarrow, ArrowUpNarrowWide, Plus } from "lucide-react";
import { useStore } from "../store";
import { Eyes } from "./Eyes";
import { PanelHeader } from "./PanelHeader";
import { TaskComposer } from "./TaskComposer";
import { subjectStyle } from "../subjects";
import { dueLabel, todayIso } from "../dates";

// Module handle so Ctrl+J (actions.ts) can focus the task list from the editor.
let panelFocus: (() => void) | null = null;
export const focusTodoPanel = () => panelFocus?.();

type SortDir = "asc" | "desc";

export function TodoPanel() {
  const todos = useStore((s) => s.todos);
  const toggleTodoAt = useStore((s) => s.toggleTodoAt);
  const deleteTodoAt = useStore((s) => s.deleteTodoAt);
  const setEditingTodo = useStore((s) => s.setEditingTodo);
  const colors = useStore((s) => s.settings?.subject_colors);

  const [composing, setComposing] = useState(false);
  const [selected, setSelected] = useState(0);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Focus the panel when the To-do view opens (so arrow-key task nav works), and
  // expose a handle so Ctrl+J (actions.ts) can focus the list from the editor.
  useEffect(() => {
    panelFocus = () => panelRef.current?.focus();
    panelRef.current?.focus();
    return () => {
      panelFocus = null;
    };
  }, []);

  // Display order by deadline; items without a deadline sink to the bottom.
  const ordered = useMemo(() => {
    const items = todos.map((todo, index) => ({ todo, index }));
    items.sort((a, b) => {
      const ad = a.todo.deadline;
      const bd = b.todo.deadline;
      if (!ad && !bd) return 0;
      if (!ad) return 1;
      if (!bd) return -1;
      const cmp = ad.localeCompare(bd);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return items;
  }, [todos, sortDir]);

  const closeComposer = () => {
    setComposing(false);
    panelRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).tagName === "INPUT") return;
    if ((e.target as HTMLElement).tagName === "TEXTAREA") return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((i) => Math.min(ordered.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((i) => Math.max(0, i - 1));
    } else if (e.key === " ") {
      e.preventDefault();
      const row = ordered[selected];
      if (row) toggleTodoAt(row.index);
    } else if (e.key === "a") {
      e.preventDefault();
      setComposing(true);
    } else if (e.key === "d") {
      e.preventDefault();
      const row = ordered[selected];
      if (row) {
        deleteTodoAt(row.index);
        setSelected((i) => Math.max(0, Math.min(ordered.length - 2, i)));
      }
    }
    // Tab is handled by the window-level toggle above (editor ↔ task list).
  };

  const today = todayIso();
  const open = todos.filter((t) => !t.done).length;

  return (
    <div className="todo-panel" tabIndex={0} ref={panelRef} onKeyDown={onKeyDown}>
      <PanelHeader title="To-do" sub={`${open} open`}>
        <button
          className={`add-btn ${composing ? "on" : ""}`}
          title="Add a task (A)"
          aria-label="Add a task"
          aria-expanded={composing}
          // Keep focus in the composer, so this click toggles it shut rather
          // than the composer's click-away closing it and this reopening it.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => (composing ? closeComposer() : setComposing(true))}
        >
          <Plus size={16} strokeWidth={2.6} />
        </button>
        <button
          className="nav-btn"
          title={`Sort by deadline (${sortDir === "asc" ? "soonest first" : "latest first"})`}
          aria-label="Toggle deadline sort"
          onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
        >
          {sortDir === "asc" ? (
            <ArrowUpNarrowWide size={18} strokeWidth={1.9} />
          ) : (
            <ArrowDownWideNarrow size={18} strokeWidth={1.9} />
          )}
        </button>
      </PanelHeader>

      <div className="todo-list">
        {composing && <TaskComposer onClose={closeComposer} />}
        {ordered.length === 0 && !composing && (
          <div className="list-empty">
            <Eyes />
            <strong>All clear</strong>
            <span>No tasks. Press + or A to add one.</span>
          </div>
        )}
        {ordered.length > 0 && (
          <div className="list-group">
            {ordered.map(({ todo, index }, pos) => {
              const overdue = !!todo.deadline && !todo.done && todo.deadline < today;
              return (
                <div
                  key={index}
                  className={`todo-item ${todo.done ? "done" : ""} ${pos === selected ? "selected" : ""}`}
                  style={subjectStyle(todo.subject, colors)}
                  onClick={() => setSelected(pos)}
                  onDoubleClick={() => setEditingTodo(index)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setSelected(pos);
                    useStore.getState().setTaskMenu({ x: e.clientX, y: e.clientY, index });
                  }}
                >
                  <input
                    type="checkbox"
                    className="check"
                    checked={todo.done}
                    aria-label={todo.done ? "Mark as not done" : "Mark as done"}
                    onChange={() => toggleTodoAt(index)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <div className="todo-body">
                    <span
                      className="todo-text"
                      title="Click to edit"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelected(pos);
                        setEditingTodo(index);
                      }}
                    >
                      {todo.text}
                    </span>
                    {(todo.subject || todo.deadline) && (
                      <span className="todo-meta">
                        {todo.subject && <span className="subj-label">{todo.subject}</span>}
                        {todo.deadline && (
                          <span className={`todo-date ${overdue ? "overdue" : ""}`}>
                            {dueLabel(todo.deadline)}
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
