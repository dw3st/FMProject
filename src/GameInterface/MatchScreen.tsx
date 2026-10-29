import { FACILITIES } from "@/Domain/facilities/facilityConfig";
import type { MatchPitch as SetupPitch } from "@/Domain/facilities/pitch";
import { nationalityDisplayName } from "@/Domain/world/labels";
import { shirtName } from "@/Domain/shirtName";
import { readJsonBody } from "@/GameInterface/readJsonBody";
import { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback, lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/GameInterface/ui/Button";
import type { Fixture } from "@/types/calendarTypes";
import type { Squad } from "@/types/playerTypes";
import { PixiPitch } from "@/GraficsEngine/PixiPitch";
import { applyPenaltyOutcome, changeFormation, getBallPos, isLivePhase, matchMinute, PRESENTATION_DURATION, TIME_SCALE, applyPlayerInstruction, setManMarks, swapPlayerPositions, fillInjuryVacancy } from "@/GameEngine/Domain/gameState";
import { useH2HSocket } from "@/GameInterface/H2H/useH2HSocket";
import { PauseBar } from "@/GameInterface/H2H/PauseBar";
import { otherSide } from "@/GameInterface/H2H/h2hState";
import type { H2HCommand } from "@/types/h2hTypes";
import { applyLiveSideConfigs, buildLiveMatchState, eligibleLivePlayers } from "@/Domain/match/liveMatchSetup";
import { overlayDismissDelayMs } from "@/GameInterface/matchOverlayTiming";
import { gameBus, type GameEvents } from "@/GameEngine/Infrastructure/EventBus";
import { WATCH, WATCH_EVENTS } from "@/Domain/watch/watchConfig";
import { wireState } from "@/Domain/match/wireState";
import type { WatchLook } from "@/types/watchTypes";
import { setDebugMode } from "@/GameEngine/Support/DebugLog";
import { initRatings, getAllRatings, exportRatings, importRatings } from "@/GameEngine/Domain/PlayerRating";
import { getTeamStats, getAllPlayerStats, initStats, exportStatsState, importStatsState, getGoalLog } from "@/GameEngine/Domain/Statistics";
import {
  MATCH_SNAPSHOT_VERSION,
  SNAPSHOT_INTERVAL_MS,
  clearMatchSnapshot,
  loadMatchSnapshot,
  matchKey,
  saveMatchSnapshot,
  type TeamTacticsSnapshot,
} from "@/GameInterface/matchResume";
import "@/GameEngine/Support/DebugSubscriber";
import { setBroadcastTeamNames } from "@/GameInterface/Broadcast/BroadcastSubscriber";
import "@/GameEngine/Domain/Statistics";
import type { GameState, GamePlayer, TeamId, Formation, PendingSub } from "@/GameEngine/types";
import type { TacticsSave, TacticalStyle, Mentality, SlotInstruction } from "@/types/tacticsTypes";
import { DEFAULT_TACTICAL_STYLE, DEFAULT_MENTALITY, MENTALITY_OPTIONS } from "@/types/tacticsTypes";
import { loadSession } from "@/GameInterface/gameSession";
import { formationForSimId } from "@/Domain/matchFormations";
import { staffEffectsOf } from "@/Domain/staff/staff";
import { SubstitutionPanel } from "@/GameInterface/SubstitutionPanel";
import { NO_PANEL_PAUSE, manualToggle, openPanelPause, pausedAfterClose, type PanelPause } from "@/GameInterface/panelPause";
import { faceUrl, managerFaceUrl, refereeFaceUrl } from "@/Domain/faces/faceUrl";
import type { MatchCrowd, MatchManagers } from "@/backend/matchCrowd";
import type { MatchSetupReferee } from "@/backend/refereeRoutes";
import { STADIUM } from "@/GraficsEngine/pitchStyle";
import type { PitchLighting, PitchOfficials, PitchStadium } from "@/GraficsEngine/PixiPitch";
import type { MatchWeather } from "@/Domain/matchday/matchConditions";
import type { StadiumSun } from "@/Domain/matchday/stadiumSun";

/**
 * Base (1x) real-time delay before navigating to the result screen after full time. Scaled down
 * by the live match speed via `overlayDismissDelayMs` at the point it's used — see that module for
 * why: at 2x/4x this must run faster, or the overlay/navigation lags behind the (speed-scaled)
 * match ending underneath it.
 *
 * Half-time and extra-time-break do NOT use a real-time delay at all — see the `halfTime` /
 * `extraTimeStart` gameBus handlers and the `matchPhase`-driven dismissal effect below: those
 * overlays are dismissed the moment the engine itself leaves the corresponding phase
 * (`halfTime` → `secondHalf`, `extraTimeBreak` → `extraTimeFirst`), so they always resume exactly
 * when play actually resumes, however the match is paused or its speed is changed while showing.
 */
const MATCH_END_TO_RESULT_MS = 3500;
/** 1x / 2x / 4x — live match speed group (spec §4). */
const GAME_SPEEDS = [1, 2, 4] as const;
import { aiFamiliarity, squadFamiliarityLevels } from "@/Domain/familiarity/familiarity";
import type { FamiliarityLevels } from "@/types/familiarityTypes";
import { TeamPanel, type DepartedPlayer } from "@/GameInterface/TeamPanel";
import { ScoreBar, type TeamMeta } from "@/GameInterface/ScoreBar";
import { useMatchHeading } from "@/GameInterface/useMatchHeading";
import { squadLogoUrl } from "@/GameInterface/Components/ClubLogo";
import { MatchEventBanner, type MatchBannerItem } from "@/GameInterface/MatchEventBanner";
import { StatsPanel } from "@/GameInterface/StatsPanel";
import { MatchSummaryPanel, type MatchFeedItem, type SummaryTeamStats } from "@/GameInterface/MatchSummaryPanel";
import { PenaltyShootoutStrip } from "@/GameInterface/Components/PenaltyShootoutStrip";
import { useCurrentUser } from "@/GameInterface/AuthGate";
import { ReportModal } from "@/GameInterface/Components/ReportModal";

// Dev-only: DebugPanel pulls in react-json-view-lite (and its CSS, a side-effect
// import that prevents tree-shaking). Loading it via a lazy() guarded by
// process.env.NODE_ENV — which Bun's `define` constant-folds at build time —
// makes the entire dynamic import disappear from production bundles.
/** Stats and Debug buttons, their panels and the engine debug mode exist only outside production (#97). */
const DEV_TOOLS = process.env.NODE_ENV !== "production";
const DebugPanel = DEV_TOOLS
  ? lazy(() => import("@/GameInterface/DebugPanel").then(m => ({ default: m.DebugPanel })))
  : null;

import { GoalOverlay } from "@/GameInterface/GoalOverlay";
import { MatchOverlay } from "@/GameInterface/MatchOverlay";
import { displaySides, displayTeam, isAwayView, toDisplayPair } from "@/GameInterface/matchSides";
import { buildPlayedMatchRecording } from "@/GameInterface/buildPlayedMatchRecording";
import { groupAdvanceApi } from "@/GameInterface/World/groupAdvanceApi";
import { useLiveRivals } from "@/GameInterface/World/useLiveRivals";
import { FriendsButton } from "@/GameInterface/Social/FriendsButton";
import { LiveRivalsStrip } from "@/GameInterface/World/LiveRivalsStrip";
import { MATCH_POPUPS_ID } from "@/GameInterface/Social/ChatPopups";
import type { LivePhase } from "@/types/rivalsTypes";
import { RIVALS } from "@/Domain/rivals/rivalsConfig";
import {
  clearPendingRecording,
  isTerminalGroupError,
  liveSendFailureUrl,
  sendWithRetry,
  storePendingRecording,
} from "@/GameInterface/World/groupAdvanceErrors";
import type { ManagerCardRecord } from "@/Domain/advanceDay/matches";
import { resolveComplaint } from "@/GameEngine/Domain/Var";
import { VAR_CONFIG } from "@/GameEngine/Configs/VarConfig";
import { resolveMatchTeamKitColors } from "@/GameInterface/matchTeamColors";
import { playerMatchEvents } from "@/GameInterface/matchPlayerEvents";
import { getBroadcastLine, onBroadcastLine } from "@/GameInterface/Broadcast/BroadcastLog";
import { Icon } from "@/GameInterface/Icons";
import { SegmentedTabs } from "@/GameInterface/ui/SegmentedTabs";
import { createUiStateThrottle, isUrgentStateChange, type UiStateThrottle } from "@/GameInterface/uiStateThrottle";
import {
  createPossessionHeatmap, exportPossessionHeatmap, importPossessionHeatmap, samplePossessionHeatmap,
  type PossessionHeatmap as HeatmapAcc,
} from "@/Domain/match/possessionHeatmap";
import { PossessionHeatmap } from "@/GameInterface/Components/PossessionHeatmap";
import { applyLiveTactics, withLiveAxis, withLiveStyle, type LiveTactics } from "@/Domain/tactics/liveTactics";
import type { TacticalAxes } from "@/types/tacticsTypes";
import { PenaltyOverlay } from "@/GameInterface/Penalty/PenaltyOverlay";
import { loadPenaltyMode } from "@/GameInterface/Penalty/penaltyMode";

// Pitch geometry: 120 yds + 2×2 yd goal nets = 124, width 80. Aspect locks the canvas to that ratio.
// No max cap — the pitch fills the available host space (which is itself constrained by the column
// layout: 100vh − header − broadcast vertically, and viewport − 2× team panel widths horizontally).
// PixiPitch is initialised with autoDensity: true so the canvas's CSS size matches the requested
// logical dims (any DPR multiplication only affects the backing-store buffer for HiDPI sharpness).
const PITCH_ASPECT = 124 / 80;
const PITCH_MIN_W = 320;
const PITCH_MIN_H = Math.round(PITCH_MIN_W / PITCH_ASPECT);

function fitPitch(containerW: number, containerH: number): { w: number; h: number } | null {
  if (containerW <= 0 || containerH <= 0) return null;
  const widthFromHeight = containerH * PITCH_ASPECT;
  let w: number, h: number;
  if (widthFromHeight <= containerW) { w = widthFromHeight; h = containerH; }
  else { w = containerW; h = containerW / PITCH_ASPECT; }
  return {
    w: Math.max(PITCH_MIN_W, Math.floor(w)),
    h: Math.max(PITCH_MIN_H, Math.floor(h)),
  };
}

/** Team A must come from a saved tactics file — no silent defaults. */
function assertSavedMyClubTactics(t: TacticsSave): void {
  if (!t.formation || typeof t.formation !== "string") {
    throw new Error("my club: tactics.formation is missing");
  }
  if (t.tactical_style == null || typeof t.tactical_style !== "string") {
    throw new Error("my club: tactics.tactical_style is missing");
  }
  if (!Array.isArray(t.lineup) || t.lineup.length !== 11) {
    throw new Error(
      `my club: starting lineup must have exactly 11 player IDs (got ${t.lineup?.length ?? 0})`,
    );
  }
  for (let i = 0; i < t.lineup.length; i++) {
    const id = t.lineup[i];
    if (typeof id !== "string" || id.length === 0) {
      throw new Error(`my club: tactics.lineup[${i}] is not a valid player id`);
    }
  }
}

/** Possession: game-seconds with the ball per team, only while the ball is in play (read on every emission). */
function accumulatePossession(
  acc: { A: number; B: number; lastTime: number; lastPhase: string },
  gs: GameState,
): void {
  const phase = gs.matchPhase ?? "";
  const dtGame = phase === acc.lastPhase ? gs.matchTime - acc.lastTime : 0;
  if (dtGame > 0 && isLivePhase(gs.matchPhase) && gs.ballHolderId != null) {
    const holder = gs.players.find((p) => p.id === gs.ballHolderId);
    if (holder) acc[holder.team] += dtGame;
  }
  acc.lastTime = gs.matchTime;
  acc.lastPhase = phase;
}

export function MatchScreen() {
  const { t, i18n } = useTranslation();
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [teamAMeta, setTeamAMeta] = useState<TeamMeta | undefined>();
  const [teamBMeta, setTeamBMeta] = useState<TeamMeta | undefined>();
  /** Squad ids behind the scoreboard crests — URLs are derived once the league catalog loads. */
  const [crestIds, setCrestIds] = useState<{ a: string; b?: string } | null>(null);
  /** Fixture being played (competition heading under the scoreboard, #81). */
  const [matchFixture, setMatchFixture] = useState<Fixture | null>(null);
  /** The user's club (the heading's "home/away" and the result). */
  const [myClubId, setMyClubId] = useState<string | undefined>();
  const matchHeadingText = useMatchHeading(useMemo(() => loadSession()?.saveId, []), matchFixture, myClubId);
  /**
   * Live match between two managers (multiplayer part 7, `/match?h2h=1`): the server runs the match, the page draws
   * it and sends commands. Engine team A is the home side there; `mySide` is the user's (always A in a solo match).
   */
  const h2hMode = useMemo(() => new URLSearchParams(window.location.search).get("h2h") === "1", []);
  const h2hModeRef = useRef(h2hMode);
  const [h2hTarget, setH2HTarget] = useState<{ saveId: string; fixtureId: string } | null>(null);
  const h2h = useH2HSocket(h2hTarget);
  const [mySide, setMySide] = useState<TeamId>("A");
  const mySideRef = useRef<TeamId>("A");
  /** When the last server state arrived (local ms): the clock runs on from it between two states. */
  const h2hStateAtRef = useRef(0);
  const [clockNow, setClockNow] = useState(0);
  /** Both match squads (starters + bench) for the faces on the pitch (#61). */
  const [faceRoster, setFaceRoster] = useState<Record<TeamId, {
    players: { id: string; nationality?: string | null }[];
    clubColors: readonly string[];
  }> | null>(null);
  const [debug, setDebug] = useState(false);
  const [showStats, setShowStats] = useState(false);
  /** Which side the left team card shows (#51): own team by default, flip to see the opponent. */
  const [panelTeam, setPanelTeam] = useState<TeamId>("A");
  // Testers can file a report without leaving the match (#46), same gate as TopNavigation.
  const isTester = !!useCurrentUser()?.isTester;
  const [reportOpen, setReportOpen] = useState(false);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const uiThrottleRef = useRef<UiStateThrottle<GameState> | null>(null);
  const deliveredStateRef = useRef<GameState | null>(null);
  const [gameSpeed, setGameSpeed] = useState<number>(1);
  /** Live-match mentality for team A (my club). Team B (AI) always stays balanced. Not saved. */
  const [mentality, setMentality] = useState<Mentality>(DEFAULT_MENTALITY);
  /** Stadium crowd and managers of the match (`match-setup`, spec 2026-10-08-match-visual §7). */
  /** Stadium of the home side (#149): name under the scoreboard, with the crowd. */
  const [venueName, setVenueName] = useState<string | null>(null);
  const [touchline, setTouchline] = useState<{
    crowd: MatchCrowd | null; managers: MatchManagers | null; referee: MatchSetupReferee | null; pitch: SetupPitch | null;
    conditions: { kickoff: string; weather: MatchWeather; sunset: string; date?: string } | null; sunSide: StadiumSun | null;
  } | null>(null);
  /** Gesture of the human's manager on a mentality change (a new `seq` plays it). */
  const [coachCue, setCoachCue] = useState<{ team: TeamId; kind: "attack" | "defend" | "balanced"; seq: number } | null>(null);
  // ── Complaint and VAR (`.claude/rules/game/var.md` §4) ──
  /** A call against the user's side opens the "Complain" button (`seq` = the call, one complaint per call). */
  const [complaint, setComplaint] = useState<{ seq: number; until: number } | null>(null);
  const complaintSeqRef = useRef(0);
  const complainedSeqRef = useRef(-1);
  const complaintsMadeRef = useRef(0);
  const managerCardsRef = useRef<ManagerCardRecord[]>([]);
  const complaintMoraleRef = useRef(false);
  /** The user's manager is off the touchline: banned before the match or sent off in it. */
  const [managerOut, setManagerOut] = useState<"banned" | "sentOff" | null>(null);
  const [coachCard, setCoachCard] = useState<{ team: TeamId; card: "yellow" | "red"; seq: number } | null>(null);
  /** Team A's saved tactical style — set once from match-setup, read by mentality changes. */
  const myTacticalStyleRef = useRef<TacticalStyle>(DEFAULT_TACTICAL_STYLE);
  const myAxesOverrideRef = useRef<TacticsSave["axesOverride"]>(undefined);
  const myFamiliarityRef = useRef<FamiliarityLevels | undefined>(undefined);
  /** Live style and axes of team A (Etapa 35): this match only, never saved. `saved` = the club's tactics. */
  const [liveTactics, setLiveTactics] = useState<LiveTactics>({ style: DEFAULT_TACTICAL_STYLE });
  const savedTacticsRef = useRef<LiveTactics>({ style: DEFAULT_TACTICAL_STYLE });
  /** Possession heat map, filled on every emitted state (drawing only). */
  const heatmapRef = useRef<HeatmapAcc | null>(createPossessionHeatmap());
  const [showSubPanel, setShowSubPanel] = useState(false);
  /** Whether closing the substitution panel resumes play: only when the panel paused a running match. */
  const panelPauseRef = useRef<PanelPause>(NO_PANEL_PAUSE);
  const showSubPanelRef = useRef(false);
  useEffect(() => { showSubPanelRef.current = showSubPanel; }, [showSubPanel]);
  const [goalFlash, setGoalFlash] = useState<{
    team: TeamId;
    score: { A: number; B: number };
  } | null>(null);
  /**
   * Brief on-screen notice: injury (`docs/superpowers/specs/2026-09-28-injuries-design.md`), and
   * offside, dangerous free kick, card and penalty (Etapa 12, #17/#19).
   */
  const [notice, setNotice] = useState<{ text: string; tone: "danger" | "warn" | "info" } | null>(null);
  /** Broadcast strip at the bottom of the pitch: goals, cards, substitutions (4.38.21). */
  const [banner, setBanner] = useState<MatchBannerItem | null>(null);
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bannerKeyRef = useRef(0);
  const crestOfRef = useRef<(tm: TeamId) => { logoUrl?: string; colors?: [string, string] }>(() => ({}));
  /** Goals, penalties and offsides as they happen (cards, subs and injuries come from `gameState`). */
  const [eventFeed, setEventFeed] = useState<MatchFeedItem[]>([]);
  const penaltyGoalPendingRef = useRef(false);
  /** Game-seconds of possession per team, accumulated from `gameState` (live phases only). */
  const possessionRef = useRef<{ A: number; B: number; lastTime: number; lastPhase: string }>({ A: 0, B: 0, lastTime: 0, lastPhase: "" });
  const teamNamesRef = useRef<{ A: string; B: string }>({ A: "A", B: "B" });
  const [matchOverlay, setMatchOverlay] = useState<"halfTime" | "extraTime" | "matchEnd" | null>(null);
  /**
   * 0..1 elapsed fraction driving the full-time overlay's progress bar. Unlike half-time /
   * extra-time (whose pause is tracked by the engine's own `presentationCountdown`, read
   * every frame into `breakProgress`), `matchEnd` freezes the engine entirely — there is no
   * engine value left counting down — so this is driven by a rAF loop timed against the same
   * speed-scaled delay used to schedule the navigation to the result screen.
   */
  const [matchEndProgress, setMatchEndProgress] = useState(0);
  const matchEndAnimRef = useRef<number | null>(null);
  /**
   * 0..1 elapsed fraction of the half-time / extra-time break, read every frame off the engine's own
   * `presentationCountdown` in `gameStateRef` (the React `gameState` only updates ~10 times a second).
   */
  const [breakProgress, setBreakProgress] = useState(0);
  /** Mirrors `gameSpeed` for the gameBus handlers below, which are registered once (`[]` deps)
   *  and would otherwise close over the initial render's speed forever. */
  const gameSpeedRef = useRef(gameSpeed);
  useEffect(() => { gameSpeedRef.current = gameSpeed; }, [gameSpeed]);
  const [ratings, setRatings] = useState<Record<number, number>>(() => getAllRatings());
  /**
   * Every player seen on the pitch, so a sent-off player can still be listed (#69). Filled on every
   * `stateChanged` emission: a player only leaves the pitch inside a simulated step, and every step's state
   * reaches that handler, so he was always registered before (the initial state never has a departed player).
   */
  const knownPlayersRef = useRef(new Map<number, GamePlayer>());
  const [selectedPlayerId, setSelectedPlayerId] = useState<number | null>(null);
  const [broadcastLine, setBroadcastLine] = useState(() => getBroadcastLine());
  const [pitchSize, setPitchSize] = useState<{ w: number; h: number } | null>(null);
  // Two-phase render: layout paints first with a loader in the host slot, then we measure on the
  // next animation frame (once the layout has settled) and mount PixiPitch with the measured size.
  // ResizeObserver is intentionally avoided — it can fire during PixiPitch's own layout reflow and
  // create a remount feedback loop.
  const pitchHostElRef = useRef<HTMLDivElement | null>(null);
  const measurePitch = useCallback(() => {
    const host = pitchHostElRef.current;
    if (!host) return;
    const rect = host.getBoundingClientRect();
    // The pitch column is sized to the pitch so the side cards hug it; the width available to the
    // pitch is the whole row minus the two side cards, not the (already shrunk) column itself.
    const column = host.parentElement;
    const row = column?.parentElement;
    const sides =
      (column?.previousElementSibling?.getBoundingClientRect().width ?? 0) +
      (column?.nextElementSibling?.getBoundingClientRect().width ?? 0);
    const availableWidth = row ? row.getBoundingClientRect().width - sides : rect.width;
    const next = fitPitch(availableWidth, rect.height);
    if (!next) return;
    setPitchSize((prev) => (prev && prev.w === next.w && prev.h === next.h ? prev : next));
  }, []);
  const pitchHostRef = useCallback(
    (host: HTMLDivElement | null) => {
      pitchHostElRef.current = host;
      if (host) requestAnimationFrame(measurePitch);
    },
    [measurePitch],
  );
  useEffect(() => {
    window.addEventListener("resize", measurePitch);
    return () => window.removeEventListener("resize", measurePitch);
  }, [measurePitch]);
  const goalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const injuryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const overlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const matchEndFinalizeRef = useRef(false);
  const gameStateRef = useRef<GameState | null>(null);
  // Rivals (multiplayer part 6): in a friends' league the friends' live scores show above the pitch, and this
  // match's score goes to them (`live_score`). Never in solo, never in a national team's game.
  const liveTarget = useMemo(() => {
    const s = loadSession();
    return s?.groupAdvance && s.saveId && s.seatId ? { saveId: s.saveId, seatId: s.seatId } : null;
  }, []);
  const liveRivals = useLiveRivals(liveTarget);
  const sendLiveRef = useRef(liveRivals.send);
  sendLiveRef.current = liveRivals.send;
  const liveFixtureRef = useRef<string | null>(null);
  const matchContextRef = useRef<{
    fixture: Fixture;
    mySquadId: string;
    homeSquad: Squad;
    awaySquad: Squad;
    /** Group world: the day and fixture the recording belongs to (`match-setup` → `matchDay`). */
    matchDay: { date: string; fixtureId: string } | null;
  } | null>(null);
  /**
   * Resume after a reload (#64): `matchResume.ts`. `matchKeyRef` is set once the match is built;
   * `recordedRef` stops snapshots once the result has been saved. The other refs mirror state the
   * snapshot needs but that lives in React state.
   */
  const matchKeyRef = useRef<string | null>(null);
  const recordedRef = useRef(false);
  const mentalityRef = useRef<Mentality>(DEFAULT_MENTALITY);
  useEffect(() => { mentalityRef.current = mentality; }, [mentality]);
  const eventFeedRef = useRef<MatchFeedItem[]>([]);
  useEffect(() => { eventFeedRef.current = eventFeed; }, [eventFeed]);
  const aiTacticsRef = useRef<TeamTacticsSnapshot>({ style: DEFAULT_TACTICAL_STYLE, mentality: DEFAULT_MENTALITY });
  /** Starts the full-time sequence (overlay + recording); set by the `matchEnd` handler below. */
  const startMatchEndRef = useRef<(() => void) | null>(null);

  // Load match setup — team A requires saved tactics + 11-man lineup (see /api/match-setup?saveId=…)
  useEffect(() => {
    const session = loadSession();
    if (!session?.saveId) {
      setLoadError(t("match.noActiveSave"));
      return;
    }

    // live=1: against another seat the server refuses (multiplayer part 4, simulated only).
    const url = `/api/match-setup?saveId=${encodeURIComponent(session.saveId)}&live=1${h2hModeRef.current ? "&h2h=1" : ""}`;

    fetch(url)
      .then(async (r) => {
        const body = await readJsonBody(r);
        if (!r.ok) {
          // Against another seat (multiplayer part 1): no live match, the preview simulates it.
          const msg = body.error === "seatOpponent"
            ? t("matchPreview.seatOpponentText")
            : typeof body.error === "string" ? body.error : `match-setup failed (${r.status})`;
          throw new Error(msg);
        }
        return body as {
          save: { leagueSlug: string; clubId: string; clubName: string; clubColors: [string, string] };
          mySquad: Squad;
          mySquadId: string;
          fixture: Fixture;
          opponentSquad: Squad | null;
          myFormation: Formation;
          oppFormation: Formation;
          myLineup: string[];
          myTactics: TacticsSave;
          /** Man-marking chosen for this match in the preview (player instructions). */
          matchMarking?: { date: string; marks: { slot: number; targetId: string }[] } | null;
          crowd?: MatchCrowd | null;
          managers?: MatchManagers | null;
          /** Referee of the match (`referees.md`): his rigor plays in the engine, the screens show the band. */
          referee?: MatchSetupReferee | null;
          /** Grass, mowing and condition of the pitch (spec 2026-10-16-pitch-types). */
          pitch?: SetupPitch | null;
          /** Kickoff, weather and sunset of the match, and where the sun sets over the stadium (match light). */
          conditions?: { kickoff: string; weather: MatchWeather; sunset: string; date?: string } | null;
          weatherEffect?: import("@/Domain/matchday/matchWeatherEffect").WeatherOfMatch | null;
          sunSide?: StadiumSun | null;
          /** Players each side may name for this competition (registration); null = everyone. */
          registered?: { mine: string[]; opp: string[] } | null;
          /** The user's manager serves a touchline ban in this match (`var.md` §4). */
          managerBanned?: boolean;
          /** His national team's game (Etapa 41b): the teams are nations. */
          national?: { teamId: string; competition: string } | null;
          matchDay?: { date: string; fixtureId: string } | null;
          /** Against another seat with `h2h=1`: the server runs this match (multiplayer part 7). */
          h2h?: boolean;
          /** An AI opponent's morale from its form (absent: own / neutral). */
          oppMorale?: number;
        };
      })
      .then((data) => {
        if (h2hModeRef.current) {
          // Live match between two managers: no local state; the server sends it once the page joined.
          const opp = data.opponentSquad;
          if (!data.h2h || !opp || !data.fixture) throw new Error(t("h2h.closed.failed"));
          const side: TeamId = data.fixture.home === data.mySquadId ? "A" : "B";
          mySideRef.current = side;
          setMySide(side);
          setPanelTeam(side);
          const mine: TeamMeta = { name: data.save.clubName, primaryColor: data.save.clubColors[0], secondaryColor: data.save.clubColors[1] };
          const theirs: TeamMeta = { name: opp.name, primaryColor: opp.colors[0], secondaryColor: opp.colors[1] };
          setTeamAMeta(side === "A" ? mine : theirs);
          setTeamBMeta(side === "A" ? theirs : mine);
          setCrestIds({ a: data.fixture.home, b: data.fixture.away });
          setMyClubId(data.mySquadId);
          setMatchFixture(data.fixture);
          const homeSquad = side === "A" ? data.mySquad : opp;
          setVenueName(homeSquad.venue?.name ?? null);
          setTouchline({
            crowd: data.crowd ?? null, managers: data.managers ?? null, referee: data.referee ?? null, pitch: data.pitch ?? null,
            conditions: data.conditions ?? null, sunSide: data.sunSide ?? null,
          });
          if (data.managerBanned) setManagerOut("banned");
          const mineRoster = { players: data.mySquad.players, clubColors: data.save.clubColors };
          const oppRoster = { players: opp.players, clubColors: opp.colors };
          setFaceRoster(side === "A" ? { A: mineRoster, B: oppRoster } : { A: oppRoster, B: mineRoster });
          const style = data.myTactics?.tactical_style ?? DEFAULT_TACTICAL_STYLE;
          myTacticalStyleRef.current = style;
          myAxesOverrideRef.current = data.myTactics?.axesOverride;
          savedTacticsRef.current = { style, axesOverride: data.myTactics?.axesOverride };
          setLiveTactics({ style, axesOverride: data.myTactics?.axesOverride });
          initRatings([]);
          initStats([]);
          setH2HTarget({ saveId: session.saveId, fixtureId: data.matchDay?.fixtureId ?? data.fixture.id });
          return;
        }
        if (!data.myTactics) {
          throw new Error("my club: missing myTactics in match setup response");
        }
        assertSavedMyClubTactics(data.myTactics);
        if (!data.myFormation?.id) {
          throw new Error("my club: missing formation data");
        }
        if (data.myFormation.id !== data.myTactics.formation) {
          throw new Error(
            `formation mismatch: file "${data.myFormation.id}" vs tactics "${data.myTactics.formation}"`,
          );
        }

        const tactics = data.myTactics;
        // A snapshot of this very match (same save, day and fixture) means the page was reloaded
        // mid-match (#64): rebuild from it instead of kicking off again. Any other snapshot is
        // stale and gets dropped by `loadMatchSnapshot`.
        const key = matchKey(session.saveId, data.fixture);
        const snap = loadMatchSnapshot(key);
        matchKeyRef.current = key;

        const teamA: TeamTacticsSnapshot = snap?.tactics.A ?? {
          style: tactics.tactical_style,
          mentality: DEFAULT_MENTALITY,
          axesOverride: tactics.axesOverride,
          // Style familiarity (`src/Domain/familiarity`): the club's trained record; the AI its rule.
          familiarity: squadFamiliarityLevels(data.mySquad, tactics.tactical_style),
        };
        const teamB: TeamTacticsSnapshot = snap?.tactics.B ?? {
          style: DEFAULT_TACTICAL_STYLE,
          mentality: DEFAULT_MENTALITY,
          familiarity: aiFamiliarity(DEFAULT_TACTICAL_STYLE),
        };
        myTacticalStyleRef.current = teamA.style;
        myAxesOverrideRef.current = teamA.axesOverride;
        savedTacticsRef.current = teamA.saved ?? { style: teamA.style, axesOverride: teamA.axesOverride };
        setLiveTactics({ style: teamA.style, axesOverride: teamA.axesOverride });
        myFamiliarityRef.current = teamA.familiarity;
        aiTacticsRef.current = teamB;
        mentalityRef.current = teamA.mentality;
        setMentality(teamA.mentality);
        // Exclude injured players from the whole candidate pool — starters AND bench (an injured
        // player must never be available as a substitute either). `data.myLineup` is already
        // injury-aware (`/api/match-setup` → `resolveUserLineup`), but the full squad list itself
        // (used here as the bench source too) is not filtered until now.
        // Registration (`.claude/rules/game/registration.md`): a player not registered for this competition (or
        // over the per-match foreign limit) is out of the pool too, starters and bench.
        const matchDate = data.fixture.date;
        const mineOk = data.registered ? new Set(data.registered.mine) : null;
        const oppOk = data.registered && data.opponentSquad ? new Set(data.registered.opp) : null;
        const myEligiblePlayers = eligibleLivePlayers(data.mySquad.players, matchDate, mineOk);
        const opponentPlayers = eligibleLivePlayers(data.opponentSquad?.players ?? data.mySquad.players, matchDate, oppOk);
        // Morale (`.claude/rules/game/morale.md`): every player at his own stored value — the AI side
        // stores none (neutral). No team override from another screen may leak into a real match.
        // An AI opponent plays at its form's morale (`aiFormMorale`, from match-setup).
        const oppMorale = typeof data.oppMorale === "number" ? data.oppMorale : data.opponentSquad ? "own" as const : "neutral" as const;
        // Fresh match: the shared builder (`src/Domain/match/liveMatchSetup.ts`, also the H2H worker's). The user is
        // side A; player instructions and man-marking only for his side (the AI side never has any).
        // A resumed match keeps its state; only the per-team engine configs are re-applied.
        if (snap) applyLiveSideConfigs({ A: { tactics: teamA, morale: "own" }, B: { tactics: teamB, morale: oppMorale } });
        const state: GameState = snap
          ? snap.state
          : buildLiveMatchState({
              A: {
                players: myEligiblePlayers,
                formation: data.myFormation,
                lineup: data.myLineup,
                tactics: teamA,
                staffInjuryMult: staffEffectsOf(data.mySquad).injuryMult,
                morale: "own",
                human: true,
                slotInstructions: tactics.slotInstructions,
                marks: (data.matchMarking?.marks ?? []).map((m) => ({ slot: m.slot, targetRosterId: m.targetId })),
                setPieceTakers: tactics.setPieceTakers,
                managerBanned: data.managerBanned === true,
                // Chosen in the preview: kick and save the penalties in 2D.
                penalty2d: loadPenaltyMode() === "manual",
                ...(data.mySquad.managerAttributes ? { managerDiscipline: data.mySquad.managerAttributes.discipline } : {}),
              },
              B: {
                players: opponentPlayers,
                formation: data.oppFormation,
                tactics: teamB,
                ...(data.opponentSquad ? { staffInjuryMult: staffEffectsOf(data.opponentSquad).injuryMult } : {}),
                morale: oppMorale,
                human: false,
              },
              date: matchDate,
              knockout: data.fixture.knockout === true,
              ...(data.fixture.aggregate
                ? { aggregate: data.fixture.home === data.mySquadId
                      ? { A: data.fixture.aggregate.home, B: data.fixture.aggregate.away }
                      : { A: data.fixture.aggregate.away, B: data.fixture.aggregate.home } }
                : {}),
              ...(data.pitch ? { pitch: { condition: data.pitch.condition, turf: data.pitch.turf } } : {}),
              // Weather that plays (`.claude/rules/game/weather.md`): a closed roof plays it neutral.
              ...(data.weatherEffect ? { weather: data.weatherEffect.effective } : {}),
              ...(data.referee ? { referee: {
                id: data.referee.id, name: data.referee.name, country: data.referee.country, strictness: data.referee.strictness,
                // Errors and VAR (`var.md`): the quality the day advance uses too.
                ...(typeof data.referee.quality === "number" ? { quality: data.referee.quality } : {}),
                ...(data.referee.var ? { var: true } : {}),
              } } : {}),
            });
        if (snap) {
          importStatsState(snap.stats);
          importRatings(snap.ratings);
          setGameSpeed(snap.ui.gameSpeed);
          setEventFeed(snap.ui.eventFeed);
          eventFeedRef.current = snap.ui.eventFeed;
          possessionRef.current = {
            A: snap.ui.possession.A, B: snap.ui.possession.B,
            lastTime: state.matchTime, lastPhase: state.matchPhase,
          };
          heatmapRef.current = importPossessionHeatmap(snap.ui.heatmap, state);
          // Resume paused at the same minute; the overlay of a break in progress comes back too
          // (its gameBus event already fired before the reload).
          setPaused(true);
          if (state.matchPhase === "halfTime") setMatchOverlay("halfTime");
          else if (state.matchPhase === "extraTimeBreak") setMatchOverlay("extraTime");
          showNotice(t("match.resumed"), "info");
        } else {
          initRatings(state.players.map(p => p.id));
          initStats(state.players.map(p => ({ id: p.id, team: p.team })));
        }
        setRatings(getAllRatings());
        setGameState(state);
        gameStateRef.current = state;
        // Reloaded after full time but before the result was saved: record it now.
        if (snap && state.matchPhase === "matchEnd") startMatchEndRef.current?.();

        const opp = data.opponentSquad!;
        const homeSquad = data.fixture.home === data.mySquadId ? data.mySquad : opp;
        const awaySquad = data.fixture.away === data.mySquadId ? data.mySquad : opp;
        matchContextRef.current = {
          fixture: data.fixture,
          mySquadId: data.mySquadId,
          homeSquad,
          awaySquad,
          matchDay: data.matchDay ?? null,
        };

        // National teams (Etapa 41b): the nation's name in the player's language.
        const teamName = (n: string) => (data.national ? nationalityDisplayName(n, i18n.language, t) : n);
        setTeamAMeta({
          name: teamName(data.save.clubName),
          primaryColor: data.save.clubColors[0],
          secondaryColor: data.save.clubColors[1],
        });
        if (data.opponentSquad) {
          setTeamBMeta({
            name: teamName(data.opponentSquad.name),
            primaryColor: data.opponentSquad.colors[0],
            secondaryColor: data.opponentSquad.colors[1],
          });
        }
        setCrestIds({ a: data.mySquadId, b: data.opponentSquad?.id });
        setMyClubId(data.mySquadId);
        setMatchFixture(data.fixture);
        liveFixtureRef.current = liveTarget && !data.national ? (data.matchDay?.fixtureId ?? data.fixture.id) : null;
        // Resumed after a reload: `matchStart` never fires again, so tell the friends where the game is (a `start`
        // frame rebuilds the live entry even when the server dropped it meanwhile).
        if (snap && liveFixtureRef.current && state.matchPhase !== "matchEnd" && state.matchPhase !== "preMatch") {
          sendLiveRef.current({
            fixtureId: liveFixtureRef.current, phase: state.matchPhase === "halfTime" ? "half" : "start", minute: Math.max(0, Math.min(130, matchMinute(state))),
            score: { for: state.score.A, against: state.score.B },
          });
        }
        setVenueName(homeSquad.venue?.name ?? null);
        setTouchline({
          crowd: data.crowd ?? null, managers: data.managers ?? null, referee: data.referee ?? null, pitch: data.pitch ?? null,
          conditions: data.conditions ?? null, sunSide: data.sunSide ?? null,
        });
        if (data.managerBanned) setManagerOut("banned");
        setFaceRoster({
          A: { players: myEligiblePlayers, clubColors: data.save.clubColors },
          B: { players: opponentPlayers, clubColors: data.opponentSquad?.colors ?? data.save.clubColors },
        });
      })
      .catch((e: unknown) => {
        setLoadError(e instanceof Error ? e.message : String(e));
      });
  }, []);

  // The pitch emits every simulated frame; the ref and the per-frame accumulators (possession, players seen)
  // follow every emission, the React state at most every UI_STATE_INTERVAL_MS (spec 2026-10-06 §2): at once on
  // a phase or score change and while paused (UI edits, commands).
  useEffect(() => {
    const throttle = createUiStateThrottle<GameState>({
      deliver: (gs) => {
        deliveredStateRef.current = gs;
        setGameState(gs);
      },
      isUrgent: isUrgentStateChange,
    });
    uiThrottleRef.current = throttle;
    const off = gameBus.on("stateChanged", (s) => {
      const next = {
        ...s,
        score: s.score ?? { A: 0, B: 0 },
        tackleCooldown: s.tackleCooldown ?? 0,
        setPiece: s.setPiece ?? null,
        decisions: s.decisions ?? {},
      };
      gameStateRef.current = next;
      accumulatePossession(possessionRef.current, next);
      if (heatmapRef.current) samplePossessionHeatmap(heatmapRef.current, next);
      for (const p of next.players) knownPlayersRef.current.set(p.id, p);
      throttle.push(next, pausedRef.current);
    });
    return () => {
      off();
      throttle.cancel();
      uiThrottleRef.current = null;
    };
  }, []);

  // H2H: every server state is the screen's state (and the pitch's, through `matchStateSync`); the per-frame
  // accumulators (possession, heat map, players seen) sample it.
  useEffect(() => {
    const next = h2h.state;
    if (!h2hModeRef.current || !next) return;
    h2hStateAtRef.current = performance.now();
    gameStateRef.current = next;
    accumulatePossession(possessionRef.current, next);
    if (heatmapRef.current) samplePossessionHeatmap(heatmapRef.current, next);
    for (const p of next.players) knownPlayersRef.current.set(p.id, p);
    deliveredStateRef.current = next;
    setGameState(next);
  }, [h2h.state]);

  // H2H: the room says which side is the user's (the fixture already did; the room wins).
  useEffect(() => {
    if (!h2h.mySide || h2h.mySide === mySideRef.current) return;
    mySideRef.current = h2h.mySide;
    setMySide(h2h.mySide);
    setPanelTeam(h2h.mySide);
  }, [h2h.mySide]);

  // H2H: the clock runs on between two states (they come every second).
  useEffect(() => {
    if (!h2hMode) return;
    const id = setInterval(() => setClockNow(performance.now()), 250);
    return () => clearInterval(id);
  }, [h2hMode]);

  // H2H: full time is recorded by the server; both pages go to the provisional result.
  useEffect(() => {
    if (!h2h.done) return;
    const date = h2h.room?.date ?? matchFixture?.date;
    const id = setTimeout(() => {
      window.location.href = date ? `/match-result?date=${encodeURIComponent(date)}&pending=1` : "/match-result?pending=1";
    }, MATCH_END_TO_RESULT_MS);
    return () => clearTimeout(id);
  }, [h2h.done]); // eslint-disable-line react-hooks/exhaustive-deps

  // H2H: the room closed (simulated, the other left, the server lost it): back to the dashboard.
  useEffect(() => {
    if (!h2h.closed) return;
    const id = setTimeout(() => { window.location.href = "/dashboard"; }, 3000);
    return () => clearTimeout(id);
  }, [h2h.closed]);

  // Pausing hands the latest state over at once: the substitution panel and the instructions edit it.
  useEffect(() => {
    pausedRef.current = paused;
    if (paused) uiThrottleRef.current?.flush();
  }, [paused]);

  // React-side edits (substitution panel, resume) land in `gameState` first: keep the ref on them. A state the
  // throttle delivered is already in the ref (or behind it), so it never moves the ref back.
  useEffect(() => {
    if (gameState !== deliveredStateRef.current) gameStateRef.current = gameState;
  }, [gameState]);

  /** Keep PixiPitch internal stateRef aligned with React (pending subs, formation, etc.). */
  useEffect(() => {
    if (!gameState) return;
    gameBus.emit("matchStateSync", gameState);
  }, [gameState]);

  useEffect(() => {
    return gameBus.on("ratingsUpdated", (r) => setRatings({ ...r }));
  }, []);

  useEffect(() => {
    return gameBus.on("goalScored", (data) => {
      if (goalTimerRef.current) clearTimeout(goalTimerRef.current);
      setGoalFlash(data);
      goalTimerRef.current = setTimeout(() => setGoalFlash(null), 2800);
    });
  }, []);

  useEffect(() => {
    const send = (phase: LivePhase, minute: number, score: { A: number; B: number }, scorer?: string) => {
      const fixtureId = liveFixtureRef.current;
      if (!fixtureId) return;
      sendLiveRef.current({
        fixtureId, phase, minute: Math.max(0, Math.min(130, minute)),
        score: { for: score.A, against: score.B }, ...(scorer ? { scorer } : {}),
      });
    };
    const now = () => gameStateRef.current;
    // The clock for the friends: a `minute` frame every LIVE_MINUTE_STEP minutes of play (checked each second).
    let lastMinute = 0;
    // Substitutions go to the friends from the match record (the engine event has no names): -1 = not read yet (a
    // resumed match does not send the old ones again).
    let subsSent = -1;
    const clock = setInterval(() => {
      const s = now();
      const fixtureId = liveFixtureRef.current;
      if (s && fixtureId && s.matchPhase !== "preMatch") {
        if (subsSent < 0) subsSent = s.substitutions.length;
        for (const sub of s.substitutions.slice(subsSent)) {
          sendLiveRef.current({
            fixtureId, phase: "sub", minute: Math.max(0, Math.min(130, sub.matchMinute)),
            score: { for: s.score.A, against: s.score.B }, scorer: sub.playerOutName, playerIn: sub.playerInName,
            side: sub.team === "A" ? "for" : "against",
          });
        }
        subsSent = s.substitutions.length;
      }
      if (!s || !isLivePhase(s.matchPhase)) return;
      const m = matchMinute(s);
      if (m - lastMinute < RIVALS.LIVE_MINUTE_STEP) return;
      lastMinute = m;
      send("minute", m, s.score);
    }, 1000);
    const offs = [
      gameBus.on("matchStart", () => { lastMinute = 0; subsSent = 0; send("start", 0, now()?.score ?? { A: 0, B: 0 }); }),
      gameBus.on("goalScored", (e) => send("goal", e.minute, e.score, now()?.players.find((p) => p.id === e.scorerId)?.name)),
      gameBus.on("goalDisallowed", (e) => send("disallowed", e.minute, e.score)),
      gameBus.on("card", (e) => {
        const s = now();
        const fixtureId = liveFixtureRef.current;
        if (!s || !fixtureId) return;
        sendLiveRef.current({
          fixtureId, phase: e.card, minute: Math.max(0, Math.min(130, e.minute)),
          score: { for: s.score.A, against: s.score.B }, scorer: e.playerName, side: e.team === "A" ? "for" : "against",
        });
      }),
      gameBus.on("halfTime", (e) => send("half", 45, e.score)),
      gameBus.on("matchEnd", (e) => {
        const s = now();
        send("end", s ? matchMinute(s) : 90, e.score);
      }),
    ];
    return () => { clearInterval(clock); offs.forEach((off) => off()); };
  }, []);

  // Watching (spec 2026-10-29-friend-match-broadcast-design): while a friend of the league watches this match
  // (`watch_on`), the pitch's positions, the state and the engine events go to him through the server. A match between
  // two managers runs in the server, which relays it itself.
  const relayLive = liveRivals.relay;
  const watchLookRef = useRef<WatchLook | null>(null);
  useEffect(() => {
    const saveId = liveTarget?.saveId;
    if (!liveRivals.watched || h2hModeRef.current || !saveId) return;
    let benchSig = "";
    let lookSent: WatchLook | null = null;
    let soon: ReturnType<typeof setTimeout> | null = null;
    const at = () => {
      const fixtureId = liveFixtureRef.current;
      const s = gameStateRef.current;
      return fixtureId && s ? { fixtureId, s } : null;
    };
    const sendFrame = () => {
      const cur = at();
      if (!cur) return;
      const ball = getBallPos(cur.s);
      relayLive({
        type: "relay_frame", saveId, fixtureId: cur.fixtureId, t: performance.now(), ball: [ball.x, ball.y],
        players: cur.s.players.map((p) => [p.id, Math.round(p.x * 100) / 100, Math.round(p.y * 100) / 100] as [number, number, number]),
        minute: matchMinute(cur.s), phase: cur.s.matchPhase, score: { ...cur.s.score },
      });
    };
    const sendState = () => {
      soon = null;
      const cur = at();
      if (!cur) return;
      const sig = `${cur.s.benchA.map((p) => p.id).join(",")}|${cur.s.benchB.map((p) => p.id).join(",")}`;
      const benches = sig !== benchSig;
      benchSig = sig;
      // The pitch look goes with the first state and again whenever it changes.
      const look = watchLookRef.current;
      const sendLook = !!look && look !== lookSent;
      if (sendLook) lookSent = look;
      relayLive({
        type: "relay_state", saveId, fixtureId: cur.fixtureId, state: wireState(cur.s, benches),
        stats: { teams: { A: getTeamStats("A"), B: getTeamStats("B") }, goals: getGoalLog(), ratings: exportRatings() },
        ...(sendLook && look ? { look } : {}),
      });
    };
    sendState();
    // Frames and states follow the simulation's steps (they keep coming with the tab hidden, where timers slow down).
    let lastFrameAt = 0;
    let lastStateAt = performance.now();
    const offStep = gameBus.on("stateChanged", () => {
      const now = performance.now();
      // Every simulation step (5 a second at 1x), never closer than FRAME_MIN_MS (2x / 4x).
      if (now - lastFrameAt >= WATCH.FRAME_MIN_MS) { lastFrameAt = now; sendFrame(); }
      if (now - lastStateAt >= WATCH.STATE_MS) { lastStateAt = now; sendState(); }
    });
    const offs = [...WATCH_EVENTS].map((name) => gameBus.on(name as keyof GameEvents, (payload: unknown) => {
      const cur = at();
      if (!cur) return;
      relayLive({ type: "relay_event", saveId, fixtureId: cur.fixtureId, name, payload });
      if (!soon) soon = setTimeout(sendState, 100);
    }));
    return () => {
      offStep();
      if (soon) clearTimeout(soon);
      offs.forEach((off) => off());
    };
  }, [liveRivals.watched, relayLive, liveTarget]);

  const showBanner = useCallback((item: Omit<MatchBannerItem, "key">) => {
    if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
    bannerKeyRef.current += 1;
    setBanner({ ...item, key: bannerKeyRef.current });
    bannerTimerRef.current = setTimeout(() => setBanner(null), 4000);
  }, []);

  const showNotice = useCallback((text: string, tone: "danger" | "warn" | "info") => {
    if (injuryTimerRef.current) clearTimeout(injuryTimerRef.current);
    setNotice({ text, tone });
    injuryTimerRef.current = setTimeout(() => setNotice(null), 3500);
  }, []);

  useEffect(() => {
    const nameOf = (id: number) => gameStateRef.current?.players.find((p) => p.id === id)?.name ?? "";
    const minuteNow = () => (gameStateRef.current ? matchMinute(gameStateRef.current) : 0);
    const team = (tm: TeamId) => teamNamesRef.current[tm];
    const push = (item: MatchFeedItem) => setEventFeed((f) => [...f, item]);
    const offs = [
      gameBus.on("injury", (data) => {
        showNotice(
          t("match.injuryNotice", { player: shirtName(data.playerName), severity: t(`match.injurySeverity.${data.severity}`) }),
          "danger",
        );
      }),
      // #140: an injured player of the user's side left with no replacement: pause and open the
      // substitutions, with the injured player and the suggested bench player marked.
      gameBus.on("injuryNeedsSub", (e) => {
        if (e.team !== mySideRef.current) return;
        if (h2hModeRef.current) {
          // The server runs the match: the panel opens, the match does not stop (pauses are counted).
          showSubPanelRef.current = true;
          setShowSubPanel(true);
          return;
        }
        panelPauseRef.current = openPanelPause(panelPauseRef.current, showSubPanelRef.current, pausedRef.current);
        showSubPanelRef.current = true;
        setPaused(true);
        setShowSubPanel(true);
      }),
      gameBus.on("offsideCalled", (e) => {
        push({ minute: minuteNow(), team: e.team, kind: "offside", player: nameOf(e.receiverId) });
        showNotice(t("match.notice.offside", { player: shirtName(nameOf(e.receiverId)), team: team(e.team) }), "info");
      }),
      gameBus.on("freeKickAwarded", (e) => {
        if (e.dangerous) showNotice(t("match.notice.freeKick", { team: team(e.team) }), "warn");
      }),
      gameBus.on("card", (e) => {
        const key = e.card === "yellow" ? "yellow" : e.secondYellow ? "secondYellow" : "red";
        showBanner({
          kind: e.card === "yellow" ? "yellow" : "red",
          title: t(`match.banner.${key}`),
          line: t("match.banner.cardLine", { player: shirtName(e.playerName), team: team(e.team), minute: minuteNow() + 1 }),
        });
      }),
      gameBus.on("playerSubstituted", (e) => {
        const s = gameStateRef.current;
        const all = s ? [...s.players, ...s.benchA, ...s.benchB] : [];
        const name = (id: number) => shirtName(all.find((p) => p.id === id)?.name ?? "");
        showBanner({
          kind: "sub",
          title: t("match.banner.sub"),
          line: t("match.banner.subLine", { out: name(e.outId), in: name(e.inId), team: team(e.team), minute: minuteNow() + 1 }),
          ...crestOfRef.current(e.team),
        });
      }),
      gameBus.on("penaltyAwarded", (e) => {
        showNotice(t("match.notice.penalty", { team: team(e.team) }), "warn");
      }),
      gameBus.on("penaltyResolved", (e) => {
        if (e.scored) penaltyGoalPendingRef.current = true;
        else push({ minute: minuteNow(), team: e.team, kind: "penaltyMissed", player: nameOf(e.takerId) });
      }),
      gameBus.on("goalScored", (e) => {
        const kind = penaltyGoalPendingRef.current ? "penaltyGoal" : "goal";
        penaltyGoalPendingRef.current = false;
        push({ minute: minuteNow(), team: e.team, kind, player: nameOf(e.scorerId) });
        const assist = e.assistId !== undefined ? nameOf(e.assistId) : "";
        showBanner({
          kind: "goal",
          title: t("match.banner.goal", { player: shirtName(nameOf(e.scorerId)) }),
          line: assist && kind === "goal"
            ? t("match.banner.goalLineAssist", { minute: e.minute + 1, team: team(e.team), assist: shirtName(assist) })
            : t("match.banner.goalLine", { minute: e.minute + 1, team: team(e.team) }),
          ...crestOfRef.current(e.team),
        });
      }),
      // VAR (`var.md` §3): the check shows as a notice, the decision in the feed.
      gameBus.on("varCheck", (e) => {
        showNotice(t("var.checking", { what: t(`var.kind.${e.kind}`) }), "info");
      }),
      gameBus.on("varReview", (e) => {
        const overturned = e.outcome === "overturned";
        showNotice(t(`var.decision.${e.kind}.${e.outcome}`), overturned ? "warn" : "info");
        if (e.kind !== "goal") {
          push({ minute: minuteNow(), team: e.against === "A" ? "B" : "A", kind: overturned ? "varOverturned" : "varConfirmed", player: "", what: t(`var.decision.${e.kind}.${e.outcome}`) });
        }
      }),
      gameBus.on("goalDisallowed", (e) => {
        push({ minute: minuteNow(), team: e.team, kind: "goalDisallowed", player: nameOf(e.scorerId) });
      }),
    ];
    return () => offs.forEach((off) => off());
  }, [t, showNotice, showBanner]);

  // Complaint (`var.md` §4): a call against the user's side (a foul, a card, a penalty, an offside, a VAR check)
  // opens the button for COMPLAINT_WINDOW real seconds; never with the manager off the touchline or no referee.
  useEffect(() => {
    const open = () => {
      // Not in a live match between two managers (no complaint there).
      if (h2hModeRef.current || !gameStateRef.current?.referee) return;
      complaintSeqRef.current++;
      setComplaint({ seq: complaintSeqRef.current, until: Date.now() + VAR_CONFIG.COMPLAINT_WINDOW * 1000 });
    };
    const offs = [
      gameBus.on("foul", (e) => { if (e.team === "A") open(); }),
      gameBus.on("card", (e) => { if (e.team === "A") open(); }),
      gameBus.on("penaltyAwarded", (e) => { if (e.team === "B") open(); }),
      gameBus.on("offsideCalled", (e) => { if (e.team === "A") open(); }),
      gameBus.on("varReview", (e) => { if (e.against === "A") open(); }),
    ];
    return () => offs.forEach((off) => off());
  }, []);
  useEffect(() => {
    if (!complaint) return;
    const id = setTimeout(() => setComplaint((c) => (c?.seq === complaint.seq ? null : c)), Math.max(0, complaint.until - Date.now()));
    return () => clearTimeout(id);
  }, [complaint]);

  /** Patches the referee/VAR fields of the running match (the pitch's state and the React copy). */
  const patchVarState = useCallback((patch: Partial<Pick<GameState, "refereeBias" | "autoSubs">>) => {
    gameBus.emit("testCommand", { type: "varPatch", patch });
    setGameState((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  function handleComplain() {
    const gs = gameStateRef.current;
    if (!gs || !complaint || managerOut || complainedSeqRef.current === complaint.seq || Date.now() > complaint.until) return;
    complainedSeqRef.current = complaint.seq;
    setComplaint(null);
    const made = complaintsMadeRef.current++;
    const onYellow = managerCardsRef.current.some((c) => c.card === "yellow");
    const out = resolveComplaint({ made, strictness: gs.referee?.strictness, onYellow }, Math.random);
    const minute = matchMinute(gs) + 1;
    if (out.card === "none") {
      complaintMoraleRef.current = true;
      if (out.bias && !gs.refereeBias) patchVarState({ refereeBias: { team: "B", amount: VAR_CONFIG.COMPLAINT_BIAS } });
      showNotice(t(out.bias ? "complaint.bias" : "complaint.calm"), "info");
      return;
    }
    managerCardsRef.current = [...managerCardsRef.current, { card: out.card, minute, complaint: made + 1 }];
    setCoachCard((prev) => ({ team: "A", card: out.card as "yellow" | "red", seq: (prev?.seq ?? 0) + 1 }));
    setEventFeed((f) => [...f, { minute: minute - 1, team: "A", kind: out.card === "red" ? "managerRed" : "managerYellow", player: "" }]);
    showNotice(t(out.card === "red" ? "complaint.red" : "complaint.yellow"), out.card === "red" ? "danger" : "warn");
    if (out.card === "red") {
      // Sent to the stands: the assistant makes the changes (AI rule), injuries included.
      setManagerOut("sentOff");
      panelPauseRef.current = NO_PANEL_PAUSE;
      showSubPanelRef.current = false;
      setShowSubPanel(false);
      patchVarState({ autoSubs: { A: true } });
      gameBus.emit("testCommand", { type: "setManualInjurySubs", team: "A", on: false });
    }
  }

  // Layout effect: the first value is set before the overlay paints (never the previous break's 100%).
  useLayoutEffect(() => {
    if (matchOverlay !== "halfTime" && matchOverlay !== "extraTime") return;
    let raf = 0;
    const tick = () => {
      const gs = gameStateRef.current;
      if (gs) {
        const frac = 1 - Math.max(0, Math.min(1, gs.presentationCountdown / PRESENTATION_DURATION));
        setBreakProgress((prev) => (prev === frac ? prev : frac));
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [matchOverlay]);

  useEffect(() => {
    return gameBus.on("halfTime", () => {
      setMatchOverlay("halfTime");
    });
  }, []);

  useEffect(() => {
    return gameBus.on("extraTimeStart", () => {
      setMatchOverlay("extraTime");
    });
  }, []);

  // Half-time / extra-time-break overlays are dismissed the moment the engine itself moves past
  // the corresponding phase — not on a real-time timer. This tracks exactly what actually gates
  // the pause (`isDeadBall` in gameState.ts), so the overlay reaches 100% and disappears exactly
  // when play resumes, stays frozen together with `paused`, and reacts correctly to a mid-overlay
  // speed change (a fixed-delay `setTimeout` couldn't do any of that — see `matchOverlayTiming.ts`).
  useEffect(() => {
    const phase = gameState?.matchPhase;
    if (!phase) return;
    if (matchOverlay === "halfTime" && phase !== "halfTime") {
      setMatchOverlay(null);
    } else if (matchOverlay === "extraTime" && phase !== "extraTimeBreak") {
      setMatchOverlay(null);
    }
  }, [gameState?.matchPhase, matchOverlay]);

  useEffect(() => {
    const startMatchEnd = () => {
      if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
      setMatchOverlay("matchEnd");

      // matchEnd freezes the engine (tickState no-ops forever in this phase — see
      // gameState.ts), so there's no engine countdown left to read for the progress bar.
      // Drive it from a rAF loop timed against the same speed-scaled delay used below to
      // schedule the navigation, so the bar reaches 100% exactly when the overlay/navigation
      // fires, at every speed.
      const delayMs = overlayDismissDelayMs(MATCH_END_TO_RESULT_MS, gameSpeedRef.current);
      if (matchEndAnimRef.current != null) cancelAnimationFrame(matchEndAnimRef.current);
      const startedAt = performance.now();
      const tickProgress = () => {
        const frac = Math.min(1, (performance.now() - startedAt) / delayMs);
        setMatchEndProgress(frac);
        matchEndAnimRef.current = frac < 1 ? requestAnimationFrame(tickProgress) : null;
      };
      setMatchEndProgress(0);
      matchEndAnimRef.current = requestAnimationFrame(tickProgress);

      // H2H: the server records the match; `h2h_done` takes the page to the result.
      if (h2hModeRef.current || matchEndFinalizeRef.current) return;
      matchEndFinalizeRef.current = true;

      const session = loadSession();
      const saveId = session?.saveId;
      const matchDate = session?.currentDate ?? "";

      overlayTimerRef.current = setTimeout(() => {
        void (async () => {
          if (saveId) {
            try {
              const ctx = matchContextRef.current;
              const gs = gameStateRef.current;
              const recording =
                ctx && gs
                  ? {
                      ...buildPlayedMatchRecording(
                        gs,
                        ctx.fixture,
                        ctx.mySquadId,
                        ctx.homeSquad,
                        ctx.awaySquad,
                        managerCardsRef.current,
                      ),
                      ...(complaintMoraleRef.current ? { complaintMorale: true as const } : {}),
                    }
                  : null;
              if (session?.groupAdvance) {
                // Group world (part 3): the recording waits for the executor; the day runs with the group.
                // Never falls back to /api/advance-day: that would run the day for everyone.
                if (!ctx?.matchDay || !recording) {
                  window.location.href = `/match-result?error=generic`;
                  return;
                }
                const { date, fixtureId } = ctx.matchDay;
                storePendingRecording(saveId, { date, fixtureId, recording });
                const r = await sendWithRetry(() => groupAdvanceApi.liveRecording(saveId, date, fixtureId, recording));
                if (!r.ok) {
                  if (isTerminalGroupError(r.error)) clearPendingRecording(saveId);
                  if (r.error === "dayClosed") {
                    // The deadline ran the day while he played: the assistant's game is the official one.
                    recordedRef.current = true;
                    clearMatchSnapshot();
                  }
                  window.location.href = liveSendFailureUrl(r.error, date);
                  return;
                }
                clearPendingRecording(saveId);
                recordedRef.current = true;
                clearMatchSnapshot();
                window.location.href = `/match-result?date=${encodeURIComponent(ctx.matchDay.date)}&pending=1`;
                return;
              }
              const payload = recording ? JSON.stringify({ playedMatch: recording }) : null;
              const res = await fetch(`/api/advance-day/${encodeURIComponent(saveId)}`, {
                method: "POST",
                ...(payload
                  ? { headers: { "Content-Type": "application/json" }, body: payload }
                  : {}),
              });
              if (!res.ok) {
                const body = await res.json().catch(() => ({})) as { error?: string };
                console.error("[MatchScreen] advance-day failed:", res.status, body.error);
                // Surface the error so the result screen can show it
                window.location.href = `/match-result?error=${encodeURIComponent(body.error ?? "advance-day failed")}`;
                return;
              }
              // Recorded: nothing left to resume (#64).
              recordedRef.current = true;
              clearMatchSnapshot();
            } catch (err) {
              console.error("[MatchScreen] advance-day network error:", err);
              // still navigate so user isn't stuck on the match screen
            }
          }
          if (matchDate) {
            window.location.href = `/match-result?date=${encodeURIComponent(matchDate)}`;
          } else {
            window.location.href = "/match-result";
          }
        })();
      }, delayMs);
    };
    startMatchEndRef.current = startMatchEnd;
    const unsub = gameBus.on("matchEnd", startMatchEnd);
    return () => {
      startMatchEndRef.current = null;
      unsub();
      if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
      if (matchEndAnimRef.current != null) cancelAnimationFrame(matchEndAnimRef.current);
    };
  }, []);

  // Resume after a reload (#64): snapshot the live match every few seconds and whenever the page
  // is hidden or unloaded. State and counters are read in the same synchronous call, so they
  // always describe the same tick.
  useEffect(() => {
    const writeSnapshot = () => {
      const key = matchKeyRef.current;
      const gs = gameStateRef.current;
      if (!key || !gs || recordedRef.current) return;
      saveMatchSnapshot({
        version: MATCH_SNAPSHOT_VERSION,
        key,
        savedAt: Date.now(),
        state: gs,
        stats: exportStatsState(),
        ratings: exportRatings(),
        tactics: {
          A: {
            style: myTacticalStyleRef.current,
            mentality: mentalityRef.current,
            axesOverride: myAxesOverrideRef.current,
            familiarity: myFamiliarityRef.current,
            saved: savedTacticsRef.current,
          },
          B: aiTacticsRef.current,
        },
        ui: {
          gameSpeed: gameSpeedRef.current,
          eventFeed: eventFeedRef.current,
          possession: { A: possessionRef.current.A, B: possessionRef.current.B },
          ...(heatmapRef.current ? { heatmap: exportPossessionHeatmap(heatmapRef.current) } : {}),
        },
      });
    };
    const onVisibility = () => { if (document.visibilityState === "hidden") writeSnapshot(); };
    const id = setInterval(writeSnapshot, SNAPSHOT_INTERVAL_MS);
    window.addEventListener("pagehide", writeSnapshot);
    window.addEventListener("beforeunload", writeSnapshot);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(id);
      window.removeEventListener("pagehide", writeSnapshot);
      window.removeEventListener("beforeunload", writeSnapshot);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    return onBroadcastLine(setBroadcastLine);
  }, []);

  useEffect(() => {
    setDebugMode(DEV_TOOLS && debug);
  }, [debug]);

  /** H2H: a change on the user's side goes to the server (the page never edits that match). */
  function sendH2H(cmd: H2HCommand) {
    h2h.send(cmd);
  }

  function handleMentalityChange(next: Mentality) {
    setMentality(next);
    mentalityRef.current = next;
    if (h2hMode) sendH2H({ kind: "mentality", mentality: next });
    else applyLiveTactics("A", { style: myTacticalStyleRef.current, axesOverride: myAxesOverrideRef.current }, next, myFamiliarityRef.current);
    const kind = next === "attacking" ? "attack" : next === "defensive" ? "defend" : "balanced";
    setCoachCue((prev) => ({ team: mySideRef.current, kind, seq: (prev?.seq ?? 0) + 1 }));
  }

  /** Live style / axes of team A (Etapa 35): the engine config only — never `PUT /tactics`. */
  function setMyLiveTactics(next: LiveTactics) {
    myTacticalStyleRef.current = next.style;
    myAxesOverrideRef.current = next.axesOverride;
    setLiveTactics(next);
    if (h2hMode) sendH2H({ kind: "tactics", style: next.style, ...(next.axesOverride ? { axesOverride: next.axesOverride } : {}) });
    else applyLiveTactics("A", next, mentalityRef.current, myFamiliarityRef.current);
  }

  function handleLiveAxis<K extends keyof TacticalAxes>(key: K, value: TacticalAxes[K]) {
    setMyLiveTactics(withLiveAxis({ style: myTacticalStyleRef.current, axesOverride: myAxesOverrideRef.current }, key, value));
  }

  // #136: reporting a problem pauses the match so the text is not lost when the match ends. Closing
  // the report never resumes on its own (the tester resumes with Play when ready).
  function handleOpenReport() {
    if (!h2hMode) setPaused(true);
    setReportOpen(true);
  }

  function handleOpenSubPanel() {
    if (h2hMode) {
      // The match keeps going (a pause is the pause button's, counted).
      showSubPanelRef.current = true;
      setShowSubPanel(true);
      return;
    }
    panelPauseRef.current = openPanelPause(panelPauseRef.current, showSubPanelRef.current, pausedRef.current);
    showSubPanelRef.current = true;
    setPaused(true);
    setShowSubPanel(true);
  }

  // A match the user paused by hand (e.g. at a goal) stays paused when the panel closes (tester report).
  function handleCloseSubPanel() {
    if (h2hMode) {
      showSubPanelRef.current = false;
      setShowSubPanel(false);
      return;
    }
    const resume = panelPauseRef.current;
    panelPauseRef.current = NO_PANEL_PAUSE;
    showSubPanelRef.current = false;
    setShowSubPanel(false);
    setPaused((p) => pausedAfterClose(resume, p));
  }

  function handleQueueSub(sub: PendingSub) {
    if (h2hMode) { sendH2H({ kind: "sub", outId: sub.outId, inId: sub.inId }); return; }
    setGameState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        pendingSubsA: [...prev.pendingSubsA, sub],
      };
    });
  }

  /** Takes back a queued substitution before the next stoppage (tester report). */
  function handleUnqueueSub(outId: number) {
    if (h2hMode) { sendH2H({ kind: "unsub", outId }); return; }
    setGameState((prev) => (prev ? { ...prev, pendingSubsA: prev.pendingSubsA.filter((s) => s.outId !== outId) } : prev));
  }

  /** Two starters swap positions (#115): no substitution used, only this match. */
  function handleSwapPositions(aId: number, bId: number) {
    if (h2hMode) { sendH2H({ kind: "swap", aId, bId }); return; }
    setGameState((prev) => (prev ? swapPlayerPositions(prev, "A", aId, bId) : prev));
  }

  /** #140: bench player `inId` takes the slot an injured player left (uses a substitution). */
  function handleFillVacancy(injuredId: number, inId: number) {
    // H2H: the server's queue fills the injury vacancy of that player.
    if (h2hMode) { sendH2H({ kind: "sub", outId: injuredId, inId }); return; }
    setGameState((prev) => (prev ? fillInjuryVacancy(prev, "A", injuredId, inId) : prev));
  }

  /** Live instruction change (player instructions): only this match, never saved. */
  function handleInstruction(slot: number, instruction: SlotInstruction | null) {
    if (h2hMode) { sendH2H({ kind: "instruction", slot, instruction }); return; }
    setGameState((prev) => (prev ? applyPlayerInstruction(prev, "A", slot, instruction) : prev));
  }

  /** Live man-marking (targets are opponents on the pitch, engine ids). */
  function handleManMarks(marks: { markerSlot: number; targetId: number }[]) {
    if (h2hMode) { sendH2H({ kind: "marks", marks }); return; }
    setGameState((prev) => (prev ? setManMarks(prev, "A", marks) : prev));
  }

  function handleChangeFormation(formationId: string) {
    if (h2hMode) { sendH2H({ kind: "formation", formation: formationId }); return; }
    setGameState((prev) => {
      if (!prev) return prev;
      const newFormation = formationForSimId(formationId);
      return changeFormation(prev, "A", newFormation);
    });
  }

  const matchKitColors = useMemo(
    () =>
      resolveMatchTeamKitColors(
        teamAMeta
          ? { primary: teamAMeta.primaryColor, secondary: teamAMeta.secondaryColor }
          : undefined,
        teamBMeta
          ? { primary: teamBMeta.primaryColor, secondary: teamBMeta.secondaryColor }
          : undefined,
      ),
    [teamAMeta, teamBMeta],
  );

  // The marker border's second colour: the club's first colour that isn't the kit worn on the pitch.
  const secondKitColors = useMemo(() => {
    const other = (tm: TeamId, kit: string) =>
      faceRoster?.[tm].clubColors.find((c) => c.toLowerCase() !== kit.toLowerCase());
    const a = other("A", matchKitColors.teamA), b = other("B", matchKitColors.teamB);
    return { ...(a ? { teamAColor2: a } : {}), ...(b ? { teamBColor2: b } : {}) };
  }, [faceRoster, matchKitColors]);

  crestOfRef.current = (tm: TeamId) => {
    const meta = tm === "A" ? teamAMeta : teamBMeta;
    const id = tm === "A" ? crestIds?.a : crestIds?.b;
    return {
      ...(id ? { logoUrl: squadLogoUrl(id) } : {}),
      ...(meta ? { colors: [meta.primaryColor, meta.secondaryColor] as [string, string] } : {}),
    };
  };

  const effectLabels = useMemo(
    () => ({ save: t("match.effects.save"), wide: t("match.effects.wide"), offside: t("match.effects.offside") }),
    [t],
  );

  // Face per team and roster id. The jersey wears the kit actually used on the pitch (an away
  // side in its change colours gets a matching shirt), then the club's other colours.
  const faceUrls = useMemo(() => {
    if (!faceRoster) return undefined;
    const side = (tm: TeamId, kit: string) => {
      const { players, clubColors } = faceRoster[tm];
      const colors = [kit, ...clubColors.filter((c) => c.toLowerCase() !== kit.toLowerCase())];
      return Object.fromEntries(players.map((p) => [p.id, faceUrl(p.id, p.nationality, colors)]));
    };
    return { A: side("A", matchKitColors.teamA), B: side("B", matchKitColors.teamB) };
  }, [faceRoster, matchKitColors]);

  // Stadium: the crowd of the match (the number the gate charges) or the default fill; the home
  // club's fans fill most of the stand. Engine team A is the human club.
  const stadium = useMemo<PitchStadium | null>(() => {
    if (!matchFixture || !crestIds) return null;
    const homeSide: TeamId = matchFixture.neutral || matchFixture.home === crestIds.a ? "A" : "B";
    const club = faceRoster?.[homeSide].clubColors;
    const homeClubColors: [string, string] | null = club && club.length >= 2 ? [club[0]!, club[1]!] : null;
    const homeCrestId = matchFixture.neutral ? undefined : homeSide === "A" ? crestIds.a : crestIds.b;
    const homeCrest = homeCrestId ? squadLogoUrl(homeCrestId) : undefined;
    const crowd = touchline?.crowd;
    const fill = crowd?.known && crowd.capacity > 0 ? crowd.attendance / crowd.capacity : STADIUM.DEFAULT_FILL;
    const homeTeam: TeamId = matchFixture.neutral || matchFixture.home === crestIds.a ? "A" : "B";
    // A stand under works (only a home game of the human club) is drawn empty, as a building site.
    return {
      fill, homeTeam, neutral: !!matchFixture.neutral, seed: matchFixture.id,
      ...(crowd?.works ? { works: crowd.works } : {}),
      // The manager's decorations (achievements): only sent for the human club's home games.
      ...(crowd?.decor ? { decor: crowd.decor } : {}),
      ...(crowd?.bigMatch ? { bigMatch: true } : {}),
      // The home club's colours for the crowd's flags, banners and scarves.
      ...(homeClubColors ? { homeColors: homeClubColors } : {}),
      // The home crest on the crowd's flags and banners.
      ...(homeCrest ? { homeCrest } : {}),
      // LED boards around the pitch: made-up ads that flip; the scorer after a goal.
      led: {
        goal: t("match.led.goal", { name: "{name}", minute: "{minute}" }),
      },
    };
  }, [matchFixture, crestIds, touchline, faceRoster, t]);

  // Managers on the touchline: faces drawn by the server, the shirt in the kit worn today.
  const coaches = useMemo(() => {
    const colorsOf = (tm: TeamId, kit: string) => {
      const club = faceRoster?.[tm].clubColors ?? [];
      return [kit, ...club.filter((c) => c.toLowerCase() !== kit.toLowerCase())];
    };
    const mgr = touchline?.managers;
    const kit = (tm: TeamId) => (tm === "A" ? matchKitColors.teamA : matchKitColors.teamB);
    // The user's manager stands on his own side (always A in a solo match).
    const face = (tm: TeamId) => {
      const who = tm === mySide ? mgr?.mine : mgr?.opponent;
      return who ? { faceUrl: managerFaceUrl(who, colorsOf(tm, kit(tm))) } : {};
    };
    return {
      A: { color: kit("A"), ...face("A") },
      B: { color: kit("B"), ...face("B") },
    };
  }, [touchline, faceRoster, matchKitColors, mySide]);

  // Referee and assistants on the pitch with their faces (`referees.md`); no appointment = faceless officials.
  const officials = useMemo<boolean | PitchOfficials>(() => {
    const r = touchline?.referee;
    if (!r) return true;
    const face = (o: { id: string; country: string; age: number; gender: "male" | "female" }) => refereeFaceUrl(o.id, o.country, o.age, o.gender === "female");
    return { refereeFace: face(r), assistantFaces: [r.assistants[0] && face(r.assistants[0]), r.assistants[1] && face(r.assistants[1])] };
  }, [touchline]);

  const [teamAWithCrest, teamBWithCrest] = useMemo(() => {
    if (!crestIds) return [teamAMeta, teamBMeta];
    return [
      teamAMeta && { ...teamAMeta, logoUrl: squadLogoUrl(crestIds.a) },
      teamBMeta && crestIds.b ? { ...teamBMeta, logoUrl: squadLogoUrl(crestIds.b) } : teamBMeta,
    ];
  }, [teamAMeta, teamBMeta, crestIds]);

  // Match light (time of day, weather): stable object so the pitch only redraws when it really changes.
  // Before the early returns below: a hook after them breaks the screen ("Rendered more hooks").
  const lightConditions = touchline?.conditions ?? null;
  const lightSun = touchline?.sunSide ?? null;
  const matchLightingProp = useMemo<PitchLighting | null>(
    () => (lightConditions && lightSun && matchFixture ? { ...lightConditions, sun: lightSun, seed: matchFixture.id } : null),
    [lightConditions, lightSun, matchFixture?.id], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // What a friend watching this match needs to draw it the same way (the pitch props below), relayed with the states.
  const watchLook = useMemo<WatchLook>(() => {
    const { led: _led, ...stadiumData } = stadium ?? ({} as PitchStadium);
    return {
      teamAColor: matchKitColors.teamA, teamBColor: matchKitColors.teamB, ...secondKitColors,
      ...(faceUrls ? { faceUrls } : {}),
      stadium: stadium ? (stadiumData as unknown as Record<string, unknown>) : null,
      pitch: touchline?.pitch && matchFixture ? ({ ...touchline.pitch, seed: matchFixture.id } as unknown as Record<string, unknown>) : null,
      lighting: matchLightingProp as unknown as Record<string, unknown> | null,
      officials,
      coaches,
    };
  }, [matchKitColors, secondKitColors, faceUrls, stadium, touchline, matchFixture, matchLightingProp, officials, coaches]);
  watchLookRef.current = watchLook;

  if (loadError) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-lg text-center space-y-3">
          <p className="text-destructive font-bold font-display uppercase tracking-[0.08em] text-sm">{t("common.cannotStartMatch")}</p>
          <p className="text-muted-foreground text-sm leading-relaxed m-0">{loadError}</p>
          <Button variant="secondary" onClick={() => { window.location.href = "/dashboard"; }}>{t("matchPreview.backToDashboard")}</Button>
        </div>
      </div>
    );
  }

  if (!gameState) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <span className={`text-sm ${h2h.closed ? "text-foreground" : "text-muted-foreground animate-pulse"}`}>
          {h2h.closed ? t(`h2h.closed.${h2h.closed}`) : t(h2hTarget ? "h2h.waiting" : "common.loadingMatch")}
        </span>
      </div>
    );
  }

  // Home side on the left when engine team A plays away (#98): a solo match keeps the user as team A; a live match
  // between two managers has the home side as A, so it never flips.
  const awayView = isAwayView(matchFixture, crestIds?.a);
  const effectivePaused = h2hMode ? !!h2h.pause : paused;
  const otherH2HSide = otherSide(mySide);
  const sideName = (tm: TeamId) =>
    h2h.room?.sides[tm].nickname ?? h2h.room?.sides[tm].clubName ?? (tm === "A" ? teamAWithCrest?.name : teamBWithCrest?.name) ?? tm;
  const opponentAway = h2hMode && h2h.room?.phase === "live" && !h2h.room.sides[otherH2HSide].connected;
  const myPausesLeft = h2h.pausesLeft?.[mySide] ?? h2h.room?.sides[mySide].pausesLeft ?? 0;
  // H2H clock: the last state's time, run on by the real time since it arrived (at most 1.5 s, frozen in a pause).
  const shownMatchTime = h2hMode && isLivePhase(gameState.matchPhase) && !h2h.pause
    ? (gameState.matchTime ?? 0) + Math.min(1.5, Math.max(0, (clockNow - h2hStateAtRef.current) / 1000)) * TIME_SCALE
    : gameState.matchTime ?? 0;
  const mySubsRemaining = mySide === "A" ? gameState.subsRemainingA : gameState.subsRemainingB;
  const myPendingSubs = (mySide === "A" ? gameState.pendingSubsA : gameState.pendingSubsB).length;
  const sides = displaySides(awayView);
  const shownTeams = toDisplayPair({ A: teamAWithCrest, B: teamBWithCrest }, awayView);
  const shownKits = toDisplayPair({ A: matchKitColors.teamA, B: matchKitColors.teamB }, awayView);
  const passFromId = gameState.pass?.fromId;
  // toId is null during a through ball — the receiver is undetermined until landing.
  const passToId = gameState.pass?.toId ?? undefined;
  const score = gameState.score ?? { A: 0, B: 0 };
  const decisions = gameState.decisions;
  const playerEvents = playerMatchEvents(gameState.cards, getAllPlayerStats());
  // Players of the shown team who left the pitch (sent off, injured or substituted), in the order
  // they first appeared, so their goals, assists and cards stay visible (#69).
  const onPitch = new Set(gameState.players.map((p) => p.id));
  const sentOffIds = new Set(gameState.cards.filter((c) => c.card === "red").map((c) => c.playerId));
  const injuredIds = new Set(gameState.injuries.map((i) => i.playerId));
  const departedPlayers: DepartedPlayer[] = [...knownPlayersRef.current.values()]
    .filter((p) => p.team === panelTeam && !onPitch.has(p.id))
    .map((p) => ({
      player: p,
      reason: sentOffIds.has(p.id) ? "sentOff" : injuredIds.has(p.id) ? "injured" : "subbedOff",
    }));

  teamNamesRef.current = { A: teamAWithCrest?.name ?? "A", B: teamBWithCrest?.name ?? "B" };
  setBroadcastTeamNames({ A: teamAWithCrest?.name, B: teamBWithCrest?.name });
  const summaryStats = (tm: TeamId): SummaryTeamStats => {
    const st = getTeamStats(tm);
    return {
      shots: st.shots, passesCompleted: st.passesCompleted, passesAttempted: st.passesAttempted,
      fouls: st.fouls, yellowCards: st.yellowCards, redCards: st.redCards, offsides: st.offsides,
      corners: st.corners, freeKicks: st.freeKicks,
    };
  };
  const possTotal = possessionRef.current.A + possessionRef.current.B;
  const possessionA = possTotal > 0 ? possessionRef.current.A / possTotal : 0.5;
  const shownScore = toDisplayPair(score, awayView);
  const feed: MatchFeedItem[] = [
    ...eventFeed,
    ...gameState.cards.map((c): MatchFeedItem => ({
      minute: c.matchMinute, team: c.team, kind: c.card === "yellow" ? "yellow" : "red", player: c.playerName,
    })),
    ...gameState.substitutions.map((sub): MatchFeedItem => ({
      minute: sub.matchMinute, team: sub.team, kind: "sub", player: sub.playerOutName, playerIn: sub.playerInName,
    })),
    ...gameState.injuries.map((inj): MatchFeedItem => ({
      minute: inj.matchMinute, team: inj.team, kind: "injury", player: inj.playerName,
    })),
  ]
    .map((item, i) => ({ item, i }))
    .sort((a, b) => a.item.minute - b.item.minute || a.i - b.i)
    .map(({ item }) => ({ ...item, minute: item.minute + 1, team: displayTeam(item.team, awayView) }));

  // Half-time/extra-time: the engine's own countdown, read every frame (`breakProgress`), so the bar
  // tracks exactly what actually gates the pause (including e.g. staying put while `paused`).
  // Full-time: no engine countdown left once matchPhase is 'matchEnd' — use the rAF-driven
  // fraction timed against the same speed-scaled delay that schedules the navigation.
  // Stadium and crowd under the scoreboard (#149): the home side's ground; a neutral venue has no name.
  const crowdInfo = touchline?.crowd;
  const stadiumLine = matchFixture?.neutral
    ? t("match.stadium.neutral")
    : [
        venueName,
        crowdInfo?.known && crowdInfo.attendance > 0
          ? t("match.stadium.attendance", { crowd: crowdInfo.attendance.toLocaleString(i18n.language) })
          : null,
      ].filter(Boolean).join(" · ") || null;
  const setupPitch = touchline?.pitch ?? null;
  const pitchInfo = setupPitch
    ? t("match.stadium.pitch", { turf: t(`facilities.turf.type.${setupPitch.turf}`), pct: Math.round(setupPitch.condition) })
    : null;

  const overlayProgress =
    matchOverlay === "halfTime" || matchOverlay === "extraTime"
      ? breakProgress
      : matchOverlay === "matchEnd"
      ? matchEndProgress
      : undefined;

  return (
    <div className="h-screen overflow-hidden bg-background flex flex-col">
      {/* 2D penalty (`docs/superpowers/specs/2026-10-28-penalty-2d-design.md`): the manager kicks or saves. */}
      {gameState && (
        <PenaltyOverlay
          state={gameState}
          mySide={mySide}
          kits={{ A: matchKitColors.teamA, B: matchKitColors.teamB }}
          names={{
            left: { team: displaySides(awayView).left, name: shownTeams.A?.name ?? "" },
            right: { team: displaySides(awayView).right, name: shownTeams.B?.name ?? "" },
          }}
          // Between two managers the server resolves the kick and moves the match on.
          onOutcome={(o) => { if (!h2hMode) setGameState((prev) => (prev ? applyPenaltyOutcome(prev, o) : prev)); }}
          choose={h2hMode ? h2h.choosePenalty : undefined}
          {...(faceUrls ? { faceUrls } : {})}
          lighting={matchLightingProp}
          seed={matchFixture?.id ?? "penalty"}
        />
      )}
      <GoalOverlay
        scoringTeam={goalFlash ? displayTeam(goalFlash.team, awayView) : null}
        score={toDisplayPair(goalFlash?.score ?? score, awayView)}
        kitColorA={shownKits.A}
        kitColorB={shownKits.B}
        nameA={shownTeams.A?.name}
        nameB={shownTeams.B?.name}
      />
      <MatchOverlay
        kind={matchOverlay}
        score={shownScore}
        kitColorA={shownKits.A}
        kitColorB={shownKits.B}
        penaltiesScore={gameState.shootout ? toDisplayPair(gameState.shootout.finalScore, awayView) : undefined}
        progress={overlayProgress}
      />

      {isTester && <ReportModal open={reportOpen} onClose={() => setReportOpen(false)} />}

      {/* Scoreboard Header */}
      {/* Scoreboard on its own row so the score + clock is centred on the page (#60); controls below. */}
      <header className="bg-card/80 backdrop-blur-sm border-b border-border px-4 py-2 shrink-0">
        <div className="max-w-7xl mx-auto flex flex-col gap-2">
          <ScoreBar
            scoreA={shownScore.A}
            scoreB={shownScore.B}
            matchTime={shownMatchTime}
            matchPhase={gameState.matchPhase ?? "preMatch"}
            teamA={shownTeams.A}
            teamB={shownTeams.B}
            scoreColorA={shownKits.A}
            scoreColorB={shownKits.B}
            aggregate={gameState.aggregate ? toDisplayPair(gameState.aggregate, awayView) : undefined}
          />

          {matchHeadingText && (
            <p className="m-0 -mt-1 text-center text-sm text-muted-foreground truncate">{matchHeadingText}</p>
          )}
          {(stadiumLine || pitchInfo) && (
            <p className="m-0 -mt-1 flex items-center justify-center gap-1.5 text-sm text-muted-foreground truncate">
              <Icon name="stadium" size={16} aria-label={t("match.stadium.label")} />
              <span className="truncate tabular-nums">{stadiumLine}</span>
              {pitchInfo && setupPitch && (
                <span className={`tabular-nums ${setupPitch.condition < FACILITIES.WEAR.WARN_BELOW ? "text-destructive" : ""}`}>
                  {stadiumLine ? " · " : ""}{pitchInfo}
                </span>
              )}
            </p>
          )}

          {gameState.shootout && (
            <div className="flex justify-center">
              <PenaltyShootoutStrip
                shootout={gameState.shootout}
                nameA={teamAWithCrest?.name ?? "A"}
                nameB={teamBWithCrest?.name ?? "B"}
                order={[sides.left, sides.right]}
              />
            </div>
          )}

          <div className="flex items-center justify-center gap-2 flex-wrap">
            {h2hMode ? (
              // Live match between two managers: fixed speed, a few pauses each (the bar below shows a pause).
              <button
                type="button"
                onClick={() => h2h.requestPause()}
                disabled={!!h2h.pause || myPausesLeft <= 0 || !isLivePhase(gameState.matchPhase)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary/50 border border-border hover:border-primary/50 transition-all font-semibold text-sm cursor-pointer text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Icon name="pause" className="w-4 h-4" />
                <span className="tabular-nums">{t("h2h.pausesLeft", { count: myPausesLeft })}</span>
              </button>
            ) : (
              <>
                <button
                  onClick={() => {
                    panelPauseRef.current = manualToggle();
                    setPaused((p) => !p);
                  }}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary/50 border border-border hover:border-primary/50 transition-all font-semibold text-sm cursor-pointer text-foreground"
                >
                  {paused ? <Icon name="play" className="w-4 h-4" /> : <Icon name="pause" className="w-4 h-4" />}
                  {paused ? t("match.play") : t("match.pause")}
                </button>
                <SegmentedTabs
                  compact
                  tabs={GAME_SPEEDS.map((s) => ({ key: String(s), label: <span className="tabular-nums">{s}×</span> }))}
                  active={String(gameSpeed)}
                  onChange={(k) => setGameSpeed(Number(k) as typeof gameSpeed)}
                />
              </>
            )}
            {managerOut ? (
              <span className="flex items-center gap-2 px-4 py-2 rounded-lg border border-destructive/50 bg-destructive/10 text-destructive font-semibold text-sm">
                <Icon name="alert" className="w-4 h-4" />
                {t(managerOut === "banned" ? "complaint.banned" : "complaint.sentOff")}
              </span>
            ) : (
              <SegmentedTabs
                compact
                tabs={MENTALITY_OPTIONS.map((m) => ({ key: m, label: t(`match.mentality.${m}`) }))}
                active={mentality}
                onChange={handleMentalityChange}
              />
            )}
            {complaint && !managerOut && !h2hMode && (
              <button
                type="button"
                onClick={handleComplain}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-chart-4/60 bg-chart-4/15 text-chart-4 font-semibold text-sm cursor-pointer hover:bg-chart-4/25"
              >
                <Icon name="message-square" className="w-4 h-4" />
                {t("complaint.button")}
              </button>
            )}
            {!managerOut && (
            <button
              onClick={handleOpenSubPanel}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all font-semibold text-sm cursor-pointer ${
                myPendingSubs > 0
                  ? "bg-chart-4/20 text-chart-4 border-chart-4/50"
                  : mySubsRemaining > 0
                  ? "bg-secondary/50 border-border hover:border-primary/50 text-foreground"
                  : "bg-secondary/30 border-border/50 text-muted-foreground cursor-not-allowed"
              }`}
            >
              <Icon name="arrow-right-left" className="w-4 h-4" />
              {t("match.subs", { remaining: mySubsRemaining })}
            </button>
            )}
            <FriendsButton variant="toolbar" />
            {DEV_TOOLS && (
            <button
              onClick={() => setShowStats((s) => !s)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all font-semibold text-sm cursor-pointer ${
                showStats
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-secondary/50 border-border hover:border-primary/50 text-foreground"
              }`}
            >
              <Icon name="stats" className="w-4 h-4" />
              {t("nav.stats")}
            </button>
            )}
            {isTester && (
              <button
                type="button"
                onClick={handleOpenReport}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border transition-all font-semibold text-sm cursor-pointer bg-secondary/50 border-border hover:border-primary/50 text-foreground"
                aria-label={t("nav.report")}
              >
                <Icon name="report" className="w-4 h-4" />
                {t("nav.report")}
              </button>
            )}
            {DEV_TOOLS && !h2hMode && (
            <button
              onClick={() => setDebug((d) => !d)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all font-semibold text-sm cursor-pointer ${
                debug
                  ? "bg-chart-4/20 text-chart-4 border-chart-4/50"
                  : "bg-secondary/50 border-border hover:border-primary/50 text-foreground"
              }`}
            >
              <Icon name="settings" className="w-4 h-4" />
              {t("match.debug")}
            </button>
            )}
          </div>
        </div>
      </header>

      {h2hMode && h2h.pause && (
        <PauseBar pause={h2h.pause} mySide={mySide} names={{ A: sideName("A"), B: sideName("B") }} onResume={() => h2h.resume()} />
      )}
      {opponentAway && (
        <div role="status" className="flex items-center justify-center gap-2 px-4 py-2 border-b border-border bg-secondary/30 text-sm font-semibold text-foreground">
          <Icon name="alert" size={16} className="text-chart-4" />
          {t("h2h.opponentAway", { name: sideName(otherH2HSide) })}
        </div>
      )}
      {h2hMode && h2h.closed && (
        <div role="status" className="flex items-center justify-center px-4 py-2 border-b border-border bg-destructive/10 text-sm font-semibold text-foreground">
          {t(`h2h.closed.${h2h.closed}`)}
        </div>
      )}

      {/* The match being played here (vs another manager) is never shown as a friend's game. */}
      {liveTarget && (
        <LiveRivalsStrip
          saveId={liveTarget.saveId}
          live={liveRivals.live.filter((l) => l.fixtureId !== matchFixture?.id)}
          highlight={liveRivals.highlight}
          excludeClubIds={matchFixture ? [matchFixture.home, matchFixture.away] : []}
        />
      )}
      {/* Friends' popups (messages, results, live goals) land here, over the top of the pitch (`ChatPopups`). */}
      <div className="relative z-50">
        <div id={MATCH_POPUPS_ID} className="absolute left-1/2 -translate-x-1/2 top-2 pointer-events-none" />
      </div>

      {/* Main Match View */}
      <main className="flex-1 flex justify-center overflow-hidden min-h-0">
        <TeamPanel
          team={panelTeam}
          side="left"
          teamName={panelTeam === "A" ? teamAWithCrest?.name : teamBWithCrest?.name}
          accentColor={panelTeam === "A" ? matchKitColors.teamA : matchKitColors.teamB}
          players={gameState.players.filter((p) => p.team === panelTeam)}
          ballHolderId={gameState.ballHolderId}
          passFromId={passFromId}
          passToId={passToId}
          decisions={decisions}
          ratings={ratings}
          selectedPlayerId={selectedPlayerId}
          onSelectPlayer={setSelectedPlayerId}
          subsRemaining={panelTeam === "A" ? gameState.subsRemainingA : gameState.subsRemainingB}
          pendingSubsCount={panelTeam === "A" ? gameState.pendingSubsA.length : gameState.pendingSubsB.length}
          subbedInPlayerIds={new Set(
            gameState.substitutions.filter((s) => s.team === panelTeam).map((s) => s.playerInId),
          )}
          playerEvents={playerEvents}
          departedPlayers={departedPlayers}
          onFlip={() => setPanelTeam((tm) => (tm === "A" ? "B" : "A"))}
          flipLabel={t("match.summary.showTeam", {
            team: (panelTeam === "A" ? teamBWithCrest?.name : teamAWithCrest?.name) ?? (panelTeam === "A" ? "B" : "A"),
          })}
        />

        <div
          className={`flex flex-col min-w-0 ${pitchSize ? "shrink-0" : "flex-1"}`}
          style={pitchSize ? { width: pitchSize.w } : undefined}
        >
          <div
            ref={pitchHostRef}
            className="flex-1 flex items-center justify-center min-h-0 overflow-hidden"
          >
            {pitchSize ? (
              // Sized to the canvas so the short notices sit on the pitch's top edge, never over
              // the scoreboard or the control bar.
              <div className="relative shrink-0" style={{ width: pitchSize.w, height: pitchSize.h }}>
                <PixiPitch
                  key={`${pitchSize.w}x${pitchSize.h}${stadium ? "s" : ""}${touchline?.referee ? "r" : ""}`}
                  canvasWidth={pitchSize.w}
                  canvasHeight={pitchSize.h}
                  paused={effectivePaused}
                  keepTickerAlive={h2hMode}
                  remote={h2hMode ? h2h.feed : null}
                  effectLabels={effectLabels}
                  debugMode={DEV_TOOLS && debug}
                  mirror={awayView}
                  initialState={gameState}
                  gameSpeed={gameSpeed}
                  teamAColor={matchKitColors.teamA}
                  teamBColor={matchKitColors.teamB}
                  {...secondKitColors}
                  faceUrls={faceUrls}
                  stadium={stadium}
                  officials={officials}
                  coaches={coaches}
                  coachCue={coachCue}
                  coachCard={coachCard}
                  extras
                  staminaTeams={[mySide]}
                  pitch={setupPitch && matchFixture ? { ...setupPitch, seed: matchFixture.id } : null}
                  lighting={matchLightingProp}
                />
                {banner && <MatchEventBanner item={banner} />}
                {notice && (
                  <div
                    role="status"
                    className={`absolute top-3 left-1/2 -translate-x-1/2 z-10 max-w-[90%] truncate pointer-events-none bg-card/95 border rounded-md px-4 py-2 text-sm font-semibold text-foreground ${
                      notice.tone === "danger" ? "border-destructive/60" : notice.tone === "warn" ? "border-chart-4/60" : "border-border"
                    }`}
                  >
                    {notice.text}
                  </div>
                )}
              </div>
            ) : (
              <span className="text-muted-foreground text-sm">{t("common.sizingPitch")}</span>
            )}
          </div>
          {/* Broadcast ticker */}
          <div className="px-4 py-2 border-t border-border bg-card/40">
            <span className="text-[13px] font-bold text-muted-foreground uppercase tracking-[0.08em] mr-2 font-display">{t("common.broadcast")}</span>
            <span className="text-sm text-foreground">
              {broadcastLine || <span className="text-muted-foreground">{t("common.waitingForAction")}</span>}
            </span>
          </div>

          {DEV_TOOLS && showStats && (
            <StatsPanel
              players={gameState.players}
              substitutions={gameState.substitutions ?? []}
              teamColorA={matchKitColors.teamA}
              teamColorB={matchKitColors.teamB}
              teamNameA={teamAWithCrest?.name}
              teamNameB={teamBWithCrest?.name}
            />
          )}
          {DebugPanel && debug && (
            <Suspense fallback={null}>
              <DebugPanel gameState={gameState} selectedPlayerId={selectedPlayerId} ballHolderId={gameState.ballHolderId} />
            </Suspense>
          )}
        </div>

        <MatchSummaryPanel
          teamA={shownTeams.A}
          teamB={shownTeams.B}
          statsA={summaryStats(sides.left)}
          statsB={summaryStats(sides.right)}
          possessionA={awayView ? 1 - possessionA : possessionA}
          feed={feed}
          extra={<PossessionHeatmap heatmap={heatmapRef} mirror={awayView} teams={{ A: mySide, B: otherH2HSide }} />}
          referee={touchline?.referee ?? null}
        />
      </main>

      {showSubPanel && (
        <SubstitutionPanel
          gameState={gameState}
          playerTeam={mySide}
          ratings={ratings}
          onQueueSub={handleQueueSub}
          onUnqueueSub={handleUnqueueSub}
          onSwapPositions={handleSwapPositions}
          onFillVacancy={handleFillVacancy}
          onChangeFormation={handleChangeFormation}
          onInstruction={handleInstruction}
          onManMarks={handleManMarks}
          liveTactics={{
            live: liveTactics,
            saved: savedTacticsRef.current,
            onStyle: (style) => setMyLiveTactics(withLiveStyle(style)),
            onAxis: handleLiveAxis,
            onReset: () => setMyLiveTactics({ ...savedTacticsRef.current }),
          }}
          onClose={handleCloseSubPanel}
        />
      )}
    </div>
  );
}
