import { ACTIONS, type ActionId, resolveBindings } from "../actions";
import { useStore } from "../store";

// What the editor shows with every tab closed, VS Code style: the logo as a
// faint watermark and a few ways back in. Keys follow the user's bindings.
const ROWS: [ActionId, string][] = [
  ["newNote", "Create new note"],
  ["quickOpen", "Open or create a note"],
  ["searchOverlay", "Search all notes"],
  ["toggleSidebar", "Show / hide side panel"],
];

const run = (id: ActionId) => ACTIONS.find((a) => a.id === id)?.run();

export function EmptyEditor() {
  const keybindings = useStore((s) => s.settings?.keybindings);
  const keys = resolveBindings(keybindings ?? {});

  return (
    <div className="empty-editor">
      <div className="empty-mark" aria-hidden />
      <div className="empty-keys">
        {ROWS.map(([id, label]) => (
          <button key={id} className="empty-key" onClick={() => run(id)}>
            <span className="empty-key-label">{label}</span>
            <span className="empty-key-combo">
              {keys[id].split("+").map((k) => (
                <kbd key={k}>{k}</kbd>
              ))}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
