import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ClubLogo, squadLogoUrl } from "@/GameInterface/Components/ClubLogo";
import { Flag } from "@/GameInterface/Components/Flag";
import { SelectCombobox } from "@/GameInterface/Components/SelectCombobox";
import { StatsHead, StatsRow, StatsTable } from "@/GameInterface/Components/StatsTable";
import { Button } from "@/GameInterface/ui/Button";
import { TABLE_CELL } from "@/GameInterface/ui/leagueTableStyle";
import {
  championBoard, competitionHistory, mostTitles, nationalRowName, seasonColumnLabel,
  type ChampionRowSpec, type ChampionTitle,
} from "@/Domain/champions/champions";
import { championFilters, MAIN_FILTER } from "@/GameInterface/Champions/championFilters";
import { competitionName, nationalityDisplayName } from "@/Domain/world/labels";
import { nationalityFlagCode } from "@/Domain/world/nationalityFlag";
import type { LeagueData } from "@/types/playerTypes";
import type { CountryEntry } from "@/types/worldTypes";

const SECTION = "font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground";

function HumanDot({ label }: { label: string }) {
  return <span className="w-2.5 h-2.5 rounded-full bg-chart-4 shrink-0" role="img" aria-label={label} title={label} />;
}

/** Crest of a club, flag of a national team. */
function ChampionCrest({ title }: { title: ChampionTitle }) {
  if (title.nation) {
    const code = nationalityFlagCode(title.nation);
    return code ? <Flag code={code} /> : null;
  }
  return <ClubLogo logoUrl={squadLogoUrl(title.squadId)} className="w-8 h-8 shrink-0" imgClassName="w-full h-full object-contain" />;
}

/**
 * Stats → Champions: the world's board (competitions by season), and the history of one competition with who won it most.
 * Spec `docs/superpowers/specs/2026-11-02-club-search-champions-design.md`.
 */
export function ChampionsTab({ saveId, leagues, countryByName, myClubId, refreshKey }: {
  saveId: string;
  leagues: LeagueData[];
  countryByName: ReadonlyMap<string, CountryEntry>;
  myClubId: string;
  refreshKey?: string;
}) {
  const { t, i18n } = useTranslation();
  const [titles, setTitles] = useState<ChampionTitle[] | null>(null);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState(MAIN_FILTER);
  const [detail, setDetail] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(false);
    fetch(`/api/saves/${saveId}/champions`)
      .then((r) => (r.ok ? (r.json() as Promise<{ titles: ChampionTitle[] }>) : Promise.reject(new Error(String(r.status)))))
      .then((d) => { if (!cancelled) setTitles(d.titles); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [saveId, refreshKey]);

  const filters = useMemo(() => championFilters(leagues, countryByName, i18n.language, t), [leagues, countryByName, i18n.language, t]);
  const rows: ChampionRowSpec[] = filters.find((f) => f.value === filter)?.rows ?? [];
  const board = useMemo(() => championBoard(titles ?? [], rows), [titles, rows]);

  const rowName = (key: string) => nationalRowName(key, i18n.language) ?? competitionName(key, leagues, i18n.language);
  const clubName = (x: ChampionTitle) => (x.nation ? nationalityDisplayName(x.nation, i18n.language, (k, o) => t(k, o)) : x.clubName);
  const managerLabel = (x: ChampionTitle) => t(x.human ? "champions.humanManager" : "champions.manager", { name: x.managerName });
  const nameClass = (x: ChampionTitle) => `font-semibold truncate ${x.squadId === myClubId ? "text-primary" : "text-foreground"}`;

  if (error) return <p className="text-sm text-muted-foreground m-0">{t("warnings.errors.loadFailed")}</p>;
  if (titles === null) return <p className="text-sm text-muted-foreground m-0">{t("common.loading")}</p>;

  if (detail) {
    const history = competitionHistory(titles, detail);
    const counts = mostTitles(history);
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display font-black uppercase text-xl leading-none m-0">{rowName(detail)}</h2>
          <Button variant="secondary" onClick={() => setDetail(null)}>{t("champions.back")}</Button>
        </div>
        <StatsTable
          className="max-w-3xl"
          head={
            <>
              <StatsHead>{t("champions.season")}</StatsHead>
              <StatsHead>{t("champions.champion")}</StatsHead>
              <StatsHead>{t("champions.managerColumn")}</StatsHead>
            </>
          }
        >
          {history.map((x) => (
            <StatsRow key={`${x.competition}-${x.season}`}>
              <td className={`${TABLE_CELL.body} font-black font-display text-primary tabular-nums`}>{x.season}</td>
              <td className={TABLE_CELL.body}>
                <div className="flex items-center gap-3 min-w-0">
                  <ChampionCrest title={x} />
                  {x.league ? (
                    <a href={`/squad/${encodeURIComponent(x.league)}/${encodeURIComponent(x.squadId)}`} className={`${nameClass(x)} no-underline hover:text-primary`}>{clubName(x)}</a>
                  ) : (
                    <span className={nameClass(x)}>{clubName(x)}</span>
                  )}
                </div>
              </td>
              <td className={`${TABLE_CELL.body} text-muted-foreground`}>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="truncate">{x.managerName}</span>
                  {x.human && (
                    <span className="inline-flex items-center gap-1.5 shrink-0 font-display font-bold uppercase tracking-[0.08em] text-[13px] text-chart-4">
                      <HumanDot label={t("champions.human")} />
                      {t("champions.human")}
                    </span>
                  )}
                </div>
              </td>
            </StatsRow>
          ))}
        </StatsTable>
        <div className="flex flex-col gap-2">
          <span className={SECTION}>{t("champions.mostTitles")}</span>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {counts.map(({ title, count }) => (
              <div key={title.squadId} className="flex items-center gap-2 min-w-0">
                <ChampionCrest title={title} />
                <span className={nameClass(title)}>{clubName(title)}</span>
                <span className="font-display font-bold text-primary tabular-nums">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <SelectCombobox
        label={t("champions.filter")}
        labelId="champions-filter"
        value={filter}
        onChange={setFilter}
        options={filters}
        placeholder={t("leagues.searchLeaguesPlaceholder")}
        className="w-full max-w-sm"
      />
      {board.rows.length === 0 ? (
        <p className="text-sm text-muted-foreground m-0">{t("champions.empty")}</p>
      ) : (
        <>
          <StatsTable
            head={
              <>
                <StatsHead>{t("champions.competition")}</StatsHead>
                {board.columns.map((y) => <StatsHead key={y}>{seasonColumnLabel(y)}</StatsHead>)}
              </>
            }
          >
            {board.rows.map((row, i) => {
              const newGroup = row.group !== undefined && row.group !== board.rows[i - 1]?.group;
              return [
                newGroup ? (
                  <tr key={`group-${row.group}`} className="bg-secondary/20">
                    <td colSpan={board.columns.length + 1} className={`px-4 py-2 ${SECTION}`}>{row.group}</td>
                  </tr>
                ) : null,
                <StatsRow key={row.key}>
                  <td className={TABLE_CELL.body}>
                    <button
                      type="button"
                      onClick={() => setDetail(row.key)}
                      className="min-h-8 bg-transparent border-0 p-0 text-left font-semibold text-foreground whitespace-nowrap cursor-pointer hover:text-primary"
                    >
                      {rowName(row.key)}
                    </button>
                  </td>
                  {board.columns.map((y) => {
                    const x = row.cells.get(y);
                    return (
                      <td key={y} className={TABLE_CELL.body}>
                        {x && (
                          <div className="flex items-center gap-2 whitespace-nowrap" title={managerLabel(x)}>
                            <ChampionCrest title={x} />
                            <span className={nameClass(x)}>{clubName(x)}</span>
                            {x.human && <HumanDot label={managerLabel(x)} />}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </StatsRow>,
              ];
            })}
          </StatsTable>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <HumanDot label={t("champions.humanLegend")} />
            {t("champions.humanLegend")}
          </div>
        </>
      )}
    </div>
  );
}
