import {
  autocompletion,
  startCompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import { EditorView } from "@codemirror/view";
import { open } from "@tauri-apps/plugin-dialog";
import * as api from "../api";
import { IMAGE_EXTS, insertImageLink } from "./images";
import { linkSource } from "./links";

type Insert = {
  text: string;
  /** Cursor offset from the start of the inserted text. */
  cursor: number;
};

type SlashCommand = {
  label: string;
  detail: string;
  make: () => Insert;
  /** Async follow-up after the inserted text (e.g. a file picker). */
  run?: (view: EditorView) => void;
};

const today = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

// Adding a command is a single entry here.
export const COMMANDS: SlashCommand[] = [
  { label: "/b", detail: "Bold", make: () => ({ text: "****", cursor: 2 }) },
  { label: "/i", detail: "Italic", make: () => ({ text: "**", cursor: 1 }) },
  { label: "/c", detail: "Code block", make: () => ({ text: "```\n\n```", cursor: 4 }) },
  { label: "/h1", detail: "Heading 1", make: () => ({ text: "# ", cursor: 2 }) },
  { label: "/h2", detail: "Heading 2", make: () => ({ text: "## ", cursor: 3 }) },
  { label: "/h3", detail: "Heading 3", make: () => ({ text: "### ", cursor: 4 }) },
  { label: "/todo", detail: "To-do item", make: () => ({ text: "- [ ] ", cursor: 6 }) },
  { label: "/list", detail: "List item", make: () => ({ text: "- ", cursor: 2 }) },
  { label: "/date", detail: "Today's date", make: () => ({ text: today(), cursor: today().length }) },
  { label: "/image", detail: "Image from file", make: () => ({ text: "", cursor: 0 }), run: pickImage },
  {
    label: "/con",
    detail: "Link to a note",
    make: () => ({ text: "[[", cursor: 2 }),
    // Reopen the menu as the note picker (links.ts linkSource) once this
    // completion has closed.
    run: (view) => window.setTimeout(() => startCompletion(view)),
  },
];

async function pickImage(view: EditorView) {
  const path = await open({
    multiple: false,
    directory: false,
    filters: [{ name: "Images", extensions: IMAGE_EXTS }],
  }).catch(() => null);
  if (typeof path !== "string") {
    view.focus();
    return;
  }
  const link = await api.importImage(path).catch((e) => {
    console.error("image import failed", e);
    return null;
  });
  if (link) insertImageLink(view, link);
  else view.focus();
}

function applyCommand(cmd: SlashCommand) {
  return (view: EditorView, _c: Completion, from: number, to: number) => {
    const { text, cursor } = cmd.make();
    view.dispatch({
      changes: { from, to, insert: text },
      selection: { anchor: from + cursor },
    });
    cmd.run?.(view);
  };
}

/** Autocomplete source that opens on `/` at a word boundary. */
function slashSource(context: CompletionContext): CompletionResult | null {
  const word = context.matchBefore(/\/\w*/);
  if (!word) return null;
  // Only trigger at the start of a line or after whitespace, so `and/or`
  // doesn't pop the menu.
  const before = context.state.sliceDoc(Math.max(0, word.from - 1), word.from);
  if (word.from !== 0 && !/\s/.test(before)) return null;
  if (word.from === word.to && !context.explicit) return null;

  return {
    from: word.from,
    options: COMMANDS.map<Completion>((cmd) => ({
      label: cmd.label,
      detail: cmd.detail,
      type: "keyword",
      apply: applyCommand(cmd),
    })),
    filter: true,
  };
}

export const slashCommands = autocompletion({
  override: [slashSource, linkSource],
  icons: false,
  defaultKeymap: true,
});
