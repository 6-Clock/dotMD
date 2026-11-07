import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import { useStore } from "../../store";
import * as api from "../../api";
import { ACTIONS, comboFromEvent, resolveBindings } from "../../actions";
import { THEMES, buildThemeCss, injectTheme, presetName } from "../../themes";
import { PanelHeader } from "../PanelHeader";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { todayIso } from "../../dates";

export function SettingsView() {
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const setKeybind = useStore((s) => s.setKeybind);
  const resetKeybind = useStore((s) => s.resetKeybind);
  // Which binding is being recorded ("global" or an action id). Lives in the
  // store so the global key handler can stand down while we capture.
  const recording = useStore((s) => s.recording);
  const setRecording = useStore((s) => s.setRecording);

  const [themeName, setThemeName] = useState(() => presetName(localStorage.getItem("dotmd-theme")));
  const [accent, setAccent] = useState(
    () => localStorage.getItem("dotmd-accent") || THEMES[presetName(localStorage.getItem("dotmd-theme"))]["--accent"],
  );

  // Capture the next key combo while recording.
  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setRecording(null);
        return;
      }
      const combo = comboFromEvent(e);
      if (!combo) return; // bare modifier, keep waiting
      if (recording === "global") updateSettings({ global_shortcut: combo });
      else setKeybind(recording, combo);
      setRecording(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [recording, updateSettings, setKeybind]);

  if (!settings) return <div className="list-empty">Loading…</div>;

  const applyTheme = (name: string, acc: string) => {
    const css = buildThemeCss({ ...THEMES[name], "--accent": acc });
    injectTheme(css);
    api.saveTheme(css).catch((e) => console.error(e));
    localStorage.setItem("dotmd-theme", name);
    localStorage.setItem("dotmd-accent", acc);
  };

  const bindings = resolveBindings(settings.keybindings);

  return (
    <div className="settings-view">
      <PanelHeader title="Settings" />

      <h2 className="list-section">Editor</h2>
      <div className="list-group">
        <label className="form-row">
          <span className="form-label grow">Autosave delay</span>
          <span className="stepper">
            <input
              type="number"
              min={200}
              step={100}
              value={settings.autosave_ms}
              onChange={(e) => updateSettings({ autosave_ms: Number(e.target.value) })}
            />
            <span className="unit">ms</span>
          </span>
        </label>
        <label className="form-row">
          <span className="form-label grow">Styled view by default</span>
          <input
            type="checkbox"
            className="switch"
            checked={settings.styled_default}
            onChange={(e) => updateSettings({ styled_default: e.target.checked })}
          />
        </label>
        <label className="form-row">
          <span className="form-label grow">Focus mode</span>
          <input
            type="checkbox"
            className="switch"
            checked={settings.focus_mode}
            onChange={(e) => updateSettings({ focus_mode: e.target.checked })}
          />
        </label>
        <label className="form-row">
          <span className="form-label grow">Typewriter scrolling</span>
          <input
            type="checkbox"
            className="switch"
            checked={settings.typewriter}
            onChange={(e) => updateSettings({ typewriter: e.target.checked })}
          />
        </label>
      </div>
      <p className="list-footnote">
        Focus fades every paragraph but the one you're in; typewriter keeps the line you're typing
        centred. {bindings.toggleFocus} toggles both.
      </p>

      <h2 className="list-section">Window &amp; shortcut</h2>
      <div className="list-group">
        <div className="form-row">
          <span className="form-label grow">Global summon</span>
          <button
            className={`kbd-btn ${recording === "global" ? "recording" : ""}`}
            onClick={() => setRecording("global")}
          >
            {recording === "global" ? "Press keys…" : settings.global_shortcut}
          </button>
        </div>
        <label className="form-row">
          <span className="form-label grow">Hide window on blur</span>
          <input
            type="checkbox"
            className="switch"
            checked={settings.hide_on_blur}
            onChange={(e) => updateSettings({ hide_on_blur: e.target.checked })}
          />
        </label>
        <label className="form-row">
          <span className="form-label grow">Close button hides to tray</span>
          <input
            type="checkbox"
            className="switch"
            checked={settings.close_to_tray}
            onChange={(e) => updateSettings({ close_to_tray: e.target.checked })}
          />
        </label>
      </div>
      <p className="list-footnote">A new summon shortcut takes effect after restarting dotMD.</p>

      <h2 className="list-section">Appearance</h2>
      <div className="list-group">
        <div className="form-row column">
          <span className="form-label">Theme</span>
          <div className="theme-choices">
            {Object.keys(THEMES).map((name) => (
              <button
                key={name}
                className={`theme-chip ${themeName === name ? "active" : ""}`}
                onClick={() => {
                  setThemeName(name);
                  setAccent(THEMES[name]["--accent"]);
                  applyTheme(name, THEMES[name]["--accent"]);
                }}
              >
                <span
                  className="theme-swatch"
                  style={{ background: THEMES[name]["--panel-bg"], borderColor: THEMES[name]["--border"] }}
                >
                  <span style={{ background: THEMES[name]["--accent"] }} />
                </span>
                {name}
              </button>
            ))}
          </div>
        </div>
        <label className="form-row">
          <span className="form-label grow">Accent colour</span>
          <input
            type="color"
            className="color-input"
            value={accent}
            onChange={(e) => {
              setAccent(e.target.value);
              applyTheme(themeName, e.target.value);
            }}
          />
        </label>
      </div>

      <StorageSection />
      <BackupSection />

      <h2 className="list-section">Keybindings</h2>
      <div className="list-group">
        {ACTIONS.map((a) => {
          const overridden = a.id in settings.keybindings;
          return (
            <div className="form-row keybind-row" key={a.id}>
              <span className="form-label grow">{a.label}</span>
              {overridden && (
                <button
                  className="kbd-reset"
                  title="Reset to default"
                  aria-label={`Reset ${a.label} to default`}
                  onClick={() => resetKeybind(a.id)}
                >
                  <RotateCcw size={13} strokeWidth={2.2} />
                </button>
              )}
              <button
                className={`kbd-btn ${recording === a.id ? "recording" : ""}`}
                onClick={() => setRecording(a.id)}
              >
                {recording === a.id ? "Press keys…" : bindings[a.id]}
              </button>
            </div>
          );
        })}
      </div>
      <p className="list-footnote">Click a shortcut, then press the new combo. Esc cancels.</p>
    </div>
  );
}

/** Storage now has its own view; Settings just points there. */
function StorageSection() {
  const setView = useStore((st) => st.setView);
  return (
    <>
      <h2 className="list-section">Storage</h2>
      <div className="list-group">
        <div className="form-row">
          <span className="form-label grow">Images, notes, subjects, tags and trash</span>
          <button className="row-btn" onClick={() => setView("storage")}>
            Open Storage →
          </button>
        </div>
      </div>
      <p className="list-footnote">See what takes space and clean it up. Shortcut: Ctrl+Shift+U.</p>
    </>
  );
}

const fmtBytes = (n: number) =>
  n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 ** 2).toFixed(1)} MB`;

/** Export everything to one .zip (notes, Untitled, projects, tasks,
 *  images, settings, theme). Saves the open note first. */
function BackupSection() {
  const save = useStore((st) => st.save);
  const [includeTrash, setIncludeTrash] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<api.BackupSummary | null>(null);
  const [error, setError] = useState("");

  const exportNow = async () => {
    const path = await saveDialog({
      title: "Export dotMD backup",
      defaultPath: `dotMD-backup-${todayIso()}.zip`,
      filters: [{ name: "Zip archive", extensions: ["zip"] }],
    }).catch(() => null);
    if (!path) return;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      await save();
      setResult(await api.exportBackup(path, includeTrash));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const fileName = result ? result.path.split(/[\\/]/).pop() : "";
  return (
    <>
      <h2 className="list-section">Backup</h2>
      <div className="list-group">
        <div className="form-row">
          <span className="form-label grow">Export everything to one .zip file</span>
          <button className="row-btn" onClick={exportNow} disabled={busy}>
            {busy ? "Exporting…" : "Export backup…"}
          </button>
        </div>
        <label className="form-row">
          <span className="form-label grow">Include trash</span>
          <input
            type="checkbox"
            className="switch"
            checked={includeTrash}
            onChange={(e) => setIncludeTrash(e.target.checked)}
          />
        </label>
        {result && (
          <div className="form-row">
            <span className="form-label grow">
              Saved {result.files} files ({fmtBytes(result.bytes)}) to {fileName}
            </span>
            <button className="row-btn" onClick={() => api.revealFile(result.path).catch(() => {})}>
              Show in folder
            </button>
          </div>
        )}
        {error && (
          <div className="form-row">
            <span className="form-label grow backup-error">Export failed: {error}</span>
          </div>
        )}
      </div>
      <p className="list-footnote">Notes, Untitled, projects, tasks, images, settings and theme.</p>
      <ImportRows />
    </>
  );
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Import a backup .zip: pick → see what's inside → Merge or Replace. Both
 *  save a snapshot of the current data first (backups/before-import-….zip). */
function ImportRows() {
  const save = useStore((st) => st.save);
  const [picked, setPicked] = useState<{ path: string; info: api.BackupInfo } | null>(null);
  const [busy, setBusy] = useState<"" | "reading" | "merge" | "replace">("");
  const [armed, setArmed] = useState(false);
  const [done, setDone] = useState<api.ImportSummary | null>(null);
  const [error, setError] = useState("");

  // Replace is a two-click confirm, like permanent deletes in Storage.
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);

  const pick = async () => {
    const path = await openDialog({
      title: "Import dotMD backup",
      multiple: false,
      directory: false,
      filters: [{ name: "dotMD backup", extensions: ["zip"] }],
    }).catch(() => null);
    if (typeof path !== "string") return;
    setError("");
    setDone(null);
    setBusy("reading");
    try {
      setPicked({ path, info: await api.inspectBackup(path) });
    } catch (e) {
      setPicked(null);
      setError(String(e));
    } finally {
      setBusy("");
    }
  };

  const run = async (mode: "merge" | "replace") => {
    if (!picked) return;
    if (mode === "replace" && !armed) {
      setArmed(true);
      return;
    }
    setArmed(false);
    setBusy(mode);
    setError("");
    try {
      await save();
      const sum = await api.importBackup(picked.path, mode);
      if (mode === "replace") {
        // Settings, theme, tabs and every list changed: start fresh.
        window.location.reload();
        return;
      }
      const st = useStore.getState();
      const settings = await api.loadSettings().catch(() => null);
      if (settings) useStore.setState({ settings });
      await Promise.all([st.syncExternalNotes(), st.refreshTrash(), st.reloadTodos(), st.refreshProjects()]);
      useStore.getState().ensureSubjectColors();
      setDone(sum);
      setPicked(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy("");
    }
  };

  const info = picked?.info;
  const when = info?.exported
    ? new Date(info.exported).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" })
    : "an unknown date";

  return (
    <>
      <div className="list-group">
        <div className="form-row">
          <span className="form-label grow">Import a backup .zip</span>
          <button className="row-btn" onClick={pick} disabled={!!busy}>
            {busy === "reading" ? "Reading…" : "Import backup…"}
          </button>
        </div>
        {info && (
          <>
            <div className="form-row backup-info">
              <span className="form-label grow">
                Backup from {when}: {plural(info.notes, "note")}, {plural(info.projects, "project")},{" "}
                {plural(info.images, "image")}, {plural(info.tasks, "task")}
              </span>
            </div>
            <div className="form-row backup-actions">
              <button className="row-btn" onClick={() => run("merge")} disabled={!!busy}>
                {busy === "merge" ? "Merging…" : "Merge into my data"}
              </button>
              <button
                className={`row-btn backup-replace ${armed ? "armed" : ""}`}
                onClick={() => run("replace")}
                disabled={!!busy}
              >
                {busy === "replace" ? "Replacing…" : armed ? "Click again to replace" : "Replace my data"}
              </button>
              <span className="backup-gap" />
              <button className="row-btn" onClick={() => setPicked(null)} disabled={!!busy}>
                Cancel
              </button>
            </div>
          </>
        )}
        {done && (
          <div className="form-row">
            <span className="form-label grow">
              Merged: {plural(done.added, "file")} added
              {done.tasks_added > 0 && `, ${plural(done.tasks_added, "task")}`}
              {done.renamed > 0 && ` · ${plural(done.renamed, "note")} that differed came in as “(imported)”`}
              {done.kept > 0 && ` · kept your version of ${plural(done.kept, "file")}`}
              {done.skipped > 0 && ` · ${done.skipped} already matched`}
            </span>
            <button className="row-btn" onClick={() => api.revealFile(done.snapshot).catch(() => {})}>
              Show snapshot
            </button>
          </div>
        )}
        {error && (
          <div className="form-row">
            <span className="form-label grow backup-error">Import failed: {error}</span>
          </div>
        )}
      </div>
      <p className="list-footnote">
        Merge adds what you don’t have and never overwrites: a note that differs comes in as “name (imported)”.
        Replace swaps all your data for the backup’s. Either way, your current data is first saved to
        backups\before-import-….zip in the dotMD data folder.
      </p>
    </>
  );
}
