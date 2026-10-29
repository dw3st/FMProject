import { useTranslation } from "react-i18next";
import { Icon } from "@/GameInterface/Icons";
import { loadSession } from "@/GameInterface/gameSession";
import type { LiveScoreView } from "@/types/rivalsTypes";

/** "Assistir": opens the friend's live match (`/watch`), only while it is being played. */
/** `newTab`: from the user's own live match (his match keeps running in its tab). */
export function WatchButton({ live, saveId, newTab }: { live: LiveScoreView; saveId?: string; newTab?: boolean }) {
  const { t } = useTranslation();
  const save = saveId ?? loadSession()?.saveId;
  if (!save || (live.status !== "live" && live.status !== "half")) return null;
  const href = `/watch?save=${encodeURIComponent(save)}&seat=${encodeURIComponent(live.seatId)}`;
  return (
    <a
      href={href}
      {...(newTab ? { target: "_blank", rel: "noopener" } : {})}
      className="ml-auto inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border bg-card text-sm font-semibold text-foreground no-underline hover:border-primary"
    >
      <Icon name="play" size={16} />
      {t("watch.button")}
    </a>
  );
}
