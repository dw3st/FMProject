import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  DayLog,
  DayEvent,
  MatchEvent,
  TrainingEvent,
  RestEvent,
  PlayerDevelopmentChange,
  TrainingEffect,
  RestEffect,
} from "@/types/dayLogTypes";
import type { LeagueData, RosterPlayer } from "@/types/playerTypes";
import { Modal } from "@/GameInterface/Components/Modal";
import { ClubLogo, squadLogoUrl } from "@/GameInterface/Components/ClubLogo";
import { fallbackTeamNameFromSquadId, teamDisplayNameFromLeagues } from "@/GameInterface/teamDisplayName";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { PlayerFace, playerInitials } from "@/GameInterface/Components/PlayerFace";
import { getMainRole } from "@/Domain/roles";
import { Icon, iconOf } from "@/GameInterface/Icons";
import { competitionName, partitionDayMatches } from "@/Domain/world/labels";
import { isCupSlug } from "@/Domain/cups/cupIds";
import { AttributeChangeRow } from "@/GameInterface/Components/AttributeChangeRow";
import { DEV_CHANGES_VISIBLE, groupDevelopmentChanges, trainingDevelopmentChanges } from "@/GameInterface/Components/attributeChanges";
import { Button } from "@/GameInterface/ui/Button";

const Minus = iconOf("minus");
const TrendingDown = iconOf("trend-down");
const TrendingUp = iconOf("trend-up");

/** One team's identity, resolved once per league set so per-match lookups are O(1). */
interface TeamLookup {
  name:   string;
  colors: [string, string];
}

type TFunc = (key: string, options?: Record<string, unknown>) => string;

interface Props {
  dayLog:    DayLog;
  onDismiss: () => void;
  mySquadId: string;
  leagues:   LeagueData[];
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function weekdayUpper(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-GB", { weekday: "long" }).toUpperCase();
}

function seasonLabel(year: number | undefined): string {
  if (year == null || !Number.isFinite(year)) return "SEASON —";
  const yy = String(year).slice(-2).padStart(2, "0");
  return `SEASON ${yy}`;
}

/** Single badge for the active day type only (no inactive option shown). */
function DayModeBadge({ mode, t }: { mode: "training" | "rest"; t: (key: string) => string }) {
  const isRest = mode === "rest";
  return (
    <div className="flex justify-center">
      <div
        className="inline-flex items-center justify-center gap-2 rounded-full border border-primary/35 bg-primary/15 px-6 py-2.5 text-[13px] font-bold uppercase tracking-[0.08em] text-primary font-display"
        role="status"
      >
        {isRest ? (
          <>
            <Icon name="rest" className="w-3.5 h-3.5 shrink-0" aria-hidden />
            {t("daySummary.restDay")}
          </>
        ) : (
          <>
            <Icon name="training" className="w-3.5 h-3.5 shrink-0" aria-hidden />
            {t("daySummary.trainingDay")}
          </>
        )}
      </div>
    </div>
  );
}

function primaryRoleLabel(positions: string[], t: (key: string) => string): string {
  const p = positions[0] ?? "CM";
  if (positions.includes("GK") || p === "GK") return t("daySummary.goalkeeper");
  if (p === "ST" || p === "CF") return t("daySummary.striker");
  const main = getMainRole(p);
  switch (main) {
    case "Defender":   return t("daySummary.defender");
    case "Midfielder": return t("daySummary.midfielder");
    case "Forward":    return t("daySummary.forward");
    default:           return t("daySummary.goalkeeper");
  }
}

function trainingFitnessLabel(delta: number, t: (key: string) => string): { text: string; tone: "neg" | "neu" } {
  const a = Math.abs(delta);
  if (a < 0.05) return { text: t("daySummary.noChange"), tone: "neu" };
  if (a < 4)    return { text: t("daySummary.lightFatigue"), tone: "neg" };
  if (a < 8)    return { text: t("daySummary.fatigued"), tone: "neg" };
  return { text: t("daySummary.drained"), tone: "neg" };
}

function trainingPointsLabel(points: number, t: (key: string) => string): { text: string; tone: "pos" | "neu" } {
  if (points < 0.05) return { text: t("daySummary.flat"), tone: "neu" };
  if (points < 1)    return { text: t("daySummary.smallImprovement"), tone: "pos" };
  if (points < 1.75) return { text: t("daySummary.goodProgress"), tone: "pos" };
  if (points < 2.5)  return { text: t("daySummary.greatProgress"), tone: "pos" };
  return { text: t("daySummary.hugeImprovement"), tone: "pos" };
}

function restFitnessLabel(delta: number, t: (key: string) => string): { text: string; tone: "pos" | "neu" } {
  if (delta < 0.05) return { text: t("daySummary.noChange"), tone: "neu" };
  if (delta < 6)    return { text: t("daySummary.refreshed"), tone: "pos" };
  if (delta < 11)   return { text: t("daySummary.recovery"), tone: "pos" };
  return { text: t("daySummary.strongRecovery"), tone: "pos" };
}

function restReadinessLabel(pointsDelta: number, t: (key: string) => string): { text: string; tone: "neg" | "neu" } {
  const a = Math.abs(pointsDelta);
  if (a < 0.05) return { text: t("daySummary.sharpnessHeld"), tone: "neu" };
  if (a < 1)    return { text: t("daySummary.minorRust"), tone: "neg" };
  return { text: t("daySummary.sharpnessFaded"), tone: "neg" };
}

type OutcomeTone = "pos" | "neg" | "neu";

function toneClass(tone: OutcomeTone): string {
  switch (tone) {
    case "pos": return "text-chart-2";
    case "neg": return "text-destructive";
    default:    return "text-muted-foreground";
  }
}

function OutcomePhrase({ text, tone, className = "" }: { text: string; tone: OutcomeTone; className?: string }) {
  const Icon = tone === "pos" ? TrendingUp : tone === "neg" ? TrendingDown : Minus;
  return (
    <span className={`inline-flex items-center justify-end gap-1 font-bold text-sm leading-tight text-right ${toneClass(tone)} ${className}`}>
      <Icon className="w-3 h-3 shrink-0 opacity-90" />
      <span className="break-words">{text}</span>
    </span>
  );
}

function SquadTrainingRestCard({
  mode, teamName, effects, playerById, clubColors, t,
}: {
  mode: "training" | "rest";
  teamName: string;
  effects: TrainingEffect[] | RestEffect[];
  playerById: Map<string, RosterPlayer>;
  /** Kit colours of the club, used for the generated faces. */
  clubColors?: readonly string[];
  t: (key: string) => string;
}) {
  const squadTitle = teamName.trim().toUpperCase() || t("daySummary.yourSquad");
  return (
    <div className="rounded-md overflow-hidden border border-border/80">
      <div className="grid grid-cols-[2.5rem_minmax(0,1fr)_minmax(4.75rem,1fr)_minmax(4.75rem,1fr)] gap-x-2 items-center px-3 sm:px-4 py-3 border-b border-border/60 bg-black/20">
        <div aria-hidden />
        <span className="font-display font-bold uppercase tracking-[0.08em] text-sm text-foreground min-w-0 truncate">{squadTitle}</span>
        <span className="text-[13px] font-bold uppercase tracking-[0.08em] text-muted-foreground/70 text-right font-display">{t("daySummary.fitness")}</span>
        <span className="text-[13px] font-bold uppercase tracking-[0.08em] text-muted-foreground/70 text-right font-display">{t("daySummary.training")}</span>
      </div>
      <div className="divide-y divide-border/40">
        {effects.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-muted-foreground">{t("daySummary.noPlayersInSession")}</div>
        ) : (
          effects.map((e, i) => {
            const p = playerById.get(String(e.playerId));
            const role = p ? primaryRoleLabel(p.positions, t) : "—";
            const initials = playerInitials(e.name);
            let fit: { text: string; tone: OutcomeTone };
            let second: { text: string; tone: OutcomeTone };
            if (mode === "training") {
              const te = e as TrainingEffect;
              const f = trainingFitnessLabel(te.fitnessDelta, t);
              const tl = trainingPointsLabel(te.trainingPoints, t);
              fit    = { text: f.text, tone: f.tone === "neu" ? "neu" : "neg" };
              second = { text: tl.text, tone: tl.tone === "neu" ? "neu" : "pos" };
            } else {
              const re = e as RestEffect;
              const f = restFitnessLabel(re.fitnessDelta, t);
              const r = restReadinessLabel(re.pointsDelta, t);
              fit    = { text: f.text, tone: f.tone === "neu" ? "neu" : "pos" };
              second = { text: r.text, tone: r.tone === "neu" ? "neu" : "neg" };
            }
            return (
              <div key={`${e.playerId}-${i}`} className="grid grid-cols-[2.5rem_minmax(0,1fr)_minmax(4.75rem,1fr)_minmax(4.75rem,1fr)] gap-x-2 items-center px-3 sm:px-4 py-3">
                <PlayerFace
                  playerId={String(e.playerId)}
                  nationality={p?.nationality}
                  clubColors={clubColors}
                  size={40}
                  fallback={initials}
                />
                <div className="min-w-0">
                  <div className="font-bold text-sm text-foreground truncate">{e.name}</div>
                  <div className="text-sm text-muted-foreground">{role}</div>
                </div>
                <OutcomePhrase text={fit.text} tone={fit.tone} className="min-w-0" />
                <OutcomePhrase text={second.text} tone={second.tone} className="min-w-0" />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

/** Builds a squadId → team identity map once per league set (replaces the old per-call linear scan). */
function buildTeamsById(leagues: LeagueData[]): Map<string, TeamLookup> {
  const map = new Map<string, TeamLookup>();
  for (const league of leagues) {
    for (const row of league.standings) {
      if (!map.has(row.squadId)) {
        map.set(row.squadId, { name: row.name, colors: row.colors });
      }
    }
  }
  return map;
}

function MatchCard({
  event, leagues, teamsById, t, lang,
}: {
  event: MatchEvent;
  leagues: LeagueData[];
  teamsById: Map<string, TeamLookup>;
  t: TFunc;
  lang: string;
}) {
  const homeTeam = teamsById.get(event.home);
  const awayTeam = teamsById.get(event.away);
  const homeName = homeTeam?.name ?? fallbackTeamNameFromSquadId(event.home);
  const awayName = awayTeam?.name ?? fallbackTeamNameFromSquadId(event.away);
  const homeLogoUrl = squadLogoUrl(event.home);
  const awayLogoUrl = squadLogoUrl(event.away);
  const homeColors = homeTeam?.colors ?? ["#555", "#888"];
  const awayColors = awayTeam?.colors ?? ["#555", "#888"];

  return (
    <div className="card-arcade rounded-md overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-secondary/20">
        <Icon name="trophy" className="w-3.5 h-3.5 text-primary" />
        <span className="text-[13px] font-bold uppercase tracking-[0.08em] text-muted-foreground font-display">
          {isCupSlug(event.competition)
            ? t("daySummary.cupMatch", { competition: competitionName(event.competition, leagues, lang) })
            : t("daySummary.matchRound", { competition: competitionName(event.competition, leagues, lang), round: event.round })}
        </span>
      </div>

      <div className="px-4 py-4">
        <div className="flex items-center justify-center gap-6">
          <div className="flex-1 flex items-center justify-end gap-2 min-w-0">
            <span className="text-sm font-semibold text-foreground truncate">{homeName}</span>
            <ClubLogo
              logoUrl={homeLogoUrl}
              primaryColor={homeColors[0]}
              secondaryColor={homeColors[1]}
              className="w-8 h-8 rounded-full shrink-0"
            />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-3xl font-black text-foreground tabular-nums font-display">
              {event.score.home}
            </span>
            <span className="text-xl text-muted-foreground/40">–</span>
            <span className="text-3xl font-black text-foreground tabular-nums font-display">
              {event.score.away}
            </span>
          </div>
          <div className="flex-1 flex items-center justify-start gap-2 min-w-0">
            <ClubLogo
              logoUrl={awayLogoUrl}
              primaryColor={awayColors[0]}
              secondaryColor={awayColors[1]}
              className="w-8 h-8 rounded-full shrink-0"
            />
            <span className="text-sm font-semibold text-foreground truncate">{awayName}</span>
          </div>
        </div>

        {event.scorers.length > 0 && (
          <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1">
            {event.scorers.map((s, i) => (
              <span key={i} className="text-sm text-muted-foreground">
                {s.playerName} {s.goals > 1 ? `(${s.goals})` : ""}
                <span className="text-muted-foreground/40 ml-1">
                  {s.team === "home" ? homeName : awayName}
                </span>
              </span>
            ))}
          </div>
        )}

        <div className="mt-3 grid grid-cols-3 gap-2 text-sm text-center">
          <StatCell label={t("daySummary.shots")} home={event.teamStats.home.shots} away={event.teamStats.away.shots} />
          <StatCell label={t("daySummary.passes")} home={event.teamStats.home.passesCompleted} away={event.teamStats.away.passesCompleted} />
          <StatCell label={t("daySummary.tackles")} home={event.teamStats.home.tackles} away={event.teamStats.away.tackles} />
        </div>
      </div>
    </div>
  );
}

function StatCell({ label, home, away }: { label: string; home: number; away: number }) {
  return (
    <div className="bg-muted/20 rounded-lg px-2 py-1.5">
      <div className="text-muted-foreground/50 font-bold uppercase tracking-[0.08em] mb-1 font-display">{label}</div>
      <div className="flex justify-center gap-2">
        <span className="font-bold text-foreground tabular-nums">{home}</span>
        <span className="text-muted-foreground/30">-</span>
        <span className="font-bold text-foreground tabular-nums">{away}</span>
      </div>
    </div>
  );
}

/** One text line for a match outside the player's own/followed leagues — no ClubLogo, so hundreds render cheaply. */
function OtherLeagueLine({
  event, leagues, teamsById, lang,
}: {
  event: MatchEvent;
  leagues: LeagueData[];
  teamsById: Map<string, TeamLookup>;
  lang: string;
}) {
  const homeName = teamsById.get(event.home)?.name ?? fallbackTeamNameFromSquadId(event.home);
  const awayName = teamsById.get(event.away)?.name ?? fallbackTeamNameFromSquadId(event.away);
  return (
    <div className="flex items-center gap-3 px-3 py-1.5 text-sm">
      <span className="shrink-0 w-36 truncate text-muted-foreground/70 font-semibold uppercase tracking-[0.08em] font-display text-[13px]">
        {competitionName(event.competition, leagues, lang)}
      </span>
      <span className="truncate text-foreground/80">
        {homeName} {event.score.home} – {event.score.away} {awayName}
      </span>
    </div>
  );
}

/** Collapsed-by-default block for matches outside the player's own/followed leagues. */
function OtherLeaguesSection({
  matches, leagues, teamsById, t, lang,
}: {
  matches: MatchEvent[];
  leagues: LeagueData[];
  teamsById: Map<string, TeamLookup>;
  t: TFunc;
  lang: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 rounded border-0 px-4 h-10 text-sm font-semibold text-muted-foreground hover:text-foreground cursor-pointer bg-transparent hover:text-foreground"
      >
        <span>{t("daySummary.otherLeagues", { count: matches.length })}</span>
        <Icon name={open ? "chevron-up" : "chevron-down"} size={14} />
      </button>
      {open && (
        <div className="mt-2 rounded-md border border-border/40 divide-y divide-border/30 overflow-hidden">
          {matches.map((e) => (
            <OtherLeagueLine key={e.fixtureId} event={e} leagues={leagues} teamsById={teamsById} lang={lang} />
          ))}
        </div>
      )}
    </section>
  );
}

function DevChangesCard({ changes, t }: { changes: PlayerDevelopmentChange[]; t: TFunc }) {
  const [expanded, setExpanded] = useState(false);
  const players = groupDevelopmentChanges(changes);
  if (players.length === 0) return null;
  const hidden = expanded ? 0 : Math.max(0, players.length - DEV_CHANGES_VISIBLE);
  const shown = hidden > 0 ? players.slice(0, DEV_CHANGES_VISIBLE) : players;

  return (
    <div className="card-arcade rounded-md overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-secondary/20">
        <Icon name="trend-up" className="w-3.5 h-3.5 text-chart-2" />
        <span className="text-[13px] font-bold uppercase tracking-[0.08em] text-muted-foreground font-display">
          {t("daySummary.playerDevelopment")}
        </span>
      </div>
      <div className="divide-y divide-border/50">
        {shown.map((p) => (
          <div key={p.playerId} className="px-4 py-2.5">
            <p className="text-sm font-semibold text-foreground m-0 mb-1">{p.playerName}</p>
            <div className="space-y-0.5">
              {p.changes.map((ch) => (
                <AttributeChangeRow key={ch.stat} stat={ch.stat} from={ch.from} to={ch.to} />
              ))}
            </div>
          </div>
        ))}
      </div>
      {hidden > 0 && (
        <div className="px-4 border-t border-border/50">
          <Button variant="secondary" flush onClick={() => setExpanded(true)}>
            {t("daySummary.morePlayers", { count: hidden })}
          </Button>
        </div>
      )}
    </div>
  );
}

function EventCard({
  event, leagues, teamsById, t, lang,
}: {
  event: DayEvent;
  leagues: LeagueData[];
  teamsById: Map<string, TeamLookup>;
  t: TFunc;
  lang: string;
}) {
  switch (event.kind) {
    case "match":
      return <MatchCard event={event} leagues={leagues} teamsById={teamsById} t={t} lang={lang} />;
    default:
      return null;
  }
}

export function DaySummaryModal({ dayLog, onDismiss, mySquadId, leagues }: Props) {
  const { t, i18n } = useTranslation();
  const { squad, save, session } = useGameSave();
  const playerById = useMemo(() => {
    const m = new Map<string, RosterPlayer>();
    if (squad?.players) {
      for (const p of squad.players) m.set(String(p.id), p);
    }
    return m;
  }, [squad]);
  const teamsById = useMemo(() => buildTeamsById(leagues), [leagues]);

  const matchEvents = dayLog.events.filter((e): e is MatchEvent => e.kind === "match");
  const myMatch = matchEvents.find((e) => e.home === mySquadId || e.away === mySquadId);
  const ownLeague = session?.leagueSlug ?? "";
  const followedLeagues = session?.followedLeagues ?? [];
  const { primary: primaryMatches, others: otherMatches } = partitionDayMatches(
    matchEvents, ownLeague, followedLeagues,
    (m) => m.home === mySquadId || m.away === mySquadId,
  );
  const trainingEvents = dayLog.events.filter(
    (e): e is TrainingEvent => e.kind === "training" && e.squadId === mySquadId,
  );
  const trainingDevChanges = trainingEvents.flatMap((e) => trainingDevelopmentChanges(e.effects ?? []));
  const restEvents = dayLog.events.filter(
    (e): e is RestEvent => e.kind === "rest" && e.squadId === mySquadId,
  );

  // Collect development changes for my squad's players only
  const myDevChanges: PlayerDevelopmentChange[] = [];
  for (const ev of matchEvents) {
    const isMyMatch = ev.home === mySquadId || ev.away === mySquadId;
    if (!isMyMatch) continue;
    for (const dc of ev.developmentChanges ?? []) {
      const side = ev.playerTeams?.[dc.playerId];
      const playerIsHome = side === "home" && ev.home === mySquadId;
      const playerIsAway = side === "away" && ev.away === mySquadId;
      if (playerIsHome || playerIsAway) myDevChanges.push(dc);
    }
  }

  const seasonEyebrow = seasonLabel(save?.season?.year);

  return (
    <Modal
      open
      onClose={onDismiss}
      size="lg"
      panelClassName="h-[80vh] max-h-[80vh] min-h-0 flex flex-col overflow-hidden"
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* Header */}
        <div className="relative shrink-0 px-6 pt-6 pb-4 border-b border-border/80">
          <button
            type="button"
            onClick={onDismiss}
            className="absolute top-4 right-4 p-2 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer bg-transparent border-0"
            aria-label={t("common.close")}
          >
            <Icon name="close" className="w-5 h-5 text-muted-foreground" />
          </button>
          <div className="text-center pr-10">
            <p className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-chart-2 mb-2 m-0">
              {weekdayUpper(dayLog.date)} // {seasonEyebrow}
            </p>
            <h2 className="font-display font-black uppercase text-xl leading-none m-0">
              {t("daySummary.title")}
            </h2>
            <p className="text-sm text-muted-foreground m-0 mt-2">{formatDate(dayLog.date)}</p>
          </div>
        </div>

        {/* Body — scrolls when content exceeds available space */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-6 space-y-8">
          {primaryMatches.length > 0 && (
            <section>
              <h3 className="font-display font-black uppercase text-xl leading-none m-0 mb-3">
                {t("daySummary.matches", { count: primaryMatches.length })}
              </h3>
              <div className="space-y-3">
                {primaryMatches.map((e) => (
                  <EventCard key={e.fixtureId} event={e} leagues={leagues} teamsById={teamsById} t={t} lang={i18n.language} />
                ))}
              </div>
            </section>
          )}

          {otherMatches.length > 0 && (
            <OtherLeaguesSection matches={otherMatches} leagues={leagues} teamsById={teamsById} t={t} lang={i18n.language} />
          )}

          {myDevChanges.length > 0 && (
            <section>
              <DevChangesCard changes={myDevChanges} t={t} />
            </section>
          )}

          {trainingEvents.length > 0 && (
            <section className="space-y-4">
              <DayModeBadge mode="training" t={t} />
              {trainingEvents.map((e) => (
                <SquadTrainingRestCard
                  key={`training-${e.squadId}`}
                  mode="training"
                  teamName={teamDisplayNameFromLeagues(e.squadId, leagues)}
                  effects={e.effects ?? []}
                  playerById={playerById}
                  clubColors={e.squadId === squad?.id ? squad?.colors : undefined}
                  t={t}
                />
              ))}
              {trainingDevChanges.length > 0 && <DevChangesCard changes={trainingDevChanges} t={t} />}
            </section>
          )}

          {restEvents.length > 0 && (
            <section className="space-y-4">
              <DayModeBadge mode="rest" t={t} />
              {restEvents.map((e) => (
                <SquadTrainingRestCard
                  key={`rest-${e.squadId}`}
                  mode="rest"
                  teamName={teamDisplayNameFromLeagues(e.squadId, leagues)}
                  effects={e.effects ?? []}
                  playerById={playerById}
                  clubColors={e.squadId === squad?.id ? squad?.colors : undefined}
                  t={t}
                />
              ))}
            </section>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 px-6 py-5 border-t border-border/80 bg-card/50 flex items-center justify-end gap-3 flex-wrap">
          {myMatch && (
            <a
              href={`/match-result?date=${encodeURIComponent(dayLog.date)}`}
              className="mr-auto text-sm font-bold text-primary hover:text-primary/90 no-underline hover:underline transition-colors"
            >
              {t("daySummary.fullMatchReport")} →
            </a>
          )}
          <button
            type="button"
            onClick={onDismiss}
            className="min-w-[200px] px-8 h-10 rounded bg-primary text-primary-foreground font-semibold text-sm tracking-[0.15em] cursor-pointer border-0"
          >
            {t("common.continue")} »
          </button>
        </div>
      </div>
    </Modal>
  );
}
