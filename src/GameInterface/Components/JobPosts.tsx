import { useEffect, useMemo, useState } from "react";
import { useTableSort } from "@/GameInterface/ui/tableSort";
import { useTranslation } from "react-i18next";
import { SelectCombobox } from "@/GameInterface/Components/SelectCombobox";
import { CrestCell, StatsHead, StatsRow, StatsTable } from "@/GameInterface/Components/StatsTable";
import { Button } from "@/GameInterface/ui/Button";
import { TABLE_CELL } from "@/GameInterface/ui/leagueTableStyle";
import { statsCompetitionOptions } from "@/GameInterface/statsCompetitionOptions";
import { formatDay } from "@/GameInterface/Dashboard/HomeCards";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { managerHref } from "@/GameInterface/ManagerScreen";
import type { LeagueData } from "@/types/playerTypes";
import type { CountryEntry } from "@/types/worldTypes";
import type { JobPostRow, JobPostsView } from "@/backend/jobPostsWorld";

/** Level badge colour: 1 very secure … 5 very threatened, vacant = an interim waiting for the hire. */
const LEVEL_CLASS: Record<string, string> = {
  "1": "bg-primary/15 text-primary",
  "2": "bg-primary/10 text-primary",
  "3": "bg-secondary text-muted-foreground",
  "4": "bg-chart-4/15 text-chart-4",
  "5": "bg-destructive/15 text-destructive",
  vacant: "bg-chart-2/15 text-chart-2",
};

/**
 * Stats → Managers → Posts (8.9.29, tester report): every club of a league with its manager and how safe his job
 * is, and the button to apply for it. The answer comes in a few days through the inbox.
 */
const NO_ROWS: JobPostRow[] = [];

export function JobPosts({ saveId, leagues, countryByName, defaultLeague, refreshKey }: {
  saveId: string;
  leagues: LeagueData[];
  countryByName: ReadonlyMap<string, CountryEntry>;
  defaultLeague: string;
  refreshKey?: string;
}) {
  const { t, i18n } = useTranslation();
  const { refresh } = useGameSave();
  const [league, setLeague] = useState(defaultLeague);
  const [view, setView] = useState<JobPostsView | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const leagueSlugs = useMemo(() => new Set(leagues.map((l) => l.slug)), [leagues]);
  const options = useMemo(
    () => statsCompetitionOptions(leagues, countryByName, i18n.language, t).filter((o) => leagueSlugs.has(o.value)),
    [leagues, countryByName, i18n.language, t, leagueSlugs],
  );

  useEffect(() => {
    let cancelled = false;
    setError(false);
    fetch(`/api/saves/${saveId}/job-posts?league=${encodeURIComponent(league)}`)
      .then((r) => (r.ok ? (r.json() as Promise<JobPostsView>) : Promise.reject(new Error(String(r.status)))))
      .then((d) => { if (!cancelled) setView(d); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [saveId, league, refreshKey, reload]);

  const act = async (method: "POST" | "DELETE", squadId?: string) => {
    setBusy(true);
    setNotice(null);
    try {
      const r = await fetch(`/api/saves/${saveId}/job-applications`, {
        method, headers: { "Content-Type": "application/json" },
        ...(squadId ? { body: JSON.stringify({ squadId }) } : {}),
      });
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as { error?: string };
        setNotice(t(`jobPosts.errors.${body.error ?? "generic"}`, { defaultValue: t("jobPosts.errors.generic") }));
      } else {
        setNotice(method === "POST" ? t("jobPosts.sent") : t("jobPosts.withdrawn"));
        void refresh();
      }
    } catch {
      setNotice(t("jobPosts.errors.generic"));
    }
    setBusy(false);
    setReload((n) => n + 1);
  };

  const { sorted, head } = useTableSort(view?.rows ?? NO_ROWS, {
    position: (r) => (r.position === null ? null : -r.position), club: (r) => r.clubName, manager: (r) => r.managerName,
    // Vacant first, then the most threatened; a human manager last.
    security: (r) => (r.level === "vacant" ? 6 : r.level),
  });
  const levelText = (r: JobPostRow) =>
    r.level === null ? t("jobPosts.humanManager") : t(`jobPosts.level.${r.level}`);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground m-0">{t("jobPosts.hint")}</p>
      <SelectCombobox
        label={t("jobPosts.league")}
        labelId="job-posts-league"
        value={league}
        onChange={setLeague}
        options={options}
        placeholder={t("leagues.searchLeaguesPlaceholder")}
        className="w-full max-w-sm"
      />
      {view?.application && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-border px-4 py-3">
          <span className="text-sm text-foreground">
            {t("jobPosts.pending", { club: view.application.clubName, date: formatDay(view.application.answerOn, i18n.language) })}
          </span>
          <Button variant="secondary" disabled={busy} onClick={() => void act("DELETE")}>{t("jobPosts.withdraw")}</Button>
        </div>
      )}
      {notice && <p className="text-sm text-foreground m-0" role="status">{notice}</p>}
      {error ? (
        <p className="text-sm text-muted-foreground m-0">{t("warnings.errors.loadFailed")}</p>
      ) : !view ? (
        <p className="text-sm text-muted-foreground m-0">{t("common.loading")}</p>
      ) : (
        <StatsTable
          head={
            <>
              <StatsHead align="center" sort={head("position")}>#</StatsHead>
              <StatsHead />
              <StatsHead sort={head("club")}>{t("jobPosts.club")}</StatsHead>
              <StatsHead sort={head("manager")}>{t("jobPosts.manager")}</StatsHead>
              <StatsHead sort={head("security")}>{t("jobPosts.security")}</StatsHead>
              <StatsHead align="right">{""}</StatsHead>
            </>
          }
        >
          {sorted.map((r) => (
            <StatsRow key={r.squadId} highlight={r.blocked === "own"}>
              <td className={`${TABLE_CELL.body} text-center font-bold text-muted-foreground tabular-nums`}>{r.position ?? "-"}</td>
              <CrestCell squadId={r.squadId} />
              <td className={TABLE_CELL.body}>
                <div className="flex items-center gap-3 min-w-0">
                  <a href={`/squad/${encodeURIComponent(view.league)}/${encodeURIComponent(r.squadId)}`} className="font-semibold text-foreground no-underline hover:text-primary truncate">
                    {r.clubName}
                  </a>
                </div>
              </td>
              <td className={`${TABLE_CELL.body} text-muted-foreground`}>{r.managerId && r.managerName ? <a href={managerHref(r.managerId)} className="text-foreground no-underline hover:text-primary">{r.managerName}</a> : (r.managerName ?? "-")}</td>
              <td className={TABLE_CELL.body}>
                <span className={`inline-flex px-2 py-0.5 rounded text-sm ${r.level === null ? "text-muted-foreground" : LEVEL_CLASS[String(r.level)]}`}>
                  {levelText(r)}
                </span>
              </td>
              <td className={`${TABLE_CELL.body} text-right`}>
                {r.blocked === null ? (
                  <Button variant="secondary" disabled={busy || !!view.application} onClick={() => void act("POST", r.squadId)}>
                    {t("jobPosts.apply")}
                  </Button>
                ) : r.blocked === "refused" ? (
                  <span className="text-sm text-muted-foreground">{t("jobPosts.refusedRecently")}</span>
                ) : null}
              </td>
            </StatsRow>
          ))}
        </StatsTable>
      )}
    </div>
  );
}
