import { useSyncExternalStore } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, X } from "lucide-react";
import { useStore } from "../store";
import { SCRATCH } from "../api";
import logo from "../assets/logo.svg";
import logoWhite from "../assets/logo-white.svg";
import { THEME_EVENT, currentScheme } from "../themes";

const appWindow = getCurrentWindow();

export const displayName = (name: string) =>
  !name ? "" : name === SCRATCH ? "Untitled" : name;

const onThemeChange = (cb: () => void) => {
  window.addEventListener(THEME_EVENT, cb);
  return () => window.removeEventListener(THEME_EVENT, cb);
};

export function TitleBar() {
  // Black mark on light themes, the white one on dark themes.
  const scheme = useSyncExternalStore(onThemeChange, currentScheme);
  const currentNote = useStore((s) => s.currentNote);
  const dirty = useStore((s) => s.content !== s.lastSaved);

  return (
    <div className="titlebar" data-tauri-drag-region>
      <span className="titlebar-brand" data-tauri-drag-region>
        <img
          className="titlebar-logo"
          src={scheme === "dark" ? logoWhite : logo}
          alt=""
          draggable={false}
          data-tauri-drag-region
        />
        dotMD
      </span>
      <div className="titlebar-title" data-tauri-drag-region>
        <span className="name" data-tauri-drag-region>
          {displayName(currentNote)}
        </span>
        {dirty && <span className="dirty-dot" title="Unsaved changes" />}
      </div>
      <div className="titlebar-controls">
        <button className="win-btn" title="Minimize" onClick={() => appWindow.minimize()}>
          <Minus size={15} strokeWidth={1.75} />
        </button>
        <button className="win-btn" title="Maximize" onClick={() => appWindow.toggleMaximize()}>
          <Square size={12} strokeWidth={1.75} />
        </button>
        <button className="win-btn close" title="Close" onClick={() => appWindow.close()}>
          <X size={16} strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
}
