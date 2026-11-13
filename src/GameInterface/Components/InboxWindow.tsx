import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@/GameInterface/Icons";
import { InboxScreen } from "@/GameInterface/InboxScreen";
import { FloatingWindow } from "@/GameInterface/ui/FloatingWindow";
import { TitleParts } from "@/GameInterface/ui/TitleParts";
import type { FloatRect, Size } from "@/GameInterface/ui/windowGeometry";

const INBOX_MIN: Size = { w: 640, h: 380 };
const INBOX_MAX: Size = { w: 1200, h: 1100 };

/** First spot: above the status bar, on the left, next to the messages button. */
export function inboxDefaultRect(v: Size): FloatRect {
  const w = Math.min(860, v.w - 48);
  const h = Math.min(600, Math.round(v.h * 0.72));
  return { x: 24, y: v.h - 56 - h, w, h };
}

/**
 * The inbox opened from the status bar: a floating window (moved, resized, the screen behind stays usable), not a
 * modal over the whole game (tester report, 2026-11-13). The `/inbox` route still shows the full screen.
 */
export function InboxWindow({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <FloatingWindow
      id="inbox"
      ariaLabel={`${t("screenTitles.inbox.main")} ${t("screenTitles.inbox.accent")}`}
      defaultRect={inboxDefaultRect}
      min={INBOX_MIN}
      max={INBOX_MAX}
      dockedHeight={520}
      onClose={onClose}
      header={
        <header className="flex items-center justify-between gap-2 px-4 pt-3">
          <h2 className="font-display font-black uppercase text-xl leading-none m-0">
            <TitleParts accent={t("screenTitles.inbox.accent")}>{t("screenTitles.inbox.main")}</TitleParts>
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            title={t("common.close")}
            className="flex items-center justify-center w-8 h-8 rounded text-muted-foreground hover:text-foreground cursor-pointer border-0 bg-transparent"
          >
            <Icon name="close" size={16} />
          </button>
        </header>
      }
    >
      <div className="min-h-0 flex-1">
        <InboxScreen embedded />
      </div>
    </FloatingWindow>
  );
}
