import { useTranslation } from "react-i18next";
import { Icon } from "@/GameInterface/Icons";
import { loadSession } from "@/GameInterface/gameSession";
import { setWatchTarget } from "@/GameInterface/Watch/watchWindow";
import type { LiveScoreView } from "@/types/rivalsTypes";

const BUTTON = "ml-auto inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border bg-card text-sm font-semibold text-foreground no-underline hover:border-primary cursor-pointer";

/**
 * "Assistir": the friend's live match in a floating broadcast window (`WatchWindowHost`), only while it is played; the
 * window stays open while the user moves between screens.
 * In the user's own live match too (report): the window draws the broadcast in an iframe, so the page still runs one pitch.
 */
export function WatchButton({ live, saveId }: { live: LiveScoreView; saveId?: string }) {
  const { t } = useTranslation();
  const save = saveId ?? loadSession()?.saveId;
  if (!save || (live.status !== "live" && live.status !== "half")) return null;
  return (
    <button type="button" className={BUTTON} onClick={() => setWatchTarget({ saveId: save, seatId: live.seatId })}>
      <Icon name="play" size={16} />
      {t("watch.button")}
    </button>
  );
}
