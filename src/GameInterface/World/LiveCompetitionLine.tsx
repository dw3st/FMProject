import { useTranslation } from "react-i18next";
import { competitionName } from "@/Domain/world/labels";
import { useLeagueCatalog } from "@/GameInterface/World/useLeagueCatalog";
import type { LiveBase } from "@/types/rivalsTypes";

/** What a friend's live game is: competition, then round, group or stage, then the leg. */
export function LiveCompetitionLine({ live, className = "" }: { live: LiveBase; className?: string }) {
  const { t, i18n } = useTranslation();
  const leagues = useLeagueCatalog();
  if (!live.competition) return null;
  const s = live.stage;
  const parts = [competitionName(live.competition, leagues, i18n.language)];
  if (s?.kind === "round") parts.push(t("rivals.matchRound", { round: s.round }));
  if (s?.kind === "group") parts.push(t("continental.groupRound", { group: s.group, round: s.round }));
  if (s?.kind === "cup") parts.push(t(`cups.stage.${s.stage}`));
  if (s?.kind === "continental") {
    parts.push(t(`continental.stage.${s.stage}`));
    if (s.leg) parts.push(t(`continental.leg${s.leg}`));
  }
  const text = parts.join(" · ");
  return <p className={`m-0 text-sm text-muted-foreground truncate ${className}`} title={text}>{text}</p>;
}
