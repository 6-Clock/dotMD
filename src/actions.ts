import { useStore } from "./store";
import { SCRATCH } from "./api";
import { focusEditor } from "./components/Editor";
import { editTitleOnOpen } from "./components/NoteHeader";
import { focusTodoPanel } from "./components/TodoPanel";
import { closeTerminal, cycleTerminal, newTerminal, useTerminals } from "./terminal";

export type ActionId =
  | "save"
  | "fileAndClear"
  | "newNote"
  | "openInbox"
  | "quickOpen"
  | "searchOverlay"
  | "toggleRendered"
  | "toggleViewOnly"
  | "viewFiles"
  | "focusToolbar"
  | "viewBoard"
  | "viewCalendar"
  | "viewProjects"
  | "viewStorage"
  | "viewTerminal"
  | "newTerminal"
  | "viewSearch"
  | "viewSettings"
  | "toggleSidebar"
  | "toggleTasks"
  | "toggleFocus"
  | "closeTab"
  | "nextTab"
  | "prevTab";

export type Action = {
  id: ActionId;
  label: string;
  defaultCombo: string;
  run: () => void;
};

const st = () => useStore.getState();

// Single source of truth for in-app actions: drives both the global key
// handler and the Keybindings settings UI, so they never drift.
export const ACTIONS: Action[] = [
  { id: "save", label: "Save note", defaultCombo: "Ctrl+S", run: () => st().save() },
  {
    id: "fileAndClear",
    label: "File & clear scratch",
    defaultCombo: "Ctrl+Enter",
    run: () => st().fileAndClear(),
  },
  {
    id: "newNote",
    label: "Create new note",
    defaultCombo: "Ctrl+N",
    run: () => {
      editTitleOnOpen(); // the title starts selected: type a name, Enter
      st().createNote().then((ok) => ok || editTitleOnOpen(false));
    },
  },
  {
    id: "openInbox",
    label: "Open Untitled (inbox)",
    defaultCombo: "Ctrl+Shift+N",
    run: () => st().openNote(SCRATCH).then(focusEditor),
  },
  {
    id: "quickOpen",
    label: "Quick open / create note",
    defaultCombo: "Ctrl+P",
    run: () => st().setOverlay(st().overlay === "switcher" ? "none" : "switcher"),
  },
  {
    id: "searchOverlay",
    label: "Search all notes (overlay)",
    defaultCombo: "Ctrl+Shift+F",
    run: () => st().setOverlay(st().overlay === "search" ? "none" : "search"),
  },
  {
    id: "toggleRendered",
    label: "Editing ↔ Markdown mode",
    defaultCombo: "Ctrl+/",
    run: () => {
      const s = st();
      s.setDocMode(s.rendered && s.docMode() !== "viewing" ? "markdown" : "editing");
    },
  },
  {
    id: "toggleViewOnly",
    label: "Viewing mode (this note)",
    defaultCombo: "Ctrl+Alt+V",
    run: () => st().toggleViewOnly(),
  },
  {
    id: "viewFiles",
    label: "Show Files panel",
    defaultCombo: "Ctrl+Shift+E",
    run: () => st().setView("files"),
  },
  {
    id: "focusToolbar",
    label: "Focus toolbar (↑/↓ switch views)",
    defaultCombo: "Ctrl+T",
    run: () => st().enterToolbarNav(),
  },
  {
    id: "viewBoard",
    label: "Show Board",
    defaultCombo: "Ctrl+Shift+B",
    run: () => st().setView("board"),
  },
  {
    id: "viewCalendar",
    label: "Show Calendar",
    defaultCombo: "Ctrl+Shift+C",
    run: () => st().setView("calendar"),
  },
  {
    id: "viewProjects",
    label: "Show Projects",
    defaultCombo: "Ctrl+Shift+P",
    run: () => st().setView("projects"),
  },
  {
    id: "viewStorage",
    label: "Show Storage",
    defaultCombo: "Ctrl+Shift+U",
    run: () => st().setView("storage"),
  },
  {
    id: "viewTerminal",
    label: "Show Terminal",
    defaultCombo: "Ctrl+`",
    run: () => st().setView("terminal"),
  },
  {
    id: "newTerminal",
    label: "New terminal",
    defaultCombo: "Ctrl+Shift+T",
    run: () => {
      useStore.setState({ activeView: "terminal", lastView: "terminal" });
      newTerminal();
    },
  },
  {
    id: "viewSearch",
    label: "Show Search panel",
    defaultCombo: "Ctrl+Shift+S",
    run: () => st().setView("search"),
  },
  {
    id: "viewSettings",
    label: "Show Settings",
    defaultCombo: "Ctrl+,",
    run: () => st().setView("settings"),
  },
  {
    id: "toggleSidebar",
    label: "Toggle sidebar",
    defaultCombo: "Ctrl+B",
    run: () => st().toggleSidebar(),
  },
  {
    id: "toggleTasks",
    label: "Toggle editor / tasks focus",
    defaultCombo: "Ctrl+J",
    run: () => {
      // In the task list → back to the editor; anywhere else → go to tasks
      // (opening the To-do view first if it isn't already the active one).
      if (document.activeElement?.closest(".todo-panel")) {
        focusEditor();
        return;
      }
      const s = st();
      if (s.activeView !== "todo") s.setView("todo");
      else focusTodoPanel();
    },
  },
  {
    id: "toggleFocus",
    label: "Focus & typewriter mode",
    defaultCombo: "Ctrl+Shift+M",
    run: () => {
      // Either on → both off; both off → both on. Settings toggles them apart.
      const s = st().settings;
      if (!s) return;
      const on = !(s.focus_mode || s.typewriter);
      st().updateSettings({ focus_mode: on, typewriter: on });
    },
  },
  {
    id: "closeTab",
    label: "Close tab",
    defaultCombo: "Ctrl+W",
    run: () => {
      // On the Terminal page these act on terminal sessions, not note tabs.
      if (onTerminal()) {
        const a = useTerminals.getState().active;
        if (a !== null) closeTerminal(a);
        return;
      }
      st().closeTab(st().currentNote).then(focusEditor);
    },
  },
  {
    id: "nextTab",
    label: "Next tab",
    defaultCombo: "Ctrl+Tab",
    run: () => (onTerminal() ? cycleTerminal(1) : st().cycleTab(1)),
  },
  {
    id: "prevTab",
    label: "Previous tab",
    defaultCombo: "Ctrl+Shift+Tab",
    run: () => (onTerminal() ? cycleTerminal(-1) : st().cycleTab(-1)),
  },
];

const onTerminal = () => st().activeView === "terminal";

const MODIFIER_KEYS = new Set(["Control", "Shift", "Alt", "Meta"]);

/** Normalize a keyboard event into an accelerator like "Ctrl+Shift+F".
 *  Returns null for bare modifier presses. */
export function comboFromEvent(e: KeyboardEvent): string | null {
  if (!e.key) return null; // some IME/autofill events have no key
  if (MODIFIER_KEYS.has(e.key)) return null;
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("Ctrl");
  if (e.shiftKey) parts.push("Shift");
  if (e.altKey) parts.push("Alt");
  let k = e.key;
  if (k === " ") k = "Space";
  else if (k.length === 1) k = k.toUpperCase();
  parts.push(k);
  return parts.join("+");
}

/** Resolve each action's active combo from user overrides + defaults. */
export function resolveBindings(overrides: Record<string, string>): Record<ActionId, string> {
  const map = {} as Record<ActionId, string>;
  for (const a of ACTIONS) map[a.id] = overrides[a.id] || a.defaultCombo;
  return map;
}

/** Run the action bound to a given combo, if any. Returns true if handled. */
export function runBinding(combo: string, overrides: Record<string, string>): boolean {
  const bindings = resolveBindings(overrides);
  for (const a of ACTIONS) {
    if (bindings[a.id] === combo) {
      a.run();
      return true;
    }
  }
  return false;
}
