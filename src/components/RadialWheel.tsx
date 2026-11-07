import { useEffect, useRef, useState } from "react";
import type { EditorView } from "@codemirror/view";
import { useStore } from "../store";
import { ANGLE, DIRS, type Dir, RINGS, dirAt } from "../editor/radial";

const R = 80; // outer radius
const INNER = 28; // inner radius = dead zone
const ICON_R = (R + INNER) / 2;
const GAP = 0.04; // radians between slices
// Alt must be held alone this long before the wheel shows, so quick Alt
// combos (Ctrl+Alt+V …) never flash it.
const OPEN_DELAY = 120;
const SPIN_COOLDOWN = 160; // ms between ring switches (trackpads fire bursts)

const ARROWS: Record<string, Dir> = {
  ArrowUp: "up",
  ArrowRight: "right",
  ArrowDown: "down",
  ArrowLeft: "left",
};

type Wheel = { x: number; y: number; ring: number; dir: Dir | null };

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/** Annular sector path for one slice, in the SVG's 2R×2R box. */
function sector(dir: Dir) {
  const a0 = ANGLE[dir] - Math.PI / 4 + GAP;
  const a1 = ANGLE[dir] + Math.PI / 4 - GAP;
  const pt = (rad: number, a: number) => `${R + rad * Math.cos(a)} ${R + rad * Math.sin(a)}`;
  return `M ${pt(R, a0)} A ${R} ${R} 0 0 1 ${pt(R, a1)} L ${pt(INNER, a1)} A ${INNER} ${INNER} 0 0 0 ${pt(INNER, a0)} Z`;
}

/** Hold Alt in the editor → a four-slice wheel at the pointer. Point at a
    slice and click to apply it (releasing Alt just closes); wheel / Alt+1…9 switch rings,
    arrows pick a slice, Esc cancels. Slices live in editor/radial.ts. */
export function RadialWheel({ getView }: { getView: () => EditorView | null }) {
  const [wheel, setWheel] = useState<Wheel | null>(null);
  const ref = useRef<Wheel | null>(null);

  useEffect(() => {
    const set = (w: Wheel | null) => {
      ref.current = w;
      setWheel(w);
    };
    const pointer = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    let timer = 0;
    let lastSpin = 0;

    const cancelTimer = () => {
      window.clearTimeout(timer);
      timer = 0;
    };
    const open = () => {
      cancelTimer();
      const view = getView();
      if (!view || !view.hasFocus || view.state.readOnly || useStore.getState().recording) return;
      const m = R + 12; // keep the whole wheel on screen
      set({
        x: clamp(pointer.x, m, window.innerWidth - m),
        y: clamp(pointer.y, m, window.innerHeight - m),
        ring: 0,
        dir: null,
      });
    };
    const close = () => {
      cancelTimer();
      set(null);
    };
    const apply = (dir: Dir | null) => {
      const w = ref.current;
      const view = getView();
      close();
      if (w && dir && view) RINGS[w.ring][dir].run(view);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Alt") {
        if (!e.repeat && !ref.current && !timer) timer = window.setTimeout(open, OPEN_DELAY);
        return;
      }
      const consume = () => {
        e.preventDefault();
        e.stopImmediatePropagation();
      };
      // Alt+1…9: jump to that ring (opens the wheel straight away if needed).
      const digit = /^Digit([1-9])$/.exec(e.code);
      if (digit && e.altKey && !e.ctrlKey && !e.metaKey && (ref.current || timer)) {
        if (!ref.current) open();
        const w = ref.current as Wheel | null;
        const ring = Number(digit[1]) - 1;
        if (w && ring < RINGS.length) set({ ...w, ring });
        consume();
        return;
      }
      if (!ref.current) {
        cancelTimer(); // Alt was part of another combo
        return;
      }
      const arrow = ARROWS[e.key];
      if (arrow) {
        consume();
        apply(arrow);
      } else if (e.key === "Escape") {
        consume();
        close();
      } else {
        close();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key !== "Alt") return;
      cancelTimer();
      const w = ref.current;
      if (!w) return;
      e.preventDefault(); // don't hand focus to the window's system menu
      close(); // only a click applies a slice
    };
    const onMove = (e: MouseEvent) => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      const w = ref.current;
      if (!w) return;
      const dir = dirAt(e.clientX - w.x, e.clientY - w.y, INNER);
      if (dir !== w.dir) set({ ...w, dir });
    };
    const onDown = (e: MouseEvent) => {
      const w = ref.current;
      if (!w) return;
      e.preventDefault(); // keep the selection
      e.stopPropagation();
      apply(dirAt(e.clientX - w.x, e.clientY - w.y, INNER));
    };
    const onWheel = (e: WheelEvent) => {
      const w = ref.current;
      if (!w || !e.deltaY) return;
      e.preventDefault();
      const now = Date.now();
      if (now - lastSpin < SPIN_COOLDOWN) return;
      lastSpin = now;
      const n = RINGS.length;
      set({ ...w, ring: (w.ring + (e.deltaY > 0 ? 1 : -1) + n) % n });
    };

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("wheel", onWheel, { capture: true, passive: false });
    window.addEventListener("blur", close);
    return () => {
      cancelTimer();
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("wheel", onWheel, true);
      window.removeEventListener("blur", close);
    };
  }, [getView]);

  if (!wheel) return null;
  const ring = RINGS[wheel.ring];
  const active = wheel.dir ? ring[wheel.dir] : null;
  return (
    <div
      className="radial-wheel"
      style={{ left: wheel.x - R, top: wheel.y - R, width: 2 * R, height: 2 * R }}
      role="menu"
      aria-label="Radial wheel"
    >
      <svg width={2 * R} height={2 * R} viewBox={`0 0 ${2 * R} ${2 * R}`} aria-hidden>
        {DIRS.map((d) => (
          <path key={d} d={sector(d)} className={`radial-slice ${wheel.dir === d ? "on" : ""}`} />
        ))}
      </svg>
      {DIRS.map((d) => {
        const { label, icon: Icon } = ring[d];
        return (
          <span
            key={d}
            className={`radial-icon ${wheel.dir === d ? "on" : ""}`}
            style={{
              left: R + ICON_R * Math.cos(ANGLE[d]),
              top: R + ICON_R * Math.sin(ANGLE[d]),
            }}
            role="menuitem"
            aria-label={label}
          >
            <Icon size={18} strokeWidth={2.2} />
          </span>
        );
      })}
      <span className="radial-rings" aria-label={`Ring ${wheel.ring + 1} of ${RINGS.length}`}>
        {RINGS.map((_, i) => (
          <i key={i} className={i === wheel.ring ? "on" : ""} />
        ))}
      </span>
      {active && <span className="radial-label">{active.label}</span>}
    </div>
  );
}
