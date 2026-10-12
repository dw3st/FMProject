import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Icon } from "@/GameInterface/Icons";
import { clampFeedWindow, FEED_WINDOW_SIZE } from "@/GameInterface/feedWindow";

/**
 * Floating window with the live match events (#148): dragged by its header, closed with the button
 * or Escape. Position comes from the caller (remembered in `localStorage` there).
 */
export function MatchFeedWindow({
  x,
  y,
  onMove,
  onClose,
  children,
}: {
  x: number;
  y: number;
  /** Called with the new (already clamped) top-left corner when a drag ends. */
  onMove: (pos: { x: number; y: number }) => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const [pos, setPos] = useState({ x, y });
  const drag = useRef<{ dx: number; dy: number; id: number } | null>(null);
  const posRef = useRef(pos);
  posRef.current = pos;

  const viewport = () => ({ w: window.innerWidth, h: window.innerHeight });

  // The page may have shrunk since the window was placed: keep it reachable.
  useEffect(() => {
    const fit = () => setPos((p) => clampFeedWindow(p, viewport()));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCloseRef.current(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button")) return;
    drag.current = { dx: e.clientX - posRef.current.x, dy: e.clientY - posRef.current.y, id: e.pointerId };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    setPos(clampFeedWindow({ x: e.clientX - d.dx, y: e.clientY - d.dy }, viewport()));
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current || drag.current.id !== e.pointerId) return;
    drag.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
    onMove(posRef.current);
  };

  return createPortal(
    <div
      role="dialog"
      aria-label={t("match.feedWindow.title")}
      className="fixed z-40 flex flex-col rounded-md border border-border bg-card shadow-lg"
      style={{ left: pos.x, top: pos.y, width: FEED_WINDOW_SIZE.w, height: FEED_WINDOW_SIZE.h }}
    >
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        title={t("match.feedWindow.drag")}
        className="flex items-center justify-between gap-2 px-3 py-1 border-b border-border bg-secondary/30 cursor-move select-none touch-none"
      >
        <span className="flex items-center gap-1.5 font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground">
          <Icon name="grid" size={16} />
          {t("match.feedWindow.title")}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("match.feedWindow.close")}
          title={t("match.feedWindow.close")}
          className="w-8 h-8 flex items-center justify-center rounded bg-transparent border-0 text-muted-foreground hover:text-foreground cursor-pointer"
        >
          <Icon name="close" size={16} />
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-2">{children}</div>
    </div>,
    document.body,
  );
}
