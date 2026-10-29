import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@/GameInterface/Icons";
import { loadSession } from "@/GameInterface/gameSession";
import { WatchPopup } from "@/GameInterface/Watch/WatchScreen";
import type { LiveScoreView } from "@/types/rivalsTypes";

const BUTTON = "ml-auto inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border bg-card text-sm font-semibold text-foreground no-underline hover:border-primary cursor-pointer";

/**
 * "Assistir": the friend's live match as a broadcast window over the current screen, only while it is being played.
 * `newTab`: from the user's own live match, the broadcast opens in another tab (his match keeps running in this one,
 * and one page never draws two pitches).
 */
export function WatchButton({ live, saveId, newTab }: { live: LiveScoreView; saveId?: string; newTab?: boolean }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const save = saveId ?? loadSession()?.saveId;
  if (!save || (live.status !== "live" && live.status !== "half")) return null;
  if (newTab) {
    const href = `/watch?save=${encodeURIComponent(save)}&seat=${encodeURIComponent(live.seatId)}`;
    return (
      <a href={href} target="_blank" rel="noopener" className={BUTTON}>
        <Icon name="play" size={16} />
        {t("watch.button")}
      </a>
    );
  }
  return (
    <>
      <button type="button" className={BUTTON} onClick={() => setOpen(true)}>
        <Icon name="play" size={16} />
        {t("watch.button")}
      </button>
      {open && <WatchPopup saveId={save} seatId={live.seatId} onClose={() => setOpen(false)} />}
    </>
  );
}
