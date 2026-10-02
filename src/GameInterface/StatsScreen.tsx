import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { PageHeadline } from "@/GameInterface/Components/PageHeadline";
import { SelectCombobox } from "@/GameInterface/Components/SelectCombobox";
import { ClubLogo, squadLogoUrl } from "@/GameInterface/Components/ClubLogo";
import { StarBadge } from "@/GameInterface/Components/StarBadge";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { useStarPlayers } from "@/GameInterface/useStarPlayers";
import { countryDisplayName, leagueLabel, competitionName } from "@/Domain/world/labels";
import { cupSlugOf } from "@/Domain/cups/cupIds";
import { isContinentalSlug } from "@/Domain/continental/competitions";
import type { CompetitionRankings, RankingRow } from "@/Domain/stats/rankings";
import type { LeagueData, RetiredPlayer } from "@/types/playerTypes";
import { CareerTable } from "@/GameInterface/Components/CareerTable";
import type { CountryEntry } from "@/types/worldTypes";
import countriesRaw from "@/Data/countries.json";

const COUNTRY_BY_NAME = new Map(Object.values(countriesRaw as Record<string, CountryEntry>).map((c) => [c.name, c]));

type Tab = "rankings" | "team" | "retired";
type TableKey = keyof CompetitionRankings;
const TABLES: TableKey[] = ["scorers", "assists", "ratings", "appearances"];
type Stars = ReturnType<typeof useStarPlayers>;

function playerHref(leagueSlug: string, squadId: string, playerId: string) {
  return `/player/${encodeURIComponent(leagueSlug)}/${encodeURIComponent(squadId)}/${encodeURIComponent(playerId)}`;
}

// Shared table styles for every Stats tab (ui-standard: text-sm rows, label-style header, 44px rows).
const TABLE = "w-full text-sm";
const TH = "px-2 py-2 font-display font-bold uppercase tracking-[0.08em] text-xs text-muted-foreground";
const TD = "px-2 py-1.5";
const ROW = "h-11 border-b border-border last:border-0";

function RankingTable({
  title, rows, myClubId, decimals, leagueSlug, stars,
}: {
  title: string;
  rows: RankingRow[];
  myClubId: string;
  decimals?: boolean;
  leagueSlug: string;
  stars: Stars;
}) {
  return (
    <section className="min-w-0">
      <h2 className="font-display font-black uppercase text-xl leading-none m-0 mb-2">{title}</h2>
      <div className="overflow-x-auto border border-border rounded-lg">
        <table className={TABLE}>
          <tbody>
            {rows.map((r, i) => {
              const kind = stars.get(r.playerId);
              return (
                <tr
                  key={r.playerId}
                  className={`${ROW} ${r.squadId === myClubId ? "bg-primary/10" : ""}`}
                >
                  <td className={`w-8 ${TD} text-center text-muted-foreground tabular-nums`}>{i + 1}</td>
                  <td className="w-8 py-1.5">
                    <ClubLogo logoUrl={squadLogoUrl(r.squadId)} className="w-8 h-8 rounded-full" />
                  </td>
                  <td className={`${TD} max-w-[12rem]`}>
                    <a
                      href={playerHref(leagueSlug, r.squadId, r.playerId)}
                      className="text-foreground no-underline hover:underline inline-flex items-center gap-1.5 max-w-full"
                    >
                      <span className="truncate">{r.name}</span>
                      {kind && <StarBadge kind={kind} />}
                    </a>
                  </td>
                  <td className={`${TD} text-muted-foreground truncate max-w-[10rem]`}>{r.clubName}</td>
                  <td className={`${TD} text-right font-bold tabular-nums`}>
                    {decimals ? r.value.toFixed(2) : r.value}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
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

  const header = (key: TeamSort, label: string, align = "text-right") => (
    <th className={`${TH} ${align}`}>
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
    </th>
  );

  return (
    <div className="overflow-x-auto border border-border rounded-lg max-w-3xl">
      <table className={TABLE}>
        <thead className="border-b border-border">
          <tr>
            {header("name", t("statsScreen.player"), "text-left")}
            {header("games", t("statsScreen.games"))}
            {header("goals", t("statsScreen.goals"))}
            {header("assists", t("statsScreen.assists"))}
            {header("rating", t("statsScreen.rating"))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const kind = stars.get(r.id);
            return (
              <tr key={r.id} className={ROW}>
                <td className={TD}>
                  <a
                    href={playerHref(session?.leagueSlug ?? "", session?.clubId ?? "", r.id)}
                    className="text-foreground no-underline hover:underline inline-flex items-center gap-1.5"
                  >
                    {r.name}
                    {kind && <StarBadge kind={kind} />}
                  </a>
                </td>
                <td className={`${TD} text-right tabular-nums`}>{r.games}</td>
                <td className={`${TD} text-right tabular-nums`}>{r.goals}</td>
                <td className={`${TD} text-right tabular-nums`}>{r.assists}</td>
                <td className={`${TD} text-right tabular-nums`}>{r.games > 0 ? r.rating.toFixed(2) : "-"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
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
  const th = TH;
  return (
    <div className="max-w-4xl">
      {filters}
      <div className="overflow-x-auto border border-border rounded-lg">
        <table className={TABLE}>
          <thead className="border-b border-border">
            <tr>
              <th className={`${th} text-left`}>{t("statsScreen.player")}</th>
              <th className={`${th} text-right`}>{t("statsScreen.retired.age")}</th>
              <th className={`${th} text-left`}>{t("statsScreen.retired.lastClub")}</th>
              <th className={`${th} text-right`}>{t("career.apps")}</th>
              <th className={`${th} text-right`}>{t("career.goals")}</th>
              <th className={th} />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const hist = r.history ?? [];
              const apps = hist.reduce((a, h) => a + h.apps, 0);
              const goals = hist.reduce((a, h) => a + h.goals, 0);
              const isOpen = open === r.id;
              return [
                <tr key={r.id} className={ROW}>
                  <td className={TD}>{r.name}</td>
                  <td className={`${TD} text-right tabular-nums`}>{r.age}</td>
                  <td className={`${TD} text-muted-foreground truncate max-w-[12rem]`}>{r.clubName ?? "-"}</td>
                  <td className={`${TD} text-right tabular-nums`}>{apps}</td>
                  <td className={`${TD} text-right tabular-nums`}>{goals}</td>
                  <td className={`${TD} text-right`}>
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() => setOpen(isOpen ? null : r.id)}
                      className="min-h-8 bg-transparent border-0 p-0 text-sm text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      {isOpen ? t("statsScreen.retired.hide") : t("statsScreen.retired.show")}
                    </button>
                  </td>
                </tr>,
                isOpen && (
                  <tr key={`${r.id}-career`} className="border-b border-border last:border-0">
                    <td colSpan={6} className="px-2 py-3">
                      <CareerTable rows={hist} leagues={leagues} />
                    </td>
                  </tr>
                ),
              ];
            })}
          </tbody>
        </table>
      </div>
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
  const [tab, setTab] = useState<Tab>("rankings");
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
