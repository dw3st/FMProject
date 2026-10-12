import { useTranslation } from "react-i18next";
import { Flag } from "@/GameInterface/Components/Flag";
import { formatDay } from "@/GameInterface/Dashboard/HomeCards";
import { nationalCompetitionName, nationalityDisplayName } from "@/Domain/world/labels";
import { nationalityFlagCode } from "@/Domain/world/nationalityFlag";
import type { RosterPlayer } from "@/types/playerTypes";

/** National-team line of the player screen (`.claude/rules/game/national-teams.md` → "Telas"). */
export function NationalCareerLine({ player, today }: { player: RosterPlayer; today?: string }) {
  const { t, i18n } = useTranslation();
  const c = player.national;
  const duty = player.nationalDuty && (!today || today <= player.nationalDuty.until) ? player.nationalDuty : null;
  if (!c && !duty) return null;
  const nation = c?.nation ?? duty!.nation;
  const code = nationalityFlagCode(nation);
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-md border border-border px-4 py-3">
      <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground">
        {t("national.careerTitle")}
      </span>
      <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
        {code && <Flag code={code} />}
        {nationalityDisplayName(nation, i18n.language, t)}
      </span>
      {c && (
        <span className="text-sm tabular-nums text-foreground">{t("national.playerLine", { caps: c.caps, goals: c.goals })}</span>
      )}
      {c && c.titles.length > 0 && (
        <span className="text-sm">
          <span className="text-muted-foreground">{t("national.titles")}: </span>
          {c.titles.map((s) => nationalCompetitionName(s, i18n.language)).join(", ")}
        </span>
      )}
      {duty && (
        <span className="rounded border border-chart-5/40 bg-chart-5/10 px-2 py-0.5 text-sm text-chart-5">
          {t("national.onDuty", { date: formatDay(duty.until, i18n.language) })}
        </span>
      )}
    </div>
  );
}
