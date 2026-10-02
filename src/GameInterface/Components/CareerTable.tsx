import { useTranslation } from "react-i18next";
import { competitionName } from "@/Domain/world/labels";
import type { LeagueData, PlayerHistoryRow } from "@/types/playerTypes";

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
  const th = "px-2 py-2 font-display font-bold uppercase tracking-[0.08em] text-xs";
  const line = (r: PlayerHistoryRow, key: string, isCurrent: boolean) => (
    <tr key={key} className={`border-t border-border ${isCurrent ? "bg-primary/10" : ""}`}>
      <td className="px-2 py-2 tabular-nums whitespace-nowrap">{isCurrent ? t("career.current") : r.season}</td>
      <td className="px-2 py-2 max-w-[12rem] truncate">{r.clubName}</td>
      <td className="px-2 py-2 text-right tabular-nums">{r.apps}</td>
      <td className="px-2 py-2 text-right tabular-nums">{r.goals}</td>
      <td className="px-2 py-2 text-right tabular-nums">{r.assists}</td>
      <td className="px-2 py-2 text-right tabular-nums">{r.avgRating !== null ? r.avgRating.toFixed(2) : "-"}</td>
      <td className="px-2 py-2 text-muted-foreground">{r.titles.map(titleName).join(", ")}</td>
    </tr>
  );
  return (
    <div className="overflow-x-auto border border-border rounded-md">
      <table className="w-full text-sm">
        <thead className="text-muted-foreground">
          <tr>
            <th className={`${th} text-left`}>{t("career.season")}</th>
            <th className={`${th} text-left`}>{t("career.club")}</th>
            <th className={`${th} text-right`}>{t("career.apps")}</th>
            <th className={`${th} text-right`}>{t("career.goals")}</th>
            <th className={`${th} text-right`}>{t("career.assists")}</th>
            <th className={`${th} text-right`}>{t("career.rating")}</th>
            <th className={`${th} text-left`}>{t("career.titles")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => line(r, `${r.season}-${r.squadId}-${i}`, false))}
          {current && line(current, "current", true)}
          <tr className="border-t border-border font-semibold">
            <td className="px-2 py-2" colSpan={2}>{t("career.total")}</td>
            <td className="px-2 py-2 text-right tabular-nums">{total.apps}</td>
            <td className="px-2 py-2 text-right tabular-nums">{total.goals}</td>
            <td className="px-2 py-2 text-right tabular-nums">{total.assists}</td>
            <td className="px-2 py-2" />
            <td className="px-2 py-2 tabular-nums">{total.titles > 0 ? total.titles : ""}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
