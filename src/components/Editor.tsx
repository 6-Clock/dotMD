import { useEffect, useMemo, useRef, useState } from "react";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, keymap, drawSelection, highlightActiveLine } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { syntaxHighlighting, indentUnit } from "@codemirror/language";
import { useStore } from "../store";
import { editorTheme } from "../editor/theme";
import { markdownHighlight } from "../editor/markdownStyle";
import { slashCommands } from "../editor/slashCommands";
import { conceal, renderedField, setRendered, setViewing, viewingField } from "../editor/conceal";
import { tagHighlight } from "../editor/tags";
import { highlightMarks } from "../editor/highlight";
import { imageBlocks, imagePaste, loadAssetsDir } from "../editor/images";
import { refreshLinks, wikiLinks } from "../editor/links";
import { focusCompartment, focusFor, typewriterCompartment, typewriterFor } from "../editor/focus";
import { EmptyEditor } from "./EmptyEditor";
import { NoteHeader } from "./NoteHeader";
import { TabBar } from "./TabBar";
import { NoteRail, headingsOf } from "./NoteRail";
import { ContextMenu, type MenuItem } from "./ContextMenu";
import { SelectionToolbar, type ToolbarPos } from "./SelectionToolbar";
import { RadialWheel } from "./RadialWheel";
import {
  type Block,
  type BlockKind,
  blockHandles,
  convertBlock,
  deleteBlock,
  duplicateBlock,
} from "../editor/blocks";

const KINDS: [BlockKind, string][] = [
  ["text", "Text"],
  ["h1", "Heading 1"],
  ["h2", "Heading 2"],
  ["h3", "Heading 3"],
  ["bullet", "Bullet"],
  ["todo", "To-do"],
  ["quote", "Quote"],
  ["code", "Code block"],
];

// Module-level handle so other parts of the app (summon, slash focus) can
// focus the editor without prop drilling.
let currentView: EditorView | null = null;
export const focusEditor = () => {
  if (useStore.getState().currentNote) currentView?.focus(); // hidden when no note is open
};
export const blurEditor = () => currentView?.contentDOM.blur();

// Viewing mode: read-only and not editable (text still selectable/copyable).
const readOnlyCompartment = new Compartment();
const readOnlyFor = (on: boolean) =>
  on ? [EditorState.readOnly.of(true), EditorView.editable.of(false)] : [];

/** Half the toolbar's width, to keep it inside the page horizontally. */
const TOOLBAR_HALF = 146;

const getView = () => currentView;

/* The writing area is a page: a centred sheet on the grouped ground holding
   the note header, the CodeMirror editor, and a tail that continues the page
   (click it to write at the end). The whole sheet scrolls in `.page-scroll`;
   CodeMirror itself doesn't scroll (its scroller is overflow: visible). */
export function Editor() {
  const parent = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const dragging = useRef(false);
  const currentNote = useStore((s) => s.currentNote);
  const content = useStore((s) => s.content);
  const rendered = useStore((s) => s.rendered);
  const notes = useStore((s) => s.notes);
  const focusMode = useStore((s) => s.settings?.focus_mode ?? false);
  const typewriter = useStore((s) => s.settings?.typewriter ?? false);
  const viewing = useStore((s) => !!s.settings?.view_only_notes?.includes(s.currentNote));
  const zoom = useStore((s) => s.settings?.zoom ?? 1);
  const [zoomFlash, setZoomFlash] = useState(0); // bump → show the % pill
  const [toolbar, setToolbar] = useState<ToolbarPos | null>(null);
  const [caretLine, setCaretLine] = useState(1);
  const [hasRail, setHasRail] = useState(false);
  // Margins fade while typing and return when the mouse moves.
  const [typing, setTyping] = useState(false);
  const headings = useMemo(() => headingsOf(content), [content]);
  const [blockMenu, setBlockMenu] = useState<{ x: number; y: number; block: Block } | null>(null);

  // Show the format bar over a finished, non-empty selection.
  const placeToolbar = () => {
    const view = viewRef.current;
    const box = scrollRef.current;
    if (!view || !box) return;
    const sel = view.state.selection.main;
    if (sel.empty || dragging.current || !view.hasFocus) {
      setToolbar(null);
      return;
    }
    const a = view.coordsAtPos(sel.from);
    const b = view.coordsAtPos(sel.to);
    if (!a || !b) {
      setToolbar(null);
      return;
    }
    const r = box.getBoundingClientRect();
    const below = a.top - r.top < 56; // no room above: flip under the selection
    const top = (below ? b.bottom + 10 : a.top - 10) - r.top + box.scrollTop;
    const mid = a.top === b.top ? (a.left + b.left) / 2 : a.left;
    const left = Math.min(
      Math.max(mid - r.left, TOOLBAR_HALF + 8),
      r.width - TOOLBAR_HALF - 8,
    );
    setToolbar({ top, left, below });
  };
  const placeRef = useRef(placeToolbar);
  placeRef.current = placeToolbar;

  // Create the editor once.
  useEffect(() => {
    if (!parent.current) return;
    const settings = useStore.getState().settings;
    const view = new EditorView({
      parent: parent.current,
      state: EditorState.create({
        doc: useStore.getState().content,
        extensions: [
          history(),
          drawSelection(),
          highlightActiveLine(),
          EditorView.lineWrapping,
          indentUnit.of("   "), // Tab inserts three spaces
          markdown({ base: markdownLanguage, codeLanguages: languages }),
          syntaxHighlighting(markdownHighlight),
          renderedField.init(() => useStore.getState().rendered),
          viewingField,
          readOnlyCompartment.of([]),
          conceal,
          tagHighlight,
          highlightMarks,
          imageBlocks,
          imagePaste,
          wikiLinks,
          blockHandles((x, y, block) => setBlockMenu({ x, y, block })),
          focusCompartment.of(focusFor(settings?.focus_mode ?? false)),
          typewriterCompartment.of(typewriterFor(settings?.typewriter ?? false)),
          slashCommands,
          // indentWithTab first: Tab → indent (3 spaces), Shift+Tab → outdent.
          keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),
          editorTheme,
          EditorView.updateListener.of((u) => {
            if (u.docChanged) {
              useStore.getState().setContent(u.state.doc.toString());
            }
            if (u.selectionSet || u.docChanged || u.focusChanged || u.geometryChanged) {
              requestAnimationFrame(() => placeRef.current());
            }
            if (u.selectionSet || u.docChanged) {
              setCaretLine(u.state.doc.lineAt(u.state.selection.main.head).number);
            }
          }),
        ],
      }),
    });
    viewRef.current = view;
    currentView = view;
    loadAssetsDir(view);
    view.focus();

    // Hold the format bar back while a mouse selection is still being dragged.
    const down = () => {
      dragging.current = true;
      setToolbar(null);
    };
    const up = () => {
      if (!dragging.current) return;
      dragging.current = false;
      requestAnimationFrame(() => placeRef.current());
    };
    const key = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey && !e.altKey) setTyping(true);
    };
    const move = () => setTyping(false);
    view.contentDOM.addEventListener("mousedown", down);
    view.contentDOM.addEventListener("keydown", key);
    window.addEventListener("mouseup", up);
    window.addEventListener("mousemove", move);
    return () => {
      view.contentDOM.removeEventListener("mousedown", down);
      view.contentDOM.removeEventListener("keydown", key);
      window.removeEventListener("mouseup", up);
      window.removeEventListener("mousemove", move);
      view.destroy();
      if (currentView === view) currentView = null;
      viewRef.current = null;
    };
  }, []);

  // Push programmatic content changes (note switch, file-&-clear, undo) into
  // the editor. The guard prevents a feedback loop while typing.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (view.state.doc.toString() !== content) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: content },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentNote, content]);

  // A new note starts at the top of its page.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [currentNote]);

  // Reflect the styled/raw toggle into the editor.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (view.state.field(renderedField) !== rendered) {
      view.dispatch({ effects: setRendered.of(rendered) });
    }
  }, [rendered]);

  // Links to a note that was just created or deleted change colour.
  useEffect(() => {
    viewRef.current?.dispatch({ effects: refreshLinks.of(null) });
  }, [notes]);

  // Viewing (per note): read-only + fully concealed.
  useEffect(() => {
    const view = viewRef.current;
    if (!view || view.state.field(viewingField) === viewing) return;
    view.dispatch({
      effects: [setViewing.of(viewing), readOnlyCompartment.reconfigure(readOnlyFor(viewing))],
    });
    setToolbar(null);
    if (!viewing) view.focus();
  }, [viewing]);

  // Page zoom: Ctrl + / Ctrl - / Ctrl 0 and Ctrl+wheel scale the page only.
  // Capture phase + preventDefault so the webview never zooms the whole app.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const st = useStore.getState();
      if (st.recording) return;
      const dir = e.key === "=" || e.key === "+" ? 1 : e.key === "-" || e.key === "_" ? -1 : e.key === "0" ? 0 : null;
      if (dir === null) return;
      e.preventDefault();
      e.stopPropagation();
      st.zoomBy(dir);
      setZoomFlash(Date.now());
    };
    const box = scrollRef.current;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey) || !e.deltaY) return;
      e.preventDefault();
      useStore.getState().zoomBy(e.deltaY < 0 ? 1 : -1);
      setZoomFlash(Date.now());
    };
    window.addEventListener("keydown", onKey, true);
    box?.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      window.removeEventListener("keydown", onKey, true);
      box?.removeEventListener("wheel", onWheel);
    };
  }, []);

  // Line heights changed with the font size.
  useEffect(() => {
    viewRef.current?.requestMeasure();
  }, [zoom, currentNote]);

  // Hide the zoom pill shortly after the last change.
  useEffect(() => {
    if (!zoomFlash) return;
    const id = window.setTimeout(() => setZoomFlash(0), 1100);
    return () => window.clearTimeout(id);
  }, [zoomFlash]);

  // Focus / typewriter settings → editor compartments.
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: [
        focusCompartment.reconfigure(focusFor(focusMode)),
        typewriterCompartment.reconfigure(typewriterFor(typewriter)),
      ],
    });
  }, [focusMode, typewriter]);

  // The blank page under the text belongs to the note: clicking it puts the
  // caret at the end.
  const toEnd = (e: React.MouseEvent) => {
    const view = viewRef.current;
    if (!view || view.state.readOnly) return;
    e.preventDefault();
    view.dispatch({ selection: { anchor: view.state.doc.length }, scrollIntoView: true });
    view.focus();
  };

  return (
    <div className={`editor-pane ${typing ? "typing" : ""} ${viewing ? "viewing" : ""} ${currentNote ? "" : "empty"}`}>
      {/* CodeMirror stays mounted (hidden) so it survives the empty state. */}
      {!currentNote && <EmptyEditor />}
      <TabBar />
      <div className="page-scroll" ref={scrollRef}>
        <div
          className={`page-row ${hasRail ? "has-rail" : ""}`}
          style={{ "--zoom": zoom } as React.CSSProperties}
        >
          <div className="rail-spacer" />
          <div className={`page ${typewriter ? "typewriter" : ""}`}>
            <NoteHeader />
            <div className="editor-wrap" ref={parent} />
            <div className="page-tail" onMouseDown={toEnd} />
          </div>
          <NoteRail
            view={viewRef.current}
            headings={headings}
            caretLine={caretLine}
            onPresence={setHasRail}
          />
        </div>
        {toolbar && <SelectionToolbar view={viewRef.current} pos={toolbar} />}
      </div>
      {zoomFlash > 0 && (
        <div className="zoom-pill" role="status">
          {Math.round(zoom * 100)}%
        </div>
      )}
      <RadialWheel getView={getView} />
      {blockMenu && (
        <ContextMenu
          x={blockMenu.x}
          y={blockMenu.y}
          items={blockMenuItems(viewRef.current, blockMenu.block)}
          onClose={() => setBlockMenu(null)}
        />
      )}
    </div>
  );
}

function blockMenuItems(view: EditorView | null, block: Block): MenuItem[] {
  if (!view) return [];
  return [
    ...KINDS.map(([kind, label]) => ({ label, onClick: () => convertBlock(view, block, kind) })),
    { label: "-" },
    { label: "Duplicate", onClick: () => duplicateBlock(view, block) },
    { label: "Delete", danger: true, onClick: () => deleteBlock(view, block) },
  ];
}
