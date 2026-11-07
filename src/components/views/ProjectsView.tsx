import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { ChevronLeft, ChevronRight, FileText, Flag, ImagePlus, MoreHorizontal, Plus, X } from "lucide-react";
import { useStore } from "../../store";
import * as api from "../../api";
import type { Project, Todo } from "../../api";
import { subjectStyle } from "../../subjects";
import { dueLabel, parseIso, todayIso, ymd } from "../../dates";
import { IMAGE_EXTS } from "../../editor/images";
import { TaskComposer } from "../TaskComposer";
import { ContextMenu, type MenuItem } from "../ContextMenu";
import { Eyes } from "../Eyes";

/* Projects: a subject promoted with a page. The index is a grid of square
   tiles; a project page is an organizer — Tasks (Open / Done / All) and the
   project's linked Notes, under a paper progress card (big %, one bar per
   task, the Goal). Checking a task off anywhere (here, To-do, Calendar,
   Board) fills its bar. */

type Item = { todo: Todo; index: number };

// assets/ path, resolved once for logo <img> URLs.
let assetsDir: Promise<string> | null = null;
function useLogoSrc(logo: string) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    const m = /assets\/([^/\\]+)$/.exec(logo);
    if (!m) return setSrc("");
    assetsDir ??= api.assetsPath().catch(() => "");
    let live = true;
    assetsDir.then((dir) => {
      if (!live || !dir) return;
      const sep = dir.includes("\\") ? "\\" : "/";
      setSrc(convertFileSrc(`${dir}${sep}${decodeURIComponent(m[1])}`));
    });
    return () => {
      live = false;
    };
  }, [logo]);
  return src;
}

/** One or two initials: "CMPT 361" → "C3", "Thesis" → "T". */
const monogram = (name: string) =>
  name
    .split(/[\s:_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

/** "just now", "12m ago", "3h ago", "Yesterday", "Mon", "Oct 25". */
function edited(ms: number): string {
  if (!ms) return "";
  const mins = Math.round((Date.now() - ms) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const d = new Date(ms);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  if (d >= start) return `${Math.round(mins / 60)}h ago`;
  const days = Math.ceil((start.getTime() - d.getTime()) / 86_400_000);
  if (days <= 1) return "Yesterday";
  if (days < 7) return d.toLocaleDateString(undefined, { weekday: "short" });
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: d.getFullYear() === start.getFullYear() ? undefined : "numeric",
  });
}


/** A tile's cover: the logo image edge to edge, or a big monogram on the
 *  project colour when there's no logo. */
function ProjectCover({ project }: { project: Project }) {
  const src = useLogoSrc(project.logo);
  if (src) return <img className="pj-cover-img" src={src} alt="" draggable={false} />;
  return <span className="pj-cover-mono">{monogram(project.name)}</span>;
}

/** Bar order: done first (by deadline, then added), then open. */
function progressOrder(items: Item[]) {
  const key = (t: Todo) => `${t.deadline || "9999-99-99"}|${t.created}`;
  const done = items.filter((i) => i.todo.done).sort((a, b) => key(a.todo).localeCompare(key(b.todo)));
  const open = items.filter((i) => !i.todo.done).sort((a, b) => key(a.todo).localeCompare(key(b.todo)));
  return [...done, ...open];
}

/* Progress card: the Goal, the big %, and one bar per task (done = ink,
   open = wash). Past BAR_CAP tasks the row turns into BAR_CAP bars filled by
   %, with no per-task hover. */
const BAR_CAP = 40;

function ProgressCard({
  order,
  goal,
  onPick,
}: {
  order: Item[];
  goal: ReactNode;
  onPick: (index: number) => void;
}) {
  const steps = order.length;
  const done = order.filter((i) => i.todo.done).length;
  const pct = steps ? Math.round((done / steps) * 100) : 0;
  const perTask = steps > 0 && steps <= BAR_CAP;
  const count = steps === 0 ? 12 : perTask ? steps : BAR_CAP;
  const filled = perTask ? done : Math.round((pct / 100) * BAR_CAP);
  const [hover, setHover] = useState<number | null>(null);
  const tip = perTask && hover !== null ? order[hover] : null;
  return (
    <section className="pj-progress" aria-label="Progress">
      <div className="pj-goal">
        <span className="pj-goal-label">Goal</span>
        {goal}
      </div>
      <div className="pj-progress-row">
        <span className="pj-pct" aria-label={`${pct}% done`}>
          {pct}
          <small>%</small>
        </span>
        <div
          className={`pj-bars ${perTask ? "live" : ""} ${steps === 0 ? "empty" : ""}`}
          role="img"
          aria-label={steps ? `${done} of ${steps} tasks done` : "No tasks yet"}
          onMouseLeave={() => setHover(null)}
        >
          {Array.from({ length: count }, (_, i) => {
            const t = perTask ? order[i] : null;
            const edge = i < count * 0.2 ? "start" : i >= count * 0.8 ? "end" : "";
            return (
              <span
                key={i}
                className={`pj-seg ${i < filled ? "on" : ""}`}
                style={{ "--i": i } as CSSProperties}
                onMouseEnter={t ? () => setHover(i) : undefined}
                onClick={t ? () => onPick(t.index) : undefined}
              >
                {tip && hover === i && (
                  <span className={`pj-tip ${edge}`}>
                    <span className={tip.todo.done ? "done" : ""}>{tip.todo.text}</span>
                  </span>
                )}
              </span>
            );
          })}
          {steps === 0 && <span className="pj-bars-note">No tasks yet</span>}
        </div>
      </div>
    </section>
  );
}

function useProjectTasks(name: string) {
  const todos = useStore((s) => s.todos);
  return useMemo(
    () => todos.map((todo, index) => ({ todo, index })).filter((i) => i.todo.subject === name),
    [todos, name],
  );
}

const typing = (e: KeyboardEvent) => {
  const el = e.target as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
};

export function ProjectsView() {
  const active = useStore((s) => s.activeProject);
  const project = useStore((s) => s.projects.find((p) => p.name === active));
  return project ? <ProjectPage key={project.name} project={project} /> : <ProjectIndex />;
}

// Index -------------------------------------------------------------------------

function ProjectIndex() {
  const projects = useStore((s) => s.projects);
  const todos = useStore((s) => s.todos);
  const colors = useStore((s) => s.settings?.subject_colors);
  const openProject = useStore((s) => s.openProject);
  const createProject = useStore((s) => s.createProject);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");
  const gridRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Subjects that could become projects.
  const candidates = useMemo(() => {
    const taken = new Set(projects.map((p) => p.name));
    const count = new Map<string, number>();
    for (const t of todos) if (t.subject && !taken.has(t.subject)) count.set(t.subject, (count.get(t.subject) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
  }, [projects, todos]);

  const stats = (name: string) => {
    const mine = todos.filter((t) => t.subject === name);
    // Last activity: the project file's edit or the newest task, whichever is later.
    const file = (projects.find((p) => p.name === name)?.modified ?? 0) * 1000;
    const last = mine.reduce((m, t) => Math.max(m, Date.parse(t.created) || 0), file);
    return { steps: mine.length, done: mine.filter((t) => t.done).length, last };
  };
  const summits = projects.filter((p) => {
    const s = stats(p.name);
    return s.steps > 0 && s.done === s.steps;
  }).length;

  const create = (name: string) => {
    if (!name.trim()) return;
    setCreating(false);
    setDraft("");
    createProject(name);
  };

  useEffect(() => rootRef.current?.focus(), []);

  // N = new project; arrows walk the cards; Enter opens (cards are buttons).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (typing(e) || e.ctrlKey || e.metaKey || e.altKey || document.querySelector(".context-menu")) return;
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        setCreating(true);
        return;
      }
      const cards = Array.from(gridRef.current?.querySelectorAll<HTMLButtonElement>(".pj-card") ?? []);
      if (!cards.length || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
      e.preventDefault();
      const i = cards.indexOf(document.activeElement as HTMLButtonElement);
      const perRow = Math.max(1, Math.round((gridRef.current?.clientWidth ?? 1) / (cards[0].offsetWidth + 16)));
      const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -perRow, ArrowDown: perRow }[e.key]!;
      cards[i < 0 ? 0 : Math.max(0, Math.min(cards.length - 1, i + step))].focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const composer = creating && (
    <div className="pj-new">
      <input
        autoFocus
        className="pj-new-field"
        value={draft}
        placeholder="Project name"
        aria-label="New project name"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") create(draft);
          if (e.key === "Escape") setCreating(false);
        }}
        onBlur={() => !draft.trim() && setCreating(false)}
      />
      {candidates.length > 0 && (
        <div className="pj-cands">
          <span className="pj-cands-label">From your subjects</span>
          {candidates.map((s) => (
            <button
              key={s}
              className="pj-cand"
              style={subjectStyle(s, colors)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => create(s)}
            >
              <i /> {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="projects" ref={rootRef} tabIndex={-1}>
      <header className="view-head pj-head">
        <h1>Projects</h1>
        <span className="view-sub">
          {projects.length} {projects.length === 1 ? "project" : "projects"}
          {summits > 0 && ` · ${summits} at the summit`}
        </span>
        <span className="pj-head-gap" />
        <button className="btn-primary pj-add" onClick={() => setCreating(true)}>
          <Plus size={14} strokeWidth={2.6} /> New project <kbd>N</kbd>
        </button>
      </header>

      {composer}

      {projects.length === 0 ? (
        <div className="view-empty">
          <Eyes size={40} />
          <strong>No projects yet</strong>
          <span>A project is a subject with a page: its tasks, and a mountain that grows a step with each one done.</span>
          {!creating && (
            <button className="btn-primary" onClick={() => setCreating(true)}>
              New project
            </button>
          )}
        </div>
      ) : (
        <div className="pj-grid" ref={gridRef}>
          {projects.map((p) => {
            const s = stats(p.name);
            const pct = s.steps ? Math.round((s.done / s.steps) * 100) : 0;
            return (
              <button
                key={p.name}
                className="pj-card"
                style={subjectStyle(p.name, colors)}
                onClick={() => openProject(p.name)}
              >
                <span className="pj-cover" aria-hidden>
                  <ProjectCover project={p} />
                  {pct === 100 ? (
                    <span className="pj-summit">
                      <Flag size={12} strokeWidth={2.6} /> Summit
                    </span>
                  ) : (
                    <span className="pj-card-pct">
                      {pct}
                      <small>%</small>
                    </span>
                  )}
                </span>
                <span className="pj-card-body">
                <span className="pj-card-text">
                  <span className="pj-card-name">{p.name}</span>
                  <span className="pj-card-meta">
                    {s.steps > 0 && (
                      <>
                        <b>
                          {s.done}/{s.steps}
                        </b>{" "}
                        steps
                      </>
                    )}
                    {s.steps === 0 && "No steps yet"}
                    {s.last > 0 && " · "}
                    {s.last > 0 && `Edited ${edited(s.last)}`}
                  </span>
                </span>
                {/* Percentage complete, in the project colour. */}
                <span
                  className="pj-bar"
                  role="progressbar"
                  aria-valuenow={pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${pct}% complete`}
                >
                  <i style={{ width: `${pct}%` }} />
                </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** The project description: a paragraph that keeps its line breaks. Click to
 *  edit in a growing text box; Enter saves, Shift+Enter breaks the line, Esc
 *  cancels, clicking away saves. (Not Ctrl+Enter: that's file-&-clear.) */
function DescriptionField({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const t = ref.current;
    if (!t) return;
    t.style.height = "auto";
    t.style.height = `${t.scrollHeight}px`;
  }, [editing, draft]);
  if (editing) {
    return (
      <textarea
        ref={ref}
        autoFocus
        rows={3}
        className="pj-about-text editing"
        value={draft}
        aria-label="Description"
        placeholder="What is this project, and what's in it?"
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => {
          const n = e.currentTarget.value.length;
          e.currentTarget.setSelectionRange(n, n);
        }}
        onBlur={() => {
          setEditing(false);
          const v = draft.trim();
          if (v !== value) onCommit(v);
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            e.currentTarget.blur();
          }
          if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
      />
    );
  }
  return (
    <button
      className={`pj-about-text ${value ? "" : "empty"}`}
      title="Edit description"
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
    >
      {value || "Add a description"}
    </button>
  );
}

// Planner rail ----------------------------------------------------------------
/* The right side of a project page: when the next deadline is (Schedule), the
   project's deadlines on a mini month (click a day → Tasks shows that day),
   and what's due soon (Up next). Built only from task deadlines. */

const DAY_MS = 86_400_000;
const daysUntil = (from: string, to: string) =>
  Math.round((parseIso(to).getTime() - parseIso(from).getTime()) / DAY_MS);
const addDays = (iso: string, n: number) => {
  const d = parseIso(iso);
  d.setDate(d.getDate() + n);
  return ymd(d);
};
const byDeadline = (a: Item, b: Item) =>
  `${a.todo.deadline}|${a.todo.created}`.localeCompare(`${b.todo.deadline}|${b.todo.created}`);

function ScheduleCard({ items, today, onPick }: { items: Item[]; today: string; onPick: (index: number) => void }) {
  const open = items.filter((i) => !i.todo.done);
  const dated = open.filter((i) => i.todo.deadline).sort(byDeadline);
  const late = dated.filter((i) => i.todo.deadline < today);
  const upcoming = dated.filter((i) => i.todo.deadline >= today);
  const next = upcoming[0];
  const last = dated[dated.length - 1];
  const undated = open.length - dated.length;

  let big: ReactNode;
  if (next) {
    const n = daysUntil(today, next.todo.deadline);
    big =
      n === 0 ? (
        <b>Today</b>
      ) : n === 1 ? (
        <b>Tomorrow</b>
      ) : (
        <>
          <b>{n}</b>
          <span>days</span>
        </>
      );
  } else if (late.length) {
    big = (
      <>
        <b className="late">{late.length}</b>
        <span>overdue</span>
      </>
    );
  }

  const meta: ReactNode[] = [];
  if (next && late.length) meta.push(<span key="l" className="late">{late.length} overdue</span>);
  if (last && last !== next && last.todo.deadline >= today)
    meta.push(<span key="e">last deadline {dueLabel(last.todo.deadline)}</span>);
  if (undated) meta.push(<span key="u">{undated} without a date</span>);

  const lead = next ?? late[0];
  return (
    <section className="pj-rail-card pj-sched" aria-label="Schedule">
      <h2 className="cal-label">{next ? "Next deadline" : "Schedule"}</h2>
      {lead ? (
        <>
          <div className="pj-sched-big">{big}</div>
          <button className="pj-sched-task" onClick={() => onPick(lead.index)} title="Edit task">
            {lead.todo.text}
          </button>
        </>
      ) : (
        <p className="pj-sched-none">
          {items.length && !open.length
            ? `All ${items.length} tasks done.`
            : "No deadlines yet. Give a task a due date and it shows up here and on the month."}
        </p>
      )}
      {meta.length > 0 && (
        <p className="pj-sched-meta">
          {meta.map((m, i) => (
            <span key={i}>
              {i > 0 && " · "}
              {m}
            </span>
          ))}
        </p>
      )}
    </section>
  );
}

const LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

function MiniMonth({
  items,
  today,
  selected,
  onPick,
}: {
  items: Item[];
  today: string;
  selected: string | null;
  onPick: (iso: string) => void;
}) {
  const [cursor, setCursor] = useState(() => {
    const d = parseIso(selected ?? today);
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const shift = (n: number) =>
    setCursor(({ y, m }) => {
      const d = new Date(y, m + n, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  const byDay = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const i of items) if (i.todo.deadline) map.set(i.todo.deadline, [...(map.get(i.todo.deadline) ?? []), i]);
    return map;
  }, [items]);

  const first = new Date(cursor.y, cursor.m, 1);
  const days = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array.from({ length: first.getDay() }, () => null),
    ...Array.from({ length: days }, (_, i) => new Date(cursor.y, cursor.m, i + 1)),
  ];
  const thisYear = cursor.y === parseIso(today).getFullYear();

  return (
    <section className="pj-rail-card pj-month" aria-label="Deadlines this month">
      <div className="mini-head">
        <span className="mini-title">
          {first.toLocaleDateString(undefined, { month: "long" })}
          {thisYear ? "" : ` ${cursor.y}`}
        </span>
        <button className="icon-btn" aria-label="Previous month" onClick={() => shift(-1)}>
          <ChevronLeft size={15} strokeWidth={2.2} />
        </button>
        <button className="icon-btn" aria-label="Next month" onClick={() => shift(1)}>
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
          const due = byDay.get(iso) ?? [];
          const open = due.filter((x) => !x.todo.done);
          const late = open.length > 0 && iso < today;
          return (
            <button
              key={iso}
              className={`mini-day ${iso === today ? "cal-today" : ""} ${iso === selected ? "selected" : ""} ${
                iso < today ? "past" : ""
              }`}
              aria-pressed={iso === selected}
              aria-label={`${d.toLocaleDateString(undefined, { month: "long", day: "numeric" })}${
                due.length ? `, ${due.length} ${due.length === 1 ? "task" : "tasks"}` : ""
              }`}
              onClick={() => onPick(iso)}
            >
              {d.getDate()}
              {due.length > 0 && (
                <span className="mini-dots">
                  {late ? (
                    <i className="late" />
                  ) : (
                    (open.length ? open : due).slice(0, 3).map((x) => (
                      <i key={x.index} className={x.todo.done ? "done" : ""} />
                    ))
                  )}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}

const UP_NEXT_CAP = 6;

function UpNext({
  items,
  today,
  onToggle,
  onPick,
}: {
  items: Item[];
  today: string;
  onToggle: (index: number) => void;
  onPick: (index: number) => void;
}) {
  // Weeks run Sunday → Saturday, like the Calendar.
  const weekEnd = addDays(today, 6 - parseIso(today).getDay());
  const nextEnd = addDays(weekEnd, 7);
  const open = items.filter((i) => !i.todo.done && i.todo.deadline).sort(byDeadline);
  const groups = [
    { label: "Overdue", late: true, rows: open.filter((i) => i.todo.deadline < today) },
    { label: "This week", late: false, rows: open.filter((i) => i.todo.deadline >= today && i.todo.deadline <= weekEnd) },
    { label: "Next week", late: false, rows: open.filter((i) => i.todo.deadline > weekEnd && i.todo.deadline <= nextEnd) },
  ];
  let budget = UP_NEXT_CAP;
  const shown = groups
    .map((g) => {
      const rows = g.rows.slice(0, Math.max(0, budget));
      budget -= rows.length;
      return { ...g, rows, more: g.rows.length - rows.length };
    })
    .filter((g) => g.rows.length || g.more);
  if (!shown.length) return null;

  return (
    <section className="pj-rail-card pj-next" aria-label="Up next">
      {shown.map((g) => (
        <div key={g.label} className="pj-next-group">
          <h3 className={`pj-next-label ${g.late ? "late" : ""}`}>
            {g.label} <span>{g.rows.length + g.more}</span>
          </h3>
          {g.rows.map(({ todo, index }) => (
            <div key={index} className="pj-next-row" onClick={() => onPick(index)}>
              <input
                type="checkbox"
                className="check"
                checked={false}
                aria-label="Mark as done"
                onChange={() => onToggle(index)}
                onClick={(e) => e.stopPropagation()}
              />
              <span className="pj-next-title">{todo.text}</span>
              <span className={`pj-next-due ${g.late ? "late" : ""}`}>{dueLabel(todo.deadline)}</span>
            </div>
          ))}
          {g.more > 0 && <span className="pj-next-more">+{g.more} more</span>}
        </div>
      ))}
    </section>
  );
}

// Project page ----------------------------------------------------------------

/** Click-to-edit text: Enter / blur saves, Esc cancels. */
function InlineField({
  value,
  placeholder,
  className,
  onCommit,
  label,
}: {
  value: string;
  placeholder: string;
  className: string;
  onCommit: (v: string) => void;
  label: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  if (editing) {
    return (
      <input
        autoFocus
        className={`${className} pj-field editing`}
        value={draft}
        aria-label={label}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={() => {
          setEditing(false);
          if (draft.trim() !== value) onCommit(draft.trim());
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
      />
    );
  }
  return (
    <button
      className={`${className} pj-field ${value ? "" : "empty"}`}
      title={`Edit ${label.toLowerCase()}`}
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
    >
      {value || placeholder}
    </button>
  );
}


// Project page ------------------------------------------------------------------

type TaskFilter = "open" | "done" | "all";
type Section = "tasks" | "notes";

/** Type-ahead picker for linking a note: matches by name or first line, and
 *  offers "New note …" when nothing has that exact name. */
function NotePicker({
  linked,
  onLink,
  onCreate,
  onClose,
}: {
  linked: string[];
  onLink: (name: string) => void;
  onCreate: (name: string) => void;
  onClose: () => void;
}) {
  const notes = useStore((s) => s.notes);
  const [q, setQ] = useState("");
  const [hi, setHi] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const query = q.trim().toLowerCase();
  const matches = notes
    .filter((n) => !linked.includes(n.name))
    .filter((n) => !query || n.name.toLowerCase().includes(query) || n.title.toLowerCase().includes(query))
    .sort((a, b) => {
      // Names that start with the query first, then newest.
      const sa = query && a.name.toLowerCase().startsWith(query) ? 0 : 1;
      const sb = query && b.name.toLowerCase().startsWith(query) ? 0 : 1;
      return sa - sb || b.modified - a.modified;
    })
    .slice(0, 8);
  const exact = notes.some((n) => n.name.toLowerCase() === query);
  const rows: { name: string; create?: boolean; meta?: api.NoteMeta }[] = [
    ...matches.map((n) => ({ name: n.name, meta: n })),
    ...(query && !exact ? [{ name: q.trim(), create: true }] : []),
  ];
  const cur = Math.min(hi, Math.max(0, rows.length - 1));

  useEffect(() => {
    const away = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener("mousedown", away);
    return () => window.removeEventListener("mousedown", away);
  }, [onClose]);

  const pick = (r: (typeof rows)[number]) => (r.create ? onCreate(r.name) : onLink(r.name));

  return (
    <div className="pj-picker" ref={ref}>
      <input
        autoFocus
        className="pj-picker-input"
        placeholder="Find a note, or name a new one"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setHi(0);
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "ArrowDown") setHi(Math.min(rows.length - 1, cur + 1));
          else if (e.key === "ArrowUp") setHi(Math.max(0, cur - 1));
          else if (e.key === "Enter" && rows[cur]) pick(rows[cur]);
          else if (e.key === "Escape") onClose();
          else return;
          e.preventDefault();
        }}
      />
      <div className="pj-picker-list" role="listbox">
        {rows.length === 0 && (
          <span className="pj-picker-empty">{notes.length ? "Every note is already linked" : "No notes yet"}</span>
        )}
        {rows.map((r, i) => (
          <button
            key={`${r.create ? "+" : ""}${r.name}`}
            role="option"
            aria-selected={i === cur}
            className={`pj-picker-row ${i === cur ? "hi" : ""} ${r.create ? "create" : ""}`}
            onMouseEnter={() => setHi(i)}
            onClick={() => pick(r)}
          >
            {r.create ? <Plus size={14} strokeWidth={2.4} /> : <FileText size={14} strokeWidth={2} />}
            <span className="pj-picker-name">{r.create ? `New note “${r.name}”` : r.name}</span>
            {r.meta && <span className="pj-picker-when">{edited(r.meta.modified * 1000)}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

function ProjectPage({ project }: { project: Project }) {
  const colors = useStore((s) => s.settings?.subject_colors);
  const openProject = useStore((s) => s.openProject);
  const updateProject = useStore((s) => s.updateProject);
  const renameSubject = useStore((s) => s.renameSubject);
  const deleteProject = useStore((s) => s.deleteProject);
  const toggleTodoAt = useStore((s) => s.toggleTodoAt);
  const setEditingTodo = useStore((s) => s.setEditingTodo);
  const editingTodo = useStore((s) => s.editingTodo);
  const allNotes = useStore((s) => s.notes);
  const openNote = useStore((s) => s.openNote);
  const linkNote = useStore((s) => s.linkNote);
  const unlinkNote = useStore((s) => s.unlinkNote);
  const newProjectNote = useStore((s) => s.newProjectNote);
  const showUndo = useStore((s) => s.showUndo);

  const items = useProjectTasks(project.name);
  const order = useMemo(() => progressOrder(items), [items]);
  const steps = items.length;
  const done = items.filter((i) => i.todo.done).length;
  const today = todayIso();
  const summit = steps > 0 && done === steps;

  // Open: soonest due first, undated after (oldest first). Done: newest first.
  const openTasks = useMemo(() => {
    const key = (t: Todo) => `${t.deadline ? `0${t.deadline}` : "1"}|${t.created}`;
    return items.filter((i) => !i.todo.done).sort((a, b) => key(a.todo).localeCompare(key(b.todo)));
  }, [items]);
  const doneTasks = useMemo(() => {
    const key = (t: Todo) => `${t.deadline || ""}|${t.created}`;
    return items.filter((i) => i.todo.done).sort((a, b) => key(b.todo).localeCompare(key(a.todo)));
  }, [items]);

  const [filter, setFilter] = useState<TaskFilter>("open");
  const [showDone, setShowDone] = useState(false);
  // A day picked on the rail's mini month: Tasks shows only what's due then.
  const [day, setDay] = useState<string | null>(null);
  const dayTasks = useMemo(
    () => (day ? [...openTasks, ...doneTasks].filter((i) => i.todo.deadline === day) : null),
    [day, openTasks, doneTasks],
  );
  // Rows in on-screen order (the keyboard walks this).
  const taskRows =
    dayTasks ??
    (filter === "done" ? doneTasks : filter === "all" || showDone ? [...openTasks, ...doneTasks] : openTasks);
  const pickDay = (iso: string) => {
    setDay((d) => (d === iso ? null : iso));
    setSection("tasks");
    setSel(0);
  };

  const noteRows = useMemo(
    () => project.notes.map((name) => ({ name, meta: allNotes.find((n) => n.name === name) })),
    [project.notes, allNotes],
  );

  const [section, setSection] = useState<Section>("tasks");
  const [sel, setSel] = useState(0);
  const [noteSel, setNoteSel] = useState(0);
  const [adding, setAdding] = useState(false);
  const [linking, setLinking] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [noteMenu, setNoteMenu] = useState<{ x: number; y: number; name: string } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);

  useEffect(() => rootRef.current?.focus(), []);
  useEffect(() => setSel((s) => Math.min(s, Math.max(0, taskRows.length - 1))), [taskRows.length]);
  useEffect(() => setNoteSel((s) => Math.min(s, Math.max(0, noteRows.length - 1))), [noteRows.length]);
  useEffect(() => {
    mainRef.current?.querySelector(".pj-sel")?.scrollIntoView({ block: "nearest" });
  }, [sel, noteSel, section]);

  const pickLogo = async () => {
    const path = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "Images", extensions: IMAGE_EXTS }],
    }).catch(() => null);
    if (typeof path !== "string") return;
    const logo = await api.importImage(path).catch(() => "");
    if (logo) updateProject({ ...project, logo });
  };

  // Leave the full view so the note shows in the editor.
  const toEditor = () => useStore.setState({ activeView: null });
  const openLinked = (name: string, exists: boolean) => {
    if (exists) openNote(name, "pin").then(toEditor);
    else newProjectNote(project.name, name).then((err) => !err && toEditor());
  };
  const unlink = (name: string) => {
    unlinkNote(project.name, name);
    showUndo(`Removed ${name} from ${project.name}`, () => linkNote(project.name, name));
  };

  // Tab switches Tasks ↔ Notes; ↑/↓ pick in the focused one. Tasks: Space done,
  // Enter edit. Notes: Enter open, Delete unlink. N add task, L link note,
  // Esc back to all projects. Re-bound every render (cheap) so it never reads
  // stale rows.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (editingTodo !== null || adding || linking || menu || noteMenu || document.querySelector(".context-menu"))
        return;
      const k = e.key;
      if (k === "Escape") day ? setDay(null) : openProject(null);
      else if (k === "Tab") setSection((s) => (s === "tasks" ? "notes" : "tasks"));
      else if (k === "n" || k === "N") setAdding(true);
      else if (k === "l" || k === "L") setLinking(true);
      else if (section === "tasks") {
        const cur = taskRows[sel];
        if (k === "ArrowDown") setSel((s) => Math.min(taskRows.length - 1, s + 1));
        else if (k === "ArrowUp") setSel((s) => Math.max(0, s - 1));
        else if (k === " " && cur) toggleTodoAt(cur.index);
        else if (k === "Enter" && cur) setEditingTodo(cur.index);
        else return;
      } else {
        const cur = noteRows[noteSel];
        if (k === "ArrowDown") setNoteSel((s) => Math.min(noteRows.length - 1, s + 1));
        else if (k === "ArrowUp") setNoteSel((s) => Math.max(0, s - 1));
        else if (k === "Enter" && cur) openLinked(cur.name, !!cur.meta);
        else if ((k === "Delete" || k === "Backspace") && cur) unlink(cur.name);
        else return;
      }
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const menuItems: MenuItem[] = [
    { label: project.logo ? "Change logo" : "Add logo", onClick: pickLogo },
    ...(project.logo ? [{ label: "Remove logo", onClick: () => updateProject({ ...project, logo: "" }) }] : []),
    { label: "Rename", onClick: () => setRenaming(true) },
    { label: "-" },
    {
      label: `Delete project · ${steps} ${steps === 1 ? "task" : "tasks"}`,
      danger: true,
      onClick: () => deleteProject(project.name),
    },
  ];

  const taskRow = ({ todo, index }: Item, i: number) => {
    const late = !todo.done && !!todo.deadline && todo.deadline < today;
    const firstLine = todo.description.split("\n")[0];
    const isSel = section === "tasks" && i === sel;
    return (
      <div
        key={index}
        className={`pj-task ${todo.done ? "done" : ""} ${isSel ? "pj-sel" : ""}`}
        onClick={() => {
          setSection("tasks");
          setSel(i);
          setEditingTodo(index);
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
        <span className="pj-task-title">{todo.text}</span>
        <span className="pj-task-desc">{firstLine}</span>
        {todo.deadline && (
          <span className={`pj-task-due ${late ? "late" : ""}`}>
            {late ? "Overdue · " : ""}
            {dueLabel(todo.deadline)}
          </span>
        )}
      </div>
    );
  };

  const taskCount = dayTasks ? dayTasks.length : filter === "done" ? done : filter === "all" ? steps : openTasks.length;
  const dayName = day
    ? parseIso(day).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
    : "";

  return (
    <div className="projects page" ref={rootRef} tabIndex={-1} style={subjectStyle(project.name, colors)}>
      <div className="pj-layout">
      <header className="pj-page-head">
        <div className="pj-topbar">
          <button className="pj-back" onClick={() => openProject(null)} title="All projects (Esc)">
            <ChevronLeft size={16} strokeWidth={2.4} /> Projects
          </button>
          <button
            className="pj-more"
            aria-label="Project menu"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setMenu({ x: r.right - 200, y: r.bottom + 6 });
            }}
          >
            <MoreHorizontal size={18} strokeWidth={2.2} />
          </button>
        </div>
        <div className="pj-hero">
          <div className="pj-about">
        {renaming ? (
          <input
            autoFocus
            className="pj-title pj-field editing"
            defaultValue={project.name}
            aria-label="Project name"
            onFocus={(e) => e.currentTarget.select()}
            onBlur={(e) => {
              setRenaming(false);
              const to = e.currentTarget.value.trim();
              if (to && to !== project.name) renameSubject(project.name, to);
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") {
                e.currentTarget.value = project.name;
                e.currentTarget.blur();
              }
            }}
          />
        ) : (
          <h1 className="pj-title" onDoubleClick={() => setRenaming(true)} title="Double-click to rename">
            {project.name}
          </h1>
        )}
            <DescriptionField
              key={`d:${project.description}`}
              value={project.description}
              onCommit={(description) => updateProject({ ...project, description })}
            />
          </div>
          <button
            className={`pj-image ${project.logo ? "" : "blank"}`}
            onClick={pickLogo}
            aria-label={project.logo ? "Change image" : "Add image"}
            title={project.logo ? "Change image" : "Add image"}
          >
            <ProjectCover project={project} />
            <span className="pj-image-edit" aria-hidden>
              <ImagePlus size={15} strokeWidth={2.2} />
            </span>
          </button>
        </div>
      </header>

      <aside className="pj-rail" aria-label="Planner">
        <ScheduleCard items={items} today={today} onPick={setEditingTodo} />
        <MiniMonth key={project.name} items={items} today={today} selected={day} onPick={pickDay} />
        <UpNext items={items} today={today} onToggle={toggleTodoAt} onPick={setEditingTodo} />
      </aside>

      <div className="pj-progress-slot">
          <ProgressCard
            order={order}
            goal={
              <InlineField
                key={`g:${project.goal}`}
                className="pj-goal-text"
                label="Goal"
                value={project.goal}
                placeholder="What does done look like?"
                onCommit={(goal) => updateProject({ ...project, goal })}
              />
            }
            onPick={setEditingTodo}
          />
      </div>

        <div className="pj-main" ref={mainRef}>
          {/* Tasks ------------------------------------------------------------ */}
          <section className={`pj-sec ${section === "tasks" ? "focus" : ""}`} onMouseDown={() => setSection("tasks")}>
            <div className="pj-sec-head">
              <h2 className="cal-label">
                Tasks <span className="cal-label-count">{taskCount}</span>
              </h2>
              {day ? (
                <button className="pj-day-chip" onClick={() => setDay(null)} title="Show all tasks (Esc)">
                  Due {dayName} <X size={13} strokeWidth={2.6} />
                </button>
              ) : (
                <div className="cal-mode" role="tablist" aria-label="Show tasks">
                  {(["open", "done", "all"] as const).map((f) => (
                    <button
                      key={f}
                      role="tab"
                      aria-selected={filter === f}
                      className={filter === f ? "on" : ""}
                      onClick={() => {
                        setFilter(f);
                        setSel(0);
                      }}
                    >
                      {f === "open" ? "Open" : f === "done" ? "Done" : "All"}
                    </button>
                  ))}
                </div>
              )}
              <button
                className={`add-btn ${adding ? "on" : ""}`}
                aria-label="Add task"
                title="Add task (N)"
                onClick={() => setAdding((a) => !a)}
              >
                <Plus size={16} strokeWidth={2.6} />
              </button>
            </div>
            {adding && (
              <TaskComposer fixedSubject={project.name} fixedDate={day ?? undefined} onClose={() => setAdding(false)} />
            )}
            <div className="pj-tasks">
              {dayTasks && dayTasks.length === 0 && !adding && (
                <button className="pj-empty" onClick={() => setAdding(true)}>
                  <Plus size={14} strokeWidth={2.4} /> Nothing due {dayName}. Add a task for that day
                </button>
              )}
              {dayTasks && dayTasks.map(taskRow)}
              {!dayTasks && steps === 0 && !adding && (
                <button className="pj-empty" onClick={() => setAdding(true)}>
                  <Plus size={14} strokeWidth={2.4} /> Add the first task
                </button>
              )}
              {!dayTasks && filter === "done" && steps > 0 && done === 0 && <span className="pj-none">Nothing finished yet</span>}
              {!dayTasks && filter === "open" && summit && <span className="pj-none">All {steps} tasks done</span>}
              {!dayTasks && (filter === "open" ? openTasks : taskRows).map(taskRow)}
              {!dayTasks && filter === "open" && doneTasks.length > 0 && (
                <>
                  <button className={`pj-fold ${showDone ? "open" : ""}`} onClick={() => setShowDone((v) => !v)}>
                    <ChevronRight size={14} strokeWidth={2.4} />
                    Done <span>{doneTasks.length}</span>
                  </button>
                  {showDone && doneTasks.map((t, i) => taskRow(t, openTasks.length + i))}
                </>
              )}
            </div>
          </section>

          {/* Notes ------------------------------------------------------------ */}
          <section className={`pj-sec ${section === "notes" ? "focus" : ""}`} onMouseDown={() => setSection("notes")}>
            <div className="pj-sec-head">
              <h2 className="cal-label">
                Notes <span className="cal-label-count">{noteRows.length}</span>
              </h2>
              <div className="pj-link-wrap">
                <button
                  className={`st-btn pj-link-btn ${linking ? "on" : ""}`}
                  title="Link a note (L)"
                  onClick={() => setLinking((v) => !v)}
                >
                  <Plus size={14} strokeWidth={2.6} /> Link note
                </button>
                {linking && (
                  <NotePicker
                    linked={project.notes}
                    onClose={() => setLinking(false)}
                    onLink={(name) => {
                      linkNote(project.name, name);
                      setLinking(false);
                      setSection("notes");
                      setNoteSel(project.notes.length);
                    }}
                    onCreate={(name) => {
                      setLinking(false);
                      newProjectNote(project.name, name).then((err) => !err && toEditor());
                    }}
                  />
                )}
              </div>
            </div>
            {noteRows.length === 0 ? (
              <button className="pj-empty" onClick={() => setLinking(true)}>
                <FileText size={14} strokeWidth={2.2} /> Link the notes that belong to this project
              </button>
            ) : (
              <div className="pj-notes">
                {noteRows.map(({ name, meta }, i) => {
                  const preview = meta ? meta.preview || (meta.title !== name ? meta.title : "") : "";
                  return (
                    <div
                      key={name}
                      className={`pj-note ${meta ? "" : "missing"} ${section === "notes" && i === noteSel ? "pj-sel" : ""}`}
                      onClick={() => {
                        setNoteSel(i);
                        openLinked(name, !!meta);
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setNoteSel(i);
                        setNoteMenu({ x: e.clientX, y: e.clientY, name });
                      }}
                    >
                      <FileText className="pj-note-icon" size={15} strokeWidth={2} />
                      <span className="pj-note-name">{name}</span>
                      <span className="pj-note-preview">{meta ? preview : "Missing · click to create it"}</span>
                      <span className="pj-note-end">
                        <span className="pj-note-when">{meta ? edited(meta.modified * 1000) : ""}</span>
                        <button
                          className="row-more"
                          aria-label={`Actions for ${name}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            const r = e.currentTarget.getBoundingClientRect();
                            setNoteSel(i);
                            setNoteMenu({ x: r.right - 200, y: r.bottom + 4, name });
                          }}
                        >
                          <MoreHorizontal size={15} />
                        </button>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <span className="pj-keys">
            <kbd>Tab</kbd> tasks / notes · <kbd>↑</kbd>
            <kbd>↓</kbd> pick · <kbd>Space</kbd> done · <kbd>Enter</kbd> open · <kbd>N</kbd> add task · <kbd>L</kbd>{" "}
            link note · <kbd>Esc</kbd> back
          </span>
        </div>

      </div>

      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />}
      {noteMenu && (
        <ContextMenu
          x={noteMenu.x}
          y={noteMenu.y}
          onClose={() => setNoteMenu(null)}
          items={[
            allNotes.some((n) => n.name === noteMenu.name)
              ? { label: "Open", onClick: () => openLinked(noteMenu.name, true) }
              : { label: "Create note", onClick: () => openLinked(noteMenu.name, false) },
            { label: "-" },
            { label: "Remove from project", onClick: () => unlink(noteMenu.name) },
          ]}
        />
      )}
    </div>
  );
}
