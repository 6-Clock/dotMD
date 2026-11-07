---
name: dotMD
description: A fast, local Markdown scratchpad — black ink, white paper, die-cut stickers.
colors:
  bg: "#ffffff"
  panel: "#f2f2ef"
  grouped: "#f2f2ef"
  card: "#ffffff"
  code-bg: "#f2f2ef"
  border: "#e2e2dd"
  text: "#141414"
  muted: "#65655f"
  heading: "#0a0a0a"
  accent: "#141414"
  accent-strong: "#141414"
  on-accent: "#ffffff"
  sticker-ring: "#ffffff"
  highlight: "#ffc83d"
  danger: "#d92d20"
  success: "#1f9d6b"
typography:
  view-title:
    fontFamily: "Inter Variable, Segoe UI Variable Text, system-ui, sans-serif"
    fontSize: "30px"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "-0.035em"
  body:
    fontFamily: "Inter Variable, Segoe UI Variable Text, system-ui, sans-serif"
    fontSize: "15.5px"
    fontWeight: 400
    lineHeight: 1.75
  ui:
    fontFamily: "Inter Variable, Segoe UI Variable Text, system-ui, sans-serif"
    fontSize: "13.5px"
    fontWeight: 650
    lineHeight: 1.45
  meta:
    fontFamily: "Inter Variable, Segoe UI Variable Text, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.4
  label:
    fontFamily: "Inter Variable, Segoe UI Variable Text, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 750
    lineHeight: 1.4
    letterSpacing: "0.08em"
  mono:
    fontFamily: "JetBrains Mono, ui-monospace, Cascadia Mono, monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.6
rounded:
  sm: "6px"
  control: "7px"
  md: "8px"
  track: "9px"
  lg: "12px"
  panel: "14px"
  sheet: "16px"
  tile: "18px"
  sticker: "10px 13px 9px 12px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "6px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  view: "22px 32px"
  page: "56px"
components:
  sticker:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.sticker}"
    padding: "per element"
  button:
    backgroundColor: "{colors.card}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "0 12px"
  button-ink:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.md}"
    padding: "0 12px"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
    padding: "10px 12px"
  input:
    backgroundColor: "{colors.card}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "6px 9px"
  badge-danger:
    backgroundColor: "color-mix(danger 12%, card)"
    textColor: "{colors.danger}"
    rounded: "{rounded.sm}"
    padding: "1px 7px"
---

# Design System: dotMD

## Overview

**Creative North Star: "Sticker"**

dotMD lives in the world of its logo: black ink on white paper, with the
"you are here" moments peeled off as die-cut stickers. The writing sheet is a
white page lifted off a warm-neutral ground (`#F2F2EF`); the chrome around it
is the same ground, quiet and flat. Ink is the accent. There is no brand hue,
and the strongest signal in the interface is a solid black shape with a white
die-cut ring, tilted −1.5°, as if someone stuck it there.

This is an Operate surface: a tool you summon, write in and dismiss. The
personality lives in a handful of precise details (the sticker states, the
hand-cut corners, the big heavy titles, the blinking "oo" eyes in empty
states). Everything else stays out of the way: scanable lists, ruled sections,
keyboard-first views, no decoration that costs a glance.

**Key Characteristics:**
- White paper sheet on a warm-neutral ground; flat chrome.
- Ink (`#141414`) is the accent: fills, active states, primary actions.
- Stickers mark "you are here": solid ink, white die-cut ring, soft lift, tilt, uneven corners.
- Inter Variable everywhere; titles at 800 with tight tracking. Mono only for code.
- Colour comes from content: subject swatches, `#tag` ink, the `==highlight==` yellow, red for overdue/destructive.
- Motion is quick and iOS-like: exponential ease-out, a small overshoot for pops.

## Colors

Every value is a CSS variable in `:root` (`src/styles/globals.css`). The user's
`theme.css` overrides it, and `src/themes.ts` ships presets: **Sticker**
(default, documented here), **Sticker Night** (inverted: paper stickers on
ink), the soft light presets Paper Cream / Sage Morning / Misty Lake / Lavender
Haze / Peach Latte, the dark presets Midnight Ink / Forest Night / Warm Ember,
plus Solarized and Nord. Compact presets are 8 base colours expanded by
`fromBase(base, dark)`.

### Accent (ink)
- **Ink** (`--accent` #141414): a **fill**. Stickers, primary/ink buttons
  (`+ New`, the To-do `+`), active section tabs, the open note row, the
  selected quick-open row.
- **Accent Strong** (`--accent-strong` #141414): the accent as **text or
  line**: links, list markers, inline code, focus rings. Identical to ink in
  Sticker; presets with a coloured accent split them.
- **On Accent** (`--on-accent` #fff): whatever rides on an ink fill.

### Surfaces
- **Paper / Card** (`--bg`, `--card` #fff): the writing sheet, cards, sheets, the preview details card.
- **Ground** (`--panel-bg`, `--grouped` #F2F2EF): title bar, rail, side panel, and the ground behind full views (Board, Calendar, Storage).
- **Code** (`--code-bg` #F2F2EF): inline code and fenced blocks.
- **Border** (`--border` #E2E2DD): hairlines and row rules.
- **Washes**: `--hover` (ink 5%), `--active` (ink 9%), `--active-line` (ink 3.5%), `--row-selected` (ink 8% over card).

### Text
- **Text** (#141414) body; **Heading** (#0a0a0a) titles; **Muted** (#65655f) dates, counts, labels, hints.

### Semantic
- **Danger** (#d92d20): overdue, "Unused", destructive buttons, armed "Click again…" confirms, the trash stripe in the Storage meter.
- **Success** (#1f9d6b): rare confirmations.
- **Highlight** (`--highlight` #ffc83d): the `==text==` highlighter fill in notes. Content colour, never chrome.

### Subject swatches (vinyl)
To-do subjects carry flat "vinyl" swatches (`src/subjects.ts`): blue, orange,
green, purple, pink, teal, yellow, red, indigo, mint, brown, gray, each with
its own `on` text colour. Components get `--subj` / `--subj-on` inline and
derive `--subj-tint` / `--subj-ink` with `color-mix`. Settings store the swatch
**name**, never the hex.

### Named Rules
**The Ink Rule.** The accent is ink. A brand hue in chrome is a defect; colour
belongs to content (subjects, tags, highlights) and to danger.

**The Fill vs Line Rule.** `--accent` is for fills, `--accent-strong` for text
and lines. Never set text in `--accent` on paper. A preset's coloured accent
would fail contrast.

## Typography

**UI and notes:** Inter Variable (`--font-ui`), self-hosted, optical sizing on.
**Code:** JetBrains Mono (`--font-editor`) for inline/fenced code and the few
key hints that need alignment. `kbd` chips use Inter at 10.5px/600 with a 2px
bottom border.

### Hierarchy
- **View title** (800, 30px, −0.035em, line-height 1.1): Storage, Calendar month, Board, page note titles (scaled by `--zoom`).
- **Day number** (Calendar agenda): huge two-digit numerals, 800, tabular.
- **Body** (400, 15.5px × `--zoom`, line-height 1.75): the editor.
- **UI** (600–700, 12.5–13.5px): rows, buttons, tabs, chips. Counts use `font-variant-numeric: tabular-nums`.
- **Meta** (400–600, 12px, muted): the second line of a row: due dates, "Edited …", previews, step counts.
- **Label** (750, 11px, uppercase, 0.08em, muted): ruled section labels: Files recency groups (Today / Yesterday / This week / This month), the Calendar year, Projects "Tasks" / "Notes", preview "Used in".
- **Mono** (~13px): code only.

### Named Rules
**The Heavy Title Rule.** Titles are short, 800-weight and tightly tracked;
everything under them stays 600–700 at small sizes. No mid-size headings in
chrome.

**The Quiet Label Rule.** Section labels are small, uppercase, letter-spaced
and muted, ruled with a hairline, never large.

## Layout

Desktop-first, one window. A 36px custom title bar, a 26px status bar, and
between them: the 48px activity bar, a resizable side panel (180–640px), and
the main area.

- **Editor**: `.page-scroll` (ground) holds a centred `.page` sheet (max 760px
  × `--zoom`, `--page-pad` 56px, 20px under 640px). Tabs and the mode pill sit
  above it; the Outline / Linked-from rail appears in the right margin at
  ≥990px (container queries).
- **Full views** (`isFullView`: Board, Calendar, Projects, Storage) hide the
  side panel and take the main area on the ground, padded `22px 32px`. Each
  opens with a 30px heavy title row.
- **Files panel**: a flat file index. One-line rows (name · first tag · time),
  ruled recency groups, a Trash footer that expands upward.
- **Calendar**: a left column (mini month, then the year as week rows filling
  the rest) and a scrolling agenda of day rows, two months deep, with an
  ink-tick month divider.
- **Projects**: an index of square tiles (cover image or monogram, name, meta,
  % bar); a project page is an organizer in one column: the progress card,
  Tasks, then linked Notes.
- **Storage**: total + three-part meter + legend, ink section tabs over a 2px
  heading rule, a toolbar (segmented sort, actions), then the list.

Spacing: 4/6/8px inside controls, 12–16px between groups, 20–32px around views.

## Elevation & Depth

Mostly flat. Surfaces separate by the paper/ground step and hairlines, and
washes mark hover/active. Shadows (all `--shadow-color`, ink 16%) appear only
where something sits on top of something else:

- **Page sheet**: `0 0 0 .5px border, 0 1px 2px, 0 10px 36px -12px`, the one resting lift (it's paper on a desk).
- **Sticker lift**: `0 0 0 3px var(--sticker-ring), 0 1px 2px, 0 5px 12px -3px`.
- **Context menu**: translucent card + `backdrop-filter: blur(20px)`, `0 12px 34px`.
- **Toast**: a big sticker: ink fill, ring, `0 14px 32px`, tilted.
- **Overlays** (quick open, search, edit sheet, lightbox, image preview): a dark scrim; the content floats on it.

### Named Rules
**The Lift-Means-On-Top Rule.** Cards and rows don't cast shadows, not even on
hover. A shadow means paper on the desk (the page), a sticker, or something
floating. Hovered cards darken their hairline ring instead
(`0 0 0 1px` heading-24%-over-border).

## Shapes

- 6px small chips/badges, 7px controls inside a track (segments, menu rows),
  8px buttons and inputs, 9px segment tracks, 10px rows, 12px (`--radius`)
  cards, menus and popovers, 14px preview details card and the Notes list card,
  and the progress card, 16px the page sheet, 18px project tiles, 999px meters
  and dots.
- **Sticker corners** are deliberately uneven: `--sticker-radius: 10px 13px 9px 12px`
  (the toast uses `16px 20px 15px 19px`). Hand-cut, not machined.
- `--tilt: -1.5deg` on every sticker.

## Components

### Stickers (the signature)
The "you are here" states: active rail item, active tab, active tag chip,
active theme chip, today in Calendar (`.cal-today`), Board subject headers, the
toast, and the current frame in the image-preview filmstrip. Recipe:
`--sticker-bg` fill, `--sticker-ink` text, `--sticker-radius`,
`--sticker-lift`, `rotate(var(--tilt))`, `peel-on` 200ms pop. The rule block
sits **last** in `globals.css` so it beats hover/press states.

On a dark stage (image preview) the sticker drops the ink fill and keeps the
shape: a 3px white ring, tilt and peel.

### Buttons
- **Ink button** (`+ New`, To-do `.add-btn` +, `.btn-primary`: New project, the composer's Add): ink fill, white text/icon, 8px radius. Never a pill.
- **Storage button** (`.st-btn`): card fill, 1px inset border ring, 30px tall,
  12.5px/650. Hover darkens the ring. `.danger` = red text, red ring on hover.
  `.armed` = solid red "Click again…" for 3s (`ConfirmButton`), the only
  confirm step in the app, reserved for permanent deletes.
- **Chrome buttons**: transparent, muted, hover wash; lucide icons on `currentColor`.

### Tabs and segments
- **Section tabs** (Storage): text buttons; the active one is an ink fill.
  Count in a 0.7-opacity tabular span. Keys `1`–`4`.
- **Segmented control** (`.st-seg` / `.cal-mode`: Storage sort and filter,
  Calendar Month | Year, Projects Open | Done | All): a `--active` track; the
  active segment is a card with a 1px shadow. Never an ink fill (ink means
  "you are here" or the main action).

### Rows and lists
- One-line rows, hairline rules, 10px radius. Hover = `--hover` wash.
- **Open/current** = ink sticker (Files) or ink fill (quick open).
- **Multi-select** = `--active` wash + 1.5px inset heading ring.
- Click / Ctrl-click / Shift-click selection, `Ctrl+A`, `Delete`, `Esc`, and
  `F2` where rename applies.

### Cards
- Calendar task cards and Board cards: white on the ground, 12px radius, no
  shadow. Subject shown in its ink (`--subj-ink`). Overdue gets a red label.
- **Board subject box**: a tinted colour box (`--subj-tint`) with a sticker
  header, done/total and a progress bar. The title is a button that opens the
  subject menu.

### Composer and fields
- **TaskComposer**: the one add-task surface (To-do panel and Calendar). Title,
  `SubjectInput`, `DateInput` or a fixed Due label, "+ Note" textarea. Enter
  adds and stays open; click-away adds and closes.
- **SubjectInput**: type-ahead with colour dots and "+ Create"; the field tints
  with a known subject's colour.
- **DateInput**: typed MM / DD / YYYY with auto slashes, a written-out preview,
  red "Not a date"; ▦ opens the native picker.
- Inputs are quiet: card or ground fill, hairline at most, 8px radius. Focus
  is a subtle shift (text darkens, the ground steps, or a 1.5px
  `--accent-strong` inset ring on steppers). Never a glow.

### Menus and toasts
- **ContextMenu**: translucent blurred card, 12px radius, ink hover rows,
  danger rows in red. Used by Files rows (incl. "Add to project…"), Board
  subjects, block handles, project notes. Popovers anchored to a button (the
  Projects note picker) use the same surface.
- **Toasts**: tilted ink stickers with an Undo action (file-&-clear,
  delete, delete subject, the generic Storage undo; 8s).

### Storage meter
A 10px pill split images / notes / trash: images in heading ink, notes in ink
45% over the ground, trash in a red diagonal stripe. A matching legend with
9px squares and tabular figures.

### Image preview (Storage → Images)
A dark scrim (`rgba(12,12,12,.9)`) over the view. A grid: stage (image
`object-fit: contain` with a drop-shadow, round translucent ‹ › buttons), a
280px white details card spanning the right column (count, name 18/800, size ·
date, "Used in" chips, Unused badge, full-width Move to trash with a `Del` kbd,
key hint), and a filmstrip of 64px frames at 55% opacity under the stage. The
current frame is the white-ring sticker. It stacks to one column under 760px.

### Projects
- **Tile** (`.pj-card`): square, 18px, card on the ground. The top is a
  full-bleed cover (logo `object-fit: cover`, or a monogram on the subject
  colour); a card-coloured % pill sits on it, or the ink **Summit** sticker at
  100% (the one reward sticker). Below: name, meta, a 6px % bar in the subject
  colour.
- **Project page layout**: two columns, main (`1fr`) | a 300px **planner
  rail** that stays in view (sticky) while the page scrolls; under 980px
  (container query on `.projects.page`) the rail drops below the progress card
  as a wrapping grid. Main column: back · ⋯ top bar, then the title (40px, 800)
  with the description paragraph under it (14.5px/1.6, ~68ch, line breaks
  kept) and a small square project image on the right (96px, 14px radius,
  hairline, no tilt; monogram on the subject colour when empty; hover shows an
  ink image-icon button).
- **Planner rail** (paper cards, 14px, hairline, no shadow): **Schedule** (the
  next open deadline as a big 40px/800 "Today" / "Tomorrow" / "N days", that
  task's name, then a muted line: overdue in red · last deadline · without a
  date; just the overdue count in red when nothing is upcoming), a **mini
  month** (the Calendar's `.mini-*` grid: dots in the subject colour, red if
  overdue, faded if done; today = sticker; click a day → Tasks shows only that
  day behind an ink "Due …  ×" chip in place of Open | Done | All, `Esc`
  clears it, and N adds a task on that day), and **Up next** (open tasks under
  Overdue / This week / Next week labels, Sunday-first weeks, 6 rows max, hidden
  when nothing is due within two weeks). Built only from task deadlines.
- **Project page body**: Tasks are one-line card rows; Notes is one card of
  ruled rows. Secondary actions use `.st-btn`.
- **Progress card** (`.pj-progress`): a paper card (14px, hairline, no
  shadow) across the top of the page, in every theme. A Goal row (uppercase
  label + inline field) over a hairline rule, then the big % (56px, 800,
  muted "%") beside a row of tall segments, one per task: done = `--accent`
  ink, open = `--active` wash, max 18px wide, left-aligned. Past 40 tasks it
  shows 40 segments filled by %. Hovering a segment shows its task in a small
  inked label (`--heading` fill, card-coloured text); click edits the task.
  No tasks = outlined empty segments + "No tasks yet". The filled segments
  sweep in once on open (staggered 14ms). No colour beyond ink: the subject
  colour stays on the tile and logo.

### Terminal
Option C, "session rail". A 232px rail on the ground: a 22px/800 "Terminal"
title with the ink **+** button, a ruled "Sessions N" label, then one row per
session (folder name 13px/650 with a 6px status dot, the last command or folder
under it in mono 11.5px muted). The open session is the sticker. Dots: success
green = running, muted = idle, hollow ring = exited 0, danger = exited with an
error. On the right, the paper sheet (16px, the page lift): a header (shell
name, the folder in mono, quiet Restart / Close buttons) over a hairline, then
the terminal on the card colour, mono 13px, ink block cursor, ANSI colours
retuned as inks on light themes. An exited shell keeps its output and shows an
"Exited · code N" sticker (red when the code isn't 0) with `Enter` / `Ctrl W`
hints. No sessions = Eyes + an ink "New terminal" button. Mono is fine here:
it's terminal output.

### Year grid (Calendar)
Week rows, Sunday-first like the mini month: days 2px apart, weeks split by a
5px gap, weekday letters on top; wraps into side-by-side stacks to fill the
column. Past = ink, future = wash, today = the tilted sticker.

### Empty states
`Eyes` (the logo's "oo") blinks once over a short muted line. Used only in
empty states, the Untitled inbox hint and the file-&-clear toast.

### Signature: the page
CodeMirror renders live Markdown in Inter at 15.5px/1.75 on the white sheet.
Styled (Editing) mode conceals markers off the active line. Links, list markers
and inline code take `--accent-strong`; `#tags` are coloured; `==highlight==`
is a yellow wash; images render under their line. The note header carries the
date, an 800-weight editable title, and words · read time · tag chips.

### The Daily page
The same sheet, sized for a few seconds of reading. Today's date replaces the
note header: weekday in heading ink over the date in muted, both 46px/800. Body
is 17px, and each `#` heading is a rule at 1.65em/800 with room above it. No
stickers: the date is the page's one loud element.

## Motion

- `--ease` `cubic-bezier(0.22, 1, 0.36, 1)` (exponential ease-out), `--ease-pop`
  `cubic-bezier(0.34, 1.45, 0.64, 1)` (small overshoot).
- `--t-fast` 140ms for hover/state; `--t-med` 240ms for view entry (`view-in`)
  and overlays (`fade-in`); `pop-in` for sheets and armed buttons; `peel-on`
  for stickers.
- Keyboard navigation is instant. Animation never delays a keypress.
- **Ctrl+T rail** is the one authored keyboard moment: an ink wash sweeps the
  rail, a 2px ring cursor pops in and springs between items, the arrived icon
  nudges. It plays even under reduced motion (user's call); nothing else does.

## Do's and Don'ts

### Do:
- **Do** use stickers only for "you are here", one per group.
- **Do** keep chrome ink-and-paper; let subjects, tags and highlights bring colour.
- **Do** read every colour, radius and wash from its variable so presets keep working.
- **Do** give every list view keyboard selection (arrows / click modifiers / Delete / Esc) and stand its keys down while an overlay owns them.
- **Do** make destructive actions undoable (trash + undo toast). Reserve the two-click armed confirm for permanent deletes only.
- **Do** use tabular figures for sizes, counts and dates.

### Don't:
- **Don't** introduce a brand hue into chrome. Ink is the accent.
- **Don't** set text in `--accent`; use `--accent-strong`.
- **Don't** add resting shadows to rows or cards; only the page, stickers and floating things lift.
- **Don't** add confirm dialogs for recoverable actions.
- **Don't** use mono as costume in chrome; it's for code.
- **Don't** hardcode hex in new UI (dark overlays/scrims excepted).
