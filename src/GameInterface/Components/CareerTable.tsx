import { useTranslation } from "react-i18next";
import { competitionName } from "@/Domain/world/labels";
import type { LeagueData, PlayerHistoryRow } from "@/types/playerTypes";
import { NumberCell, StatsCell, StatsHead, StatsRow, StatsTable } from "@/GameInterface/Components/StatsTable";
import { TABLE_STYLE } from "@/GameInterface/ui/leagueTableStyle";
import { AwardBadge } from "@/GameInterface/Awards/AwardBadge";

/** Career rows (closed seasons), an optional current-season row, and totals. Dumb component. */
export function CareerTable({
  rows, current, leagues,
}: {
  rows: PlayerHistoryRow[];
  current?: PlayerHistoryRow | null;
  leagues: LeagueData[];
}) {
  const { t, i18n } = useTranslation();
  const all = current ? [...rows, current] : rows;
  if (all.length === 0) return <p className="text-sm text-muted-foreground m-0">{t("career.empty")}</p>;
  const total = all.reduce(
    (a, r) => ({
      apps: a.apps + r.apps, goals: a.goals + r.goals, assists: a.assists + r.assists,
      yellowCards: a.yellowCards + r.yellowCards, redCards: a.redCards + r.redCards,
      injuries: a.injuries + r.injuries, daysInjured: a.daysInjured + r.daysInjured,
      titles: a.titles + r.titles.length,
    }),
    { apps: 0, goals: 0, assists: 0, yellowCards: 0, redCards: 0, injuries: 0, daysInjured: 0, titles: 0 },
  );
  const titleName = (title: string) => competitionName(title.slice(title.indexOf(":") + 1), leagues, i18n.language);
  const line = (r: PlayerHistoryRow, key: string, isCurrent: boolean) => (
    <StatsRow key={key} highlight={isCurrent}>
      <StatsCell className="tabular-nums whitespace-nowrap text-muted-foreground">{isCurrent ? t("career.current") : r.season}</StatsCell>
      <StatsCell className={`max-w-[12rem] truncate ${isCurrent ? TABLE_STYLE.nameHighlight : TABLE_STYLE.name}`}>{r.clubName}{r.loan ? ` ${t("career.loan")}` : ""}</StatsCell>
      <NumberCell>{r.apps}</NumberCell>
      <NumberCell strong>{r.goals}</NumberCell>
      <NumberCell>{r.assists}</NumberCell>
      <NumberCell>{r.avgRating !== null ? r.avgRating.toFixed(2) : "-"}</NumberCell>
      <NumberCell>{r.yellowCards}</NumberCell>
      <NumberCell>{r.redCards}</NumberCell>
      <NumberCell>{r.injuries}</NumberCell>
      <NumberCell>{r.daysInjured}</NumberCell>
      <StatsCell className="text-sm text-muted-foreground">
        <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
          {r.titles.length > 0 && <span>{r.titles.map(titleName).join(", ")}</span>}
          {(r.awards ?? []).map((a, j) => (
            <AwardBadge
              key={`${a.kind}-${j}`}
              kind={a.kind}
              iconOnly
              title={a.year !== undefined ? String(a.year) : `${competitionName(a.league ?? r.league, leagues, i18n.language)} ${r.season}`}
            />
          ))}
        </span>
      </StatsCell>
    </StatsRow>
  );
  return (
    <StatsTable
      head={
        <>
          <StatsHead>{t("career.season")}</StatsHead>
          <StatsHead>{t("career.club")}</StatsHead>
          <StatsHead align="center">{t("career.apps")}</StatsHead>
          <StatsHead align="center">{t("career.goals")}</StatsHead>
          <StatsHead align="center">{t("career.assists")}</StatsHead>
          <StatsHead align="center">{t("career.rating")}</StatsHead>
          <StatsHead align="center" title={t("career.yellowCardsFull")}>{t("career.yellowCards")}</StatsHead>
          <StatsHead align="center" title={t("career.redCardsFull")}>{t("career.redCards")}</StatsHead>
          <StatsHead align="center" title={t("career.injuriesFull")}>{t("career.injuries")}</StatsHead>
          <StatsHead align="center" title={t("career.daysInjuredFull")}>{t("career.daysInjured")}</StatsHead>
          <StatsHead>{t("career.titles")}</StatsHead>
        </>
      }
    >
      {rows.map((r, i) => line(r, `${r.season}-${r.squadId}-${i}`, false))}
      {current && line(current, "current", true)}
      <StatsRow>
        <StatsCell className="font-semibold">{t("career.total")}</StatsCell>
        <StatsCell />
        <NumberCell>{total.apps}</NumberCell>
        <NumberCell strong>{total.goals}</NumberCell>
        <NumberCell>{total.assists}</NumberCell>
        <StatsCell />
        <NumberCell>{total.yellowCards}</NumberCell>
        <NumberCell>{total.redCards}</NumberCell>
        <NumberCell>{total.injuries}</NumberCell>
        <NumberCell>{total.daysInjured}</NumberCell>
        <StatsCell className="tabular-nums text-muted-foreground">{total.titles > 0 ? total.titles : ""}</StatsCell>
      </StatsRow>
    </StatsTable>
  );
}
