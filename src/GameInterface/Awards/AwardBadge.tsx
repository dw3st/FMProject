import { useTranslation } from "react-i18next";
import { Icon, type IconName } from "@/GameInterface/Icons";
import type { AwardKind } from "@/types/awardTypes";

/** Icon of each award (`.claude/rules/game/awards.md` → Telas). */
export const AWARD_ICON: Record<AwardKind, IconName> = {
  best_player: "award",
  top_scorer: "award",
  best_manager: "award",
  young_player: "medal",
  best_goalkeeper: "medal",
  team_of_season: "medal",
  goal_of_season: "star",
  world_player: "trophy",
  world_manager: "trophy",
};

/**
 * One award: icon + name (`awards.kind.<kind>`), `title` with the league/season. `iconOnly` keeps
 * just the 16px icon (career table), with the full text in `title` and `aria-label`.
 */
export function AwardBadge({ kind, title, iconOnly = false }: { kind: AwardKind; title?: string; iconOnly?: boolean }) {
  const { t } = useTranslation();
  const label = t(`awards.kind.${kind}`);
  const tip = title ? `${label} · ${title}` : label;
  const world = kind === "world_player" || kind === "world_manager";
  if (iconOnly) {
    return (
      <span title={tip} aria-label={tip} role="img" className={`inline-flex ${world ? "text-chart-4" : "text-primary"}`}>
        <Icon name={AWARD_ICON[kind]} size={16} />
      </span>
    );
  }
  return (
    <span
      title={tip}
      className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-sm font-semibold whitespace-nowrap ${
        world ? "border-chart-4/50 text-chart-4" : "border-primary/40 text-primary"
      }`}
    >
      <Icon name={AWARD_ICON[kind]} size={16} />
      {label}
    </span>
  );
}
