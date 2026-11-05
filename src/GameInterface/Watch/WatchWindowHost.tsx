import { useEffect, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@/GameInterface/Icons";
import { FloatingWindow } from "@/GameInterface/ui/FloatingWindow";
import { useSocial } from "@/GameInterface/Social/useSocial";
import { worldRoomParam } from "@/Domain/social/rooms";
import { setWatchTarget, subscribeWatchTarget, watchTarget, type WatchTarget } from "@/GameInterface/Watch/watchWindow";
import { hiddenKey, hideAutoWatch } from "@/GameInterface/Watch/autoWatch";
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

/** Opened by itself (the dashboard): a smaller window in the bottom-right corner, above the status bar. */
function cornerRect(v: Size): FloatRect {
  const w = Math.min(560, Math.round(v.w * 0.4));
  const h = Math.round(w / 1.45);
  return { x: v.w - w - 24, y: Math.max(64, v.h - h - 64), w, h };
}

const close = () => setWatchTarget(null);
/** "Hide": an auto window stays closed for that match today. */
const hide = (target: WatchTarget) => {
  if (target.auto) hideAutoWatch(hiddenKey(target.saveId, target.seatId, target.auto.day));
  close();
};

/**
 * The broadcast in a browser window of its own (report: drag it to a second monitor): the floating window closes and
 * the same `/watch` page opens as a popup the user moves anywhere. Blocked popup: the floating window stays.
 */
function popOut(saveId: string, seatId: string): void {
  const url = `/watch?save=${encodeURIComponent(saveId)}&seat=${encodeURIComponent(seatId)}&follow=1`;
  const w = Math.min(1100, Math.round(window.screen.availWidth * 0.6));
  const h = Math.round(w / 1.55);
  const win = window.open(url, "fm-watch", `popup=yes,width=${w},height=${h}`);
  if (win) close();
}

/**
 * The broadcast of a friend's match in a floating window: the `/watch` page in a frame (its own bundle: Pixi and the
 * engine stay out of the game pages, which the page server does not split). The window stays open on every screen of
 * this tab (moved, resized) and the frame reconnects; the user keeps managing his club meanwhile.
 */
export function WatchWindowHost() {
  const { t } = useTranslation();
  const target = useSyncExternalStore(subscribeWatchTarget, watchTarget, () => null);
  const { openChat } = useSocial();

  useEffect(() => {
    if (!target) return;
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const type = (e.data as { type?: string } | null)?.type;
      if (type === "watch-close") close();
      // The room is always the league of the window: nothing from the message is used.
      if (type === "watch-chat") openChat(worldRoomParam(target.saveId));
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [target, openChat]);

  if (!target) return null;
  const auto = !!target.auto;
  const src = `/watch?save=${encodeURIComponent(target.saveId)}&seat=${encodeURIComponent(target.seatId)}&embed=1`;
  return (
    <FloatingWindow
      id={auto ? "watch-corner" : "watch"}
      ariaLabel={t("watch.title")}
      defaultRect={auto ? cornerRect : watchDefaultRect}
      min={WATCH_MIN}
      max={WATCH_MAX}
      dockedHeight={320}
      hasFrame
      onClose={() => hide(target)}
      header={
        <header className="flex items-center gap-2 border-b border-border px-3 py-1.5">
          <Icon name="play" size={16} className="text-primary shrink-0" />
          <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground flex-1 truncate">
            {t("watch.title")}
          </span>
          <button
            type="button"
            className="flex items-center gap-1.5 h-8 px-2 rounded border border-border bg-card text-sm font-semibold text-foreground hover:border-primary cursor-pointer"
            onClick={() => popOut(target.saveId, target.seatId)}
            title={t("watch.popOut")}
          >
            <Icon name="external-link" size={16} />
            {t("watch.popOutShort")}
          </button>
          {auto ? (
            <button type="button" onClick={() => hide(target)} title={t("watch.hideTitle")}
              className="h-8 px-2 rounded border-0 bg-transparent text-sm font-semibold text-muted-foreground hover:text-foreground cursor-pointer">
              {t("watch.hide")}
            </button>
          ) : (
            <button type="button" className={ICON_BUTTON} onClick={close} aria-label={t("watch.leave")} title={t("watch.leave")}>
              <Icon name="close" size={16} />
            </button>
          )}
        </header>
      }
    >
      <iframe key={src} src={src} title={t("watch.title")} className="w-full flex-1 min-h-0 border-0 bg-background rounded-b-md" />
    </FloatingWindow>
  );
}
