// Deadline helpers. Deadlines are local YYYY-MM-DD strings; parsing them with
// `new Date("YYYY-MM-DD")` would read UTC and shift a day west of Greenwich.

/** Local YYYY-MM-DD for a Date. */
export function ymd(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export const todayIso = () => ymd(new Date());

export const parseIso = (iso: string) => new Date(`${iso}T00:00:00`);

/** "Today" / "Tomorrow" / "Yesterday" / "Mon, Oct 28" style due label. */
export function dueLabel(iso: string): string {
  if (!iso) return "";
  const d = parseIso(iso);
  if (isNaN(d.getTime())) return "";
  const today = parseIso(todayIso()).getTime();
  const diff = Math.round((d.getTime() - today) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, {
    weekday: Math.abs(diff) < 7 ? "short" : undefined,
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  });
}

// Typed dates (MM / DD / YYYY) ----------------------------------------------

const MAX = [2, 2, 4];

/** Auto-format typed date text as MM / DD / YYYY: slashes appear after a full
 *  month / day, and a separator after one digit pads it ("1/" → "01 / "). */
export function maskDate(raw: string): string {
  const segs = [""];
  for (const ch of raw) {
    const i = segs.length - 1;
    if (/\d/.test(ch)) {
      if (segs[i].length < MAX[i]) segs[i] += ch;
      else if (i < 2) segs.push(ch);
    } else if (/[/\s.-]/.test(ch) && segs[i] && i < 2) {
      if (segs[i].length === 1) segs[i] = "0" + segs[i];
      segs.push("");
    }
  }
  let out = segs.join(" / ");
  const i = segs.length - 1;
  if (i < 2 && segs[i].length === MAX[i]) out += " / ";
  return out;
}

/** "11 / 07 / 2026" for a YYYY-MM-DD deadline ("" stays ""). */
export function formatTyped(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${m} / ${d} / ${y}`;
}

export type TypedDate =
  | { kind: "empty" }
  | { kind: "partial" }
  | { kind: "invalid" }
  | { kind: "ok"; iso: string };

/** Read MM/DD[/YY[YY]]. No year = the next such day that isn't past. */
export function parseTyped(text: string): TypedDate {
  const parts = text.split(/\D+/).filter(Boolean);
  if (parts.length === 0) return { kind: "empty" };
  if (parts.length === 1) return { kind: "partial" };
  const m = Number(parts[0]);
  const d = Number(parts[1]);
  const yRaw = parts[2];
  if (yRaw && yRaw.length !== 2 && yRaw.length !== 4) return { kind: "partial" };
  const valid = (y: number) => {
    const dt = new Date(y, m - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
  };
  if (m < 1 || m > 12 || d < 1) return { kind: "invalid" };
  let y: number;
  if (yRaw) {
    y = yRaw.length === 2 ? 2000 + Number(yRaw) : Number(yRaw);
    if (!valid(y)) return { kind: "invalid" };
  } else {
    y = new Date().getFullYear();
    if (!valid(y) || ymd(new Date(y, m - 1, d)) < todayIso()) {
      // Past (or Feb 29 in a non-leap year): the next year it exists.
      let n = y + 1;
      while (!valid(n) && n < y + 8) n++;
      if (!valid(n)) return { kind: "invalid" };
      y = n;
    }
  }
  return { kind: "ok", iso: ymd(new Date(y, m - 1, d)) };
}
