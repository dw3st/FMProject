import { useEffect, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@/GameInterface/Icons";
import { FloatingWindow } from "@/GameInterface/ui/FloatingWindow";
import { setWatchTarget, subscribeWatchTarget, watchTarget } from "@/GameInterface/Watch/watchWindow";
import type { FloatRect, Size } from "@/GameInterface/ui/windowGeometry";

const WATCH_MIN: Size = { w: 420, h: 300 };
const WATCH_MAX: Size = { w: 1600, h: 1100 };
const ICON_BUTTON =
  "flex items-center justify-center w-8 h-8 rounded text-muted-foreground hover:text-foreground cursor-pointer border-0 bg-transparent";

/** First spot in a tab: a large window centred over the screen. */
function watchDefaultRect(v: Size): FloatRect {
  const w = Math.min(1040, Math.round(v.w * 0.7));
  const h = Math.min(Math.round(w / 1.55), v.h - 140);
  return { x: Math.round((v.w - w) / 2), y: 80, w, h };
}

const close = () => setWatchTarget(null);

/**
 * The broadcast of a friend's match in a floating window: the `/watch` page in a frame (its own bundle: Pixi and the
 * engine stay out of the game pages, which the page server does not split). The window stays open on every screen of
 * this tab (moved, resized) and the frame reconnects; the user keeps managing his club meanwhile.
 */
export function WatchWindowHost() {
  const { t } = useTranslation();
  const target = useSyncExternalStore(subscribeWatchTarget, watchTarget, () => null);

  useEffect(() => {
    if (!target) return;
    const onMsg = (e: MessageEvent) => {
      if (e.origin === window.location.origin && (e.data as { type?: string } | null)?.type === "watch-close") close();
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [target]);

  if (!target) return null;
  const src = `/watch?save=${encodeURIComponent(target.saveId)}&seat=${encodeURIComponent(target.seatId)}&embed=1`;
  return (
    <FloatingWindow
      id="watch"
      ariaLabel={t("watch.title")}
      defaultRect={watchDefaultRect}
      min={WATCH_MIN}
      max={WATCH_MAX}
      dockedHeight={320}
      hasFrame
      onClose={close}
      header={
        <header className="flex items-center gap-2 border-b border-border px-3 py-1.5">
          <Icon name="play" size={16} className="text-primary shrink-0" />
          <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground flex-1 truncate">
            {t("watch.title")}
          </span>
          <button type="button" className={ICON_BUTTON} onClick={close} aria-label={t("watch.leave")} title={t("watch.leave")}>
            <Icon name="close" size={16} />
          </button>
        </header>
      }
    >
      <iframe key={src} src={src} title={t("watch.title")} className="w-full flex-1 min-h-0 border-0 bg-background rounded-b-md" />
    </FloatingWindow>
  );
}
