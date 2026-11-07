import { HighlightStyle } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

/* Live Markdown styling: bold looks bold, headings look like headings, etc.
   Uses the same CSS variables as the rest of the app. */
export const markdownHighlight = HighlightStyle.define([
  // Headings use fixed classes (styled in globals.css, "Editor") so their
  // lines can also get room above them via .cm-line:has(.tok-h1).
  { tag: t.heading1, class: "tok-h1" },
  { tag: t.heading2, class: "tok-h2" },
  { tag: t.heading3, class: "tok-h3" },
  { tag: [t.heading4, t.heading5, t.heading6], class: "tok-h4" },
  { tag: t.strong, fontWeight: "700", color: "var(--text)" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through", color: "var(--muted)" },
  { tag: t.link, color: "var(--accent-strong)", textDecoration: "underline" },
  { tag: t.url, color: "var(--muted)" },
  { tag: t.monospace, fontFamily: "var(--font-editor)", color: "var(--accent-strong)" },
  { tag: t.quote, color: "var(--muted)", fontStyle: "italic" },
  { tag: t.list, color: "var(--accent-strong)" },
  // Markers (#, **, -, ```) are dimmed so the content stands out.
  { tag: t.processingInstruction, color: "var(--muted)" },
  { tag: t.contentSeparator, color: "var(--muted)" },

  // Syntax highlighting inside fenced code blocks (themed via --syn-* tokens).
  { tag: t.keyword, color: "var(--syn-keyword)" },
  { tag: [t.string, t.special(t.string)], color: "var(--syn-string)" },
  { tag: [t.function(t.variableName), t.labelName], color: "var(--syn-func)" },
  { tag: [t.number, t.bool, t.null], color: "var(--syn-number)" },
  { tag: t.comment, color: "var(--syn-comment)", fontStyle: "italic" },
  { tag: [t.typeName, t.className], color: "var(--syn-type)" },
  { tag: [t.propertyName], color: "var(--syn-property)" },
  { tag: [t.operator, t.punctuation], color: "var(--muted)" },
]);
