import { useEffect, useLayoutEffect, useRef } from "react";
import { Plus, RotateCcw, X } from "lucide-react";
import {
  attachTerminal,
  closeTerminal,
  detachTerminal,
  fitTerminal,
  folderName,
  newTerminal,
  restartTerminal,
  selectTerminal,
  useTerminals,
  type TermMeta,
} from "../../terminal";
import { Eyes } from "../Eyes";

/* Terminal (full view): a session rail on the left (one row per cmd.exe,
   named after its folder, last command underneath, a status dot; the open one
   is the sticker) and a paper sheet on the right holding the live terminal.
   Sessions keep running when you leave the view. */

function subline(m: TermMeta) {
  if (m.status === "starting") return "starting…";
  if (m.status === "exited") return m.code === null ? "exited" : `exited · code ${m.code}`;
  return m.last || m.cwd;
}

function dotClass(m: TermMeta) {
  if (m.status === "running") return "run";
  if (m.status === "exited") return m.code ? "dead" : "done";
  if (m.status === "starting") return "starting";
  return "idle";
}

export function TerminalView() {
  const sessions = useTerminals((s) => s.sessions);
  const active = useTerminals((s) => s.active);
  const mountRef = useRef<HTMLDivElement>(null);
  const cur = sessions.find((m) => m.key === active) ?? null;

  // First visit: start a shell straight away.
  useEffect(() => {
    if (useTerminals.getState().sessions.length === 0) newTerminal();
  }, []);

  // Show the active session's terminal in the sheet.
  useLayoutEffect(() => {
    const el = mountRef.current;
    if (!el || active === null) return;
    attachTerminal(active, el);
    return () => detachTerminal(active);
  }, [active]);

  // Refit on any size change (window, side panel, zoom).
  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const a = useTerminals.getState().active;
        if (a !== null) fitTerminal(a);
      });
    });
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <div className="terminal-view">
      <aside className="tm-list" aria-label="Terminal sessions">
        <div className="tm-head">
          <h1 className="tm-title">Terminal</h1>
          <button className="tm-new" onClick={() => newTerminal()} title="New terminal (Ctrl+Shift+T)">
            <Plus size={16} strokeWidth={2.6} />
          </button>
        </div>
        {sessions.length > 0 && (
          <h2 className="cal-label tm-label">
            Sessions <span className="cal-label-count">{sessions.length}</span>
          </h2>
        )}
        <div className="tm-rows" role="tablist" aria-orientation="vertical">
          {sessions.map((m) => (
            <button
              key={m.key}
              role="tab"
              aria-selected={m.key === active}
              className={`tm-row ${m.key === active ? "on" : ""}`}
              onClick={() => selectTerminal(m.key)}
              onAuxClick={(e) => e.button === 1 && closeTerminal(m.key)}
              title={m.cwd}
            >
              <span className="tm-row-name">
                <span className={`tm-dot ${dotClass(m)}`} aria-hidden />
                {folderName(m.cwd)}
              </span>
              <span className="tm-row-sub">{subline(m)}</span>
            </button>
          ))}
        </div>
        <span className="tm-keys">
          <kbd>Ctrl</kbd> <kbd>Shift</kbd> <kbd>T</kbd> new · <kbd>Ctrl</kbd> <kbd>Tab</kbd> switch · <kbd>Ctrl</kbd>{" "}
          <kbd>W</kbd> close
        </span>
      </aside>

      <section className="tm-sheet">
        {cur && (
          <header className="tm-sheet-head">
            <span className="tm-shell">{cur.shell}</span>
            <span className="tm-path">{cur.cwd}</span>
            <span className="tm-gap" />
            <button className="tm-btn" onClick={() => restartTerminal(cur.key)} title="Restart this shell">
              <RotateCcw size={14} strokeWidth={2.2} /> Restart
            </button>
            <button className="tm-btn" onClick={() => closeTerminal(cur.key)} title="Close (Ctrl+W)">
              <X size={14} strokeWidth={2.2} /> Close
            </button>
          </header>
        )}
        <div className="tm-mount" ref={mountRef} />
        {cur?.status === "exited" && (
          <div className="tm-exit">
            <span className={`tm-exit-chip ${cur.code ? "bad" : ""}`}>
              Exited{cur.code !== null ? ` · code ${cur.code}` : ""}
            </span>
            <span className="tm-exit-hint">
              <kbd>Enter</kbd> restart · <kbd>Ctrl</kbd> <kbd>W</kbd> close
            </span>
          </div>
        )}
        {!cur && (
          <div className="tm-empty">
            <Eyes size={44} blink />
            <p>No terminals open.</p>
            <button className="btn-primary" onClick={() => newTerminal()}>
              <Plus size={14} strokeWidth={2.6} /> New terminal
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
