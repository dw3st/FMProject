import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, Trophy, X, Star, ArrowRightLeft } from "lucide-react";
import { Modal } from "@/GameInterface/Components/Modal";
import { PageHeadline } from "@/GameInterface/Components/PageHeadline";
import { SelectCombobox } from "@/GameInterface/Components/SelectCombobox";
import type { LeagueData, LeagueTeam, LeagueZone, LeagueZoneColor, StandingRow } from "@/types/playerTypes";
import type { Fixture } from "@/types/calendarTypes";
import type { DayLog, MatchEvent } from "@/types/dayLogTypes";
import type { CountryEntry } from "@/types/worldTypes";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { ClubLogo, squadLogoUrl } from "@/GameInterface/Components/ClubLogo";
import { ratingTextClass10 } from "@/GameInterface/scoreColors";
import { clubSlugFromSquadId } from "@/backend/squadIdResolve";
import { computeStandings } from "@/Domain/season";
import { catalogLeagueBySquadId, countryDisplayName, leagueLabel } from "@/Domain/world/labels";
import { resolveSimMode, MAX_FOLLOWED_LEAGUES } from "@/Domain/advanceDay/simMode";
import { updateFollowedLeagues } from "@/GameInterface/gameSession";
import { Icon } from "@/GameInterface/Icons";
import countriesRaw from "@/Data/countries.json";

const countries: CountryEntry[] = Object.values(countriesRaw as Record<string, CountryEntry>);
const COUNTRY_BY_NAME = new Map(countries.map((c) => [c.name, c]));

const resultColors: Record<string, string> = {
  W: "bg-emerald-500 text-white",
  D: "bg-zinc-600 text-white",
  L: "bg-red-500 text-white",
};

const ZONE_BORDER: Record<LeagueZoneColor, string> = {
  blue: "border-l-blue-500",
  orange: "border-l-orange-500",
  cyan: "border-l-cyan-500",
  green: "border-l-green-500",
  red: "border-l-red-500",
  purple: "border-l-purple-500",
};

const ZONE_DOT: Record<LeagueZoneColor, string> = {
  blue: "bg-blue-500",
  orange: "bg-orange-500",
  cyan: "bg-cyan-500",
  green: "bg-green-500",
  red: "bg-red-500",
  purple: "bg-purple-500",
};

function getZone(rank: number, total: number, zones: LeagueZone[]): LeagueZone | null {
  for (const z of zones) {
    if (z.fromEnd != null) {
      if (rank > total - z.fromEnd) return z;
    } else if (z.from != null) {
      const to = z.to ?? z.from;
      if (rank >= z.from && rank <= to) return z;
    }
  }
  return null;
}

function StandingsTable({
  standings,
  leagueSlug,
  catalog,
  zones,
  onClickSquad,
}: {
  standings: StandingRow[];
  leagueSlug: string;
  /** squadId → catalog (origin) league — crest files are filed by origin league. */
  catalog: Map<string, string>;
  zones: LeagueZone[];
  onClickSquad: (row: StandingRow) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="card-arcade rounded-xl overflow-hidden border-glow">
      <div className="grid grid-cols-[40px_1fr_50px_40px_40px_40px_40px_40px_50px_60px_120px] gap-2 px-4 py-3 bg-secondary/30 border-b border-border text-xs font-bold uppercase tracking-wider text-muted-foreground">
        <div className="text-center">{t("leagues.rank")}</div>
        <div>{t("leagues.club")}</div>
        <div className="text-center">{t("leagues.matches")}</div>
        <div className="text-center">{t("leagues.won")}</div>
        <div className="text-center">{t("leagues.drawn")}</div>
        <div className="text-center">{t("leagues.lost")}</div>
        <div className="text-center">{t("leagues.goalsFor")}</div>
        <div className="text-center">{t("leagues.goalsAgainst")}</div>
        <div className="text-center">{t("leagues.goalDifference")}</div>
        <div className="text-center font-display">{t("leagues.points")}</div>
        <div className="text-center">{t("leagues.lastFive")}</div>
      </div>

      <div className="divide-y divide-border/50">
        {standings.map((row, idx) => {
          const rank = idx + 1;
          const zone = getZone(rank, standings.length, zones);

          return (
            <div
              key={row.squadId}
              onClick={() => onClickSquad(row)}
              className={`grid grid-cols-[40px_1fr_50px_40px_40px_40px_40px_40px_50px_60px_120px] gap-2 px-4 py-2.5 hover:bg-secondary/30 transition-colors cursor-pointer border-l-4 ${
                zone ? ZONE_BORDER[zone.color] : "border-l-transparent"
              }`}
            >
              <div className="text-center font-bold text-muted-foreground">{rank}</div>

              <div className="flex items-center gap-3">
                <ClubLogo
                  logoUrl={squadLogoUrl(row.squadId, catalog.get(row.squadId) ?? leagueSlug, row.slug)}
                  primaryColor={row.colors[0]}
                  secondaryColor={row.colors[1]}
                  className="w-6 h-6 rounded shrink-0"
                  imgClassName="w-full h-full object-contain"
                />
                <span className="font-semibold text-foreground">{row.name}</span>
              </div>

              <div className="text-center text-muted-foreground">{row.mp}</div>
              <div className="text-center text-muted-foreground">{row.w}</div>
              <div className="text-center text-muted-foreground">{row.d}</div>
              <div className="text-center text-muted-foreground">{row.l}</div>
              <div className="text-center text-muted-foreground">{row.gf}</div>
              <div className="text-center text-muted-foreground">{row.ga}</div>
              <div className={`text-center font-semibold ${row.gd >= 0 ? "text-primary" : "text-red-400"}`}>
                {row.gd > 0 ? `+${row.gd}` : row.gd}
              </div>
              <div className="text-center font-black font-display text-primary glow-text">
                {row.pts}
              </div>
              <div className="flex items-center justify-center gap-1">
                {row.form.map((result, i) => (
                  <span
                    key={i}
                    className={`w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center ${resultColors[result]}`}
                  >
                    {result}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FixturesPanel({
  fixtures,
  activeLeagueSlug,
  standings,
  catalog,
  currentDate,
  onClickFixture,
}: {
  fixtures: Fixture[];
  activeLeagueSlug: string;
  standings: StandingRow[];
  catalog: Map<string, string>;
  currentDate: string;
  onClickFixture: (fixture: Fixture) => void;
}) {
  const { t } = useTranslation();
  const leagueFixtures = fixtures.filter(f => f.competition === activeLeagueSlug);
  const maxRound = leagueFixtures.reduce((m, f) => Math.max(m, f.round), 0);

  // Default to the round that contains currentDate, or the first unplayed round
  const initialRound = (() => {
    if (!currentDate || leagueFixtures.length === 0) return 1;
    const played = leagueFixtures.filter(f => f.date <= currentDate);
    return played.length > 0 ? played[played.length - 1]!.round : 1;
  })();

  const [round, setRound] = useState(initialRound);

  const roundFixtures = leagueFixtures
    .filter(f => f.round === round)
    .sort((a, b) => a.date.localeCompare(b.date));

  const clubSlugForFixture = (squadId: string) =>
    standings.find(s => s.squadId === squadId)?.slug;

  const teamName = (squadId: string) =>
    standings.find(s => s.squadId === squadId)?.name ??
    squadId.split("_").slice(-1)[0]!.replace(/\b\w/g, c => c.toUpperCase());

  const teamColors = (squadId: string) =>
    standings.find(s => s.squadId === squadId)?.colors ?? ["#555", "#888"] as [string, string];

  if (leagueFixtures.length === 0) {
    return (
      <p className="text-muted-foreground text-sm p-4">
        {t("leagues.noFixtureData")}
      </p>
    );
  }

  const roundDate = roundFixtures[0]?.date
    ? new Date(roundFixtures[0].date + "T12:00:00").toLocaleDateString("en-GB", {
        day: "numeric", month: "long", year: "numeric",
      })
    : "";

  return (
    <div className="space-y-4">
      {/* Round navigator */}
      <div className="flex items-center justify-between card-arcade rounded-xl px-4 py-3">
        <button
          onClick={() => setRound(r => Math.max(1, r - 1))}
          disabled={round <= 1}
          className="p-1.5 rounded-lg hover:bg-muted/50 transition-colors disabled:opacity-30 cursor-pointer bg-transparent border-0"
        >
          <ChevronLeft className="w-5 h-5 text-muted-foreground" />
        </button>

        <div className="text-center">
          <p className="text-sm font-black font-display uppercase tracking-wider text-foreground">
            {t("leagues.matchday", { round })}
          </p>
          {roundDate && (
            <p className="text-xs text-muted-foreground mt-0.5">{roundDate}</p>
          )}
        </div>

        <button
          onClick={() => setRound(r => Math.min(maxRound, r + 1))}
          disabled={round >= maxRound}
          className="p-1.5 rounded-lg hover:bg-muted/50 transition-colors disabled:opacity-30 cursor-pointer bg-transparent border-0"
        >
          <ChevronRight className="w-5 h-5 text-muted-foreground" />
        </button>
      </div>

      {/* Match list */}
      <div className="card-arcade rounded-xl overflow-hidden border-glow divide-y divide-border/50">
        {roundFixtures.map((f, i) => {
          const isPlayed = f.played && !!f.result;
          return (
            <div
              key={i}
              onClick={() => isPlayed && onClickFixture(f)}
              className={`grid grid-cols-[1fr_80px_1fr] items-center px-4 py-3 transition-colors ${
                isPlayed
                  ? "hover:bg-secondary/30 cursor-pointer"
                  : "opacity-60"
              }`}
            >
              {/* Home */}
              <div className="flex items-center gap-3 justify-end">
                <span className="font-semibold text-foreground text-sm">{teamName(f.home)}</span>
                <ClubLogo
                  logoUrl={squadLogoUrl(f.home, catalog.get(f.home) ?? activeLeagueSlug, clubSlugForFixture(f.home))}
                  primaryColor={teamColors(f.home)[0]}
                  secondaryColor={teamColors(f.home)[1]}
                  className="w-6 h-6 rounded shrink-0"
                  imgClassName="w-full h-full object-contain"
                />
              </div>

              {/* Score / vs */}
              <div className="text-center">
                {isPlayed ? (
                  <span className="font-black font-display text-foreground">
                    {f.result!.home} – {f.result!.away}
                  </span>
                ) : (
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{t("leagues.vs")}</span>
                )}
              </div>

              {/* Away */}
              <div className="flex items-center gap-3">
                <ClubLogo
                  logoUrl={squadLogoUrl(f.away, catalog.get(f.away) ?? activeLeagueSlug, clubSlugForFixture(f.away))}
                  primaryColor={teamColors(f.away)[0]}
                  secondaryColor={teamColors(f.away)[1]}
                  className="w-6 h-6 rounded shrink-0"
                  imgClassName="w-full h-full object-contain"
                />
                <span className="font-semibold text-foreground text-sm">{teamName(f.away)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatBar({ homeVal, awayVal, label }: { homeVal: number; awayVal: number; label: string }) {
  const total = homeVal + awayVal || 1;
  const homePct = (homeVal / total) * 100;
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
      <div className="flex items-center justify-end gap-2">
        <span className="text-sm font-black text-foreground">{homeVal}</span>
        <div className="flex-1 h-2 bg-muted/20 rounded-full overflow-hidden max-w-[120px]">
          <div className="h-full bg-primary rounded-full ml-auto" style={{ width: `${homePct}%` }} />
        </div>
      </div>
      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground w-28 text-center shrink-0">{label}</span>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-2 bg-muted/20 rounded-full overflow-hidden max-w-[120px]">
          <div className="h-full bg-chart-2 rounded-full" style={{ width: `${100 - homePct}%` }} />
        </div>
        <span className="text-sm font-black text-foreground">{awayVal}</span>
      </div>
    </div>
  );
}

function MatchStatsModal({
  event,
  standings,
  allTeams,
  leagueSlug,
  catalog,
  onClose,
}: {
  event: MatchEvent;
  standings: StandingRow[];
  allTeams: Map<string, { name: string; slug?: string; colors: [string, string] }>;
  leagueSlug: string;
  catalog: Map<string, string>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const lookup = (squadId: string) =>
    standings.find(s => s.squadId === squadId) ?? allTeams.get(squadId);

  const clubSlugForEvent = (squadId: string) => lookup(squadId)?.slug;

  const teamName = (squadId: string) =>
    lookup(squadId)?.name ??
    squadId.split("_").slice(-1)[0]!.replace(/\b\w/g, c => c.toUpperCase());
  const teamColors = (squadId: string) =>
    lookup(squadId)?.colors ?? ["#555", "#888"] as [string, string];
  const homeName = teamName(event.home);
  const awayName = teamName(event.away);

  type PlayerRow = { id: string; name: string; rating: number; goals: number; assists: number; shots: number; passesCompleted: number; passesAttempted: number; tackles: number; interceptions: number; team: "home" | "away" };

  const playerRows: PlayerRow[] = Object.entries(event.playerStats).map(([id, ps]) => ({
    id,
    name: event.playerNames?.[id] ?? id,
    rating: event.playerRatings?.[id] ?? 0,
    goals: ps.goals,
    assists: ps.assists,
    shots: ps.shots,
    passesCompleted: ps.passesCompleted,
    passesAttempted: ps.passesAttempted,
    tackles: ps.tackles,
    interceptions: ps.interceptions,
    team: event.playerTeams?.[id] ?? "home",
  })).sort((a, b) => b.rating - a.rating);

  const homePlayers = playerRows.filter(p => p.team === "home");
  const awayPlayers = playerRows.filter(p => p.team === "away");

  const passAcc = (c: number, a: number) => a > 0 ? `${Math.round((c / a) * 100)}%` : "—";

  function PlayerTable({ players, side }: { players: PlayerRow[]; side: "home" | "away" }) {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              <th className={`py-2 font-bold ${side === "away" ? "text-right pr-3" : "text-left pl-3"}`}>{t("leagues.playerTable.player")}</th>
              <th className="px-2 text-center">{t("leagues.playerTable.rating")}</th>
              <th className="px-2 text-center">{t("leagues.playerTable.goals")}</th>
              <th className="px-2 text-center">{t("leagues.playerTable.assists")}</th>
              <th className="px-2 text-center">{t("leagues.playerTable.shots")}</th>
              <th className="px-2 text-center">{t("leagues.playerTable.passAccuracy")}</th>
              <th className="px-2 text-center">{t("leagues.playerTable.tackles")}</th>
              <th className="px-2 text-center">{t("leagues.playerTable.interceptions")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30">
            {players.map(p => (
              <tr key={p.id} className="hover:bg-muted/10">
                <td className={`py-1.5 font-semibold text-foreground ${side === "away" ? "text-right pr-3" : "pl-3"}`}>{p.name}</td>
                <td className="px-2 text-center">
                  {p.rating > 0 ? (
                    <span className={`inline-flex items-center gap-0.5 font-black ${ratingTextClass10(p.rating)}`}>
                      <Star className="w-2.5 h-2.5 fill-current" />{p.rating.toFixed(1)}
                    </span>
                  ) : <span className="text-muted-foreground/40">—</span>}
                </td>
                <td className="px-2 text-center font-bold text-foreground">{p.goals > 0 ? p.goals : "—"}</td>
                <td className="px-2 text-center font-bold text-emerald-400">{p.assists > 0 ? p.assists : "—"}</td>
                <td className="px-2 text-center text-muted-foreground">{p.shots}</td>
                <td className="px-2 text-center text-muted-foreground">{passAcc(p.passesCompleted, p.passesAttempted)}</td>
                <td className="px-2 text-center text-muted-foreground">{p.tackles}</td>
                <td className="px-2 text-center text-muted-foreground">{p.interceptions}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <Modal open onClose={onClose} size="xl">
        {/* Header */}
        <div className="sticky top-0 z-10 card-arcade border-b border-border rounded-t-2xl px-6 py-4">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer bg-transparent border-0"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3 text-center">
            {t("leagues.matchday", { round: event.round })}
          </p>
          <div className="flex items-center justify-center gap-6">
            <div className="flex items-center gap-3 flex-1 justify-end">
              <span className="font-black text-lg text-foreground">{homeName}</span>
              <ClubLogo
                logoUrl={squadLogoUrl(event.home, catalog.get(event.home) ?? (event.competition || leagueSlug), clubSlugForEvent(event.home))}
                primaryColor={teamColors(event.home)[0]}
                secondaryColor={teamColors(event.home)[1]}
                className="w-8 h-8 rounded shrink-0"
                imgClassName="w-full h-full object-contain"
              />
            </div>
            <div className="text-center px-4">
              <span className="font-black text-3xl font-display text-foreground tracking-wider">
                {event.score.home} – {event.score.away}
              </span>
            </div>
            <div className="flex items-center gap-3 flex-1 justify-start">
              <ClubLogo
                logoUrl={squadLogoUrl(event.away, catalog.get(event.away) ?? (event.competition || leagueSlug), clubSlugForEvent(event.away))}
                primaryColor={teamColors(event.away)[0]}
                secondaryColor={teamColors(event.away)[1]}
                className="w-8 h-8 rounded shrink-0"
                imgClassName="w-full h-full object-contain"
              />
              <span className="font-black text-lg text-foreground">{awayName}</span>
            </div>
          </div>
          {event.scorers.length > 0 && (
            <p className="text-center text-xs text-muted-foreground mt-2">
              {event.scorers.map(s => `${s.playerName}${s.goals > 1 ? ` ×${s.goals}` : ""}`).join(" · ")}
            </p>
          )}
        </div>

        <div className="px-6 py-4 space-y-6">
          {/* Team stats */}
          <div className="space-y-2">
            <StatBar homeVal={event.teamStats.home.shots}           awayVal={event.teamStats.away.shots}           label={t("common.shots")} />
            <StatBar homeVal={event.teamStats.home.passesCompleted} awayVal={event.teamStats.away.passesCompleted} label={t("common.passes")} />
            <StatBar homeVal={event.teamStats.home.tackles}         awayVal={event.teamStats.away.tackles}         label={t("common.tackles")} />
            <StatBar homeVal={event.teamStats.home.interceptions}   awayVal={event.teamStats.away.interceptions}   label={t("common.interceptions")} />
          </div>

          {/* Player stats */}
          {event.compact ? (
            <p className="text-xs text-white/40 m-0">{t("leagues.quickSimNoDetail")}</p>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2 pl-3">{homeName}</p>
                <PlayerTable players={homePlayers} side="home" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2 pl-3">{awayName}</p>
                <PlayerTable players={awayPlayers} side="away" />
              </div>
            </div>
          )}

          {/* Substitutions */}
          {event.substitutions && event.substitutions.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <ArrowRightLeft className="w-3 h-3 text-muted-foreground" />
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground m-0">{t("leagues.substitutions")}</p>
              </div>
              <div className="space-y-1">
                {event.substitutions
                  .slice()
                  .sort((a, b) => a.matchMinute - b.matchMinute)
                  .map((sub, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="text-[10px] font-black tabular-nums text-muted-foreground w-6 shrink-0">
                        {sub.matchMinute}&apos;
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground shrink-0 w-14 truncate">
                        {sub.team === "home" ? homeName : awayName}
                      </span>
                      <span className="text-red-400 font-medium truncate flex-1">{sub.playerOutName}</span>
                      <ArrowRightLeft className="w-2.5 h-2.5 text-muted-foreground/60 shrink-0" />
                      <span className="text-emerald-400 font-medium truncate flex-1 text-right">{sub.playerInName}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
    </Modal>
  );
}

export function LeagueTableScreen({ leagueSlug }: { leagueSlug?: string }) {
  const { t, i18n } = useTranslation();
  const { session, currentDate, mergeSession } = useGameSave();
  const [leagues, setLeagues] = useState<LeagueData[]>([]);
  const [activeSlug, setActiveSlug] = useState(
    leagueSlug ?? session?.leagueSlug ?? "premier_league",
  );
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"table" | "fixtures">("table");
  const [matchEvent, setMatchEvent] = useState<MatchEvent | null>(null);
  const [liveStandings, setLiveStandings] = useState<StandingRow[] | null>(null);
  const [leagueFixtures, setLeagueFixtures] = useState<Fixture[]>([]);
  const [followBusy, setFollowBusy] = useState(false);

  useEffect(() => {
    fetch("/api/leagues")
      .then((r) => r.json())
      .then((data: LeagueData[]) => {
        setLeagues(data);
        if (leagueSlug && data.some((l) => l.slug === leagueSlug)) {
          setActiveSlug(leagueSlug);
        } else if (
          !leagueSlug &&
          session?.leagueSlug &&
          data.some((l) => l.slug === session.leagueSlug)
        ) {
          setActiveSlug(session.leagueSlug);
        }
        setLoading(false);
      });
  }, [leagueSlug, session?.leagueSlug]);

  // Fetch live standings from the backend (new multi-league format)
  useEffect(() => {
    if (!session?.saveId || !activeSlug) return;
    setLiveStandings(null);
    fetch(`/api/saves/${session.saveId}/leagues/${activeSlug}/standings`)
      .then((r) => (r.ok ? (r.json() as Promise<StandingRow[]>) : null))
      .then((rows) => setLiveStandings(rows ?? null));
  }, [session?.saveId, activeSlug]);

  // Fetch fixtures for the selected league
  useEffect(() => {
    if (!session?.saveId || !activeSlug) return;
    setLeagueFixtures([]);
    fetch(`/api/saves/${session.saveId}/leagues/${activeSlug}/fixtures`)
      .then((r) => (r.ok ? (r.json() as Promise<Fixture[]>) : null))
      .then((data) => setLeagueFixtures(data ?? []));
  }, [session?.saveId, activeSlug]);

  const active = leagues.find((l) => l.slug === activeSlug);
  const catalog = useMemo(() => catalogLeagueBySquadId(leagues), [leagues]);
  const hasFixtures = leagueFixtures.length > 0;
  // Prefer live standings from backend; fall back to client-side computation for old saves
  const standings = liveStandings
    ?? (active ? computeStandings(active.standings, leagueFixtures, activeSlug) : []);

  // Cross-league squadId lookup so the match modal can resolve teams from any league
  const allTeams = new Map<string, { name: string; slug?: string; colors: [string, string] }>();
  for (const lg of leagues) {
    for (const t of lg.standings) {
      allTeams.set(t.squadId, { name: t.name, slug: t.slug, colors: t.colors });
    }
  }

  // Country-qualified labels ("Premier League · Armênia") so the combobox search also matches by country.
  const leagueOptions = leagues.map((l) => {
    const country = COUNTRY_BY_NAME.get(l.country);
    const countryName = country ? countryDisplayName(country, i18n.language, t) : l.country;
    return { value: l.slug, label: leagueLabel(l, countryName) };
  });

  // Filter out the user's own league defensively — it should never occupy a follow slot, even if
  // a stale session (e.g. from before followedLeagues synced from the server) carries it.
  const followedLeagues = (session?.followedLeagues ?? []).filter((slug) => slug !== session?.leagueSlug);
  const isOwnLeague = !!session && activeSlug === session.leagueSlug;
  const isFollowed = followedLeagues.includes(activeSlug);
  const atFollowLimit = !isFollowed && followedLeagues.length >= MAX_FOLLOWED_LEAGUES;
  const followDisabled = isOwnLeague || atFollowLimit || followBusy || !session;
  const followTooltip = isOwnLeague
    ? t("leagues.followOwnLeague")
    : atFollowLimit
      ? t("leagues.followLimit")
      : isFollowed
        ? t("leagues.unfollowLeague")
        : t("leagues.followLeague");

  const simMode = session
    ? resolveSimMode(activeSlug, { leagueSlug: session.leagueSlug, followedLeagues })
    : "full";

  const handleToggleFollow = async () => {
    if (!session || followDisabled) return;
    const previous = followedLeagues;
    const next = isFollowed
      ? previous.filter((s) => s !== activeSlug)
      : [...previous, activeSlug];
    mergeSession({ followedLeagues: next });
    setFollowBusy(true);
    try {
      const saved = await updateFollowedLeagues(session.saveId, next);
      mergeSession({ followedLeagues: saved });
    } catch {
      mergeSession({ followedLeagues: previous });
    } finally {
      setFollowBusy(false);
    }
  };

  if (loading) {
    return <p className="text-muted-foreground text-sm p-6">{t("leagues.loadingLeagues")}</p>;
  }

  const handleClickFixture = (fixture: Fixture) => {
    if (!session) return;
    fetch(`/api/saves/${session.saveId}/days/${fixture.date}`)
      .then(r => r.ok ? r.json() as Promise<DayLog> : null)
      .then(log => {
        if (!log) return;
        const ev = log.events.find(
          e =>
            e.kind === "match" &&
            e.fixtureId === fixture.id &&
            e.competition === fixture.competition,
        ) as MatchEvent | undefined;
        if (ev) setMatchEvent(ev);
      });
  };

  const handleClickSquad = (row: StandingRow) => {
    const clubPart =
      row.slug ??
      clubSlugFromSquadId(row.squadId, activeSlug);
    window.location.href = `/squad/${activeSlug}/${clubPart}`;
  };

  return (
    <>
    <div className="p-4 overflow-auto">
      <div className="max-w-6xl mx-auto space-y-6">
        <PageHeadline
          backHref="/dashboard"
          trailing={
            active ? (
              <div className="text-sm text-muted-foreground font-semibold">{t("common.season")} {active.season}</div>
            ) : undefined
          }
        >
          {t("leagues.title")} <span className="text-primary glow-text">{t("leagues.table")}</span>
        </PageHeadline>

        {leagues.length > 0 && (
          <div className="flex items-end gap-2">
            <SelectCombobox
              label={t("leagues.selectLeague")}
              labelId="league-table-league"
              value={activeSlug}
              onChange={setActiveSlug}
              options={leagueOptions}
              leadingIcon={<Trophy className="w-4 h-4 text-primary shrink-0" aria-hidden />}
              placeholder={t("leagues.searchLeaguesPlaceholder")}
              className="w-full max-w-sm"
            />
            <button
              type="button"
              onClick={() => void handleToggleFollow()}
              disabled={followDisabled}
              title={followTooltip}
              aria-label={followTooltip}
              aria-pressed={isFollowed}
              className="shrink-0 p-2 rounded-lg border border-border bg-secondary/10 hover:bg-secondary/20 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Icon
                name={isFollowed ? "star-filled" : "star"}
                size={18}
                className={isFollowed ? "text-amber-400" : "text-muted-foreground"}
              />
            </button>
            {simMode === "fast" && (
              <span
                title={t("leagues.simulatedBadgeTooltip")}
                className="shrink-0 inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-widest text-amber-400"
              >
                {t("leagues.simulatedBadge")}
              </span>
            )}
          </div>
        )}

        {active && (
          <>
            {/* Table / Fixtures view toggle */}
            <div className="flex gap-1 p-1 bg-secondary/20 rounded-lg w-fit border border-border">
              <button
                type="button"
                onClick={() => setTab("table")}
                className={`px-4 py-1.5 rounded-md text-xs font-bold uppercase tracking-wide transition-all cursor-pointer border-0 ${
                  tab === "table"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground bg-transparent"
                }`}
              >
                {t("leagues.table")}
              </button>
              <button
                type="button"
                onClick={() => setTab("fixtures")}
                disabled={!hasFixtures}
                className={`px-4 py-1.5 rounded-md text-xs font-bold uppercase tracking-wide transition-all cursor-pointer border-0 disabled:opacity-40 disabled:cursor-not-allowed ${
                  tab === "fixtures"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground bg-transparent"
                }`}
              >
                {t("leagues.fixtures")}
              </button>
            </div>

            {tab === "table" ? (
              <>
                <StandingsTable
                  standings={standings}
                  leagueSlug={activeSlug}
                  catalog={catalog}
                  zones={active?.zones ?? []}
                  onClickSquad={handleClickSquad}
                />

                {(active?.zones?.length ?? 0) > 0 && (
                  <div className="flex items-center gap-6 text-xs text-muted-foreground flex-wrap">
                    {active!.zones!.map(z => (
                      <div key={z.id} className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${ZONE_DOT[z.color]}`} />
                        <span>{t(`leagues.zones.${z.id}`, { defaultValue: z.label })}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <FixturesPanel
                fixtures={leagueFixtures}
                activeLeagueSlug={activeSlug}
                standings={standings}
                catalog={catalog}
                currentDate={currentDate}
                onClickFixture={handleClickFixture}
              />
            )}
          </>
        )}
      </div>
    </div>

      {matchEvent && (
        <MatchStatsModal
          event={matchEvent}
          standings={standings}
          allTeams={allTeams}
          leagueSlug={activeSlug}
          catalog={catalog}
          onClose={() => setMatchEvent(null)}
        />
      )}
    </>
  );
}
