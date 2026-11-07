---
version: 1
slug: "src-app-tsx"
primary_target: "src/App.tsx"
related_targets: []
---

# dotMD app shell (Operate)

Scope: the whole desktop app UI (shell, Files, To-do, Board, Calendar, overlays, Settings, editor chrome). Mode: Operate.
User pins (2026-10-29 redesign): move off the iOS Notes look; carry the new logo's stark black & white, hand-cut edges and "oo" character; keep subject colours but restyle them; must not feel childish/cartoony nor brutalist/harsh. Layout and components stay; colour, type and shape change. Inter stays. No drag-and-drop. (2026-10-30: Calendar moves off the Google-Calendar grid to a planner agenda — huge day numbers, task cards, mini month + No date list — plus a 12-month Year view; today = ink sticker, red only for overdue.) (2026-10-30: per-subject quick-add is now wanted — Board subject menu with Add task / Rename / Change colour / Delete subject.)

## Direction contract
THESIS: dotMD as a sheet of die-cut stickers: black ink on white paper, and whatever is "you are here" (active view, tab, note, subject, toast) is peeled off as a sticker. Refuses the iOS grouped-grey + Notes-yellow look and the generic grey-sidebar notes app.
OWN-WORLD: neutral warm-grey ground #F2F2EF, white page, ink #141414 text and primary fills; stickers = solid fill + 3px white die-cut ring + soft lift shadow + slight tilt + irregular corner radii; vinyl subject swatches (flat, saturated, AA-legible ink); Inter 800 tight titles; round check circles. Dark: inverted, paper-white stickers on #121212.
STORY: the user sees at a glance where they are (the stickers), writes on a calm flat page, and files/tidies with small sticker feedback.
FIRST VIEWPORT: 56px rail with the active item as a tilted ink sticker; 280px side panel, 26px heavy title, white search field, sticker tag chips, selected note row lifted; tab bar with the active tab as a sticker; white page centred at 760px; toast as a sticker bottom-right.
FORM: Die-cut Sticker Sheet, position 1 on the ordered list (pick card, chosen by user). seed:3aa47fabac762328
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
