import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { GamePlayer } from "@/GameEngine/types";
import type { RosterPlayer } from "@/types/playerTypes";
import { getPlayerStats } from "@/GameEngine/Domain/Statistics";
import { computeOverallAvg } from "@/Domain/playerRating";
import { HUD, hudAttributes } from "@/Domain/match/matchHud";
import { FaceImage, playerInitials } from "@/GameInterface/Components/PlayerFace";
import { getDetailedPositionColor } from "@/GameInterface/positionHelpers";
import { ratingTextClass10 } from "@/GameInterface/scoreColors";
import { displayRating10 } from "@/GameInterface/Components/SubsPitchView";

/**
 * Match HUD (FIFA style, tester request): a band under the pitch with the user's player on the ball: face, shirt
 * number, name, position, overall, four attributes for his position, today's rating, fitness and numbers. It stays
 * `HUD.LINGER_S` after he lets the ball go; the band keeps its height so the pitch never jumps.
 */
export function MatchHud({ players, mySide, holderId, roster, faces, numbers, ratings, color }: {
  players: readonly GamePlayer[];
  mySide: "A" | "B";
  holderId: number | null;
  roster: ReadonlyMap<string, RosterPlayer>;
  faces?: Record<string, string>;
  numbers: ReadonlyMap<number, number>;
  ratings: Record<number, number>;
  color: string;
}) {
  const { t } = useTranslation();
  const roleAbbr = (role: string) => t(`roles.detailedAbbr.${role}`, { defaultValue: role });
  const [shownId, setShownId] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holder = holderId !== null ? players.find((p) => p.id === holderId && p.team === mySide) ?? null : null;

  useEffect(() => {
    if (holder) {
      if (timer.current) { clearTimeout(timer.current); timer.current = null; }
      setShownId(holder.id);
    } else if (shownId !== null && !timer.current) {
      timer.current = setTimeout(() => { timer.current = null; setShownId(null); }, HUD.LINGER_S * 1000);
    }
  }, [holder?.id, shownId]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const p = shownId !== null ? players.find((q) => q.id === shownId) ?? null : null;
  const r = p ? roster.get(p.rosterId) : undefined;

  return (
    <div className="h-[92px] shrink-0 border-t border-border bg-card/60 overflow-hidden" aria-live="polite">
      {p && (
        <div
          key={p.id}
          className="h-full flex items-center gap-4 px-4 border-l-[6px] animate-[tvGoalIn_.25s_ease-out]"
          style={{ borderLeftColor: color }}
        >
          <div className="flex items-center gap-3 min-w-0 w-64 shrink-0">
            <FaceImage src={faces?.[p.rosterId] ?? ""} size={64} fallback={playerInitials(p.name)} />
            <div className="flex flex-col min-w-0">
              <span className="flex items-baseline gap-2 min-w-0">
                <span className="font-display font-bold text-2xl tabular-nums text-muted-foreground">{numbers.get(p.id) ?? ""}</span>
                <span className="font-display font-bold uppercase text-xl leading-tight truncate">{p.name}</span>
              </span>
              <span className="flex items-baseline gap-2 text-sm">
                <span className={`font-display font-bold uppercase ${getDetailedPositionColor(p.role)}`}>{roleAbbr(p.role)}</span>
                {r && (
                  <span className="text-muted-foreground">
                    {t("match.hud.overall")} <span className="font-display font-bold text-foreground tabular-nums">{Math.round(computeOverallAvg(r) * 10)}</span>
                  </span>
                )}
              </span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 flex-1 min-w-0 max-w-md">
            {(r ? hudAttributes(p.role, r.stats) : []).map((a) => (
              <div key={a.key} className="flex items-center gap-2 min-w-0">
                <span className="w-10 shrink-0 font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground">{t(`match.hud.attr.${a.key}`)}</span>
                <span className="flex-1 h-1.5 rounded bg-border overflow-hidden min-w-16">
                  <span className="block h-full rounded bg-primary" style={{ width: `${Math.min(100, a.value)}%` }} />
                </span>
                <span className="w-8 text-right text-sm font-semibold tabular-nums">{a.value}</span>
              </div>
            ))}
          </div>
          <HudToday player={p} rating={displayRating10(p, ratings)} />
        </div>
      )}
    </div>
  );
}

function HudToday({ player, rating }: { player: GamePlayer; rating: number }) {
  const { t } = useTranslation();
  const s = getPlayerStats(player.id);
  return (
    <div className="flex flex-col gap-1 shrink-0 text-sm text-right">
      <span className="flex items-baseline gap-3 justify-end">
        <span className="text-muted-foreground">{t("match.hud.rating")} <span className={`font-display font-bold text-lg tabular-nums ${ratingTextClass10(rating)}`}>{rating.toFixed(1)}</span></span>
        <span className="text-muted-foreground">{t("match.hud.fitness")} <span className="font-display font-bold text-lg tabular-nums text-foreground">{Math.round(player.energy)}</span></span>
      </span>
      <span className="text-muted-foreground tabular-nums">
        {t("match.hud.today", { passes: s.passesCompleted, shots: s.shots, goals: s.goals })}
      </span>
    </div>
  );
}
