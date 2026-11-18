// The seasons a manager can reopen on his page (`.claude/rules/game/season-summary.md`): every end-of-season report
// he saw, or would have seen, kept in the save.
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "@/GameInterface/Components/Modal";
import { SeasonSummaryView } from "@/GameInterface/Components/SeasonSummaryView";
import { ClubLogo, squadLogoUrl } from "@/GameInterface/Components/ClubLogo";
import { SectionTitle } from "@/GameInterface/ui/SectionTitle";
import { TABLE_CELL, TABLE_STYLE } from "@/GameInterface/ui/leagueTableStyle";
import { competitionName } from "@/Domain/world/labels";
import type { LeagueData } from "@/types/playerTypes";
import type { SeasonSummary } from "@/types/seasonSummaryTypes";

export function SeasonReportsSection({ saveId, leagues }: { saveId: string; leagues: LeagueData[] }) {
  const { t, i18n } = useTranslation();
  const [reports, setReports] = useState<SeasonSummary[] | null>(null);
  const [open, setOpen] = useState<SeasonSummary | null>(null);
  useEffect(() => {
    let alive = true;
    void fetch(`/api/saves/${saveId}/season-reports`)
      .then((r) => (r.ok ? (r.json() as Promise<{ reports: SeasonSummary[] }>) : { reports: [] }))
      .then((d) => { if (alive) setReports(d.reports); })
      .catch(() => { if (alive) setReports([]); });
    return () => { alive = false; };
  }, [saveId]);

  if (!reports || reports.length === 0) return null;
  return (
    <section className="flex flex-col gap-2.5 min-w-0">
      <SectionTitle>{t("seasonSummary.history.title")}</SectionTitle>
      <div className={TABLE_STYLE.shell}>
        <table className="w-full border-collapse">
          <thead className={TABLE_STYLE.head}>
            <tr>
              <th className={`${TABLE_CELL.head} text-left`}>{t("seasonSummary.history.season")}</th>
              <th className={`${TABLE_CELL.head} text-left`}>{t("seasonSummary.history.club")}</th>
              <th className={`${TABLE_CELL.head} text-center`}>{t("seasonSummary.history.position")}</th>
              <th className={`${TABLE_CELL.head} text-center`}>{t("seasonSummary.history.points")}</th>
              <th className={`${TABLE_CELL.head} text-center`}>{t("seasonSummary.history.titles")}</th>
              <th className={TABLE_CELL.head} />
            </tr>
          </thead>
          <tbody className={TABLE_STYLE.body}>
            {reports.map((r) => (
              <tr key={`${r.year}:${r.clubId}`} className={`${TABLE_STYLE.row} ${TABLE_STYLE.rowClickable}`} onClick={() => setOpen(r)}>
                <td className={`${TABLE_CELL.body} font-semibold tabular-nums`}>{r.season}</td>
                <td className={TABLE_CELL.body}>
                  <span className="flex items-center gap-2 min-w-0">
                    <ClubLogo className={TABLE_STYLE.crest} logoUrl={squadLogoUrl(r.clubId)} primaryColor={r.clubColors?.[0]} secondaryColor={r.clubColors?.[1]} />
                    <span className="min-w-0">
                      <span className={`${TABLE_STYLE.name} block truncate`}>{r.clubName}</span>
                      <span className="block text-sm text-muted-foreground truncate">{competitionName(r.league, leagues, i18n.language)}</span>
                    </span>
                  </span>
                </td>
                <td className={`${TABLE_CELL.body} ${TABLE_STYLE.key}`}>{r.table?.position ? `${r.table.position}º` : "—"}</td>
                <td className={`${TABLE_CELL.body} ${TABLE_STYLE.number}`}>{r.table?.points ?? "—"}</td>
                <td className={`${TABLE_CELL.body} ${TABLE_STYLE.number}`}>{r.titles.filter((x) => !x.startsWith("promotion:")).length}</td>
                <td className={`${TABLE_CELL.body} text-right`}>
                  <button type="button" onClick={(e) => { e.stopPropagation(); setOpen(r); }}
                    className="h-8 cursor-pointer rounded-md border border-border bg-card px-3 text-sm font-semibold text-foreground hover:border-primary">
                    {t("seasonSummary.history.open")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {open && (
        <Modal open onClose={() => setOpen(null)} size="report" panelClassName="max-h-[94vh] overflow-y-auto overflow-x-hidden">
          <SeasonSummaryView summary={open} leagues={leagues} movedTo={null} formerClub={null} otherMoves={0} onDismiss={() => setOpen(null)} />
        </Modal>
      )}
    </section>
  );
}
