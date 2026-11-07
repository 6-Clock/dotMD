import { EditorView } from "@codemirror/view";

/* CodeMirror chrome theme. Everything reads CSS variables so the user's
   theme.css restyles the editor along with the rest of the app. */
export const editorTheme = EditorView.theme(
  {
    // The page (.page in globals.css) owns the surface, width and scrolling;
    // the editor is transparent and grows with its content.
    "&": {
      color: "var(--text)",
      backgroundColor: "transparent",
      fontSize: "calc(15.5px * var(--zoom, 1))", // page zoom (Editor.tsx)
    },
    ".cm-content": {
      caretColor: "var(--accent-strong)",
      padding: "0 var(--page-pad) 8px",
      lineHeight: "1.75",
      width: "100%",
      boxSizing: "border-box",
    },
    ".cm-line": {
      padding: "0 4px",
    },
    ".cm-scroller": {
      overflow: "visible",
      letterSpacing: "-0.006em",
    },
    "&.cm-focused .cm-cursor": {
      borderLeftColor: "var(--accent-strong)",
      borderLeftWidth: "2px",
    },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
      backgroundColor: "var(--selection)",
    },
    ".cm-activeLine": {
      backgroundColor: "transparent",
    },
    ".cm-gutters": {
      display: "none",
    },
    ".cm-tooltip": {
      backgroundColor: "var(--card)",
      border: "1px solid var(--border)",
      borderRadius: "10px",
      color: "var(--text)",
      boxShadow: "0 10px 30px var(--shadow-color)",
      overflow: "hidden",
    },
    ".cm-tooltip-autocomplete ul": {
      padding: "4px",
      fontFamily: "var(--font-ui)",
    },
    ".cm-tooltip-autocomplete ul li[aria-selected]": {
      backgroundColor: "var(--accent)",
      color: "var(--on-accent)",
    },
    ".cm-tooltip-autocomplete ul li": {
      padding: "5px 10px",
      borderRadius: "6px",
    },
  },
  { dark: false },
);
