import { useMemo, useState } from "react";
import { CalendarDays } from "lucide-react";
import { useStore } from "../../store";
import { Eyes } from "../Eyes";
import type { Todo } from "../../api";
import { subjectStyle } from "../../subjects";
import { dueLabel, todayIso } from "../../dates";
import { SwatchPicker } from "../SwatchPicker";
import { ContextMenu, type MenuItem } from "../ContextMenu";

type Item = { todo: Todo; index: number };

export function Board() {
  const todos = useStore((s) => s.todos);
  const projects = useStore((s) => s.projects);
  const toggleTodoAt = useStore((s) => s.toggleTodoAt);
  const setEditingTodo = useStore((s) => s.setEditingTodo);
  const colors = useStore((s) => s.settings?.subject_colors);
  const setSubjectColor = useStore((s) => s.setSubjectColor);
  const addTodo = useStore((s) => s.addTodo);
  const renameSubject = useStore((s) => s.renameSubject);
  const deleteSubject = useStore((s) => s.deleteSubject);
  const [picking, setPicking] = useState<string | null>(null);
  // Subject menu ("" = the No subject box), inline rename, inline add.
  const [menu, setMenu] = useState<{ x: number; y: number; subject: string } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameTo, setRenameTo] = useState("");
  const [adding, setAdding] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  // Group by subject, preserving first-appearance order; "No subject" last.
  // Within a column: open first (soonest deadline first), done at the bottom.
  const columns = useMemo(() => {
    const map = new Map<string, Item[]>();
    todos.forEach((todo, index) => {
      const key = todo.subject || "";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push({ todo, index });
    });
    // A project with no tasks yet still gets its (empty) box.
    for (const p of projects) if (!map.has(p.name)) map.set(p.name, []);
    const keys = Array.from(map.keys()).filter((k) => k !== "");
    if (map.has("")) keys.push("");
    const rank = (t: Todo) => (t.done ? "2" : t.deadline ? `0${t.deadline}` : "1");
    return keys.map((subject) => ({
      subject,
      items: map.get(subject)!.slice().sort((a, b) => rank(a.todo).localeCompare(rank(b.todo))),
    }));
  }, [todos, projects]);

  const startAdd = (subject: string) => {
    setAdding(subject);
    setDraft("");
  };

  const commitAdd = (subject: string, keepOpen: boolean) => {
    const text = draft.trim();
    if (text) addTodo(text, { subject });
    setDraft("");
    if (!text || !keepOpen) setAdding(null);
  };

  const startRename = (subject: string) => {
    setRenaming(subject);
    setRenameTo(subject);
  };

  const commitRename = (from: string) => {
    setRenaming(null);
    renameSubject(from, renameTo);
  };

  const menuItems = (subject: string, count: number): MenuItem[] => {
    const add = { label: "Add task", onClick: () => startAdd(subject) };
    if (!subject) return [add];
    return [
      add,
      { label: "Rename", onClick: () => startRename(subject) },
      { label: "Change colour", onClick: () => setPicking(subject) },
      { label: "-" },
      {
        label: `Delete subject · ${count} ${count === 1 ? "task" : "tasks"}`,
        danger: true,
        onClick: () => deleteSubject(subject),
      },
    ];
  };

  const today = todayIso();
  const open = todos.filter((t) => !t.done).length;
  const overdue = todos.filter((t) => !t.done && t.deadline && t.deadline < today).length;

  if (todos.length === 0) {
    return (
      <div className="board">
        <div className="view-empty">
          <Eyes size={40} />
          <strong>No tasks yet</strong>
          <span>Add tasks in the To-do panel. Each subject gets its own coloured box here.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="board" onMouseDown={() => setPicking(null)}>
      <header className="view-head">
        <h1>Board</h1>
        <span className="view-sub">
          {open} open
          {overdue > 0 && <span className="overdue-text"> · {overdue} overdue</span>}
        </span>
      </header>

      <div className="board-cols">
        {columns.map((col) => {
          const done = col.items.filter((i) => i.todo.done).length;
          const total = col.items.length;
          return (
            <section
              className={`board-col ${col.subject ? "" : "neutral"}`}
              key={col.subject || "__none"}
              style={subjectStyle(col.subject, colors)}
            >
              <div
                className="board-col-head"
                onContextMenu={(e) => {
                  e.preventDefault();
                  setMenu({ x: e.clientX, y: e.clientY, subject: col.subject });
                }}
              >
                {col.subject ? (
                  <button
                    className="subj-dot"
                    title="Change colour"
                    aria-label={`Change colour for ${col.subject}`}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={() => setPicking((p) => (p === col.subject ? null : col.subject))}
                  />
                ) : (
                  <span className="subj-dot none" />
                )}
                {renaming === col.subject && col.subject ? (
                  <input
                    className="col-title-input"
                    autoFocus
                    value={renameTo}
                    aria-label={`Rename ${col.subject}`}
                    onFocus={(e) => e.currentTarget.select()}
                    onChange={(e) => setRenameTo(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename(col.subject);
                      if (e.key === "Escape") setRenaming(null);
                    }}
                    onBlur={() => commitRename(col.subject)}
                  />
                ) : (
                  <h2>
                    <button
                      className="col-title"
                      title="Subject options"
                      aria-haspopup="menu"
                      onClick={(e) => {
                        const r = e.currentTarget.getBoundingClientRect();
                        setMenu({ x: r.left, y: r.bottom + 8, subject: col.subject });
                      }}
                    >
                      {col.subject || "No subject"}
                    </button>
                  </h2>
                )}
                <span className="col-count">
                  {done}/{total}
                </span>
                {picking === col.subject && col.subject && (
                  <div className="popover" onMouseDown={(e) => e.stopPropagation()}>
                    <SwatchPicker
                      value={colors?.[col.subject]}
                      onChange={(name) => {
                        setSubjectColor(col.subject, name);
                        setPicking(null);
                      }}
                    />
                  </div>
                )}
              </div>
              <div className="col-progress" aria-hidden>
                <span style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
              </div>

              {adding === col.subject && (
                <input
                  className="board-add-input"
                  autoFocus
                  value={draft}
                  placeholder={col.subject ? `New task in ${col.subject}` : "New task"}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitAdd(col.subject, true);
                    if (e.key === "Escape") setAdding(null);
                  }}
                  onBlur={() => commitAdd(col.subject, false)}
                />
              )}

              <div className="board-cards">
                {col.items.map(({ todo, index }) => {
                  const late = !!todo.deadline && !todo.done && todo.deadline < today;
                  const isToday = todo.deadline === today && !todo.done;
                  return (
                    <article
                      className={`board-card ${todo.done ? "done" : ""}`}
                      key={index}
                      tabIndex={0}
                      onClick={() => setEditingTodo(index)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") setEditingTodo(index);
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        useStore.getState().setTaskMenu({ x: e.clientX, y: e.clientY, index });
                      }}
                    >
                      <div className="board-card-top">
                        <input
                          type="checkbox"
                          className="check"
                          checked={todo.done}
                          aria-label={todo.done ? "Mark as not done" : "Mark as done"}
                          onChange={() => toggleTodoAt(index)}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <span className="board-card-name">{todo.text}</span>
                      </div>
                      {todo.description && (
                        <p className="board-card-desc">{todo.description}</p>
                      )}
                      {todo.deadline && (
                        <span
                          className={`due-chip ${late ? "overdue" : ""} ${isToday ? "today" : ""}`}
                        >
                          <CalendarDays size={12} strokeWidth={2.2} />
                          {late ? `Overdue · ${dueLabel(todo.deadline)}` : dueLabel(todo.deadline)}
                        </span>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems(
            menu.subject,
            columns.find((c) => c.subject === menu.subject)?.items.length ?? 0,
          )}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}
