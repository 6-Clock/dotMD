import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useStore } from "../../store";
import type { Todo } from "../../api";
import { subjectStyle } from "../../subjects";
import { TaskComposer } from "../TaskComposer";
import { ymd, parseIso } from "../../dates";

const LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

type Mode = "month" | "year";

const monthStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const daysIn = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
const addDays = (iso: string, n: number) => {
  const d = parseIso(iso);
  d.setDate(d.getDate() + n);
  return ymd(d);
};
/** Shift by whole months, clamping the day (Jan 31 → Feb 28). */
const addMonths = (iso: string, n: number) => {
  const d = parseIso(iso);
  const y = d.getFullYear();
  const m = d.getMonth() + n;
  return ymd(new Date(y, m, Math.min(d.getDate(), daysIn(y, m))));
};

/** Full weeks for a month grid (Sunday first), null for days outside it. */
function monthCells(y: number, m: number): (Date | null)[] {
  const lead = new Date(y, m, 1).getDay();
  const n = daysIn(y, m);
  const out: (Date | null)[] = Array(lead).fill(null);
  for (let d = 1; d <= n; d++) out.push(new Date(y, m, d));
  while (out.length % 7) out.push(null);
  return out;
}

const DAY_MS = 86_400_000;
/** Whole local days from a to b (DST-safe: both are local midnights). */
const dayDiff = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / DAY_MS);

// Year grid spacing: days in a week sit close, weeks are split by a wider gap,
// and side-by-side stacks of weeks by a wider one still.
const YP_DAY_GAP = 2;
const YP_WEEK_GAP = 5;
const YP_BAND_GAP = 14;
const YP_HEAD = 16; // weekday letters row + its gap

/** How many side-by-side stacks of week rows (each 7 days wide) and what cell
 *  size best fill a W×H box with `weeks` rows. */
function fitWeeks(w: number, h: number, weeks: number) {
  let best = { bands: 1, cell: 4 };
  for (let bands = 1; bands <= 6; bands++) {
    const rows = Math.ceil(weeks / bands);
    const byW = (w - (bands - 1) * YP_BAND_GAP - bands * 6 * YP_DAY_GAP) / (7 * bands);
    const byH = (h - YP_HEAD - (rows - 1) * YP_WEEK_GAP) / rows;
    const cell = Math.min(28, Math.floor(Math.min(byW, byH)));
    if (cell > best.cell) best = { bands, cell };
  }
  return best;
}

/** The year as a grid of days, filling the rest of the column: past = ink,
 *  today = sticker, future = wash. Hovering a day swaps the readout for that
 *  day; clicking jumps the agenda. */
function YearProgress({ todayIso, onPick }: { todayIso: string; onPick: (iso: string) => void }) {
  const today = parseIso(todayIso);
  const y = today.getFullYear();
  const [hover, setHover] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) =>
      setBox({ w: e.contentRect.width, h: e.contentRect.height }),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const days = useMemo(() => {
    const n = dayDiff(new Date(y, 0, 1), new Date(y + 1, 0, 1));
    return Array.from({ length: n }, (_, i) => ymd(new Date(y, 0, i + 1)));
  }, [y]);

  // One row per week, Sunday-first like the mini month; the first week is
  // padded with blanks before Jan 1.
  const weeks = useMemo(() => {
    const cells: (number | null)[] = [...Array(new Date(y, 0, 1).getDay()).fill(null), ...days.map((_, i) => i)];
    const out: (number | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) out.push(cells.slice(i, i + 7));
    return out;
  }, [y, days]);

  const { bands, cell } = fitWeeks(box.w, box.h, weeks.length);
  const perBand = Math.ceil(weeks.length / bands);

  const dayNo = dayDiff(new Date(y, 0, 1), today); // 0-based index of today
  const left = days.length - dayNo - 1;
  const pct = Math.round(((dayNo + 1) / days.length) * 100);

  let big: ReactNode = left;
  let unit: ReactNode = "days left";
  let sub: ReactNode = `${pct}% of ${y} gone`;
  if (hover) {
    const d = parseIso(hover);
    const diff = dayDiff(today, d);
    big = diff === 0 ? left : Math.abs(diff);
    unit = diff === 0 ? "today" : diff > 0 ? (diff === 1 ? "day to go" : "days to go") : diff === -1 ? "day ago" : "days ago";
    sub = d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  }

  const target = (e: ReactMouseEvent) => (e.target as HTMLElement).dataset.iso ?? null;

  return (
    <section className="yp" aria-label={`${y}: ${left} days left, ${pct}% through`}>
      <h2 className="cal-label">{y}</h2>
      <div className="yp-box" ref={boxRef}>
        {box.w > 0 && (
          <div
            className="yp-grid"
            style={
              {
                gap: YP_BAND_GAP,
                "--yp-cell": `${cell}px`,
                "--yp-day-gap": `${YP_DAY_GAP}px`,
                "--yp-week-gap": `${YP_WEEK_GAP}px`,
              } as CSSProperties
            }
            onMouseOver={(e) => setHover(target(e))}
            onMouseLeave={() => setHover(null)}
            onClick={(e) => {
              const iso = target(e);
              if (iso) onPick(iso);
            }}
          >
            {Array.from({ length: bands }, (_, b) => (
              <div className="yp-band" key={b}>
                {LETTERS.map((l, k) => (
                  <span key={`h${k}`} className="yp-wd" aria-hidden>
                    {l}
                  </span>
                ))}
                {weeks.slice(b * perBand, (b + 1) * perBand).map((week, r) =>
                  week.map((i, k) =>
                    i === null ? (
                      <span key={`${r}-${k}`} className="yp-pad" />
                    ) : (
                      <i
                        key={days[i]}
                        data-iso={days[i]}
                        className={i < dayNo ? "past" : i === dayNo ? "now" : undefined}
                      />
                    ),
                  ),
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className={`yp-read ${hover ? "peek" : ""}`} aria-hidden>
        <span className="yp-big">{big}</span>
        <span className="yp-unit">
          <b>{unit}</b>
          <span>{sub}</span>
        </span>
      </div>
    </section>
  );
}

export function Calendar() {
  const todos = useStore((s) => s.todos);
  const toggleTodoAt = useStore((s) => s.toggleTodoAt);
  const setEditingTodo = useStore((s) => s.setEditingTodo);
  const colors = useStore((s) => s.settings?.subject_colors);

  const todayIso = ymd(new Date());
  const [mode, setMode] = useState<Mode>("month");
  const [cursor, setCursor] = useState(() => monthStart(new Date()));
  const [selected, setSelected] = useState<string>(todayIso);
  const [adding, setAdding] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const agendaRef = useRef<HTMLDivElement>(null);
  const dayRefs = useRef(new Map<string, HTMLElement>());
  // A day to bring into view after the next render (keyboard / mini month).
  const scrollTo = useRef<{ iso: string; smooth: boolean } | null>({ iso: todayIso, smooth: false });

  // deadline → todo indices due that day, open ones first.
  const byDate = useMemo(() => {
    const m = new Map<string, number[]>();
    todos.forEach((t, i) => {
      if (!t.deadline) return;
      if (!m.has(t.deadline)) m.set(t.deadline, []);
      m.get(t.deadline)!.push(i);
    });
    for (const list of m.values())
      list.sort((a, b) => Number(todos[a].done) - Number(todos[b].done));
    return m;
  }, [todos]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  // The agenda runs on past the month's end: this month, then all of the next.
  const agendaDays = useMemo(() => {
    const n = daysIn(year, month) + daysIn(year, month + 1);
    return Array.from({ length: n }, (_, i) => new Date(year, month, i + 1));
  }, [year, month]);
  const rangeEnd = ymd(new Date(year, month + 2, 1)); // exclusive

  // The month the header / mini month name: whichever the agenda is scrolled into.
  const [shown, setShown] = useState(cursor);
  const nextMonthRef = useRef<HTMLDivElement>(null);
  useEffect(() => setShown(cursor), [cursor]);
  const onAgendaScroll = () => {
    const box = agendaRef.current;
    const mark = nextMonthRef.current;
    if (!box || !mark) return;
    const inNext = mark.offsetTop - box.scrollTop < box.clientHeight / 3;
    const m = inNext ? new Date(year, month + 1, 1) : cursor;
    if (m.getTime() !== shown.getTime()) setShown(m);
  };

  /** Select a day, and scroll the agenda to it (re-basing the agenda on its
   *  month only when the day is outside what's rendered). */
  const jump = (iso: string, smooth = true) => {
    setSelected(iso);
    if (iso < ymd(cursor) || iso >= rangeEnd) setCursor(monthStart(parseIso(iso)));
    scrollTo.current = { iso, smooth };
  };

  useLayoutEffect(() => {
    const target = scrollTo.current;
    if (!target || mode !== "month") return;
    const el = dayRefs.current.get(target.iso);
    if (!el) return;
    scrollTo.current = null;
    el.scrollIntoView({ block: target.smooth ? "nearest" : "start", behavior: target.smooth ? "smooth" : "auto" });
  });

  const shiftPeriod = (dir: 1 | -1) => {
    if (mode === "year") {
      setCursor(new Date(year + dir, month, 1));
      setSelected((s) => addMonths(s, 12 * dir));
    } else {
      const c = new Date(shown.getFullYear(), shown.getMonth() + dir, 1);
      setCursor(c);
      scrollTo.current = null;
      agendaRef.current?.scrollTo({ top: 0 });
    }
  };

  const startAdd = (iso: string) => {
    setSelected(iso);
    setAdding(iso);
  };
  const closeAdd = () => {
    setAdding(null);
    rootRef.current?.focus();
  };

  const openInMonth = (iso: string) => {
    setMode("month");
    jump(iso, false);
  };

  // Steal focus from the editor underneath so the keys drive the calendar.
  useEffect(() => {
    rootRef.current?.focus();
  }, []);

  // Keyboard. Month: ↑/↓ day, ←/→ week. Year: grid arrows. PgUp/PgDn period,
  // N/Enter add (month) or open (year), Y toggles, T today.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      // Let modified combos (e.g. Ctrl+T for the toolbar) reach the global handler.
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (useStore.getState().editingTodo !== null) return;
      const yearMode = mode === "year";
      const step: Record<string, number> = yearMode
        ? { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
        : { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -7, ArrowRight: 7 };
      if (e.key in step) {
        e.preventDefault();
        jump(addDays(selected, step[e.key]));
        return;
      }
      switch (e.key) {
        case "PageUp":
        case "PageDown": {
          e.preventDefault();
          const dir = e.key === "PageUp" ? -1 : 1;
          jump(addMonths(selected, yearMode ? 12 * dir : dir), false);
          break;
        }
        case "Enter":
        case "n":
        case "N":
          e.preventDefault();
          if (yearMode) openInMonth(selected);
          else startAdd(selected);
          break;
        case "y":
        case "Y":
          e.preventDefault();
          setMode((m) => (m === "month" ? "year" : "month"));
          scrollTo.current = { iso: selected, smooth: false };
          break;
        case "t":
        case "T":
          e.preventDefault();
          jump(todayIso);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, selected, todayIso]);

  // Mini-month / year-grid day button with task dots.
  const dayButton = (d: Date | null, i: number, dots: number, onPick: (iso: string) => void) => {
    if (!d) return <span key={`e${i}`} className="mini-day empty" />;
    const iso = ymd(d);
    const items = byDate.get(iso) ?? [];
    const open = items.filter((idx) => !todos[idx].done);
    const late = open.length > 0 && iso < todayIso;
    return (
      <button
        key={iso}
        className={`mini-day ${iso === todayIso ? "cal-today" : ""} ${iso === selected ? "selected" : ""}`}
        aria-label={`${d.toLocaleDateString(undefined, { month: "long", day: "numeric" })}${
          items.length ? `, ${items.length} tasks` : ""
        }`}
        onClick={() => onPick(iso)}
      >
        {d.getDate()}
        {items.length > 0 && (
          <span className="mini-dots">
            {late ? (
              <i className="late" />
            ) : (
              (open.length ? open : items).slice(0, dots).map((idx) => (
                <i
                  key={idx}
                  className={todos[idx].done ? "done" : ""}
                  style={subjectStyle(todos[idx].subject, colors)}
                />
              ))
            )}
          </span>
        )}
      </button>
    );
  };

  const miniMonth = (y: number, m: number, dots: number, onPick: (iso: string) => void) => (
    <div className="mini-grid">
      {LETTERS.map((l, i) => (
        <span key={i} className="mini-wd">
          {l}
        </span>
      ))}
      {monthCells(y, m).map((d, i) => dayButton(d, i, dots, onPick))}
    </div>
  );

  const card = (idx: number, iso: string) => {
    const t: Todo = todos[idx];
    const late = !t.done && iso < todayIso;
    const firstLine = t.description.split("\n")[0];
    return (
      <article
        key={idx}
        className={`ag-card ${t.done ? "done" : ""}`}
        style={subjectStyle(t.subject, colors)}
        tabIndex={0}
        onClick={() => setEditingTodo(idx)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.stopPropagation();
            setEditingTodo(idx);
          }
        }}
      >
        <input
          type="checkbox"
          className="check"
          checked={t.done}
          aria-label={t.done ? "Mark as not done" : "Mark as done"}
          onChange={() => toggleTodoAt(idx)}
          onClick={(e) => e.stopPropagation()}
        />
        <div className="ag-card-body">
          <span className="ag-card-title">{t.text}</span>
          {(t.subject || firstLine || late) && (
            <span className="ag-card-meta">
              {t.subject && <span className="ag-subj">{t.subject}</span>}
              {firstLine && <span className="ag-desc">{firstLine}</span>}
              {late && <span className="ag-late">Overdue</span>}
            </span>
          )}
        </div>
      </article>
    );
  };

  return (
    <div className={`calendar ${mode}`} ref={rootRef} tabIndex={0}>
      {mode === "month" && (
        <aside className="cal-side">
          <div className="mini-head">
            <span className="mini-title">
              {shown.toLocaleDateString(undefined, { month: "long" })} {shown.getFullYear()}
            </span>
            <button className="icon-btn" aria-label="Previous month" onClick={() => shiftPeriod(-1)}>
              <ChevronLeft size={15} strokeWidth={2.2} />
            </button>
            <button className="icon-btn" aria-label="Next month" onClick={() => shiftPeriod(1)}>
              <ChevronRight size={15} strokeWidth={2.2} />
            </button>
          </div>
          {miniMonth(shown.getFullYear(), shown.getMonth(), 3, (iso) => jump(iso))}

          <YearProgress todayIso={todayIso} onPick={(iso) => jump(iso)} />
        </aside>
      )}

      <section className="cal-main">
        <header className="cal-header">
          <h1 className="cal-title">
            {mode === "month" && shown.toLocaleDateString(undefined, { month: "long" })}{" "}
            <span className="cal-year">{mode === "month" ? shown.getFullYear() : year}</span>
          </h1>
          <button className="cal-btn" onClick={() => jump(todayIso)}>
            Today
          </button>
          <div className="cal-nav">
            <button
              className="icon-btn"
              aria-label={mode === "year" ? "Previous year" : "Previous month"}
              onClick={() => shiftPeriod(-1)}
            >
              <ChevronLeft size={16} strokeWidth={2.2} />
            </button>
            <button
              className="icon-btn"
              aria-label={mode === "year" ? "Next year" : "Next month"}
              onClick={() => shiftPeriod(1)}
            >
              <ChevronRight size={16} strokeWidth={2.2} />
            </button>
          </div>
          <div className="cal-mode" role="tablist" aria-label="Calendar view">
            {(["month", "year"] as const).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                className={mode === m ? "on" : ""}
                onClick={() => {
                  setMode(m);
                  scrollTo.current = { iso: selected, smooth: false };
                }}
              >
                {m === "month" ? "Month" : "Year"}
              </button>
            ))}
          </div>
        </header>

        {mode === "month" ? (
          <div className="agenda" ref={agendaRef} onScroll={onAgendaScroll}>
            {agendaDays.map((d) => {
              const iso = ymd(d);
              const items = byDate.get(iso) ?? [];
              const past = iso < todayIso;
              const newMonth = d.getDate() === 1 && d.getMonth() !== month;
              return (
                <Fragment key={iso}>
                {newMonth && (
                  <div className="ag-month" ref={nextMonthRef}>
                    <span className="ag-month-name">
                      {d.toLocaleDateString(undefined, { month: "long" })}
                    </span>
                    <span className="ag-month-year">{d.getFullYear()}</span>
                  </div>
                )}
                <div
                  ref={(el) => {
                    if (el) dayRefs.current.set(iso, el);
                    else dayRefs.current.delete(iso);
                  }}
                  className={`ag-day ${past ? "past" : ""} ${iso === selected ? "selected" : ""}`}
                  onClick={() => setSelected(iso)}
                >
                  <div className="ag-date">
                    <span className={`ag-num ${iso === todayIso ? "cal-today" : ""}`}>
                      {String(d.getDate()).padStart(2, "0")}
                    </span>
                    <span className="ag-wd">
                      {d.toLocaleDateString(undefined, { weekday: "short" })}
                    </span>
                  </div>

                  <div className="ag-items">
                    {items.length === 0 && adding !== iso && (
                      <div className="ag-empty">
                        <span>Nothing due</span>
                        <button
                          className="ag-add"
                          aria-label="Add a task for this day"
                          onClick={(e) => {
                            e.stopPropagation();
                            startAdd(iso);
                          }}
                        >
                          <Plus size={15} strokeWidth={2.4} />
                        </button>
                      </div>
                    )}
                    {items.map((idx) => card(idx, iso))}
                    {adding === iso && <TaskComposer key={iso} fixedDate={iso} onClose={closeAdd} />}
                    {items.length > 0 && adding !== iso && (
                      <button
                        className="ag-add end"
                        aria-label="Add a task for this day"
                        onClick={(e) => {
                          e.stopPropagation();
                          startAdd(iso);
                        }}
                      >
                        <Plus size={15} strokeWidth={2.4} />
                      </button>
                    )}
                  </div>
                </div>
                </Fragment>
              );
            })}
          </div>
        ) : (
          <div className="year-grid">
            {Array.from({ length: 12 }, (_, m) => (
              <div
                key={m}
                className={`year-month ${year === new Date().getFullYear() && m === new Date().getMonth() ? "current" : ""}`}
              >
                <button
                  className="year-month-name"
                  onClick={() => openInMonth(ymd(new Date(year, m, 1)))}
                >
                  {new Date(year, m, 1).toLocaleDateString(undefined, { month: "long" })}
                </button>
                {miniMonth(year, m, 1, (iso) => openInMonth(iso))}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
