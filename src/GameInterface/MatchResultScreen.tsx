import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Cloud,
  MapPin,
  Clock,
  User,
  ChevronLeft,
  ChevronRight,
  BarChart3,
  Target,
  ArrowRightLeft,
} from "lucide-react";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import type { Squad, RosterPlayer, LeagueData } from "@/types/playerTypes";
import type { MatchEvent } from "@/types/dayLogTypes";
import type { DayLog } from "@/types/dayLogTypes";
import { squadIdToClubSlugMap } from "@/backend/squadIdResolve";
import type { Fixture } from "@/types/calendarTypes";
import { MAIN_ROLE_ABBR, getPositionColor } from "@/GameInterface/positionHelpers";
import { ClubLogo, squadLogoUrl } from "@/GameInterface/Components/ClubLogo";
import { ratingTextClass10 } from "@/GameInterface/scoreColors";
import { teamDisplayNameFromLeagues } from "@/GameInterface/teamDisplayName";
import { catalogLeagueBySquadId, competitionName } from "@/Domain/world/labels";
import {
  FALLBACK_AWAY_ACCENT,
  FALLBACK_HOME_ACCENT,
  resolveMatchTeamKitColors,
  squadPrimaryColor,
  squadSecondaryColor,
} from "@/GameInterface/matchTeamColors";
import { addOneDay } from "@/Domain/advanceDay/date";

// ── Helpers (aligned with MatchPreviewScreen) ───────────────────────────────

function roleLabel(role: string): string {
  if (role in MAIN_ROLE_ABBR) return MAIN_ROLE_ABBR[role as keyof typeof MAIN_ROLE_ABBR];
  return role;
}

function RoleBadge({ role, align }: { role: string; align: "left" | "right" }) {
  const color = getPositionColor(role);
  return (
    <span
      className={`text-[9px] font-black uppercase tracking-wider shrink-0 w-7 ${align === "right" ? "text-right" : ""} ${color}`}
    >
      {roleLabel(role)}
    </span>
  );
}

const WEATHER_OPTIONS = [
  { icon: "☀", label: "Clear" },
  { icon: "⛅", label: "Partly Cloudy" },
  { icon: "🌧", label: "Light Rain" },
  { icon: "🌫", label: "Foggy" },
  { icon: "❄", label: "Cold" },
];

const REFEREES = ["M. Oliver", "A. Taylor", "S. Attwell", "P. Tierney", "C. Kavanagh"];

function getMatchMeta(date: string, clubName: string, isHome: boolean) {
  const seed = parseInt(date.replace(/-/g, ""), 10);
  return {
    weather: WEATHER_OPTIONS[seed % WEATHER_OPTIONS.length]!,
    referee: REFEREES[seed % REFEREES.length]!,
    venue: isHome ? `${clubName} Stadium` : "Away Ground",
  };
}

function playerIdsForTeam(event: MatchEvent, side: "home" | "away"): string[] {
  return Object.entries(event.playerTeams)
    .filter(([, t]) => t === side)
    .map(([id]) => id);
}

function sortPlayerIds(ids: string[], event: MatchEvent): string[] {
  return [...ids].sort((a, b) => {
    const ga = event.playerStats[a]?.goals ?? 0;
    const gb = event.playerStats[b]?.goals ?? 0;
    if (ga !== gb) return gb - ga;
    const ra = event.playerRatings[a] ?? 0;
    const rb = event.playerRatings[b] ?? 0;
    return rb - ra;
  });
}

function rosterById(squad: Squad | null): Map<string, RosterPlayer> {
  if (!squad) return new Map();
  return new Map(squad.players.map((p) => [p.id, p]));
}

function latestPlayedFixtureDate(fixtures: Fixture[], mySquadId: string): string | null {
  const played = fixtures
    .filter((f) => f.played && f.result && (f.home === mySquadId || f.away === mySquadId))
    .sort((a, b) => b.date.localeCompare(a.date));
  return played[0]?.date ?? null;
}

function parseDateQuery(): string | null {
  if (typeof window === "undefined") return null;
  const q = new URLSearchParams(window.location.search).get("date");
  return q && /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : null;
}

// ── Rows ────────────────────────────────────────────────────────────────────

function ResultPlayerRow({
  playerId,
  event,
  roster,
  align,
}: {
  playerId: string;
  event: MatchEvent;
  roster: RosterPlayer | undefined;
  align: "left" | "right";
}) {
  const name = event.playerNames[playerId] ?? roster?.name ?? playerId;
  const lastName = name.split(" ").pop() ?? name;
  const role = roster?.positions[0] ?? "CM";
  const rating = event.playerRatings[playerId];
  const goals = event.playerStats[playerId]?.goals ?? 0;
  const assists = event.playerStats[playerId]?.assists ?? 0;
  const highlight = goals > 0 || assists > 0;
  const ratingLabel =
    rating != null && Number.isFinite(rating) ? rating.toFixed(1) : "—";
  const ratingClass = rating != null && Number.isFinite(rating) ? ratingTextClass10(rating) : "text-muted-foreground";

  const rowClass = highlight
    ? "bg-amber-500/10 border border-amber-500/35 rounded-lg"
    : "";

  if (align === "left") {
    return (
      <div className={`flex items-center gap-2 py-[3px] px-1 -mx-1 ${rowClass}`}>
        <RoleBadge role={role} align="left" />
        <span className="flex-1 text-[13px] text-foreground font-medium truncate">{lastName}</span>
        {goals > 0 && (
          <span className="flex items-center gap-0.5 text-amber-400 shrink-0" title={`${goals} goal${goals > 1 ? "s" : ""}`}>
            <Target className="w-3 h-3" />
            {goals > 1 && <span className="text-[10px] font-black tabular-nums">{goals}</span>}
          </span>
        )}
        {assists > 0 && (
          <span className="flex items-center gap-0.5 text-sky-400 shrink-0" title={`${assists} assist${assists > 1 ? "s" : ""}`}>
            <span className="text-[10px] font-black tabular-nums">{assists > 1 ? assists : ""}A</span>
          </span>
        )}
        <span className={`text-[13px] font-bold tabular-nums shrink-0 ${ratingClass}`}>{ratingLabel}</span>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 py-[3px] px-1 -mx-1 ${rowClass}`}>
      <span className={`text-[13px] font-bold tabular-nums shrink-0 ${ratingClass}`}>{ratingLabel}</span>
      {assists > 0 && (
        <span className="flex items-center gap-0.5 text-sky-400 shrink-0" title={`${assists} assist${assists > 1 ? "s" : ""}`}>
          <span className="text-[10px] font-black tabular-nums">{assists > 1 ? assists : ""}A</span>
        </span>
      )}
      {goals > 0 && (
        <span className="flex items-center gap-0.5 text-amber-400 shrink-0" title={`${goals} goal${goals > 1 ? "s" : ""}`}>
          {goals > 1 && <span className="text-[10px] font-black tabular-nums">{goals}</span>}
          <Target className="w-3 h-3" />
        </span>
      )}
      <span className="flex-1 text-[13px] text-foreground font-medium truncate text-right">{lastName}</span>
      <RoleBadge role={role} align="right" />
    </div>
  );
}

function StatsCompareBar({
  label,
  home,
  away,
  homeColor,
  awayColor,
}: {
  label: string;
  home: number;
  away: number;
  homeColor: string;
  awayColor: string;
}) {
  const sum = home + away;
  const homePct = sum === 0 ? 50 : (home / sum) * 100;
  const awayPct = sum === 0 ? 50 : (away / sum) * 100;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        <span>{label}</span>
        <span className="tabular-nums text-foreground">
          <span style={{ color: homeColor }}>{home}</span>
          <span className="text-muted-foreground/40 mx-1">·</span>
          <span style={{ color: awayColor }}>{away}</span>
        </span>
      </div>
      <div className="h-2 rounded-full bg-muted/40 overflow-hidden flex">
        <div
          className="h-full shrink-0 transition-all"
          style={{ width: `${homePct}%`, backgroundColor: homeColor }}
        />
        <div
          className="h-full shrink-0 transition-all"
          style={{ width: `${awayPct}%`, backgroundColor: awayColor }}
        />
      </div>
    </div>
  );
}

function ResultTeamCard({
  side,
  squadName,
  squad,
  event,
  teamSide,
  logoUrl,
  accentHex,
}: {
  side: "home" | "away";
  squadName: string;
  squad: Squad | null;
  event: MatchEvent;
  teamSide: "home" | "away";
  logoUrl?: string;
  accentHex: string;
}) {
  const { t } = useTranslation();
  const ids = sortPlayerIds(playerIdsForTeam(event, teamSide), event);
  const byId = rosterById(squad);
  const isHome = side === "home";
  const accentBorder =
    isHome
      ? { borderLeftWidth: 2, borderLeftStyle: "solid" as const, borderLeftColor: accentHex }
      : { borderRightWidth: 2, borderRightStyle: "solid" as const, borderRightColor: accentHex };

  return (
    <div
      className="flex-1 rounded-xl bg-card/60 backdrop-blur-sm p-5 flex flex-col gap-3 border border-border"
      style={{ ...accentBorder, height: "40vh", overflow: "scroll" }}
    >
      <div className={`flex items-center gap-3 ${isHome ? "" : "flex-row-reverse"}`}>
        <ClubLogo
          logoUrl={logoUrl}
          className="w-10 h-10 rounded-full shrink-0"
          imgClassName="w-full h-full object-contain p-1"
        />
        <div className={`min-w-0 ${isHome ? "" : "text-right"}`}>
          <h2 className="text-base font-black font-display text-foreground uppercase tracking-wider m-0 leading-tight truncate">
            {squadName}
          </h2>
          <p className="text-[10px] font-bold uppercase tracking-widest m-0" style={{ color: accentHex }}>
            {t("matchResult.matchRatings")}
          </p>
        </div>
        <div className="flex-1" />
      </div>

      <div className="border-t border-border/30" />

      <div className="flex-1">
        <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-1.5">
          {t("matchResult.squadPerformance")}
        </p>
        <div>
          {ids.length === 0 ? (
            <p className="text-[11px] text-muted-foreground italic">{t("matchResult.noPlayerData")}</p>
          ) : (
            ids.map((id) => (
              <ResultPlayerRow
                key={id}
                playerId={id}
                event={event}
                roster={byId.get(id)}
                align={isHome ? "left" : "right"}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main ────────────────────────────────────────────────────────────────────

export function MatchResultScreen() {
  const { t } = useTranslation();
  const { session, loading: saveLoading, fixtures, squad, currentDate: simCurrentDate } = useGameSave();
  const [leagues, setLeagues] = useState<LeagueData[]>([]);
  const [matchEvent, setMatchEvent] = useState<MatchEvent | null>(null);
  const [homeSquad, setHomeSquad] = useState<Squad | null>(null);
  const [awaySquad, setAwaySquad] = useState<Squad | null>(null);
  const [loading, setLoading] = useState(true);
  const [redirectingToDashboard, setRedirectingToDashboard] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolvedDate, setResolvedDate] = useState<string>("");

  const mySquadId = squad?.id ?? session?.clubId ?? "";

  useEffect(() => {
    void fetch("/api/leagues")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: LeagueData[]) => setLeagues(Array.isArray(data) ? data : []))
      .catch(() => setLeagues([]));
  }, []);

  useEffect(() => {
    if (saveLoading || !session) return;

    let cancelled = false;
    setLoading(true);
    setError(null);
    setRedirectingToDashboard(false);

    void (async () => {
      try {
        const qDate = parseDateQuery();
        const date =
          qDate ??
          latestPlayedFixtureDate(fixtures, mySquadId) ??
          null;

        if (!date) {
          if (!cancelled) {
            setRedirectingToDashboard(true);
            setTimeout(() => {
              window.location.href = "/dashboard";
            }, 1500);
          }
          return;
        }

        const lastDayForResult = addOneDay(date);
        if (
          !simCurrentDate ||
          simCurrentDate < date ||
          simCurrentDate > lastDayForResult
        ) {
          if (!cancelled) {
            setRedirectingToDashboard(true);
            setTimeout(() => {
              window.location.href = "/dashboard";
            }, 1500);
          }
          return;
        }

        const res = await fetch(`/api/saves/${encodeURIComponent(session.saveId)}/days/${encodeURIComponent(date)}`);
        if (!res.ok) {
          if (!cancelled) setError(t("match.loadError"));
          return;
        }

        const dayLog = (await res.json()) as DayLog;
        const ev = dayLog.events.find(
          (e): e is MatchEvent =>
            e.kind === "match" &&
            (e.home === mySquadId || e.away === mySquadId),
        );

        if (!ev) {
          if (!cancelled) setError(t("match.noMatchOnDate"));
          return;
        }

        // The squad route resolves by squadId anywhere in the save — no static slug mapping needed.
        const [hs, as] = await Promise.all([
          fetch(`/api/saves/${session.saveId}/squad/${session.leagueSlug}/${encodeURIComponent(ev.home)}`).then((r) =>
            r.ok ? (r.json() as Promise<Squad>) : null,
          ),
          fetch(`/api/saves/${session.saveId}/squad/${session.leagueSlug}/${encodeURIComponent(ev.away)}`).then((r) =>
            r.ok ? (r.json() as Promise<Squad>) : null,
          ),
        ]);

        if (cancelled) return;
        setMatchEvent(ev);
        setResolvedDate(date);
        setHomeSquad(hs);
        setAwaySquad(as);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : t("common.loading"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [saveLoading, session, fixtures, mySquadId, simCurrentDate, t]);

  // Crests are filed by the club's catalog (origin) league, not its current league.
  const catalogLeague = useMemo(() => catalogLeagueBySquadId(leagues), [leagues]);
  const catalogSlugs = useMemo(() => squadIdToClubSlugMap(leagues.flatMap((l) => l.standings)), [leagues]);

  if (saveLoading || !session) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (redirectingToDashboard) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-foreground font-bold text-lg">{t("common.noMatchResult")}</p>
          <p className="text-muted-foreground text-sm">{t("common.redirectingToDashboard")}</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground text-sm">{t("common.loadingMatchResult")}</p>
        </div>
      </div>
    );
  }

  if (error || !matchEvent) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-lg text-center space-y-4">
          <p className="text-destructive font-bold text-lg m-0">{error ?? "No data"}</p>
          <a
            href="/dashboard"
            className="inline-flex items-center gap-2 text-primary font-bold text-sm no-underline hover:underline"
          >
            <ChevronLeft className="w-4 h-4" />
            {t("common.backToDashboard")}
          </a>
        </div>
      </div>
    );
  }

  const isHome = matchEvent.home === mySquadId;
  const homeName = teamDisplayNameFromLeagues(matchEvent.home, leagues);
  const awayName = teamDisplayNameFromLeagues(matchEvent.away, leagues);
  const homeLogoUrl = squadLogoUrl(matchEvent.home, catalogLeague.get(matchEvent.home) ?? session.leagueSlug, catalogSlugs.get(matchEvent.home));
  const awayLogoUrl = squadLogoUrl(matchEvent.away, catalogLeague.get(matchEvent.away) ?? session.leagueSlug, catalogSlugs.get(matchEvent.away));

  const { weather, referee, venue } = getMatchMeta(resolvedDate, session.clubName, isHome);
  const competition = competitionName(matchEvent.competition, leagues);
  const th = matchEvent.teamStats.home;
  const ta = matchEvent.teamStats.away;
  const homePrimary = squadPrimaryColor(homeSquad, FALLBACK_HOME_ACCENT);
  const awayPrimary = squadPrimaryColor(awaySquad, FALLBACK_AWAY_ACCENT);
  const { teamA: homeHex, teamB: awayHex } = resolveMatchTeamKitColors(
    { primary: homePrimary, secondary: squadSecondaryColor(homeSquad, homePrimary) },
    { primary: awayPrimary, secondary: squadSecondaryColor(awaySquad, awayPrimary) },
  );

  return (
    <div className="min-h-screen bg-background flex flex-col items-center px-6 py-8 gap-7 overflow-y-auto">
      <div className="text-center space-y-2 shrink-0">
        <p
          className="text-[11px] font-bold uppercase tracking-[0.2em] m-0 bg-clip-text text-transparent"
          style={{
            backgroundImage: `linear-gradient(90deg, ${homeHex}, ${awayHex})`,
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
          }}
        >
          {t("matchResult.matchdayRound", { round: matchEvent.round, competition })}
        </p>
        <h1 className="text-4xl font-black font-display text-foreground uppercase tracking-wider m-0">
          {t("matchResult.title")}
        </h1>
        <div className="flex items-center justify-center gap-6 pt-2">
          <span
            className="text-lg font-bold truncate max-w-[40%]"
            style={{ color: homeHex }}
          >
            {homeName}
          </span>
          <div className="flex items-center gap-3 tabular-nums">
            <span className="text-5xl font-black font-display" style={{ color: homeHex }}>
              {matchEvent.score.home}
            </span>
            <span className="text-2xl text-muted-foreground/50">–</span>
            <span className="text-5xl font-black font-display" style={{ color: awayHex }}>
              {matchEvent.score.away}
            </span>
          </div>
          <span
            className="text-lg font-bold truncate max-w-[40%]"
            style={{ color: awayHex }}
          >
            {awayName}
          </span>
        </div>
        {matchEvent.scorers.length > 0 && (
          <div className="flex flex-col items-center gap-1 pt-2">
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-1">
              {matchEvent.scorers.map((s, i) => (
                <span
                  key={i}
                  className="text-[12px] font-semibold text-amber-400/90 flex items-center gap-1"
                >
                  <Target className="w-3.5 h-3.5 shrink-0" />
                  {s.playerName}
                  {s.goals > 1 ? ` (${s.goals} ${t("matchResult.goals")})` : ` (${t("matchResult.goal")})`}
                  <span className="text-muted-foreground/60">{s.team === "home" ? homeName : awayName}</span>
                </span>
              ))}
            </div>
            {Object.entries(matchEvent.playerStats).some(([, ps]) => (ps.assists ?? 0) > 0) && (
              <div className="flex flex-wrap justify-center gap-x-4 gap-y-1">
                {Object.entries(matchEvent.playerStats)
                  .filter(([, ps]) => (ps.assists ?? 0) > 0)
                  .map(([pid, ps]) => (
                    <span
                      key={pid}
                      className="text-[12px] font-semibold text-sky-400/90 flex items-center gap-1"
                    >
                      <span className="font-black">A</span>
                      {matchEvent.playerNames[pid] ?? pid}
                      {(ps.assists ?? 0) > 1 ? ` (${ps.assists} ${t("matchResult.assists")})` : ` (${t("matchResult.assist")})`}
                      <span className="text-muted-foreground/60">
                        {matchEvent.playerTeams[pid] === "home" ? homeName : awayName}
                      </span>
                    </span>
                  ))}
              </div>
            )}
          </div>
        )}
        <div
          className="w-16 h-0.5 mx-auto rounded-full opacity-80"
          style={{ background: `linear-gradient(to right, ${homeHex}, ${awayHex})` }}
        />
      </div>

      <div className="w-full max-w-5xl flex items-stretch gap-5">
        <ResultTeamCard
          side="home"
          squadName={homeName}
          squad={homeSquad}
          event={matchEvent}
          teamSide="home"
          logoUrl={homeLogoUrl}
          accentHex={homeHex}
        />
        <div className="flex flex-col items-center justify-center shrink-0 gap-3 py-4">
          <div className="w-px flex-1 bg-border/30" />
          <div className="w-11 h-11 rounded-full border border-border/50 bg-card/40 flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-muted-foreground" />
          </div>
          <div className="w-px flex-1 bg-border/30" />
        </div>
        <ResultTeamCard
          side="away"
          squadName={awayName}
          squad={awaySquad}
          event={matchEvent}
          teamSide="away"
          logoUrl={awayLogoUrl}
          accentHex={awayHex}
        />
      </div>

      <div className="w-full max-w-5xl shrink-0">
        <div className="card-arcade rounded-xl overflow-hidden">
          <div
            className="h-1 w-full shrink-0"
            style={{ background: `linear-gradient(to right, ${homeHex}, ${awayHex})` }}
          />
          <div className="px-6 py-4">
            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-4 m-0">
              {t("matchResult.matchStatistics")}
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <StatsCompareBar
                label={t("match.shots")}
                home={th.shots}
                away={ta.shots}
                homeColor={homeHex}
                awayColor={awayHex}
              />
              <StatsCompareBar
                label={t("matchResult.passesCompleted")}
                home={th.passesCompleted}
                away={ta.passesCompleted}
                homeColor={homeHex}
                awayColor={awayHex}
              />
              <StatsCompareBar
                label={t("match.tackles")}
                home={th.tackles}
                away={ta.tackles}
                homeColor={homeHex}
                awayColor={awayHex}
              />
              <StatsCompareBar
                label={t("match.interceptions")}
                home={th.interceptions}
                away={ta.interceptions}
                homeColor={homeHex}
                awayColor={awayHex}
              />
            </div>
          </div>
        </div>
      </div>

      {matchEvent.substitutions && matchEvent.substitutions.length > 0 && (
        <div className="w-full max-w-5xl shrink-0">
          <div className="card-arcade rounded-xl px-6 py-4">
            <div className="flex items-center gap-2 mb-3">
              <ArrowRightLeft className="w-3.5 h-3.5 text-muted-foreground" />
              <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest m-0">
                {t("match.lastMinuteSubs")}
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
              {matchEvent.substitutions
                .slice()
                .sort((a, b) => a.matchMinute - b.matchMinute)
                .map((sub, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span className="text-[10px] font-black tabular-nums text-muted-foreground w-7 shrink-0">
                      {sub.matchMinute}&apos;
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground shrink-0">
                      {sub.team === "home" ? homeName : awayName}
                    </span>
                    <span className="text-red-400 font-medium truncate flex-1">
                      {sub.playerOutName}
                    </span>
                    <ArrowRightLeft className="w-3 h-3 text-muted-foreground shrink-0" />
                    <span className="text-emerald-400 font-medium truncate flex-1 text-right">
                      {sub.playerInName}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      <div className="w-full max-w-5xl shrink-0">
        <div className="card-arcade rounded-xl px-6 py-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
            <InfoCell icon={MapPin} label={t("matchResult.venue")} value={venue} />
            <InfoCell icon={Cloud} label={t("matchResult.weather")} value={`${weather.icon} ${weather.label}`} />
            <InfoCell icon={Clock} label={t("matchResult.date")} value={resolvedDate} />
            <InfoCell icon={User} label={t("matchResult.officials")} value={referee} />
          </div>
        </div>
      </div>

      {/* Action — same placement & style as primary actions on /match-preview */}
      <div className="flex items-center gap-4 shrink-0 pb-2">
        <a
          href="/dashboard"
          className="flex items-center gap-2 px-8 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm uppercase tracking-wider glow-primary hover:scale-[1.02] active:scale-[0.98] transition-all no-underline border-0"
        >
          {t("common.continue")}
          <ChevronRight className="w-4 h-4" />
        </a>
      </div>

      <div className="h-[max(0.5rem,env(safe-area-inset-bottom))] shrink-0" aria-hidden />
    </div>
  );
}

function InfoCell({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof MapPin;
  label: string;
  value: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="w-3.5 h-3.5" />
        <span className="text-[10px] font-bold uppercase tracking-widest">{label}</span>
      </div>
      <p className="text-sm font-semibold text-foreground m-0">{value}</p>
    </div>
  );
}
