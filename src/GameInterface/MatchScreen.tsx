import { shirtName } from "@/Domain/shirtName";
import { readJsonBody } from "@/GameInterface/readJsonBody";
import { setTeamMoraleOverride } from "@/GameEngine/Configs/MoraleConfig";
import { MORALE } from "@/Domain/morale/moraleConfig";
import { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback, lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import type { Fixture } from "@/types/calendarTypes";
import type { Squad } from "@/types/playerTypes";
import { PixiPitch } from "@/GraficsEngine/PixiPitch";
import { createMatchState, changeFormation, isLivePhase, matchMinute, PRESENTATION_DURATION, applyTeamInstructions, applyPlayerInstruction, setManMarks, setManMarksBySlot, swapPlayerPositions, fillInjuryVacancy } from "@/GameEngine/Domain/gameState";
import { overlayDismissDelayMs } from "@/GameInterface/matchOverlayTiming";
import { gameBus } from "@/GameEngine/Infrastructure/EventBus";
import { setDebugMode } from "@/GameEngine/Support/DebugLog";
import { initRatings, getAllRatings, exportRatings, importRatings } from "@/GameEngine/Domain/PlayerRating";
import { getTeamStats, getAllPlayerStats, initStats, exportStatsState, importStatsState } from "@/GameEngine/Domain/Statistics";
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
import "@/GameInterface/Broadcast/BroadcastSubscriber";
import "@/GameEngine/Domain/Statistics";
import type { GameState, GamePlayer, TeamId, Formation, PendingSub } from "@/GameEngine/types";
import type { TacticsSave, TacticalStyle, Mentality, SlotInstruction } from "@/types/tacticsTypes";
import { DEFAULT_TACTICAL_STYLE, DEFAULT_MENTALITY, MENTALITY_OPTIONS } from "@/types/tacticsTypes";
import { loadSession } from "@/GameInterface/gameSession";
import { formationForSimId } from "@/Domain/matchFormations";
import { autoFillLineupWithFitness } from "@/Domain/lineupHelpers";
import { isUnavailable } from "@/Domain/discipline/discipline";
import { staffEffectsOf } from "@/Domain/staff/staff";
import { getFormationSlots } from "@/types/formationSlots";
import type { FormationShape } from "@/types/formationSlots";
import { SubstitutionPanel } from "@/GameInterface/SubstitutionPanel";
import { faceUrl, managerFaceUrl, refereeFaceUrl } from "@/Domain/faces/faceUrl";
import type { MatchCrowd, MatchManagers } from "@/backend/matchCrowd";
import type { MatchSetupReferee } from "@/backend/refereeRoutes";
import { STADIUM } from "@/GraficsEngine/pitchStyle";
import type { PitchOfficials, PitchStadium } from "@/GraficsEngine/PixiPitch";

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
import { applyTeamTacticsConfig } from "@/GameEngine/Configs/DefenseConfig";
import { applyTeamAttackConfig } from "@/GameEngine/Configs/AttackConfig";
import { aiFamiliarity, squadFamiliarityLevels } from "@/Domain/familiarity/familiarity";
import type { FamiliarityLevels } from "@/types/familiarityTypes";
import { TeamPanel, type DepartedPlayer } from "@/GameInterface/TeamPanel";
import { ScoreBar, type TeamMeta } from "@/GameInterface/ScoreBar";
import { useMatchHeading } from "@/GameInterface/useMatchHeading";
import { squadLogoUrl } from "@/GameInterface/Components/ClubLogo";
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
  const { t } = useTranslation();
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [teamAMeta, setTeamAMeta] = useState<TeamMeta | undefined>();
  const [teamBMeta, setTeamBMeta] = useState<TeamMeta | undefined>();
  /** Squad ids behind the scoreboard crests — URLs are derived once the league catalog loads. */
  const [crestIds, setCrestIds] = useState<{ a: string; b?: string } | null>(null);
  /** Fixture being played (competition heading under the scoreboard, #81). */
  const [matchFixture, setMatchFixture] = useState<Fixture | null>(null);
  const matchHeadingText = useMatchHeading(useMemo(() => loadSession()?.saveId, []), matchFixture, crestIds?.a);
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
  const [touchline, setTouchline] = useState<{ crowd: MatchCrowd | null; managers: MatchManagers | null; referee: MatchSetupReferee | null } | null>(null);
  /** Gesture of the human's manager on a mentality change (a new `seq` plays it). */
  const [coachCue, setCoachCue] = useState<{ team: TeamId; kind: "attack" | "defend" | "balanced"; seq: number } | null>(null);
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
  const [goalFlash, setGoalFlash] = useState<{
    team: TeamId;
    score: { A: number; B: number };
  } | null>(null);
  /**
   * Brief on-screen notice: injury (`docs/superpowers/specs/2026-09-28-injuries-design.md`), and
   * offside, dangerous free kick, card and penalty (Etapa 12, #17/#19).
   */
  const [notice, setNotice] = useState<{ text: string; tone: "danger" | "warn" | "info" } | null>(null);
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
  const matchContextRef = useRef<{
    fixture: Fixture;
    mySquadId: string;
    homeSquad: Squad;
    awaySquad: Squad;
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

    const url = `/api/match-setup?saveId=${encodeURIComponent(session.saveId)}`;

    fetch(url)
      .then(async (r) => {
        const body = await readJsonBody(r);
        if (!r.ok) {
          const msg = typeof body.error === "string" ? body.error : `match-setup failed (${r.status})`;
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
          /** Players each side may name for this competition (registration); null = everyone. */
          registered?: { mine: string[]; opp: string[] } | null;
        };
      })
      .then((data) => {
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
        applyTeamTacticsConfig("A", teamA.style, teamA.mentality, teamA.axesOverride, teamA.familiarity);
        applyTeamAttackConfig("A", teamA.style, teamA.mentality, teamA.axesOverride, teamA.familiarity);
        applyTeamTacticsConfig("B", teamB.style, teamB.mentality, teamB.axesOverride, teamB.familiarity);
        applyTeamAttackConfig("B", teamB.style, teamB.mentality, teamB.axesOverride, teamB.familiarity);

        // Exclude injured players from the whole candidate pool — starters AND bench (an injured
        // player must never be available as a substitute either). `data.myLineup` is already
        // injury-aware (`/api/match-setup` → `resolveUserLineup`), but the full squad list itself
        // (used here as the bench source too) is not filtered until now.
        // Registration (`.claude/rules/game/registration.md`): a player not registered for this competition (or
        // over the per-match foreign limit) is out of the pool too, starters and bench.
        const matchDate = data.fixture.date;
        const mineOk = data.registered ? new Set(data.registered.mine) : null;
        const oppOk = data.registered ? new Set(data.registered.opp) : null;
        const myEligiblePlayers = data.mySquad.players.filter((p) => !isUnavailable(p, matchDate) && (!mineOk || mineOk.has(p.id)));
        const opponentPlayers = (data.opponentSquad?.players ?? data.mySquad.players).filter(
          (p) => !isUnavailable(p, matchDate) && (!oppOk || !data.opponentSquad || oppOk.has(p.id)),
        );
        // Morale (`.claude/rules/game/morale.md`): every player at his own stored value — the AI side
        // stores none (neutral). No team override from another screen may leak into a real match.
        setTeamMoraleOverride("A", undefined);
        setTeamMoraleOverride("B", data.opponentSquad ? undefined : MORALE.NEUTRAL);
        const oppSlots = getFormationSlots(data.oppFormation as unknown as FormationShape, "attacking");
        const oppLineup = autoFillLineupWithFitness(oppSlots, opponentPlayers, matchDate);
        const fresh: GameState | null = snap ? null : {
          ...createMatchState(
            myEligiblePlayers,
            data.myFormation,
            opponentPlayers,
            data.oppFormation,
            data.myLineup,
            oppLineup,
            {
              A: staffEffectsOf(data.mySquad).injuryMult,
              ...(data.opponentSquad ? { B: staffEffectsOf(data.opponentSquad).injuryMult } : {}),
            },
          ),
          knockout: data.fixture.knockout === true,
          ...(data.referee ? { referee: { id: data.referee.id, name: data.referee.name, country: data.referee.country, strictness: data.referee.strictness } } : {}),
          // #140: the user picks the replacement of an injured player (the AI side stays automatic).
          manualInjurySubs: { A: true },
          ...(tactics.setPieceTakers ? { setPieceTakers: { A: tactics.setPieceTakers } } : {}),
          ...(data.fixture.aggregate
            ? { aggregate: data.fixture.home === data.mySquadId
                  ? { A: data.fixture.aggregate.home, B: data.fixture.aggregate.away }
                  : { A: data.fixture.aggregate.away, B: data.fixture.aggregate.home } }
            : {}),
        };
        // Player instructions of the user's side: the saved slot instructions and this match's
        // man-marking (`.claude/rules/game/player-instructions.md`). The AI side never has any.
        const state: GameState = snap ? snap.state : setManMarksBySlot(
          applyTeamInstructions(fresh!, "A", tactics.slotInstructions),
          "A",
          (data.matchMarking?.marks ?? []).map((m) => ({ slot: m.slot, targetRosterId: m.targetId })),
        );
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
        };

        setTeamAMeta({
          name: data.save.clubName,
          primaryColor: data.save.clubColors[0],
          secondaryColor: data.save.clubColors[1],
        });
        if (data.opponentSquad) {
          setTeamBMeta({
            name: data.opponentSquad.name,
            primaryColor: data.opponentSquad.colors[0],
            secondaryColor: data.opponentSquad.colors[1],
          });
        }
        setCrestIds({ a: data.mySquadId, b: data.opponentSquad?.id });
        setMatchFixture(data.fixture);
        setTouchline({ crowd: data.crowd ?? null, managers: data.managers ?? null, referee: data.referee ?? null });
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
        if (e.team !== "A") return;
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
        showNotice(t(`match.notice.${key}`, { player: shirtName(e.playerName), team: team(e.team) }), e.card === "red" ? "danger" : "warn");
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
      }),
    ];
    return () => offs.forEach((off) => off());
  }, [t, showNotice]);

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

      if (matchEndFinalizeRef.current) return;
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
              const payload =
                ctx && gs
                  ? JSON.stringify({
                      playedMatch: buildPlayedMatchRecording(
                        gs,
                        ctx.fixture,
                        ctx.mySquadId,
                        ctx.homeSquad,
                        ctx.awaySquad,
                      ),
                    })
                  : null;
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

  function handleMentalityChange(next: Mentality) {
    setMentality(next);
    mentalityRef.current = next;
    applyLiveTactics("A", { style: myTacticalStyleRef.current, axesOverride: myAxesOverrideRef.current }, next, myFamiliarityRef.current);
    const kind = next === "attacking" ? "attack" : next === "defensive" ? "defend" : "balanced";
    setCoachCue((prev) => ({ team: "A", kind, seq: (prev?.seq ?? 0) + 1 }));
  }

  /** Live style / axes of team A (Etapa 35): the engine config only — never `PUT /tactics`. */
  function setMyLiveTactics(next: LiveTactics) {
    myTacticalStyleRef.current = next.style;
    myAxesOverrideRef.current = next.axesOverride;
    setLiveTactics(next);
    applyLiveTactics("A", next, mentalityRef.current, myFamiliarityRef.current);
  }

  function handleLiveAxis<K extends keyof TacticalAxes>(key: K, value: TacticalAxes[K]) {
    setMyLiveTactics(withLiveAxis({ style: myTacticalStyleRef.current, axesOverride: myAxesOverrideRef.current }, key, value));
  }

  // #136: reporting a problem pauses the match so the text is not lost when the match ends. Closing
  // the report never resumes on its own (the tester resumes with Play when ready).
  function handleOpenReport() {
    setPaused(true);
    setReportOpen(true);
  }

  function handleOpenSubPanel() {
    setPaused(true);
    setShowSubPanel(true);
  }

  function handleCloseSubPanel() {
    setShowSubPanel(false);
    setPaused(false);
  }

  function handleQueueSub(sub: PendingSub) {
    setGameState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        pendingSubsA: [...prev.pendingSubsA, sub],
      };
    });
  }

  /** Two starters swap positions (#115): no substitution used, only this match. */
  function handleSwapPositions(aId: number, bId: number) {
    setGameState((prev) => (prev ? swapPlayerPositions(prev, "A", aId, bId) : prev));
  }

  /** #140: bench player `inId` takes the slot an injured player left (uses a substitution). */
  function handleFillVacancy(injuredId: number, inId: number) {
    setGameState((prev) => (prev ? fillInjuryVacancy(prev, "A", injuredId, inId) : prev));
  }

  /** Live instruction change (player instructions): only this match, never saved. */
  function handleInstruction(slot: number, instruction: SlotInstruction | null) {
    setGameState((prev) => (prev ? applyPlayerInstruction(prev, "A", slot, instruction) : prev));
  }

  /** Live man-marking (targets are opponents on the pitch, engine ids). */
  function handleManMarks(marks: { markerSlot: number; targetId: number }[]) {
    setGameState((prev) => (prev ? setManMarks(prev, "A", marks) : prev));
  }

  function handleChangeFormation(formationId: string) {
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
    const crowd = touchline?.crowd;
    const fill = crowd?.known && crowd.capacity > 0 ? crowd.attendance / crowd.capacity : STADIUM.DEFAULT_FILL;
    const homeTeam: TeamId = matchFixture.neutral || matchFixture.home === crestIds.a ? "A" : "B";
    // A stand under works (only a home game of the human club) is drawn empty, as a building site.
    return { fill, homeTeam, neutral: !!matchFixture.neutral, seed: matchFixture.id, ...(crowd?.works ? { works: crowd.works } : {}) };
  }, [matchFixture, crestIds, touchline]);

  // Managers on the touchline: faces drawn by the server, the shirt in the kit worn today.
  const coaches = useMemo(() => {
    const colorsOf = (tm: TeamId, kit: string) => {
      const club = faceRoster?.[tm].clubColors ?? [];
      return [kit, ...club.filter((c) => c.toLowerCase() !== kit.toLowerCase())];
    };
    const mgr = touchline?.managers;
    return {
      A: { color: matchKitColors.teamA, ...(mgr ? { faceUrl: managerFaceUrl(mgr.mine, colorsOf("A", matchKitColors.teamA)) } : {}) },
      B: { color: matchKitColors.teamB, ...(mgr?.opponent ? { faceUrl: managerFaceUrl(mgr.opponent, colorsOf("B", matchKitColors.teamB)) } : {}) },
    };
  }, [touchline, faceRoster, matchKitColors]);

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

  if (loadError) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-lg text-center space-y-3">
          <p className="text-destructive font-bold font-display uppercase tracking-[0.08em] text-sm">{t("common.cannotStartMatch")}</p>
          <p className="text-muted-foreground text-sm leading-relaxed m-0">{loadError}</p>
        </div>
      </div>
    );
  }

  if (!gameState) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <span className="text-muted-foreground text-sm animate-pulse">{t("common.loadingMatch")}</span>
      </div>
    );
  }

  // Home side on the left when the user plays away (#98); the engine keeps the user as team A.
  const awayView = isAwayView(matchFixture, crestIds?.a);
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
  const overlayProgress =
    matchOverlay === "halfTime" || matchOverlay === "extraTime"
      ? breakProgress
      : matchOverlay === "matchEnd"
      ? matchEndProgress
      : undefined;

  return (
    <div className="h-screen overflow-hidden bg-background flex flex-col">
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
            matchTime={gameState.matchTime ?? 0}
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
            <button
              onClick={() => setPaused((p) => !p)}
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
            <SegmentedTabs
              compact
              tabs={MENTALITY_OPTIONS.map((m) => ({ key: m, label: t(`match.mentality.${m}`) }))}
              active={mentality}
              onChange={handleMentalityChange}
            />
            <button
              onClick={handleOpenSubPanel}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all font-semibold text-sm cursor-pointer ${
                gameState.pendingSubsA.length > 0
                  ? "bg-chart-4/20 text-chart-4 border-chart-4/50"
                  : gameState.subsRemainingA > 0
                  ? "bg-secondary/50 border-border hover:border-primary/50 text-foreground"
                  : "bg-secondary/30 border-border/50 text-muted-foreground cursor-not-allowed"
              }`}
            >
              <Icon name="arrow-right-left" className="w-4 h-4" />
              {t("match.subs", { remaining: gameState.subsRemainingA })}
            </button>
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
            {DEV_TOOLS && (
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
                  paused={paused}
                  effectLabels={effectLabels}
                  debugMode={DEV_TOOLS && debug}
                  mirror={awayView}
                  initialState={gameState}
                  gameSpeed={gameSpeed}
                  teamAColor={matchKitColors.teamA}
                  teamBColor={matchKitColors.teamB}
                  faceUrls={faceUrls}
                  stadium={stadium}
                  officials={officials}
                  coaches={coaches}
                  coachCue={coachCue}
                />
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
          extra={<PossessionHeatmap heatmap={heatmapRef} mirror={awayView} />}
          referee={touchline?.referee ?? null}
        />
      </main>

      {showSubPanel && (
        <SubstitutionPanel
          gameState={gameState}
          playerTeam="A"
          ratings={ratings}
          onQueueSub={handleQueueSub}
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
