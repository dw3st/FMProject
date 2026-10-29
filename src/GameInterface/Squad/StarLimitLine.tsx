import { useTranslation } from "react-i18next";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { useStarPlayers } from "@/GameInterface/useStarPlayers";
import { STAR_LIMIT } from "@/Domain/squad/starLimit";

/** The user's top players (gold stars) and whether `playerId`, from another club, would break the limit. */
export function useStarLimit(playerId?: string | null): { count: number; max: number; isTop: boolean; full: boolean } {
  const { session, squad, currentDate } = useGameSave();
  const stars = useStarPlayers(session?.saveId, currentDate);
  const count = (squad?.players ?? []).filter((p) => stars.get(p.id) === "gold").length;
  const isTop = !!playerId && stars.get(playerId) === "gold";
  const mine = !!playerId && !!squad?.players.some((p) => p.id === playerId);
  return { count, max: STAR_LIMIT.MAX, isTop, full: isTop && !mine && count >= STAR_LIMIT.MAX };
}

/** One line under a top player of another club (profile, negotiation): how many the user already has. */
export function StarLimitLine({ playerId }: { playerId: string | null }) {
  const { t } = useTranslation();
  const { count, max, isTop, full } = useStarLimit(playerId);
  if (!isTop) return null;
  const line = t("starLimit.line", { count, max, top: STAR_LIMIT.TOP });
  return <p className={`text-sm m-0 ${full ? "text-chart-4" : "text-muted-foreground"}`}>{full ? `${line} ${t("starLimit.full")}` : line}</p>;
}

/** "Top 25 do mundo: 4/5" in the user's squad header. */
export function StarCount() {
  const { t } = useTranslation();
  const { count, max } = useStarLimit();
  return (
    <div className="text-sm text-muted-foreground font-semibold tabular-nums" title={t("starLimit.rule", { max, top: STAR_LIMIT.TOP })}>
      {t("starLimit.count", { count, max, top: STAR_LIMIT.TOP })}
    </div>
  );
}
