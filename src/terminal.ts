/* Terminal sessions, kept outside React so they survive leaving the Terminal
   view: each session owns an xterm.js instance (+ its host element, moved in
   and out of the view on mount) and a Rust PTY running cmd.exe. A small
   zustand store holds what the session rail shows: folder, last command,
   status. Status and folder are read off cmd's prompt ("C:\path>"). */

import { create } from "zustand";
import { Terminal, type ITheme } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { listen } from "@tauri-apps/api/event";
import "@xterm/xterm/css/xterm.css";
import * as api from "./api";
import { THEME_EVENT } from "./themes";

export type TermStatus = "starting" | "idle" | "running" | "exited";
export type TermMeta = {
  key: number;
  cwd: string;
  shell: string;
  /** Last command submitted at the prompt. */
  last: string;
  status: TermStatus;
  code: number | null;
};

type Live = {
  term: Terminal;
  fit: FitAddon;
  host: HTMLDivElement;
  pty: number | null;
  spawning: boolean;
  opened: boolean;
};

type State = { sessions: TermMeta[]; active: number | null };
export const useTerminals = create<State>(() => ({ sessions: [], active: null }));

const live = new Map<number, Live>();
const byPty = new Map<number, number>(); // pty id → session key
let seq = 0;

const meta = (key: number) => useTerminals.getState().sessions.find((m) => m.key === key);
const patch = (key: number, p: Partial<TermMeta>) =>
  useTerminals.setState((s) => ({ sessions: s.sessions.map((m) => (m.key === key ? { ...m, ...p } : m)) }));

/** "C:\Users\artur\Desktop" → "Desktop"; "C:\" → "C:". */
export const folderName = (cwd: string) => cwd.split(/[\\/]/).filter(Boolean).pop() || cwd || "Terminal";

// Theme -------------------------------------------------------------------------
// ANSI colours retuned as inks on paper; on dark themes, soft pastel inks
// (not neon) so coloured backgrounds like `ls`'s green "other-writable" boxes
// stay calm. minimumContrastRatio (below) keeps any fg/bg pair readable.
const LIGHT_ANSI: ITheme = {
  black: "#141414", red: "#c4321e", green: "#18794e", yellow: "#8f5d00",
  blue: "#2f5fd0", magenta: "#8a3fb8", cyan: "#0f7470", white: "#65655f",
  brightBlack: "#65655f", brightRed: "#d92d20", brightGreen: "#1f9d6b", brightYellow: "#a66c00",
  brightBlue: "#3d6ff0", brightMagenta: "#9c4fd0", brightCyan: "#12867f", brightWhite: "#3a3a36",
};
const DARK_ANSI: ITheme = {
  black: "#3a3a37", red: "#e8897d", green: "#86c29c", yellow: "#dcc184",
  blue: "#9db1dc", magenta: "#c6a5dd", cyan: "#86c3bd", white: "#d8d8d2",
  brightBlack: "#7a7a74", brightRed: "#f0a095", brightGreen: "#a0d3b2", brightYellow: "#e8d19c",
  brightBlue: "#b4c5e8", brightMagenta: "#d6bbe8", brightCyan: "#a2d3ce", brightWhite: "#f2f2ef",
};

function cssVar(name: string, fallback: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function theme(): ITheme {
  const dark = cssVar("--scheme", "light") === "dark";
  const card = cssVar("--card", "#ffffff");
  return {
    ...(dark ? DARK_ANSI : LIGHT_ANSI),
    background: card,
    foreground: cssVar("--text", "#141414"),
    cursor: cssVar("--accent", "#141414"),
    cursorAccent: card,
    selectionBackground: cssVar("--selection", "rgba(20, 20, 20, 0.12)"),
  };
}

// Prompt reading -------------------------------------------------------------------

const PROMPT = /^([A-Za-z]:\\[^>]*)>(.*)$/;

/** The logical line under the cursor (soft-wrapped rows joined). */
function cursorLine(term: Terminal) {
  const buf = term.buffer.active;
  let y = buf.baseY + buf.cursorY;
  let text = buf.getLine(y)?.translateToString(true) ?? "";
  while (y > 0 && buf.getLine(y)?.isWrapped) {
    y -= 1;
    text = (buf.getLine(y)?.translateToString(true) ?? "") + text;
  }
  return text;
}

const pendingStatus = new Set<number>();
function scheduleStatus(key: number) {
  if (pendingStatus.has(key)) return;
  pendingStatus.add(key);
  requestAnimationFrame(() => {
    pendingStatus.delete(key);
    const l = live.get(key);
    const m = meta(key);
    if (!l || !m || m.status === "exited") return;
    const p = PROMPT.exec(cursorLine(l.term));
    if (!p) return;
    const next: Partial<TermMeta> = {};
    if (p[1] !== m.cwd) next.cwd = p[1];
    // Back at an empty prompt: whatever was running has finished.
    if ((m.status === "running" && !p[2].trim()) || m.status === "starting") next.status = "idle";
    if (Object.keys(next).length) patch(key, next);
  });
}

// Events -----------------------------------------------------------------------------

let listening = false;
function ensureListeners() {
  if (listening) return;
  listening = true;
  listen<{ id: number; data: string }>("term-data", (e) => {
    const key = byPty.get(e.payload.id);
    const l = key !== undefined ? live.get(key) : undefined;
    if (key === undefined || !l) return;
    l.term.write(e.payload.data, () => scheduleStatus(key));
  });
  listen<{ id: number; code: number | null }>("term-exit", (e) => {
    const key = byPty.get(e.payload.id);
    const l = key !== undefined ? live.get(key) : undefined;
    if (key === undefined || !l) return;
    l.pty = null;
    patch(key, { status: "exited", code: e.payload.code });
  });
  window.addEventListener(THEME_EVENT, () => {
    const t = theme();
    live.forEach((l) => (l.term.options.theme = t));
  });
}

// Sessions ---------------------------------------------------------------------------

function makeLive(key: number): Live {
  const term = new Terminal({
    fontFamily: cssVar("--font-editor", '"JetBrains Mono", ui-monospace, "Cascadia Mono", monospace'),
    fontSize: 13,
    lineHeight: 1.3,
    cursorBlink: true,
    cursorStyle: "block",
    scrollback: 5000,
    theme: theme(),
    // Text whose colour is too close to its background (e.g. blue on ls's
    // green dir boxes) is nudged lighter/darker until it reads at 4.5:1.
    minimumContrastRatio: 4.5,
  });
  const fit = new FitAddon();
  term.loadAddon(fit);
  const host = document.createElement("div");
  host.className = "term-host";
  const l: Live = { term, fit, host, pty: null, spawning: false, opened: false };

  term.onData((data) => {
    const m = meta(key);
    if (!m) return;
    if (m.status === "exited") {
      if (data === "\r") restartTerminal(key);
      return;
    }
    if (l.pty === null) return;
    if (data.includes("\r")) {
      // Remember what was submitted at the prompt.
      const p = PROMPT.exec(cursorLine(term));
      const cmd = p?.[2].trim();
      if (p && cmd) patch(key, { last: cmd, status: "running", cwd: p[1] });
    }
    api.termWrite(l.pty, data).catch(() => {});
  });
  term.onResize(({ cols, rows }) => {
    if (l.pty !== null) api.termResize(l.pty, cols, rows).catch(() => {});
  });
  term.attachCustomKeyEventHandler((e) => {
    if (e.type !== "keydown") return true;
    const mod = (e.ctrlKey || e.metaKey) && !e.altKey;
    const k = e.key.toLowerCase();
    // Ctrl+C copies when there's a selection, otherwise it interrupts.
    if (mod && !e.shiftKey && k === "c" && term.hasSelection()) {
      navigator.clipboard.writeText(term.getSelection()).catch(() => {});
      term.clearSelection();
      e.preventDefault();
      return false;
    }
    // Ctrl+V: let the browser's paste event reach xterm (it pastes as input).
    if (mod && k === "v") return false;
    return true;
  });
  return l;
}

async function spawn(key: number) {
  const l = live.get(key);
  const m = meta(key);
  if (!l || !m || l.pty !== null || l.spawning) return;
  l.spawning = true;
  try {
    const r = await api.termSpawn(l.term.cols, l.term.rows, m.cwd || undefined);
    if (!live.has(key)) {
      api.termKill(r.id).catch(() => {});
      return;
    }
    l.pty = r.id;
    byPty.set(r.id, key);
    patch(key, { cwd: r.cwd, shell: r.shell.replace(/^.*[\\/]/, "") });
  } catch (err) {
    l.term.write(`\r\n\x1b[31mCouldn't start the shell: ${err}\x1b[0m\r\n`);
    patch(key, { status: "exited", code: null });
  } finally {
    l.spawning = false;
  }
}

/** Open a new session (in `cwd`, else the home folder) and make it active. */
export function newTerminal(cwd?: string): number {
  ensureListeners();
  const key = ++seq;
  live.set(key, makeLive(key));
  useTerminals.setState((s) => ({
    sessions: [...s.sessions, { key, cwd: cwd ?? "", shell: "cmd.exe", last: "", status: "starting", code: null }],
    active: key,
  }));
  return key;
}

export const selectTerminal = (key: number) => useTerminals.setState({ active: key });

export function cycleTerminal(delta: number) {
  const { sessions, active } = useTerminals.getState();
  if (sessions.length < 2) return;
  const i = sessions.findIndex((m) => m.key === active);
  selectTerminal(sessions[(i + delta + sessions.length) % sessions.length].key);
}

/** End the shell and remove the session; the neighbour becomes active. */
export function closeTerminal(key: number) {
  const l = live.get(key);
  if (l) {
    if (l.pty !== null) api.termKill(l.pty).catch(() => {});
    for (const [pty, k] of byPty) if (k === key) byPty.delete(pty);
    l.term.dispose();
    l.host.remove();
    live.delete(key);
  }
  useTerminals.setState((s) => {
    const i = s.sessions.findIndex((m) => m.key === key);
    const sessions = s.sessions.filter((m) => m.key !== key);
    const active =
      s.active !== key ? s.active : (sessions[Math.min(i, sessions.length - 1)]?.key ?? null);
    return { sessions, active };
  });
}

/** Start a fresh shell in the same session (same folder), keeping the output above. */
export function restartTerminal(key: number) {
  const l = live.get(key);
  if (!l) return;
  if (l.pty !== null) api.termKill(l.pty).catch(() => {});
  for (const [pty, k] of byPty) if (k === key) byPty.delete(pty);
  l.pty = null;
  l.term.write("\r\n");
  patch(key, { status: "starting", code: null, last: "" });
  if (l.opened) spawn(key);
}

/** Put a session's terminal into `container` (the view's sheet) and focus it. */
export function attachTerminal(key: number, container: HTMLElement) {
  const l = live.get(key);
  if (!l) return;
  if (l.host.parentElement !== container) container.appendChild(l.host);
  if (!l.opened) {
    l.term.open(l.host);
    l.opened = true;
  }
  fitTerminal(key);
  if (meta(key)?.status === "starting") spawn(key);
  l.term.focus();
}

export function detachTerminal(key: number) {
  live.get(key)?.host.remove();
}

export function fitTerminal(key: number) {
  const l = live.get(key);
  if (!l?.opened || !l.host.isConnected) return;
  try {
    l.fit.fit();
  } catch {
    /* not laid out yet */
  }
}

export const focusTerminal = (key: number) => live.get(key)?.term.focus();
