import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { loadTheme, saveTheme } from "./api";
import { THEMES, THEME_VERSION, buildThemeCss, injectTheme, presetName } from "./themes";
import "@fontsource-variable/inter/opsz.css";
import "@fontsource-variable/inter/opsz-italic.css";
import "./styles/globals.css";

// localStorage keys were renamed toc-* → dotmd-*; carry old values over once.
for (const key of Object.keys(localStorage)) {
  if (!key.startsWith("toc-")) continue;
  const next = "dotmd-" + key.slice(4);
  if (localStorage.getItem(next) === null) localStorage.setItem(next, localStorage.getItem(key)!);
  localStorage.removeItem(key);
}
// The project mountain is gone; drop its remembered climb positions.
for (const key of Object.keys(localStorage)) {
  if (key.startsWith("dotmd-climb:") || key.startsWith("toc-climb:")) localStorage.removeItem(key);
}

// Inject the user's theme.css after the defaults so it overrides any variable.
// A theme.css written by an older build (no version marker) is regenerated
// once from its preset, so the redesigned token set takes effect.
async function applyUserTheme() {
  try {
    let css = await loadTheme();
    if (!css.includes(THEME_VERSION)) {
      const name = presetName(localStorage.getItem("dotmd-theme"));
      css = buildThemeCss(THEMES[name]);
      localStorage.setItem("dotmd-theme", name);
      localStorage.removeItem("dotmd-accent"); // custom accents are gone
      saveTheme(css).catch((e) => console.error(e));
    }
    injectTheme(css);
  } catch (e) {
    console.error("theme load failed", e);
  }
}

applyUserTheme().finally(() => {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});
