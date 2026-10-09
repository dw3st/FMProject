import { useTranslation } from "react-i18next";
import { shirtName } from "@/Domain/shirtName";
import type { GamePlayer, InjuryVacancy } from "@/GameEngine/types";
import { Chip } from "@/GameInterface/ui/Chip";
import { Icon } from "@/GameInterface/Icons";
import { gamePlayerNaturalRole } from "@/GameInterface/positionHelpers";
import { displayRating10 } from "@/GameInterface/Components/SubsPitchView";

interface Props {
  vacancies: InjuryVacancy[];
  /** Bench players that can still come on (not already queued). */
  bench: GamePlayer[];
  ratings?: Record<number, number>;
  /** A substitution is still available. */
  canSub: boolean;
  onFill: (injuredId: number, inId: number) => void;
}

/**
 * #140: slots left by injured players of the user's side. One row per injury: the injured player
 * and the bench, the suggested replacement first and highlighted; picking one brings him on now.
 */
export function InjuryVacancyPanel({ vacancies, bench, ratings, canSub, onFill }: Props) {
  const { t } = useTranslation();
  if (vacancies.length === 0) return null;
  return (
    <div className="px-4 py-3 border-b border-border space-y-3 shrink-0">
      {vacancies.map((v) => {
        const ordered = [...bench].sort((a, b) =>
          a.id === v.suggestedInId ? -1 : b.id === v.suggestedInId ? 1 : displayRating10(b, ratings) - displayRating10(a, ratings));
        return (
          <div key={v.injuredId} className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <Icon name="heart-pulse" size={16} className="text-destructive shrink-0" />
              <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground">
                {t("substitutionPanel.injuredLabel")}
              </span>
              <span className="font-semibold text-foreground">{shirtName(v.injuredName)}</span>
              <span className="text-muted-foreground">
                {canSub ? t("substitutionPanel.pickReplacement") : t("substitutionPanel.noSubsLeft")}
              </span>
            </div>
            {canSub && (
              <div className="flex flex-wrap gap-2">
                {ordered.map((p) => {
                  const suggested = p.id === v.suggestedInId;
                  return (
                    <Chip key={p.id} selected={suggested} onClick={() => onFill(v.injuredId, p.id)}>
                      {gamePlayerNaturalRole(p)} · {shirtName(p.name)} · <span className="tabular-nums">{displayRating10(p, ratings).toFixed(1)}</span>
                      {suggested ? ` · ${t("substitutionPanel.suggested")}` : ""}
                    </Chip>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
