import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ScreenTitle } from "@/GameInterface/ui/ScreenTitle";
import { ScreenContainer } from "@/GameInterface/ui/ScreenContainer";
import { SelectCombobox } from "@/GameInterface/Components/SelectCombobox";
import {
  ClubCell, CrestCell, LoadMoreButton, NameCell, NumberCell, RankCell, StatsCell, StatsDetailRow, StatsHead, StatsRow, StatsTable,
} from "@/GameInterface/Components/StatsTable";
import { StarBadge } from "@/GameInterface/Components/StarBadge";
import { SegmentedTabs } from "@/GameInterface/ui/SegmentedTabs";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { useStarPlayers } from "@/GameInterface/useStarPlayers";
import { ALL_COMPETITIONS, type CompetitionRankings, type RankingRow } from "@/Domain/stats/rankings";
import { statsCompetitionOptions } from "@/GameInterface/statsCompetitionOptions";
import type { LeagueData, RetiredPlayer } from "@/types/playerTypes";
import { CareerTable } from "@/GameInterface/Components/CareerTable";
import { ManagerRanking } from "@/GameInterface/Components/ManagerRanking";
import type { CountryEntry } from "@/types/worldTypes";
import countriesRaw from "@/Data/countries.json";
import { OptionChips } from "@/GameInterface/ui/OptionChips";
import { AwardsView } from "@/GameInterface/Awards/AwardsView";
import { RefereesTab } from "@/GameInterface/Referees/RefereesTab";
import { Chip } from "@/GameInterface/ui/Chip";
import { Icon } from "@/GameInterface/Icons";
import { Button } from "@/GameInterface/ui/Button";
import { Notice } from "@/GameInterface/ui/Notice";
import { formatEuros } from "@/Domain/money";
import { useFavoriteCompetitions } from "@/GameInterface/useFavoriteCompetitions";

const COUNTRY_BY_NAME = new Map(Object.values(countriesRaw as Record<string, CountryEntry>).map((c) => [c.name, c]));

type Tab = "rankings" | "team" | "retired" | "managers" | "awards" | "referees";
const TABS: Tab[] = ["rankings", "team", "retired", "managers", "awards", "referees"];
type TableKey = keyof CompetitionRankings;
const TABLES: TableKey[] = ["scorers", "assists", "ratings", "appearances"];
/** Column label of each ranking table's value. */
const VALUE_LABEL: Record<TableKey, string> = {
  scorers: "statsScreen.goals", assists: "statsScreen.assists", ratings: "statsScreen.rating", appearances: "statsScreen.games",
};
type Stars = ReturnType<typeof useStarPlayers>;

function playerHref(leagueSlug: string, squadId: string, playerId: string) {
  return `/player/${encodeURIComponent(leagueSlug)}/${encodeURIComponent(squadId)}/${encodeURIComponent(playerId)}`;
}

function RankingTable({
  title, valueLabel, rows, myClubId, decimals, leagueSlug, stars,
}: {
  title: string;
  valueLabel: string;
  rows: RankingRow[];
  myClubId: string;
  decimals?: boolean;
  leagueSlug: string;
  stars: Stars;
}) {
  const { t } = useTranslation();
  return (
    <section className="min-w-0">
      <h2 className="font-display font-black uppercase text-xl leading-none m-0 mb-3">{title}</h2>
      <StatsTable
        head={<>
          <StatsHead align="center">#</StatsHead>
          <StatsHead />
          <StatsHead>{t("statsScreen.player")}</StatsHead>
          <StatsHead>{t("statsScreen.club")}</StatsHead>
          <StatsHead align="center">{valueLabel}</StatsHead>
        </>}
      >
        {rows.map((r, i) => {
          const kind = stars.get(r.playerId);
          return (
            <StatsRow key={r.playerId} highlight={r.squadId === myClubId}>
              <RankCell rank={i + 1} />
              <CrestCell squadId={r.squadId} />
              <NameCell href={playerHref(leagueSlug, r.squadId, r.playerId)}>
                <span className="truncate">{r.name}</span>
                {kind && <StarBadge kind={kind} />}
              </NameCell>
              <ClubCell>{r.clubName}</ClubCell>
              <NumberCell strong>{decimals ? r.value.toFixed(2) : r.value}</NumberCell>
            </StatsRow>
          );
        })}
      </StatsTable>
    </section>
  );
}

type TeamSort = "name" | "games" | "goals" | "assists" | "rating";

function TeamTable({ stars }: { stars: Stars }) {
  const { t } = useTranslation();
  const { squad, session } = useGameSave();
  const [sort, setSort] = useState<TeamSort>("games");
  const [dir, setDir] = useState<1 | -1>(-1);

  const rows = useMemo(() => {
    const list = (squad?.players ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      games: p.seasonLog?.appearances ?? 0,
      goals: p.seasonLog?.goals ?? 0,
      assists: p.seasonLog?.assists ?? 0,
      rating: p.seasonLog?.avgRating ?? 0,
    }));
    return list.sort((a, b) => {
      const v = sort === "name" ? a.name.localeCompare(b.name) : a[sort] - b[sort];
      return (v || a.name.localeCompare(b.name)) * dir;
    });
  }, [squad, sort, dir]);

  const header = (key: TeamSort, label: string, align: "left" | "center" = "center") => (
    <StatsHead align={align}>
      <button
        type="button"
        onClick={() => {
          if (sort === key) setDir((d) => (d === 1 ? -1 : 1));
          else { setSort(key); setDir(key === "name" ? 1 : -1); }
        }}
        className="bg-transparent border-0 p-0 [font:inherit] tracking-[inherit] uppercase text-inherit cursor-pointer hover:text-foreground"
      >
        {label}{sort === key ? (dir === 1 ? " ↑" : " ↓") : ""}
      </button>
    </StatsHead>
  );

  const clubId = squad?.id ?? session?.clubId ?? "";
  return (
    <StatsTable
      className="max-w-3xl"
      head={<>
        <StatsHead />
        {header("name", t("statsScreen.player"), "left")}
        {header("games", t("statsScreen.games"))}
        {header("goals", t("statsScreen.goals"))}
        {header("assists", t("statsScreen.assists"))}
        {header("rating", t("statsScreen.rating"))}
      </>}
    >
      {rows.map((r) => {
        const kind = stars.get(r.id);
        return (
          <StatsRow key={r.id}>
            <CrestCell squadId={clubId} />
            <NameCell href={playerHref(session?.leagueSlug ?? "", session?.clubId ?? "", r.id)}>
              <span className="truncate">{r.name}</span>
              {kind && <StarBadge kind={kind} />}
            </NameCell>
            <NumberCell strong={sort === "games"}>{r.games}</NumberCell>
            <NumberCell strong={sort === "goals"}>{r.goals}</NumberCell>
            <NumberCell strong={sort === "assists"}>{r.assists}</NumberCell>
            <NumberCell strong={sort === "rating"}>{r.games > 0 ? r.rating.toFixed(2) : "-"}</NumberCell>
          </StatsRow>
        );
      })}
    </StatsTable>
  );
}

type RetiredRow = RetiredPlayer & {
  clubName: string | null;
  /** A legend (world class at retirement): the fee to bring him back, or who already did. */
  legend: {
    fee: number | null;
    back: { via: "points" | "money" | "reborn"; mine: boolean; manager: string | null; on: string | null } | null;
  } | null;
};
type RetiredFilter = "mine" | "legends" | "all";

const RETIRED_PAGE = 50;

function RetiredList({ saveId, leagues }: { saveId: string; leagues: LeagueData[] }) {
  const { t, i18n } = useTranslation();
  const [filter, setFilter] = useState<RetiredFilter>("mine");
  const mine = filter === "mine";
  const legends = filter === "legends";
  const [hiredThisSeason, setHiredThisSeason] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [hiring, setHiring] = useState(false);
  const [hireMsg, setHireMsg] = useState<{ kind: "info" | "error"; text: string } | null>(null);
  const [reload, setReload] = useState(0);
  const [rows, setRows] = useState<RetiredRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  // Bumped on every filter change, so a "load more" answer for the old filter is dropped.
  const generation = useRef(0);

  const fetchPage = (offset: number) =>
    fetch(`/api/saves/${saveId}/retired?offset=${offset}&limit=${RETIRED_PAGE}${mine ? "&mine=1" : ""}${legends ? "&legends=1" : ""}`)
      .then((r) => (r.ok
        ? (r.json() as Promise<{ total: number; items: RetiredRow[]; legendHire: { thisSeason: boolean } }>)
        : Promise.reject(new Error(String(r.status)))));

  useEffect(() => {
    let cancelled = false;
    generation.current++;
    setRows(null);
    setError(false);
    setOpen(null);
    setLoadingMore(false);
    setMoreFailed(false);
    fetchPage(0)
      .then((d) => { if (!cancelled) { setRows(d.items); setTotal(d.total); setHiredThisSeason(d.legendHire.thisSeason); } })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveId, filter, reload]);

  const hire = async (r: RetiredRow) => {
    setHiring(true);
    setHireMsg(null);
    const res = await fetch(`/api/saves/${saveId}/legends/${encodeURIComponent(r.id)}/hire`, { method: "POST" }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { error?: string } | null;
    setHiring(false);
    setConfirming(null);
    if (res?.ok) {
      setHireMsg({ kind: "info", text: t("statsScreen.retired.legend.hired", { name: r.name }) });
      setReload((n) => n + 1);
    } else {
      setHireMsg({ kind: "error", text: t(`statsScreen.retired.legend.errors.${body?.error ?? "generic"}`, { defaultValue: t("statsScreen.retired.legend.errors.generic") }) });
    }
  };

  const loadMore = () => {
    if (!rows || loadingMore) return;
    const gen = generation.current;
    setLoadingMore(true);
    setMoreFailed(false);
    fetchPage(rows.length)
      .then((d) => { if (gen === generation.current) { setRows([...rows, ...d.items]); setTotal(d.total); } })
      .catch(() => { if (gen === generation.current) setMoreFailed(true); })
      .finally(() => { if (gen === generation.current) setLoadingMore(false); });
  };

  const filters = (
    <OptionChips
      className="mb-3"
      options={[
        { key: "mine", label: t("statsScreen.retired.mine") },
        { key: "legends", label: t("statsScreen.retired.legends") },
        { key: "all", label: t("statsScreen.retired.all") },
      ]}
      value={filter}
      onChange={(k) => { setFilter(k); setHireMsg(null); setConfirming(null); }}
    />
  );

  const legendCell = (r: RetiredRow) => {
    if (!r.legend) return null;
    const back = r.legend.back;
    if (back) {
      const who = back.mine ? t("statsScreen.retired.legend.byYou") : back.manager ?? t("statsScreen.retired.legend.byOther");
      return (
        <span className="text-sm text-muted-foreground">
          {t(`statsScreen.retired.legend.back.${back.via}`, { who })}
          {back.on && <span className="tabular-nums"> · {new Date(`${back.on}T00:00:00`).toLocaleDateString(i18n.language)}</span>}
        </span>
      );
    }
    if (r.legend.fee === null) return null;
    const fee = formatEuros(r.legend.fee);
    if (hiredThisSeason) return <span className="text-sm text-muted-foreground">{t("statsScreen.retired.legend.oncePerSeason")}</span>;
    return confirming === r.id ? (
      <span className="flex items-center gap-3">
        <Button disabled={hiring} onClick={() => void hire(r)}>{t("statsScreen.retired.legend.confirm", { fee })}</Button>
        <Button variant="secondary" disabled={hiring} onClick={() => setConfirming(null)}>{t("common.cancel")}</Button>
      </span>
    ) : (
      <Button variant="secondary" onClick={() => setConfirming(r.id)}>{t("statsScreen.retired.legend.hire", { fee })}</Button>
    );
  };

  if (error) return <>{filters}<p className="text-sm text-muted-foreground">{t("statsScreen.loadFailed")}</p></>;
  if (!rows) return <>{filters}<p className="text-sm text-muted-foreground">{t("statsScreen.loading")}</p></>;
  if (rows.length === 0) {
    return <>{filters}<p className="text-sm text-muted-foreground">{t(mine ? "statsScreen.retired.emptyMine" : legends ? "statsScreen.retired.emptyLegends" : "statsScreen.retired.empty")}</p></>;
  }
  return (
    <div className={legends ? "max-w-6xl" : "max-w-4xl"}>
      {filters}
      {legends && <p className="text-sm text-muted-foreground mt-0 mb-3">{t("statsScreen.retired.legend.about")}</p>}
      {hireMsg && <div className="mb-3"><Notice kind={hireMsg.kind}>{hireMsg.text}</Notice></div>}
      <StatsTable
        head={<>
          <StatsHead />
          <StatsHead>{t("statsScreen.player")}</StatsHead>
          <StatsHead align="center">{t("statsScreen.retired.age")}</StatsHead>
          <StatsHead>{t("statsScreen.retired.lastClub")}</StatsHead>
          <StatsHead align="center">{t("career.apps")}</StatsHead>
          <StatsHead align="center">{t("career.goals")}</StatsHead>
          {legends && <StatsHead>{t("statsScreen.retired.legend.status")}</StatsHead>}
          <StatsHead />
        </>}
      >
        {rows.map((r) => {
          const hist = r.history ?? [];
          const apps = hist.reduce((a, h) => a + h.apps, 0);
          const goals = hist.reduce((a, h) => a + h.goals, 0);
          const isOpen = open === r.id;
          return [
            <StatsRow key={r.id}>
              <CrestCell squadId={r.squadId} />
              <NameCell><span className="truncate">{r.name}</span></NameCell>
              <NumberCell>{r.age}</NumberCell>
              <ClubCell>{r.clubName ?? "-"}</ClubCell>
              <NumberCell>{apps}</NumberCell>
              <NumberCell>{goals}</NumberCell>
              {legends && <StatsCell>{legendCell(r)}</StatsCell>}
              <StatsCell align="right">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? null : r.id)}
                  className="min-h-8 bg-transparent border-0 p-0 text-sm text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  {isOpen ? t("statsScreen.retired.hide") : t("statsScreen.retired.show")}
                </button>
              </StatsCell>
            </StatsRow>,
            isOpen && (
              <StatsDetailRow key={`${r.id}-career`} colSpan={legends ? 8 : 7}>
                <CareerTable rows={hist} leagues={leagues} />
              </StatsDetailRow>
            ),
          ];
        })}
      </StatsTable>
      {rows.length < total && (
        <LoadMoreButton
          onClick={loadMore}
          loading={loadingMore}
          failed={moreFailed}
          label={t("statsScreen.retired.loadMore")}
          loadingLabel={t("statsScreen.loading")}
          failedLabel={t("statsScreen.loadFailed")}
        />
      )}
    </div>
  );
}

export function StatsScreen() {
  const { t, i18n } = useTranslation();
  const { session, currentDate, loading: saveLoading } = useGameSave();
  const stars = useStarPlayers(session?.saveId, currentDate);

  const [leagues, setLeagues] = useState<LeagueData[]>([]);
  const [tab, setTab] = useState<Tab>(() => {
    const q = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("tab") : null;
    return TABS.includes(q as Tab) ? (q as Tab) : "rankings";
  });
  const [competition, setCompetition] = useState<string | null>(null);
  const [data, setData] = useState<CompetitionRankings | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!saveLoading && !session) window.location.href = "/new-game";
  }, [saveLoading, session]);

  useEffect(() => {
    void fetch("/api/leagues").then((r) => (r.ok ? r.json() : [])).then(setLeagues).catch(() => setLeagues([]));
  }, []);

  const ownLeague = session?.leagueSlug ?? "";
  const active = competition ?? ALL_COMPETITIONS;

  const options = useMemo(
    () => (leagues.length > 0 ? statsCompetitionOptions(leagues, COUNTRY_BY_NAME, i18n.language, t) : []),
    [leagues, i18n.language, t],
  );

  const { favorites, toggle: toggleFavorite } = useFavoriteCompetitions();
  const favoriteOptions = useMemo(
    () => favorites.map((slug) => options.find((o) => o.value === slug)).filter((o) => o !== undefined),
    [favorites, options],
  );
  const isFavorite = favorites.includes(active);

  useEffect(() => {
    if (!session?.saveId || !active || tab !== "rankings") return;
    let cancelled = false;
    setData(null);
    setError(false);
    fetch(`/api/saves/${session.saveId}/stats?competition=${encodeURIComponent(active)}`)
      .then((r) => (r.ok ? (r.json() as Promise<CompetitionRankings>) : Promise.reject(new Error(String(r.status)))))
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [session?.saveId, active, tab, currentDate]);

  return (
    <ScreenContainer>
        <ScreenTitle accent={t("screenTitles.stats.accent")}>
          {t("screenTitles.stats.main")}
        </ScreenTitle>

        <SegmentedTabs
          tabs={[
            { key: "rankings" as const, label: t("statsScreen.rankings") },
            { key: "team" as const, label: t("statsScreen.myTeam") },
            { key: "retired" as const, label: t("statsScreen.retired.tab") },
            { key: "managers" as const, label: t("statsScreen.managers.tab") },
            { key: "awards" as const, label: t("statsScreen.awards.tab") },
            { key: "referees" as const, label: t("statsScreen.referees.tab") },
          ]}
          active={tab}
          onChange={setTab}
        />

        {tab === "rankings" && options.length > 0 && (
          <div className="flex flex-wrap items-end gap-3">
            <SelectCombobox
              label={t("statsScreen.competition")}
              labelId="stats-competition"
              value={active}
              onChange={setCompetition}
              options={options}
              placeholder={t("leagues.searchLeaguesPlaceholder")}
              className="w-full max-w-sm"
            />
            <button
              type="button"
              onClick={() => toggleFavorite(active)}
              aria-pressed={isFavorite}
              aria-label={t(isFavorite ? "statsScreen.favorites.remove" : "statsScreen.favorites.add")}
              title={t(isFavorite ? "statsScreen.favorites.remove" : "statsScreen.favorites.add")}
              className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-card transition-colors ${isFavorite ? "text-chart-4" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Icon name={isFavorite ? "star-filled" : "star"} size={18} />
            </button>
            {favoriteOptions.length > 0 && (
              <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t("statsScreen.favorites.label")}>
                {favoriteOptions.map((o) => (
                  <Chip key={o.value} selected={o.value === active} onClick={() => setCompetition(o.value)}>
                    {o.label}
                  </Chip>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "team" ? (
          <TeamTable stars={stars} />
        ) : tab === "retired" ? (
          session?.saveId ? <RetiredList saveId={session.saveId} leagues={leagues} /> : null
        ) : tab === "managers" ? (
          session?.saveId ? <ManagerRanking saveId={session.saveId} leagues={leagues} refreshKey={currentDate} /> : null
        ) : tab === "referees" ? (
          session?.saveId ? <RefereesTab saveId={session.saveId} leagues={leagues} countryByName={COUNTRY_BY_NAME} refreshKey={currentDate ?? undefined} /> : null
        ) : tab === "awards" ? (
          session?.saveId ? (
            <AwardsView
              saveId={session.saveId}
              leagues={leagues}
              countryByName={COUNTRY_BY_NAME}
              myClubId={session.clubId ?? ""}
              ownLeague={ownLeague}
              currentDate={currentDate ?? ""}
            />
          ) : null
        ) : error ? (
          <p className="text-sm text-muted-foreground">{t("statsScreen.loadFailed")}</p>
        ) : !data ? (
          <p className="text-sm text-muted-foreground">{t("statsScreen.loading")}</p>
        ) : (
          <div className="grid gap-5 md:grid-cols-2">
            {TABLES.filter((k) => k !== "ratings" || data.ratings.length > 0).map((k) => (
              <RankingTable
                key={k}
                title={t(`statsScreen.${k}`)}
                valueLabel={t(VALUE_LABEL[k])}
                rows={data[k]}
                myClubId={session?.clubId ?? ""}
                decimals={k === "ratings"}
                leagueSlug={ownLeague}
                stars={stars}
              />
            ))}
          </div>
        )}

        <p className="text-sm text-muted-foreground m-0 flex flex-wrap items-center gap-x-4 gap-y-1">
          {(["gold", "blue", "green"] as const).map((k) => (
            <span key={k} className="inline-flex items-center gap-1">
              <StarBadge kind={k} /> {t(`players.star.${k}`)}
            </span>
          ))}
        </p>
    </ScreenContainer>
  );
}
