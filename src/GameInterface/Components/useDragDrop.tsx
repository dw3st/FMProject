import { useCallback, useEffect, useRef, useState } from "react";
import type { DragEvent as ReactDragEvent, PointerEvent as ReactPointerEvent } from "react";

/** What is being dragged: a pitch slot (by index) or a bench player (by id). */
export interface DragSource {
  kind: "slot" | "bench";
  key: string;
}

/** Where it was dropped. Read from `data-drop` attributes: `slot:3`, `bench:<id>`, `zone:<row>:<col>`. */
export type DropTarget =
  | { kind: "slot"; index: number }
  | { kind: "bench"; playerId: string }
  | { kind: "zone"; row: number; col: number };

function parseDropTarget(value: string | null | undefined): DropTarget | null {
  if (!value) return null;
  const [kind, a, b] = value.split(":");
  if (kind === "slot" && a !== undefined) return { kind: "slot", index: Number(a) };
  if (kind === "bench" && a !== undefined) return { kind: "bench", playerId: value.slice("bench:".length) };
  if (kind === "zone" && a !== undefined && b !== undefined) return { kind: "zone", row: Number(a), col: Number(b) };
  return null;
}

const DRAG_THRESHOLD_PX = 6;

interface ActiveDrag {
  source: DragSource;
  label: string;
  x: number;
  y: number;
  /** `data-drop` value currently under the pointer, if any. */
  over: string | null;
}

function dropValueAt(x: number, y: number): string | null {
  const el = document.elementFromPoint(x, y);
  return el?.closest("[data-drop]")?.getAttribute("data-drop") ?? null;
}

/**
 * Pointer-events drag and drop (mouse, pen and touch). A press that moves less than the threshold
 * stays a click. On touch, only elements inside `[data-drag-handle]` / `[data-pitch-marker]` start a
 * drag (everything else keeps scrolling the page).
 */
export function useDragDrop(onDrop: (source: DragSource, target: DropTarget) => void) {
  const [drag, setDrag] = useState<ActiveDrag | null>(null);
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;
  const justDragged = useRef(false);
  const cleanup = useRef<(() => void) | null>(null);

  useEffect(() => () => cleanup.current?.(), []);

  const start = useCallback(
    (source: DragSource, label: string, e: ReactPointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      if (e.pointerType === "touch") {
        const t = e.target as HTMLElement;
        if (!t.closest("[data-drag-handle],[data-pitch-marker]")) return;
      }
      const startX = e.clientX;
      const startY = e.clientY;
      let active = false;

      const onMove = (ev: PointerEvent) => {
        if (!active) {
          if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_THRESHOLD_PX) return;
          active = true;
        }
        setDrag({ source, label, x: ev.clientX, y: ev.clientY, over: dropValueAt(ev.clientX, ev.clientY) });
      };
      const finish = (ev: PointerEvent | null) => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onCancel);
        cleanup.current = null;
        setDrag(null);
        if (!active) return;
        justDragged.current = true;
        setTimeout(() => { justDragged.current = false; }, 60);
        if (!ev) return;
        const target = parseDropTarget(dropValueAt(ev.clientX, ev.clientY));
        if (target) onDropRef.current(source, target);
      };
      const onUp = (ev: PointerEvent) => finish(ev);
      const onCancel = () => finish(null);

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onCancel);
      cleanup.current = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onCancel);
      };
    },
    [],
  );

  /** Props to spread on a draggable element. */
  const dragProps = useCallback(
    (source: DragSource, label: string) => ({
      onPointerDown: (e: ReactPointerEvent<HTMLElement>) => start(source, label, e),
      // A native HTML drag (selected text, a link, an image) fires pointercancel and kills ours.
      onDragStart: (e: ReactDragEvent<HTMLElement>) => e.preventDefault(),
    }),
    [start],
  );

  /** Call at the top of an onClick: true when the click is the tail of a drag and must be ignored. */
  const consumeClick = useCallback(() => justDragged.current, []);

  return { drag, dragProps, consumeClick };
}

/** Floating label that follows the pointer while dragging. */
export function DragGhost({ drag }: { drag: { label: string; x: number; y: number } | null }) {
  if (!drag) return null;
  return (
    <div
      className="fixed z-[300] pointer-events-none -translate-x-1/2 -translate-y-full -mt-2 px-3 py-1 rounded border border-primary bg-card text-sm font-semibold text-primary"
      style={{ left: drag.x, top: drag.y }}
    >
      {drag.label}
    </div>
  );
}
