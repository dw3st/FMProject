import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { OpponentReport, ResultLetter, TacticRecord } from "@/Domain/scouting/opponentReport";
import { getDetailedPositionColor } from "@/GameInterface/positionHelpers";
import { SectionTitle } from "@/GameInterface/ui/SectionTitle";

const RESULT_CLASS: Record<ResultLetter, string> = {
  W: "bg-star-green/20 text-star-green border-star-green/40",
  D: "bg-secondary/40 text-muted-foreground border-border",
  L: "bg-destructive/15 text-destructive border-destructive/40",
};

const LABEL = "font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground m-0";

/** Pre-match analyst (report 955c069c): the opponent's stand-out players, form and results by formation. */
export function OpponentReportCard({ saveId, clubId, clubName }: { saveId: string; clubId: string; clubName: string }) {
  const { t } = useTranslation();
  const [report, setReport] = useState<OpponentReport | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setReport(null);
    setFailed(false);
    fetch(`/api/saves/${saveId}/clubs/${encodeURIComponent(clubId)}/opponent-report`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: OpponentReport) => { if (alive) setReport(d); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [saveId, clubId]);

  if (failed) return null;
  const letter = (r: ResultLetter) => t(`analyst.result.${r}`);

  return (
    <div className="card-arcade rounded-md p-4 flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <SectionTitle>{t("analyst.title")}</SectionTitle>
        <p className="text-sm text-muted-foreground m-0">{t("analyst.subtitle", { club: clubName })}</p>
      </div>
      {!report ? (
        <p className="text-sm text-muted-foreground m-0">{t("analyst.loading")}</p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="flex flex-col gap-2">
            <p className={LABEL}>{t("analyst.keyPlayers")}</p>
            {report.keyPlayers.length === 0 && <p className="text-sm text-muted-foreground m-0">{t("analyst.noPlayers")}</p>}
            {report.keyPlayers.map((p) => (
              <div key={p.id} className="flex items-center gap-2 text-sm">
                <span className={`font-display font-bold text-sm w-10 shrink-0 ${getDetailedPositionColor(p.position)}`}>
                  {t(`roles.detailedAbbr.${p.position}`, { defaultValue: p.position })}
                </span>
                <span className="font-semibold text-foreground truncate flex-1" title={p.name}>{p.name}</span>
                <span className="tabular-nums text-muted-foreground whitespace-nowrap">
                  {t("analyst.playerLine", { goals: p.goals, assists: p.assists, rating: p.avgRating.toFixed(1) })}
                </span>
              </div>
            ))}
            {report.keyPlayers.length > 0 && <p className="text-sm text-muted-foreground m-0">{t("analyst.markHint")}</p>}
          </div>

          <div className="flex flex-col gap-2">
            <p className={LABEL}>{t("analyst.form")}</p>
            {report.form.length === 0 && <p className="text-sm text-muted-foreground m-0">{t("analyst.noGames")}</p>}
            {report.form.map((g, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className={`inline-flex w-7 h-7 items-center justify-center rounded border font-display font-bold text-sm shrink-0 ${RESULT_CLASS[g.result]}`}>
                  {letter(g.result)}
                </span>
                <span className="tabular-nums font-semibold w-10 shrink-0">{g.goalsFor}–{g.goalsAgainst}</span>
                <span className="truncate text-foreground flex-1" title={g.opponentName}>
                  {t(g.home ? "analyst.vsHome" : "analyst.vsAway", { club: g.opponentName ?? g.opponentId })}
                </span>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-3">
            {report.tacticGames === 0 ? (
              <>
                <p className={LABEL}>{t("analyst.byFormation")}</p>
                <p className="text-sm text-muted-foreground m-0">{t("analyst.noTactics")}</p>
              </>
            ) : (
              <>
                <TacticTable title={t("analyst.byFormation")} rows={report.byOwnFormation} />
                <TacticTable title={t("analyst.byFaced")} rows={report.byFacedFormation} />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TacticTable({ title, rows }: { title: string; rows: TacticRecord[] }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-1.5">
      <p className={LABEL}>{title}</p>
      {rows.slice(0, 4).map((r) => (
        <div key={r.formation} className="flex items-center gap-2 text-sm tabular-nums">
          <span className="font-semibold text-foreground w-20 shrink-0">{r.formation === "custom" ? t("study.freeFormation") : r.formation}</span>
          <span className="text-muted-foreground">{t("analyst.record", { played: r.played, won: r.won, drawn: r.drawn, lost: r.lost })}</span>
        </div>
      ))}
    </div>
  );
}
