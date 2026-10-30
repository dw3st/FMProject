import {
  useCallback, useEffect, useRef, useState, useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent, type Ref, type PointerEvent as ReactPointerEvent, type ReactNode,
} from "react";
import {
  bringToFront, clampRect, dockedRect, dropFromStack, isNarrow, moveRect, readRect, resizeRect, stackSnapshot,
  subscribeStack, writeRect, zIndexOf, type FloatRect, type ResizeEdge, type Size,
} from "@/GameInterface/ui/windowGeometry";

function viewportSize(): Size {
  return { w: window.innerWidth, h: window.innerHeight };
}

const EDGES: { edge: ResizeEdge; className: string }[] = [
  { edge: "n", className: "top-0 left-3 right-3 h-1.5 cursor-ns-resize" },
  { edge: "s", className: "bottom-0 left-3 right-3 h-1.5 cursor-ns-resize" },
  { edge: "e", className: "right-0 top-3 bottom-3 w-1.5 cursor-ew-resize" },
  { edge: "w", className: "left-0 top-3 bottom-3 w-1.5 cursor-ew-resize" },
  { edge: "nw", className: "top-0 left-0 w-3 h-3 cursor-nwse-resize" },
  { edge: "ne", className: "top-0 right-0 w-3 h-3 cursor-nesw-resize" },
  { edge: "sw", className: "bottom-0 left-0 w-3 h-3 cursor-nesw-resize" },
  { edge: "se", className: "bottom-0 right-0 w-4 h-4 cursor-nwse-resize" },
];

/** Controls inside the header that must keep their own clicks (not start a drag). */
const INTERACTIVE = "button, a, input, textarea, select, [role='button']";

export interface FloatingWindowProps {
  /** Storage id of the position and size (per tab), also the stacking key. */
  id: string;
  /** Where the window opens the first time in this tab. */
  defaultRect: (viewport: Size) => FloatRect;
  min: Size;
  max?: Size;
  /** The header (drag handle): title and buttons. */
  header: ReactNode;
  children: ReactNode;
  /** Escape with the focus inside the window. */
  onClose: () => void;
  role?: "dialog" | "region";
  ariaLabel: string;
  className?: string;
  /** Content that swallows pointer events (an iframe): it gets `pointer-events: none` while dragging. */
  hasFrame?: boolean;
  /** Height of the window docked full width on a narrow screen. */
  dockedHeight?: number;
  sectionRef?: Ref<HTMLElement>;
}

/**
 * A window over the game screen: dragged by its header, resized from its edges and corners, kept between the bars,
 * the last one touched on top. Position and size stay per tab (`sessionStorage`). On a narrow screen it docks full
 * width at the bottom.
 */
export function FloatingWindow(p: FloatingWindowProps) {
  const { id, min, max, onClose } = p;
  const [viewport, setViewport] = useState<Size>(() => viewportSize());
  const [rect, setRect] = useState<FloatRect>(() => {
    const v = viewportSize();
    return clampRect(readRect(id) ?? p.defaultRect(v), v, min, max);
  });
  const [dragging, setDragging] = useState(false);
  const rectRef = useRef(rect);
  rectRef.current = rect;
  const stack = useSyncExternalStore(subscribeStack, stackSnapshot, stackSnapshot);

  useEffect(() => {
    bringToFront(id);
    return () => dropFromStack(id);
  }, [id]);

  useEffect(() => {
    const onResize = () => {
      const v = viewportSize();
      setViewport(v);
      setRect((r) => clampRect(r, v, min, max));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [min, max]);

  const narrow = isNarrow(viewport);

  const startPointer = useCallback((e: ReactPointerEvent, apply: (dx: number, dy: number) => FloatRect) => {
    if (e.button !== 0) return;
    e.preventDefault();
    bringToFront(id);
    const sx = e.clientX;
    const sy = e.clientY;
    setDragging(true);
    let last = rectRef.current;
    const onMove = (ev: PointerEvent) => {
      last = apply(ev.clientX - sx, ev.clientY - sy);
      setRect(last);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      setDragging(false);
      writeRect(id, last);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }, [id]);

  const onHeaderDown = (e: ReactPointerEvent) => {
    if (narrow || (e.target as HTMLElement).closest(INTERACTIVE)) return;
    const start = rectRef.current;
    const v = viewportSize();
    startPointer(e, (dx, dy) => moveRect(start, dx, dy, v, min, max));
  };

  const onEdgeDown = (edge: ResizeEdge) => (e: ReactPointerEvent) => {
    const start = rectRef.current;
    const v = viewportSize();
    startPointer(e, (dx, dy) => resizeRect(start, edge, dx, dy, v, min, max));
  };

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key !== "Escape") return;
    e.stopPropagation(); // only this window closes
    onClose();
  };

  const shown = narrow ? dockedRect(viewport, p.dockedHeight ?? Math.min(rect.h, Math.round(viewport.h * 0.7))) : rect;

  return (
    <section
      ref={p.sectionRef}
      role={p.role ?? "dialog"}
      aria-label={p.ariaLabel}
      onKeyDown={onKeyDown}
      onPointerDownCapture={() => bringToFront(id)}
      style={{ left: shown.x, top: shown.y, width: shown.w, height: shown.h, zIndex: zIndexOf(stack, id) }}
      className={`fixed flex flex-col rounded-md border border-border bg-card shadow-lg pointer-events-auto ${p.className ?? ""}`}
    >
      <div
        onPointerDown={onHeaderDown}
        className={`shrink-0 select-none touch-none ${narrow ? "" : "cursor-move"}`}
      >
        {p.header}
      </div>
      <div className={`flex-1 min-h-0 flex flex-col ${dragging && p.hasFrame ? "pointer-events-none" : ""}`}>{p.children}</div>
      {!narrow && EDGES.map(({ edge, className }) => (
        <div key={edge} aria-hidden="true" onPointerDown={onEdgeDown(edge)} className={`absolute touch-none ${className}`} />
      ))}
      {dragging && <div aria-hidden="true" className="fixed inset-0 z-[60] cursor-grabbing" />}
    </section>
  );
}
