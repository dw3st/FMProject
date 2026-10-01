import { useEffect, useMemo, useState } from "react";
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
import type { LeagueData } from "@/types/playerTypes";
import type { CountryEntry } from "@/types/worldTypes";
import countriesRaw from "@/Data/countries.json";

const COUNTRY_BY_NAME = new Map(Object.values(countriesRaw as Record<string, CountryEntry>).map((c) => [c.name, c]));

type Tab = "rankings" | "team";
type TableKey = keyof CompetitionRankings;
const TABLES: TableKey[] = ["scorers", "assists", "ratings", "appearances"];
type Stars = ReturnType<typeof useStarPlayers>;

function playerHref(leagueSlug: string, squadId: string, playerId: string) {
  return `/player/${encodeURIComponent(leagueSlug)}/${encodeURIComponent(squadId)}/${encodeURIComponent(playerId)}`;
}

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
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground m-0 mb-2">{title}</h2>
      <div className="overflow-x-auto border border-border rounded-lg">
        <table className="w-full text-sm">
          <tbody>
            {rows.map((r, i) => {
              const kind = stars.get(r.playerId);
              return (
                <tr
                  key={r.playerId}
                  className={`border-b border-border last:border-0 ${r.squadId === myClubId ? "bg-primary/10" : ""}`}
                >
                  <td className="w-8 px-2 py-1.5 text-center text-muted-foreground tabular-nums">{i + 1}</td>
                  <td className="w-8 py-1.5">
                    <ClubLogo logoUrl={squadLogoUrl(r.squadId)} className="w-5 h-5" />
                  </td>
                  <td className="px-2 py-1.5 max-w-[12rem]">
                    <a
                      href={playerHref(leagueSlug, r.squadId, r.playerId)}
                      className="text-foreground no-underline hover:underline inline-flex items-center gap-1.5 max-w-full"
                    >
                      <span className="truncate">{r.name}</span>
                      {kind && <StarBadge kind={kind} />}
                    </a>
                  </td>
                  <td className="px-2 py-1.5 text-muted-foreground truncate max-w-[10rem]">{r.clubName}</td>
                  <td className="px-2 py-1.5 text-right font-bold tabular-nums">
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
    <th className={`px-2 py-2 font-semibold ${align}`}>
      <button
        type="button"
        onClick={() => {
          if (sort === key) setDir((d) => (d === 1 ? -1 : 1));
          else { setSort(key); setDir(key === "name" ? 1 : -1); }
        }}
        className="bg-transparent border-0 p-0 text-inherit uppercase tracking-wider text-xs cursor-pointer hover:text-foreground"
      >
        {label}{sort === key ? (dir === 1 ? " ↑" : " ↓") : ""}
      </button>
    </th>
  );

  return (
    <div className="overflow-x-auto border border-border rounded-lg max-w-3xl">
      <table className="w-full text-sm">
        <thead className="text-muted-foreground border-b border-border">
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
              <tr key={r.id} className="border-b border-border last:border-0">
                <td className="px-2 py-1.5">
                  <a
                    href={playerHref(session?.leagueSlug ?? "", session?.clubId ?? "", r.id)}
                    className="text-foreground no-underline hover:underline inline-flex items-center gap-1.5"
                  >
                    {r.name}
                    {kind && <StarBadge kind={kind} />}
                  </a>
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">{r.games}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{r.goals}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{r.assists}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{r.games > 0 ? r.rating.toFixed(2) : "-"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
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

        <p className="text-xs text-muted-foreground m-0 flex flex-wrap items-center gap-x-4 gap-y-1">
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
