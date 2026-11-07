// Subject colours: flat vinyl-sticker swatches. A subject maps to a swatch
// *name* (stored in settings.subject_colors), never a raw hex, so themes can
// retune the palette without touching anyone's data. `on` is the text colour
// that stays legible on a solid fill of the swatch.

import type { CSSProperties } from "react";

export const SWATCHES = [
  { name: "blue", label: "Blue", hex: "#2f6fed", on: "#ffffff" },
  { name: "orange", label: "Orange", hex: "#ff7a2f", on: "#141414" },
  { name: "green", label: "Green", hex: "#1fa971", on: "#141414" },
  { name: "purple", label: "Purple", hex: "#7c4deb", on: "#ffffff" },
  { name: "pink", label: "Pink", hex: "#f0508c", on: "#141414" },
  { name: "teal", label: "Teal", hex: "#12a6a0", on: "#141414" },
  { name: "yellow", label: "Yellow", hex: "#ffc83d", on: "#141414" },
  { name: "red", label: "Red", hex: "#f0473c", on: "#141414" },
  { name: "indigo", label: "Indigo", hex: "#4f46e5", on: "#ffffff" },
  { name: "mint", label: "Mint", hex: "#2ec4a6", on: "#141414" },
  { name: "brown", label: "Brown", hex: "#8c5e3c", on: "#ffffff" },
  { name: "gray", label: "Gray", hex: "#8a8a84", on: "#141414" },
] as const;

const BY_NAME: Record<string, string> = Object.fromEntries(SWATCHES.map((s) => [s.name, s.hex]));
const ON_BY_HEX: Record<string, string> = Object.fromEntries(SWATCHES.map((s) => [s.hex, s.on]));

/** Hex for a subject, or null when it has no subject (renders neutral). */
export function subjectHex(subject: string, map: Record<string, string> | undefined): string | null {
  if (!subject) return null;
  const name = map?.[subject];
  return (name && BY_NAME[name]) || BY_NAME.gray;
}

/** Inline style that hands the subject colour to CSS as `--subj`, plus
    `--subj-on` for text set on a solid fill of it. */
export function subjectStyle(
  subject: string,
  map: Record<string, string> | undefined,
): CSSProperties | undefined {
  const hex = subjectHex(subject, map);
  return hex ? ({ "--subj": hex, "--subj-on": ON_BY_HEX[hex] } as CSSProperties) : undefined;
}

/** Next swatch for a new subject: the first one nobody uses yet, cycling once
 *  the palette is exhausted. */
export function nextSwatch(map: Record<string, string>): string {
  const used = new Set(Object.values(map));
  const free = SWATCHES.find((s) => !used.has(s.name) && s.name !== "gray");
  if (free) return free.name;
  const n = Object.keys(map).length;
  return SWATCHES[n % (SWATCHES.length - 1)].name;
}
