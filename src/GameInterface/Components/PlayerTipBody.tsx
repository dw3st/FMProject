import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { getMainRole } from "@/Domain/roles";
import { hudAttributes } from "@/Domain/match/matchHud";
import { playablePositions, preferredRole } from "@/Domain/positions/positionAptitude";
import { attrDisplay } from "@/Domain/attributes";
import { Icon } from "@/GameInterface/Icons";
import { LoadIndicator } from "@/GameInterface/Components/LoadIndicator";
import { MAIN_ROLE_ABBR, positionLabel } from "@/GameInterface/positionHelpers";
import { ratingTextClass10 } from "@/GameInterface/scoreColors";
import type { RosterPlayer } from "@/types/playerTypes";

export const ROW_TIP_W = 240;
export const ROW_TIP_H = 280;

export function getEnergyColor(energy: number) {
  if (energy >= 80) return "bg-chart-2";
  if (energy >= 50) return "bg-chart-4";
  return "bg-destructive";
}

function positionsText(t: TFunction, player: RosterPlayer): string {
  const { natural, apt, training } = playablePositions(player);
  const abbr = (r: string) => t(`roles.detailedAbbr.${r}` as never) as string;
  const part = (key: "natural" | "apt" | "training", roles: string[]) =>
    roles.length > 0 ? `${t(`roles.aptitude.${key}` as never)}: ${roles.map(abbr).join(", ")}` : null;
  return [part("natural", [natural]), part("apt", apt), part("training", training)].filter(Boolean).join(" · ");
}

/** What the hover card of a player says, on the pitch and in the lists (tester report: one style for both). */
export function PlayerTipBody({ player, role, avg, energy, oop, note, matchRating }: {
  player: RosterPlayer;
  /** Slot the numbers are for. */
  role: string;
  avg: number;
  energy: number;
  oop?: boolean;
  /** Extra line, e.g. the rating at the natural position. */
  note?: string;
  /** His rating in the match being played: shown apart from `avg`, his level (tester report: two numbers, one word). */
  matchRating?: number;
}) {
  const { t } = useTranslation();
  return (
    <>
      <div className="flex items-center justify-between mb-2">
        <span className="font-bold text-foreground text-sm">{player.name}</span>
        <span className={`text-sm px-2 py-0.5 rounded font-semibold ${oop ? "bg-chart-4/20 text-chart-4" : "bg-primary/20 text-primary"}`}>
          {positionLabel(t, preferredRole(player), player.positions[0] ?? "CM")}
        </span>
      </div>
      {oop && (
        <div className="flex items-center gap-1 mb-2 text-sm text-chart-4">
          <Icon name="alert" className="w-3 h-3" />
          <span>
            {t("formations.outOfPositionPrimary", {
              position: positionLabel(t, preferredRole(player), player.positions[0] ?? "CM"),
              role: MAIN_ROLE_ABBR[getMainRole(player.positions[0] ?? "CM")],
            })}
          </span>
        </div>
      )}
      <p className="mb-2 text-sm text-muted-foreground">{positionsText(t, player)}</p>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Icon name="star" className="w-3 h-3" />
            <span>{t(matchRating === undefined ? "formations.rating" : "formations.level")}</span>
          </div>
          <span className={`font-bold text-sm tabular-nums ${ratingTextClass10(avg)}`}>{attrDisplay(avg)}</span>
        </div>
        {matchRating !== undefined && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Icon name="trophy" className="w-3 h-3" />
              <span>{t("formations.matchRating")}</span>
            </div>
            <span className={`font-bold text-sm tabular-nums ${ratingTextClass10(matchRating)}`}>{matchRating.toFixed(1)}</span>
          </div>
        )}
        {note && <p className="m-0 text-sm text-muted-foreground">{note}</p>}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Icon name="zap" className="w-3 h-3" />
            <span>{t("formations.energy")}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-16 h-1.5 bg-border rounded overflow-hidden w-full min-w-16">
              <div className={`h-full rounded-full ${getEnergyColor(energy)}`} style={{ width: `${energy}%` }} />
            </div>
            <span className="font-bold text-sm text-foreground">{Math.round(energy)}%</span>
            <LoadIndicator load={player.seasonLog?.load ?? 0} size={11} />
          </div>
        </div>
        {/* The four attributes that matter in this slot (tester report: show finishing etc. on hover). */}
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 pt-2 border-t border-border/60">
          {hudAttributes(role, player.stats).map((a) => (
            <div key={a.key} className="flex items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground truncate">{t(`attributeNames.${a.key}`)}</span>
              <span className="font-semibold tabular-nums text-foreground">{a.value}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
