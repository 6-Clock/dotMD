import { syntaxTree } from "@codemirror/language";
import {
  type EditorState,
  RangeSetBuilder,
  StateEffect,
  StateField,
} from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, WidgetType } from "@codemirror/view";
import { convertFileSrc } from "@tauri-apps/api/core";
import * as api from "../api";
import { useStore } from "../store";

/* Inline images: a `![alt](../assets/file.png)` link renders as a block under
   its line. Only links into the shared assets/ folder render (see images.rs);
   web URLs and other paths stay plain text. Block widgets must come from a
   StateField (a ViewPlugin can't provide them), unlike conceal.ts. */

let assetsDir = "";

/** Re-run the image scan (once the assets path is known). */
const refreshImages = StateEffect.define<null>();

/** Resolve the assets folder and re-render any images already in the doc. */
export async function loadAssetsDir(view: EditorView) {
  assetsDir = await api.assetsPath().catch(() => "");
  if (assetsDir) view.dispatch({ effects: refreshImages.of(null) });
}

/** File name if `url` points into assets/, else null. */
export function assetFile(url: string): string | null {
  const m = /^(?:\.\.\/|\.\/)?assets\/([^/\\]+)$/.exec(url.trim());
  return m ? m[1] : null;
}

function srcFor(file: string) {
  const sep = assetsDir.includes("\\") ? "\\" : "/";
  return convertFileSrc(`${assetsDir}${sep}${decodeURIComponent(file)}`);
}

class ImageWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly alt: string,
    readonly file: string,
  ) {
    super();
  }

  eq(other: ImageWidget) {
    return other.src === this.src && other.alt === this.alt;
  }

  toDOM(view: EditorView) {
    const wrap = document.createElement("div");
    wrap.className = "cm-image";
    const img = document.createElement("img");
    img.src = this.src;
    img.alt = this.alt;
    img.draggable = false;
    img.decoding = "async";
    img.onload = () => {
      wrap.classList.add("loaded");
      view.requestMeasure();
    };
    img.onerror = () => {
      wrap.classList.add("missing");
      wrap.replaceChildren(`Image not found · ${this.file}`);
      view.requestMeasure();
    };
    img.onclick = () => useStore.getState().setLightbox({ src: this.src, alt: this.alt });
    wrap.appendChild(img);
    return wrap;
  }

  // Clicks belong to the image (lightbox), not the editor's caret.
  ignoreEvent() {
    return true;
  }
}

function build(state: EditorState): DecorationSet {
  if (!assetsDir) return Decoration.none;
  const builder = new RangeSetBuilder<Decoration>();
  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name !== "Image") return;
      const urlNode = node.node.getChild("URL");
      if (!urlNode) return false;
      const file = assetFile(state.sliceDoc(urlNode.from, urlNode.to));
      if (!file) return false;
      const text = state.sliceDoc(node.from, node.to);
      const alt = /^!\[([^\]]*)\]/.exec(text)?.[1] ?? "";
      const lineEnd = state.doc.lineAt(node.to).to;
      builder.add(
        lineEnd,
        lineEnd,
        Decoration.widget({ widget: new ImageWidget(srcFor(file), alt, file), block: true, side: 1 }),
      );
      return false;
    },
  });
  return builder.finish();
}

export const imageBlocks = StateField.define<DecorationSet>({
  create: (state) => build(state),
  update(deco, tr) {
    if (
      tr.docChanged ||
      tr.effects.some((e) => e.is(refreshImages)) ||
      syntaxTree(tr.state) !== syntaxTree(tr.startState)
    ) {
      return build(tr.state);
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

/** Insert an image link on its own line at the cursor. */
export function insertImageLink(view: EditorView, link: string) {
  const { state } = view;
  const pos = state.selection.main.head;
  const line = state.doc.lineAt(pos);
  const before = pos > line.from ? "\n" : "";
  const after = pos < line.to ? "\n" : "";
  const insert = `${before}![](${link})${after}`;
  view.dispatch({
    changes: { from: pos, to: state.selection.main.to, insert },
    selection: { anchor: pos + before.length + `![](${link})`.length },
    scrollIntoView: true,
  });
  view.focus();
}

const MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/bmp": "bmp",
  "image/avif": "avif",
};

/** Ctrl+V with image data saves it into assets/ and links it. Text pastes
    fall through to CodeMirror. */
export const imagePaste = EditorView.domEventHandlers({
  paste(event, view) {
    const item = Array.from(event.clipboardData?.items ?? []).find(
      (i) => i.kind === "file" && i.type in MIME_EXT,
    );
    const file = item?.getAsFile();
    if (!item || !file) return false;
    event.preventDefault();
    const ext = MIME_EXT[item.type]; // read now: the item is dead after the event
    file
      .arrayBuffer()
      .then((buf) => api.saveImage(new Uint8Array(buf), ext))
      .then((link) => insertImageLink(view, link))
      .catch((e) => console.error("image paste failed", e));
    return true;
  },
});

export const IMAGE_EXTS = ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif"];
