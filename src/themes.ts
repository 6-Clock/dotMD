// Built-in theme presets. Each is a full set of the CSS variables the app
// reads; selecting one writes it to theme.css and injects it live.

export type ThemeVars = Record<string, string>;

// Bumped whenever the token set or the presets change; a theme.css generated
// by an older build is regenerated from its (renamed) preset on startup.
// v4: the six ink-accent presets, no custom accent.
export const THEME_VERSION = "dotmd-theme v4";

// Interaction washes + depth, split light vs dark so hover/active/selection
// and shadows read correctly on either ground. Ink washes, not iOS greys.
// `--sticker-ring` is the die-cut border around stickers (the "you are here"
// states); `--highlight` fills ==highlighted== text.
const LIGHT_FX = {
  "--hover": "rgba(20, 20, 20, 0.05)",
  "--active": "rgba(20, 20, 20, 0.09)",
  "--active-line": "rgba(20, 20, 20, 0.035)",
  "--shadow-color": "rgba(20, 20, 20, 0.16)",
  "--chip-ink": "#000000", // subject chips mix their colour toward this for text
  "--sticker-ring": "#ffffff",
  "--highlight": "#ffc83d",
  "--scheme": "light", // native controls (date picker, scrollbars)
};
const DARK_FX = {
  "--hover": "rgba(255, 255, 255, 0.06)",
  "--active": "rgba(255, 255, 255, 0.11)",
  "--active-line": "rgba(255, 255, 255, 0.035)",
  "--shadow-color": "rgba(0, 0, 0, 0.55)",
  "--chip-ink": "#ffffff",
  "--sticker-ring": "rgba(255, 255, 255, 0.2)",
  "--highlight": "#e0a823",
  "--scheme": "dark",
};

// Fenced-code syntax palettes.
const SYN_LIGHT = {
  "--syn-keyword": "#ad3da4",
  "--syn-string": "#c41a16",
  "--syn-func": "#3e6d74",
  "--syn-number": "#1c00cf",
  "--syn-comment": "#6c7986",
  "--syn-type": "#0b4f79",
  "--syn-property": "#326d74",
};
const SYN_DARK = {
  "--syn-keyword": "#ff7ab2",
  "--syn-string": "#ff8170",
  "--syn-func": "#67b7a4",
  "--syn-number": "#d9c97c",
  "--syn-comment": "#7f8c98",
  "--syn-type": "#5dd8ff",
  "--syn-property": "#a167e6",
};

// Every preset is the same world: ink on paper, with the "you are here"
// states peeled off as stickers. A theme only changes the paper, the ground
// and how the ink reads on them; the accent is always the theme's own ink.
// Colour belongs to content (subjects, tags, highlights), never to chrome.
type Paper = {
  paper: string; // the writing sheet and cards
  ground: string; // title bar, rail, side panel, behind full views
  ink: string; // body text, headings, and the accent fill
  muted: string; // dates, counts, hints (>= 4.5:1 on the ground)
  border: string; // hairlines
  code: string; // inline and fenced code
  highlight: string; // ==text== fill
};

function fromPaper(p: Paper, dark: boolean): ThemeVars {
  return {
    ...(dark ? DARK_FX : LIGHT_FX),
    ...(dark ? SYN_DARK : SYN_LIGHT),
    "--bg": p.paper,
    "--card": p.paper,
    "--panel-bg": p.ground,
    "--grouped": p.ground,
    "--border": p.border,
    "--text": p.ink,
    "--heading": p.ink,
    "--muted": p.muted,
    "--accent": p.ink,
    "--accent-strong": p.ink,
    "--on-accent": p.paper,
    "--code-bg": p.code,
    "--selection": `color-mix(in srgb, ${p.ink} ${dark ? 18 : 13}%, transparent)`,
    "--highlight": p.highlight,
    "--sticker-ring": dark ? DARK_FX["--sticker-ring"] : p.paper,
    "--danger": dark ? "#f2786c" : "#c8331f",
    "--success": dark ? "#5cc995" : "#1f8a5f",
  };
}

export const THEMES: Record<string, ThemeVars> = {
  // The default world, after the logo: black ink on white paper over a
  // warm-neutral ground.
  Sticker: {
    "--bg": "#ffffff",
    "--panel-bg": "#f2f2ef",
    "--grouped": "#f2f2ef",
    "--card": "#ffffff",
    "--border": "#e2e2dd",
    "--text": "#141414",
    "--muted": "#65655f",
    "--accent": "#141414",
    "--accent-strong": "#141414",
    "--on-accent": "#ffffff",
    "--heading": "#0a0a0a",
    "--code-bg": "#f2f2ef",
    "--selection": "rgba(20, 20, 20, 0.12)",
    "--danger": "#d92d20",
    "--success": "#1f9d6b",
    ...LIGHT_FX,
    ...SYN_LIGHT,
  },
  // Warm, unbleached paper: easier than white under a warm lamp.
  Linen: fromPaper(
    {
      paper: "#fbf8f2", ground: "#eeeae0", ink: "#24211c", muted: "#696356",
      border: "#dcd6c8", code: "#f1ede4", highlight: "#f5d77e",
    },
    false,
  ),
  // Cool grey paper: calm in daylight, less glare than white.
  Fog: fromPaper(
    {
      paper: "#f9fafb", ground: "#e8ebef", ink: "#1b2028", muted: "#5a626e",
      border: "#d5dae1", code: "#eef1f4", highlight: "#f3d27a",
    },
    false,
  ),
  // Inverted, like the white logo: paper-white stickers on an ink ground.
  "Sticker Night": fromPaper(
    {
      paper: "#1e1e1d", ground: "#151514", ink: "#ecebe6", muted: "#a09f98",
      border: "#2f2f2d", code: "#272725", highlight: "#8a6a1c",
    },
    true,
  ),
  // Soft charcoal, not black: lower contrast for long evenings.
  Graphite: fromPaper(
    {
      paper: "#2a2d32", ground: "#222428", ink: "#dcdfe3", muted: "#9ca2ab",
      border: "#3a3e45", code: "#33373d", highlight: "#7d6526",
    },
    true,
  ),
  // Warm dark brown-grey, like a dimmed lamp.
  Cocoa: fromPaper(
    {
      paper: "#2c2825", ground: "#23201d", ink: "#e5ddd2", muted: "#a69c90",
      border: "#3d3732", code: "#35302c", highlight: "#80622a",
    },
    true,
  ),
};

/** Presets grouped for the picker. */
export const LIGHT_THEMES = ["Sticker", "Linen", "Fog"];
export const DARK_THEMES = ["Sticker Night", "Graphite", "Cocoa"];

export const DEFAULT_THEME = "Sticker";

// Retired presets map onto their closest current one.
const RENAMED: Record<string, string> = {
  Minimal: "Sticker",
  Light: "Sticker",
  Notes: "Sticker",
  Dark: "Sticker Night",
  "Notes Dark": "Sticker Night",
  "Paper Cream": "Linen",
  "Peach Latte": "Linen",
  "Sage Morning": "Fog",
  "Misty Lake": "Fog",
  "Lavender Haze": "Fog",
  "Midnight Ink": "Graphite",
  "Forest Night": "Graphite",
  Nord: "Graphite",
  Solarized: "Graphite",
  "Warm Ember": "Cocoa",
};

/** The current preset name for a stored one (handles renamed presets). */
export function presetName(stored: string | null): string {
  if (stored && THEMES[stored]) return stored;
  if (stored && RENAMED[stored]) return RENAMED[stored];
  return DEFAULT_THEME;
}

// Shape language shared across every palette.
const FONTS = {
  "--font-ui": '"Inter Variable", "Inter", "Segoe UI Variable Text", system-ui, sans-serif',
  "--font-editor": '"JetBrains Mono", ui-monospace, "Cascadia Mono", monospace',
  "--radius": "12px",
  "--tilt": "-1.5deg", // stickers sit slightly askew, like the logo
};

/** Build a :root { … } stylesheet from a set of variables. */
export function buildThemeCss(vars: ThemeVars): string {
  const all = { ...vars, ...FONTS };
  const body = Object.entries(all)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join("\n");
  return `/* ${THEME_VERSION} */\n:root {\n${body}\n}\n`;
}

/** Replace the injected user-theme stylesheet so changes show instantly. */
export function injectTheme(css: string): void {
  let el = document.getElementById("user-theme") as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = "user-theme";
    document.head.appendChild(el);
  }
  el.textContent = css;
  window.dispatchEvent(new Event(THEME_EVENT));
}

/** Fired by `injectTheme`, for UI that depends on the active theme. */
export const THEME_EVENT = "dotmd-theme-changed";

/** The active theme's colour scheme (its `--scheme` token). */
export const currentScheme = (): "light" | "dark" =>
  getComputedStyle(document.documentElement).getPropertyValue("--scheme").trim() === "dark"
    ? "dark"
    : "light";
