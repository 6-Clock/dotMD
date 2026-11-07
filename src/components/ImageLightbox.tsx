import { useEffect } from "react";
import { X } from "lucide-react";
import { useStore } from "../store";
import { focusEditor } from "./Editor";

/** Full-size view of an editor image. Esc / backdrop / ✕ closes. */
export function ImageLightbox() {
  const lightbox = useStore((s) => s.lightbox);
  const setLightbox = useStore((s) => s.setLightbox);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      setLightbox(null);
      focusEditor();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [lightbox, setLightbox]);

  if (!lightbox) return null;

  const close = () => {
    setLightbox(null);
    focusEditor();
  };

  return (
    <div className="lightbox" role="dialog" aria-label="Image" onMouseDown={close}>
      <button className="lightbox-close" aria-label="Close" onClick={close}>
        <X size={16} strokeWidth={2.4} />
      </button>
      <figure onMouseDown={(e) => e.stopPropagation()}>
        <img src={lightbox.src} alt={lightbox.alt} />
        {lightbox.alt && <figcaption>{lightbox.alt}</figcaption>}
      </figure>
    </div>
  );
}
