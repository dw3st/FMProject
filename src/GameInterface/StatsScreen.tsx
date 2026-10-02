import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { PageHeadline } from "@/GameInterface/Components/PageHeadline";
import { SelectCombobox } from "@/GameInterface/Components/SelectCombobox";
import {
  ClubCell, CrestCell, NameCell, NumberCell, RankCell, StatsCell, StatsDetailRow, StatsHead, StatsRow, StatsTable,
} from "@/GameInterface/Components/StatsTable";
import { StarBadge } from "@/GameInterface/Components/StarBadge";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { useStarPlayers } from "@/GameInterface/useStarPlayers";
import { countryDisplayName, leagueLabel, competitionName } from "@/Domain/world/labels";
import { cupSlugOf } from "@/Domain/cups/cupIds";
import { isContinentalSlug } from "@/Domain/continental/competitions";
import type { CompetitionRankings, RankingRow } from "@/Domain/stats/rankings";
import type { LeagueData, RetiredPlayer } from "@/types/playerTypes";
import { CareerTable } from "@/GameInterface/Components/CareerTable";
import { ManagerRanking } from "@/GameInterface/Components/ManagerRanking";
import type { CountryEntry } from "@/types/worldTypes";
import countriesRaw from "@/Data/countries.json";

const COUNTRY_BY_NAME = new Map(Object.values(countriesRaw as Record<string, CountryEntry>).map((c) => [c.name, c]));

type Tab = "rankings" | "team" | "retired" | "managers";
const TABS: Tab[] = ["rankings", "team", "retired", "managers"];
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
      <h2 className="font-display font-black uppercase text-xl leading-none m-0 mb-2">{title}</h2>
      <StatsTable
        head={<>
          <StatsHead align="center">#</StatsHead>
          <StatsHead />
          <StatsHead>{t("statsScreen.player")}</StatsHead>
          <StatsHead>{t("statsScreen.club")}</StatsHead>
          <StatsHead align="right">{valueLabel}</StatsHead>
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

  const header = (key: TeamSort, label: string, align: "left" | "right" = "right") => (
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
            <NumberCell>{r.games}</NumberCell>
            <NumberCell>{r.goals}</NumberCell>
            <NumberCell>{r.assists}</NumberCell>
            <NumberCell>{r.games > 0 ? r.rating.toFixed(2) : "-"}</NumberCell>
          </StatsRow>
        );
      })}
    </StatsTable>
  );
}

type RetiredRow = RetiredPlayer & { clubName: string | null };

const RETIRED_PAGE = 50;

function RetiredList({ saveId, leagues }: { saveId: string; leagues: LeagueData[] }) {
  const { t } = useTranslation();
  const [mine, setMine] = useState(true);
  const [rows, setRows] = useState<RetiredRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  // Bumped on every filter change, so a "load more" answer for the old filter is dropped.
  const generation = useRef(0);

  const fetchPage = (offset: number) =>
    fetch(`/api/saves/${saveId}/retired?offset=${offset}&limit=${RETIRED_PAGE}${mine ? "&mine=1" : ""}`)
      .then((r) => (r.ok
        ? (r.json() as Promise<{ total: number; items: RetiredRow[] }>)
        : Promise.reject(new Error(String(r.status)))));

  useEffect(() => {
    let cancelled = false;
    generation.current++;
    setRows(null);
    setError(false);
    setOpen(null);
    setLoadingMore(false);
    fetchPage(0)
      .then((d) => { if (!cancelled) { setRows(d.items); setTotal(d.total); } })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveId, mine]);

  const loadMore = () => {
    if (!rows || loadingMore) return;
    const gen = generation.current;
    setLoadingMore(true);
    fetchPage(rows.length)
      .then((d) => { if (gen === generation.current) { setRows([...rows, ...d.items]); setTotal(d.total); } })
      .catch(() => { if (gen === generation.current) setError(true); })
      .finally(() => { if (gen === generation.current) setLoadingMore(false); });
  };

  const chip = (value: boolean, label: string) => (
    <button
      type="button"
      aria-pressed={mine === value}
      onClick={() => setMine(value)}
      className={`rounded border px-3 py-1.5 text-sm bg-transparent cursor-pointer min-h-8 ${
        mine === value ? "border-primary text-primary" : "border-border text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
  const filters = (
    <div className="flex gap-2 mb-3">
      {chip(true, t("statsScreen.retired.mine"))}
      {chip(false, t("statsScreen.retired.all"))}
    </div>
  );

  if (error) return <>{filters}<p className="text-sm text-muted-foreground">{t("statsScreen.loadFailed")}</p></>;
  if (!rows) return <>{filters}<p className="text-sm text-muted-foreground">{t("statsScreen.loading")}</p></>;
  if (rows.length === 0) {
    return <>{filters}<p className="text-sm text-muted-foreground">{t(mine ? "statsScreen.retired.emptyMine" : "statsScreen.retired.empty")}</p></>;
  }
  return (
    <div className="max-w-4xl">
      {filters}
      <StatsTable
        head={<>
          <StatsHead />
          <StatsHead>{t("statsScreen.player")}</StatsHead>
          <StatsHead align="right">{t("statsScreen.retired.age")}</StatsHead>
          <StatsHead>{t("statsScreen.retired.lastClub")}</StatsHead>
          <StatsHead align="right">{t("career.apps")}</StatsHead>
          <StatsHead align="right">{t("career.goals")}</StatsHead>
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
              <StatsDetailRow key={`${r.id}-career`} colSpan={7}>
                <CareerTable rows={hist} leagues={leagues} />
              </StatsDetailRow>
            ),
          ];
        })}
      </StatsTable>
      {rows.length < total && (
        <button
          type="button"
          onClick={loadMore}
          disabled={loadingMore}
          className="mt-3 h-10 px-5 bg-transparent border-0 text-sm font-semibold text-muted-foreground hover:text-foreground cursor-pointer disabled:opacity-50"
        >
          {loadingMore ? t("statsScreen.loading") : t("statsScreen.retired.loadMore")}
        </button>
      )}
    </div>
  );
}

export function StatsScreen() {
  const { t, i18n } = useTranslation();
  const { session, currentDate, loading: saveLoading, fixtures } = useGameSave();
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
  const active = competition ?? ownLeague;

  const options = useMemo(() => {
    const own = leagues.find((l) => l.slug === ownLeague);
    const cup = own ? cupSlugOf(own.country) : null;
    const continental = [...new Set(fixtures.map((f) => f.competition))].filter(isContinentalSlug);
    const special = [...(cup ? [cup] : []), ...continental].map((slug) => ({
      value: slug,
      label: competitionName(slug, leagues, i18n.language),
    }));
    const leagueOpts = leagues.map((l) => {
      const c = COUNTRY_BY_NAME.get(l.country);
      return { value: l.slug, label: leagueLabel(l, c ? countryDisplayName(c, i18n.language, t) : l.country) };
    });
    const first = leagueOpts.filter((o) => o.value === ownLeague);
    return [...first, ...special, ...leagueOpts.filter((o) => o.value !== ownLeague)];
  }, [leagues, fixtures, ownLeague, i18n.language, t]);

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

  const tabButton = (value: Tab, label: string) => (
    <button
      type="button"
      onClick={() => setTab(value)}
      aria-pressed={tab === value}
      className={`px-3 py-1.5 text-sm rounded-md border cursor-pointer ${
        tab === value
          ? "border-primary text-foreground bg-primary/10"
          : "border-border text-muted-foreground bg-transparent hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="p-4 overflow-auto">
      <div className="max-w-6xl mx-auto space-y-5">
        <PageHeadline backHref="/dashboard">{t("statsScreen.title")}</PageHeadline>

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex gap-2">
            {tabButton("rankings", t("statsScreen.rankings"))}
            {tabButton("team", t("statsScreen.myTeam"))}
            {tabButton("retired", t("statsScreen.retired.tab"))}
            {tabButton("managers", t("statsScreen.managers.tab"))}
          </div>
          {tab === "rankings" && options.length > 0 && (
            <SelectCombobox
              labelId="stats-competition"
              value={active}
              onChange={setCompetition}
              options={options}
              placeholder={t("leagues.searchLeaguesPlaceholder")}
              className="w-full max-w-sm"
            />
          )}
        </div>

        {tab === "team" ? (
          <TeamTable stars={stars} />
        ) : tab === "retired" ? (
          session?.saveId ? <RetiredList saveId={session.saveId} leagues={leagues} /> : null
        ) : tab === "managers" ? (
          session?.saveId ? <ManagerRanking saveId={session.saveId} leagues={leagues} refreshKey={currentDate} /> : null
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
      </div>
    </div>
  );
}
