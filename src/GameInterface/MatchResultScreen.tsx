import { useState, useEffect, type ReactNode } from "react";
import { TitleParts } from "@/GameInterface/ui/TitleParts";
import { preferredRole } from "@/Domain/positions/positionAptitude";
import { compareSquadPositions } from "@/Domain/positions/positionSort";
import { useTranslation } from "react-i18next";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import type { Squad, RosterPlayer, LeagueData } from "@/types/playerTypes";
import type { MatchEvent } from "@/types/dayLogTypes";
import type { DayLog } from "@/types/dayLogTypes";
import type { Fixture } from "@/types/calendarTypes";
import { MAIN_ROLE_ABBR, getPositionColor } from "@/GameInterface/positionHelpers";
import { ClubLogo, squadLogoUrl } from "@/GameInterface/Components/ClubLogo";
import { ratingTextClass10 } from "@/GameInterface/scoreColors";
import { teamDisplayNameFromLeagues } from "@/GameInterface/teamDisplayName";
import { competitionName } from "@/Domain/world/labels";
import {
  FALLBACK_AWAY_ACCENT,
  FALLBACK_HOME_ACCENT,
  readableOnDark,
  resolveMatchTeamKitColors,
  squadPrimaryColor,
  squadSecondaryColor,
} from "@/GameInterface/matchTeamColors";
import { addOneDay } from "@/Domain/dates";
import { Icon, iconOf } from "@/GameInterface/Icons";
import { matchConditions } from "@/Domain/matchday/matchConditions";
import { weatherIconName, weatherLabelKey } from "@/GameInterface/matchWeather";
import { Flag } from "@/GameInterface/Components/Flag";
import { nationalityFlagCode } from "@/Domain/world/nationalityFlag";

const Clock = iconOf("clock");
const MapPin = iconOf("map-pin");
const User = iconOf("user");

// ── Helpers (aligned with MatchPreviewScreen) ───────────────────────────────

function roleLabel(role: string): string {
  if (role in MAIN_ROLE_ABBR) return MAIN_ROLE_ABBR[role as keyof typeof MAIN_ROLE_ABBR];
  return role;
}

function RoleBadge({ role, align }: { role: string; align: "left" | "right" }) {
  const color = getPositionColor(role);
  return (
    <span
      className={`text-sm font-black uppercase font-display tracking-[0.06em] shrink-0 w-10 ${align === "right" ? "text-right" : ""} ${color}`}
    >
      {roleLabel(role)}
    </span>
  );
}

function playerIdsForTeam(event: MatchEvent, side: "home" | "away"): string[] {
  return Object.entries(event.playerTeams)
    .filter(([, t]) => t === side)
    .map(([id]) => id);
}

/**
 * Pitch order of the result list (#114): starters by line (GK, DEF, MID, FWD) and detailed
 * position, best rated first inside a position; the substitutes who came on go below, in the order
 * they entered.
 */
function orderResultPlayers(
  ids: string[],
  event: MatchEvent,
  byId: Map<string, RosterPlayer>,
): { starters: string[]; subs: string[] } {
  const entered = new Map<string, number>();
  event.substitutions.forEach((s, i) => {
    if (ids.includes(s.playerInId) && !entered.has(s.playerInId)) entered.set(s.playerInId, i);
  });
  const sortable = (id: string) => {
    const p = byId.get(id);
    return { pos: p?.positions[0] ?? "", natural: p ? preferredRole(p) : undefined, name: "" };
  };
  const rating = (id: string) => event.playerRatings[id] ?? 0;
  const starters = ids
    .filter((id) => !entered.has(id))
    .sort((a, b) => compareSquadPositions(sortable(a), sortable(b)) || rating(b) - rating(a));
  const subs = ids.filter((id) => entered.has(id)).sort((a, b) => entered.get(a)! - entered.get(b)!);
  return { starters, subs };
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
  const role = roster ? preferredRole(roster) : "CM";
  const rating = event.playerRatings[playerId];
  const goals = event.playerStats[playerId]?.goals ?? 0;
  const assists = event.playerStats[playerId]?.assists ?? 0;
  const highlight = goals > 0 || assists > 0;
  const ratingLabel =
    rating != null && Number.isFinite(rating) ? rating.toFixed(1) : "—";
  const ratingClass = rating != null && Number.isFinite(rating) ? ratingTextClass10(rating) : "text-muted-foreground";

  const rowClass = highlight
    ? "bg-primary/10 border border-primary/30 rounded-lg"
    : "";

  if (align === "left") {
    return (
      <div className={`flex items-center gap-2.5 min-h-9 [@media(min-height:900px)]:min-h-11 px-1.5 -mx-1.5 ${rowClass}`}>
        <RoleBadge role={role} align="left" />
        <span className="flex-1 text-base text-foreground font-medium truncate">{lastName}</span>
        {goals > 0 && (
          <span className="flex items-center gap-0.5 text-foreground shrink-0" title={`${goals} goal${goals > 1 ? "s" : ""}`}>
            <Icon name="ball" className="w-4 h-4" />
            {goals > 1 && <span className="text-base font-black tabular-nums">{goals}</span>}
          </span>
        )}
        {assists > 0 && (
          <span className="flex items-center gap-0.5 text-chart-3 shrink-0" title={`${assists} assist${assists > 1 ? "s" : ""}`}>
            <span className="text-base font-black tabular-nums">{assists > 1 ? assists : ""}A</span>
          </span>
        )}
        <span className={`w-10 text-lg font-display font-bold tabular-nums shrink-0 ${ratingClass}`}>{ratingLabel}</span>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2.5 min-h-9 [@media(min-height:900px)]:min-h-11 px-1.5 -mx-1.5 ${rowClass}`}>
      <span className={`w-10 text-lg font-display font-bold tabular-nums shrink-0 ${ratingClass}`}>{ratingLabel}</span>
      {assists > 0 && (
        <span className="flex items-center gap-0.5 text-chart-3 shrink-0" title={`${assists} assist${assists > 1 ? "s" : ""}`}>
          <span className="text-base font-black tabular-nums">{assists > 1 ? assists : ""}A</span>
        </span>
      )}
      {goals > 0 && (
        <span className="flex items-center gap-0.5 text-foreground shrink-0" title={`${goals} goal${goals > 1 ? "s" : ""}`}>
          {goals > 1 && <span className="text-base font-black tabular-nums">{goals}</span>}
          <Icon name="ball" className="w-4 h-4" />
        </span>
      )}
      <span className="flex-1 text-base text-foreground font-medium truncate text-right">{lastName}</span>
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
      <div className="flex justify-between text-sm font-bold uppercase tracking-[0.08em] text-muted-foreground font-display">
        <span>{label}</span>
        <span className="tabular-nums text-foreground">
          <span style={{ color: homeColor }}>{home}</span>
          <span className="text-muted-foreground/40 mx-1">·</span>
          <span style={{ color: awayColor }}>{away}</span>
        </span>
      </div>
      <div className="h-2.5 rounded-full bg-border overflow-hidden flex">
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
  const byId = rosterById(squad);
  const { starters, subs } = orderResultPlayers(playerIdsForTeam(event, teamSide), event, byId);
  const renderRow = (id: string) => (
    <ResultPlayerRow
      key={id}
      playerId={id}
      event={event}
      roster={byId.get(id)}
      align={side === "home" ? "left" : "right"}
    />
  );
  const isHome = side === "home";
  const accentBorder =
    isHome
      ? { borderLeftWidth: 2, borderLeftStyle: "solid" as const, borderLeftColor: accentHex }
      : { borderRightWidth: 2, borderRightStyle: "solid" as const, borderRightColor: accentHex };

  return (
    <div
      className="flex-1 rounded-md bg-card/60 backdrop-blur-sm p-5 flex flex-col gap-3 border border-border"
      style={{ ...accentBorder, height: "48vh", overflow: "scroll" }}
    >
      <div className={`flex items-center gap-3 ${isHome ? "" : "flex-row-reverse"}`}>
        <ClubLogo
          logoUrl={logoUrl}
          className="w-10 h-10 rounded-full shrink-0"
          imgClassName="w-full h-full object-contain p-1"
        />
        <div className={`min-w-0 ${isHome ? "" : "text-right"}`}>
          <h2 className="font-display font-black uppercase text-2xl leading-none m-0 truncate">
            {squadName}
          </h2>
          <p className="text-sm font-bold uppercase tracking-[0.08em] m-0 font-display" style={{ color: accentHex }}>
            {t("matchResult.matchRatings")}
          </p>
        </div>
        <div className="flex-1" />
      </div>

      <div className="border-t border-border/30" />

      <div className="flex-1">
        <p className="text-sm font-bold text-muted-foreground uppercase tracking-[0.08em] mb-1.5 font-display">
          {t("matchResult.squadPerformance")}
        </p>
        <div>
          {starters.length + subs.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("matchResult.noPlayerData")}</p>
          ) : (
            <>
              {starters.map(renderRow)}
              {subs.length > 0 && (
                <p className={`font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground mt-3 mb-1.5 ${isHome ? "" : "text-right"}`}>
                  {t("matchResult.substitutes")}
                </p>
              )}
              {subs.map(renderRow)}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main ────────────────────────────────────────────────────────────────────

export function MatchResultScreen() {
  const { t, i18n } = useTranslation();
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

  if (saveLoading || !session) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground text-sm">{t("common.loadingMatchResult")}</p>
        </div>
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
            <Icon name="chevron-left" className="w-4 h-4" />
            {t("common.backToDashboard")}
          </a>
        </div>
      </div>
    );
  }

  const isHome = matchEvent.home === mySquadId;
  const homeName = teamDisplayNameFromLeagues(matchEvent.home, leagues);
  const awayName = teamDisplayNameFromLeagues(matchEvent.away, leagues);
  const homeLogoUrl = squadLogoUrl(matchEvent.home);
  const awayLogoUrl = squadLogoUrl(matchEvent.away);

  // Same kickoff/weather as the dashboard card and the preview: the fixture + the home club's country.
  const fixture = fixtures.find(
    (f) => f.date === resolvedDate && f.home === matchEvent.home && f.away === matchEvent.away,
  );
  const neutral = !!fixture?.neutral;
  const conditions = matchConditions(
    { date: resolvedDate, home: matchEvent.home, away: matchEvent.away },
    neutral ? null : homeSquad?.country ?? null,
  );
  const venue = neutral
    ? t("cups.neutral")
    : homeSquad?.venue?.name ?? (isHome ? `${session.clubName} Stadium` : "Away Ground");
  const competition = competitionName(matchEvent.competition, leagues, i18n.language);
  const th = matchEvent.teamStats.home;
  const ta = matchEvent.teamStats.away;
  const homePrimary = squadPrimaryColor(homeSquad, FALLBACK_HOME_ACCENT);
  const awayPrimary = squadPrimaryColor(awaySquad, FALLBACK_AWAY_ACCENT);
  const kits = resolveMatchTeamKitColors(
    { primary: homePrimary, secondary: squadSecondaryColor(homeSquad, homePrimary) },
    { primary: awayPrimary, secondary: squadSecondaryColor(awaySquad, awayPrimary) },
  );
  // Everything here is drawn on the dark background: lift black/navy kits so the score,
  // names, bars and accents stay readable (same helper as the live ScoreBar).
  const homeHex = readableOnDark(kits.teamA);
  const awayHex = readableOnDark(kits.teamB);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center px-6 py-8 gap-7 overflow-y-auto">
      {/* Header: title + score centred, Continue on the right so it needs no scrolling (#41) */}
      <div className="w-full max-w-5xl min-[1600px]:max-w-6xl grid grid-cols-[1fr_auto_1fr] items-start gap-4 shrink-0">
      <div aria-hidden />
      <div className="text-center space-y-2 min-w-0">
        <p className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground m-0">
          {t("matchResult.matchdayRound", { round: matchEvent.round, competition })}
        </p>
        <h1 className="font-display font-black uppercase tracking-tight text-3xl md:text-4xl leading-none m-0">
          <TitleParts accent={t("screenTitles.matchResult.accent")}>{t("screenTitles.matchResult.main")}</TitleParts>
        </h1>
        <div className="flex items-center justify-center gap-6 pt-2">
          <span
            className="text-xl font-bold truncate max-w-[40%]"
            style={{ color: homeHex }}
          >
            {homeName}
          </span>
          <div className="flex items-center gap-3 tabular-nums">
            <span className="text-5xl font-black font-display" style={{ color: homeHex }}>
              {matchEvent.score.home}
            </span>
            <span className="text-2xl font-display text-muted-foreground/50">–</span>
            <span className="text-5xl font-black font-display" style={{ color: awayHex }}>
              {matchEvent.score.away}
            </span>
          </div>
          <span
            className="text-xl font-bold truncate max-w-[40%]"
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
                  className="text-base font-semibold text-foreground flex items-center gap-1"
                >
                  <Icon name="ball" className="w-4 h-4 shrink-0" />
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
                      className="text-base font-semibold text-chart-3/90 flex items-center gap-1"
                    >
                      <Icon name="handshake" className="w-4 h-4 shrink-0" />
                      <span className="sr-only">{t("matchResult.assist")}:</span>
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
          style={{ background: `linear-gradient(to right, ${homeHex} 50%, ${awayHex} 50%)` }}
        />
      </div>
      <div className="flex justify-end">
        <a
          href="/dashboard"
          className="flex items-center gap-2 px-5 h-10 rounded bg-primary text-primary-foreground font-semibold text-sm no-underline border-0"
        >
          {t("common.continue")}
          <Icon name="chevron-right" className="w-4 h-4" />
        </a>
      </div>
      </div>

      <div className="w-full max-w-5xl min-[1600px]:max-w-6xl flex items-stretch gap-5">
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
            <Icon name="stats" className="w-5 h-5 text-muted-foreground" />
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

      <div className="w-full max-w-5xl min-[1600px]:max-w-6xl shrink-0">
        <div className="card-arcade rounded-md overflow-hidden">
          <div
            className="h-1.5 w-full shrink-0"
            style={{ background: `linear-gradient(to right, ${homeHex} 50%, ${awayHex} 50%)` }}
          />
          <div className="px-6 py-4">
            <p className="text-sm font-bold text-muted-foreground uppercase tracking-[0.08em] mb-4 m-0 font-display">
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
              {th.fouls != null && ta.fouls != null && (
                <>
                  <StatsCompareBar label={t("match.summary.fouls")} home={th.fouls} away={ta.fouls} homeColor={homeHex} awayColor={awayHex} />
                  <StatsCompareBar
                    label={t("matchResult.yellowCards")}
                    home={th.yellowCards ?? 0}
                    away={ta.yellowCards ?? 0}
                    homeColor={homeHex}
                    awayColor={awayHex}
                  />
                  <StatsCompareBar
                    label={t("matchResult.redCards")}
                    home={th.redCards ?? 0}
                    away={ta.redCards ?? 0}
                    homeColor={homeHex}
                    awayColor={awayHex}
                  />
                  <StatsCompareBar
                    label={t("match.summary.offsides")}
                    home={th.offsides ?? 0}
                    away={ta.offsides ?? 0}
                    homeColor={homeHex}
                    awayColor={awayHex}
                  />
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {matchEvent.substitutions && matchEvent.substitutions.length > 0 && (
        <div className="w-full max-w-5xl min-[1600px]:max-w-6xl shrink-0">
          <div className="card-arcade rounded-md px-6 py-4">
            <div className="flex items-center gap-2 mb-3">
              <Icon name="arrow-right-left" className="w-3.5 h-3.5 text-muted-foreground" />
              <p className="text-sm font-bold text-muted-foreground uppercase tracking-[0.08em] m-0 font-display">
                {t("match.lastMinuteSubs")}
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
              {matchEvent.substitutions
                .slice()
                .sort((a, b) => a.matchMinute - b.matchMinute)
                .map((sub, i) => (
                  <div key={i} className="flex items-center gap-2 text-base">
                    <span className="text-base font-black tabular-nums text-muted-foreground w-7 shrink-0">
                      {sub.matchMinute + 1}&apos;
                    </span>
                    <span className="text-sm font-bold uppercase tracking-[0.08em] font-display text-muted-foreground shrink-0">
                      {sub.team === "home" ? homeName : awayName}
                    </span>
                    <span className="text-destructive font-medium truncate flex-1">
                      {sub.playerOutName}
                    </span>
                    <Icon name="arrow-right-left" className="w-3 h-3 text-muted-foreground shrink-0" />
                    <span className="text-chart-2 font-medium truncate flex-1 text-right">
                      {sub.playerInName}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {matchEvent.cards && matchEvent.cards.length > 0 && (
        <div className="w-full max-w-5xl min-[1600px]:max-w-6xl shrink-0">
          <div className="card-arcade rounded-md px-6 py-4">
            <p className="text-sm font-bold text-muted-foreground uppercase tracking-[0.08em] mb-3 m-0 font-display">
              {t("matchResult.cards")}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
              {matchEvent.cards.map((c, i) => (
                <div key={i} className="flex items-center gap-2 text-base">
                  <span className="text-base font-black tabular-nums text-muted-foreground w-7 shrink-0">
                    {c.matchMinute + 1}&apos;
                  </span>
                  <span
                    className={`inline-block w-2.5 h-3.5 rounded-sm shrink-0 ${c.card === "yellow" ? "bg-card-yellow" : "bg-destructive"}`}
                    aria-label={c.card === "yellow" ? t("matchResult.yellowCard") : t("matchResult.redCard")}
                  />
                  <span className="text-foreground font-medium truncate flex-1">
                    {c.playerName}
                    {c.secondYellow ? ` (${t("matchResult.secondYellow")})` : ""}
                  </span>
                  <span className="text-sm font-bold uppercase tracking-[0.08em] font-display text-muted-foreground shrink-0">
                    {c.team === "home" ? homeName : awayName}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="w-full max-w-5xl min-[1600px]:max-w-6xl shrink-0">
        <div className="card-arcade rounded-md px-6 py-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
            <InfoCell icon={MapPin} label={t("matchResult.venue")} value={venue} />
            <InfoCell icon={iconOf(weatherIconName(conditions))} label={t("matchResult.weather")}
              value={`${t(weatherLabelKey(conditions.weather))} · ${conditions.kickoff}`} />
            <InfoCell icon={Clock} label={t("matchResult.date")} value={resolvedDate} />
            <InfoCell icon={User} label={t("matchResult.officials")} value={matchEvent.referee ? (
              <span className="inline-flex items-center gap-2">
                {matchEvent.referee.name}
                {nationalityFlagCode(matchEvent.referee.country) && <Flag code={nationalityFlagCode(matchEvent.referee.country)!} />}
              </span>
            ) : "—"} />
          </div>
        </div>
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
  value: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="w-4 h-4" />
        <span className="text-[13px] font-bold uppercase tracking-[0.08em] font-display">{label}</span>
      </div>
      <p className="text-base font-semibold text-foreground m-0">{value}</p>
    </div>
  );
}
