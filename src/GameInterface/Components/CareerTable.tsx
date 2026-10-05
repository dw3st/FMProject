import { useTranslation } from "react-i18next";
import { competitionName } from "@/Domain/world/labels";
import type { LeagueData, PlayerHistoryRow } from "@/types/playerTypes";
import { NumberCell, StatsCell, StatsHead, StatsRow, StatsTable } from "@/GameInterface/Components/StatsTable";
import { TABLE_STYLE } from "@/GameInterface/ui/leagueTableStyle";

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
    (a, r) => ({ apps: a.apps + r.apps, goals: a.goals + r.goals, assists: a.assists + r.assists, titles: a.titles + r.titles.length }),
    { apps: 0, goals: 0, assists: 0, titles: 0 },
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
      <StatsCell className="text-sm text-muted-foreground">{r.titles.map(titleName).join(", ")}</StatsCell>
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
        <StatsCell className="tabular-nums text-muted-foreground">{total.titles > 0 ? total.titles : ""}</StatsCell>
      </StatsRow>
    </StatsTable>
  );
}
