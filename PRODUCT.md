# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary users are **developers and power users** who live in keyboard-driven
tools (terminals, editors). The defining situation: they are mid-task in another
application and need to capture a thought *right now* without breaking flow or
context-switching into a heavyweight app. They value speed, keyboard control,
and owning their data over features and polish-for-its-own-sake.

## Product Purpose

dotMD is a fast, local Markdown **scratchpad**: summon it from anywhere, jot, and
get out of the way. It exists to make capture frictionless — the thought goes
down instantly and the tool disappears. Everything is stored locally as plain
`.md` files. Success is the user reaching for dotMD reflexively because it is
faster than any alternative and never gets in the way.

## Positioning

The product *is* the **speed and minimal chrome** — an instant, get-out-of-the-
way feel that a feature-rich competitor cannot truthfully claim, because their
surface area is the opposite of restraint. Reinforced by two structural choices
a neighboring app could not bolt on without becoming a different product: a
**scratch-as-inbox model** (one persistent note is always the landing surface;
`Ctrl+Enter` files the buffer into the archive) and **local plain-`.md`
ownership** (no cloud, no lock-in, portable forever).

## Operating Context

- Desktop app (Tauri). Lives in the system **tray**; a **global summon shortcut**
  (`Ctrl+Shift+J` by default) brings it over whatever the user is doing.
- Summoning always lands in the persistent `scratch` note. `Ctrl+Enter` files the
  current buffer into its own note and clears scratch; `Ctrl+P` / search return to
  prior notes.
- All data is plain files under `%APPDATA%\com.dotmd.app\` (`notes/*.md`, `todo.md`,
  `theme.css`, `settings.json`) — directly editable outside the app.
- Keyboard-first throughout: rebindable in-app shortcuts for save, file-and-clear,
  quick-open, search, daily, views, and sidebar toggle.

## Capabilities and Constraints

Confirmed functionality: live Markdown editor with a styled-view toggle; slash
commands; persistent `scratch`; file-and-clear with undo; autosave + save-on-blur;
note create/open/rename/delete/duplicate/reveal; full-text search; a single
persistent **Daily** page; inline `#tag` coloring + tag filtering; non-destructive
**trash + restore**; a **Calendar** of to-dos by deadline; to-dos with
subject/deadline/description; a **Board** (kanban by subject); Settings (editor,
window/shortcut, appearance themes + accent, rebindable keybindings).

Durable constraints (binding — confirmed with the user):

- **Fully local / offline.** No cloud, no accounts, no network dependency — data
  lives only on the user's machine.
- **Human-readable Markdown.** Notes and `todo.md` must stay plain, human-readable
  Markdown that is editable outside the app.
- **Keyboard-first & fast.** Keyboard-driven operation, minimal UI, and an instant
  feel are never traded away for features.
- **Protected `scratch` and `daily`.** These two notes are structural guarantees:
  they are always seeded at startup and cannot be deleted or renamed.

Terminology: *scratch* = the inbox; everything else = the archive. *Daily* = the
single persistent rules/principles page (distinct from the dated daily-note
shortcut).

## Brand Commitments

Name: **dotMD** (renamed from Toc on 2026-10-29). No other voice, logo, or identity constraints have been established
as binding.

## Evidence on Hand

The working application and its local `.md` data store are the real evidence. No
testimonials, customers, benchmarks, press, pricing, or deployment claims have
been established — future work must not fabricate any.

## Product Principles

1. **Capture friction is the enemy.** Every decision is judged by whether it keeps
   the summon-to-jotted path instant and unbroken.
2. **The tool disappears.** Minimal chrome; it gets out of the way the moment the
   thought is down.
3. **The user owns the data.** Plain local Markdown files, portable and editable
   without dotMD — always.
4. **Keyboard before mouse.** The fast path is the keyboard path; the UI must never
   require reaching for the mouse to stay productive.
5. **Inbox, then archive.** Scratch is a frictionless inbox; organizing is a
   deliberate, later, cheap action — never a precondition for capturing.

## Accessibility & Inclusion

No formal standard has been set. The confirmed keyboard-first constraint implies
full keyboard operability as a baseline that future work must preserve.
