import { useState, useEffect, useRef, useMemo, useCallback, lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import type { Fixture } from "@/types/calendarTypes";
import type { Squad } from "@/types/playerTypes";
import { PixiPitch } from "@/GraficsEngine/PixiPitch";
import { createMatchState, changeFormation, PRESENTATION_DURATION } from "@/GameEngine/Domain/gameState";
import { overlayDismissDelayMs } from "@/GameInterface/matchOverlayTiming";
import { gameBus } from "@/GameEngine/Infrastructure/EventBus";
import { setDebugMode } from "@/GameEngine/Suport/DebugLog";
import { initRatings, getAllRatings } from "@/GameEngine/Domain/PlayerRating";
import { initStats } from "@/GameEngine/Domain/Statistics";
import "@/GameEngine/Suport/DebugSubscriber";
import "@/GameInterface/Broadcast/BroadcastSubscriber";
import "@/GameEngine/Domain/Statistics";
import type { GameState, TeamId, Formation, PendingSub } from "@/GameEngine/types";
import type { TacticsSave, TacticalStyle, Mentality } from "@/types/tacticsTypes";
import { DEFAULT_TACTICAL_STYLE, DEFAULT_MENTALITY, MENTALITY_OPTIONS } from "@/types/tacticsTypes";
import { loadSession } from "@/GameInterface/gameSession";
import { formationForSimId } from "@/Domain/matchFormations";
import { autoFillLineupWithFitness } from "@/Domain/lineupHelpers";
import { isInjured } from "@/Domain/injury/injury";
import { getFormationSlots } from "@/types/formationSlots";
import type { FormationShape } from "@/types/formationSlots";
import { SubstitutionPanel } from "@/GameInterface/SubstitutionPanel";

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
import { TeamPanel } from "@/GameInterface/TeamPanel";
import { ScoreBar, type TeamMeta } from "@/GameInterface/ScoreBar";
import { squadLogoUrl } from "@/GameInterface/Components/ClubLogo";
import { StatsPanel } from "@/GameInterface/StatsPanel";
import { PenaltyShootoutStrip } from "@/GameInterface/Components/PenaltyShootoutStrip";

// Dev-only: DebugPanel pulls in react-json-view-lite (and its CSS, a side-effect
// import that prevents tree-shaking). Loading it via a lazy() guarded by
// process.env.NODE_ENV — which Bun's `define` constant-folds at build time —
// makes the entire dynamic import disappear from production bundles.
const DebugPanel = process.env.NODE_ENV !== "production"
  ? lazy(() => import("@/GameInterface/DebugPanel").then(m => ({ default: m.DebugPanel })))
  : null;

import { GoalOverlay } from "@/GameInterface/GoalOverlay";
import { MatchOverlay } from "@/GameInterface/MatchOverlay";
import { buildPlayedMatchRecording } from "@/GameInterface/buildPlayedMatchRecording";
import { resolveMatchTeamKitColors } from "@/GameInterface/matchTeamColors";
import { getBroadcastLine, onBroadcastLine } from "@/GameInterface/Broadcast/BroadcastLog";
import { Icon } from "@/GameInterface/Icons";

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

export function MatchScreen() {
  const { t } = useTranslation();
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [teamAMeta, setTeamAMeta] = useState<TeamMeta | undefined>();
  const [teamBMeta, setTeamBMeta] = useState<TeamMeta | undefined>();
  /** Squad ids behind the scoreboard crests — URLs are derived once the league catalog loads. */
  const [crestIds, setCrestIds] = useState<{ a: string; b?: string } | null>(null);
  const [debug, setDebug] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [paused, setPaused] = useState(false);
  const [gameSpeed, setGameSpeed] = useState<number>(1);
  /** Live-match mentality for team A (my club). Team B (AI) always stays balanced. Not saved. */
  const [mentality, setMentality] = useState<Mentality>(DEFAULT_MENTALITY);
  /** Team A's saved tactical style — set once from match-setup, read by mentality changes. */
  const myTacticalStyleRef = useRef<TacticalStyle>(DEFAULT_TACTICAL_STYLE);
  const myAxesOverrideRef = useRef<TacticsSave["axesOverride"]>(undefined);
  const [showSubPanel, setShowSubPanel] = useState(false);
  const [goalFlash, setGoalFlash] = useState<{
    team: TeamId;
    score: { A: number; B: number };
  } | null>(null);
  /** Brief on-screen notice for an in-match injury (`docs/superpowers/specs/2026-09-28-injuries-design.md`). */
  const [injuryNotice, setInjuryNotice] = useState<{
    team: TeamId;
    playerName: string;
    severity: "light" | "medium" | "severe";
  } | null>(null);
  const [matchOverlay, setMatchOverlay] = useState<"halfTime" | "extraTime" | "matchEnd" | null>(null);
  /**
   * 0..1 elapsed fraction driving the full-time overlay's progress bar. Unlike half-time /
   * extra-time (whose pause is tracked by the engine's own `presentationCountdown`, read
   * directly off `gameState` below), `matchEnd` freezes the engine entirely — there is no
   * engine value left counting down — so this is driven by a rAF loop timed against the same
   * speed-scaled delay used to schedule the navigation to the result screen.
   */
  const [matchEndProgress, setMatchEndProgress] = useState(0);
  const matchEndAnimRef = useRef<number | null>(null);
  /** Mirrors `gameSpeed` for the gameBus handlers below, which are registered once (`[]` deps)
   *  and would otherwise close over the initial render's speed forever. */
  const gameSpeedRef = useRef(gameSpeed);
  useEffect(() => { gameSpeedRef.current = gameSpeed; }, [gameSpeed]);
  const [ratings, setRatings] = useState<Record<number, number>>(() => getAllRatings());
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
    const next = fitPitch(rect.width, rect.height);
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
        const body = (await r.json()) as Record<string, unknown>;
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
        myTacticalStyleRef.current = tactics.tactical_style;
        myAxesOverrideRef.current = tactics.axesOverride;
        applyTeamTacticsConfig("A", tactics.tactical_style, DEFAULT_MENTALITY, tactics.axesOverride);
        applyTeamAttackConfig("A", tactics.tactical_style, DEFAULT_MENTALITY, tactics.axesOverride);
        applyTeamTacticsConfig("B", DEFAULT_TACTICAL_STYLE, DEFAULT_MENTALITY);
        applyTeamAttackConfig("B", DEFAULT_TACTICAL_STYLE, DEFAULT_MENTALITY);

        // Exclude injured players from the whole candidate pool — starters AND bench (an injured
        // player must never be available as a substitute either). `data.myLineup` is already
        // injury-aware (`/api/match-setup` → `resolveUserLineup`), but the full squad list itself
        // (used here as the bench source too) is not filtered until now.
        const matchDate = data.fixture.date;
        const myEligiblePlayers = data.mySquad.players.filter((p) => !isInjured(p, matchDate));
        const opponentPlayers = (data.opponentSquad?.players ?? data.mySquad.players).filter(
          (p) => !isInjured(p, matchDate),
        );
        const oppSlots = getFormationSlots(data.oppFormation as unknown as FormationShape, "attacking");
        const oppLineup = autoFillLineupWithFitness(oppSlots, opponentPlayers, matchDate);
        const state = {
          ...createMatchState(
            myEligiblePlayers,
            data.myFormation,
            opponentPlayers,
            data.oppFormation,
            data.myLineup,
            oppLineup,
          ),
          knockout: data.fixture.knockout === true,
          ...(data.fixture.aggregate
            ? { aggregate: data.fixture.home === data.mySquadId
                  ? { A: data.fixture.aggregate.home, B: data.fixture.aggregate.away }
                  : { A: data.fixture.aggregate.away, B: data.fixture.aggregate.home } }
            : {}),
        };
        initRatings(state.players.map(p => p.id));
        initStats(state.players.map(p => ({ id: p.id, team: p.team })));
        setRatings(getAllRatings());
        setGameState(state);
        gameStateRef.current = state;

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
      })
      .catch((e: unknown) => {
        setLoadError(e instanceof Error ? e.message : String(e));
      });
  }, []);

  useEffect(() => {
    return gameBus.on("stateChanged", (s) => {
      const next = {
        ...s,
        score: s.score ?? { A: 0, B: 0 },
        tackleCooldown: s.tackleCooldown ?? 0,
        setPiece: s.setPiece ?? null,
        decisions: s.decisions ?? {},
      };
      gameStateRef.current = next;
      setGameState(next);
    });
  }, []);

  useEffect(() => {
    gameStateRef.current = gameState;
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
    return gameBus.on("injury", (data) => {
      if (injuryTimerRef.current) clearTimeout(injuryTimerRef.current);
      setInjuryNotice({ team: data.team, playerName: data.playerName, severity: data.severity });
      injuryTimerRef.current = setTimeout(() => setInjuryNotice(null), 4000);
    });
  }, []);

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
    const unsub = gameBus.on("matchEnd", () => {
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
    });
    return () => {
      unsub();
      if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
      if (matchEndAnimRef.current != null) cancelAnimationFrame(matchEndAnimRef.current);
    };
  }, []);

  useEffect(() => {
    return onBroadcastLine(setBroadcastLine);
  }, []);

  useEffect(() => {
    setDebugMode(debug);
  }, [debug]);

  function handleMentalityChange(next: Mentality) {
    setMentality(next);
    applyTeamTacticsConfig("A", myTacticalStyleRef.current, next, myAxesOverrideRef.current);
    applyTeamAttackConfig("A", myTacticalStyleRef.current, next, myAxesOverrideRef.current);
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

  const teamA = gameState.players.filter((p) => p.team === "A");
  const teamB = gameState.players.filter((p) => p.team === "B");
  const passFromId = gameState.pass?.fromId;
  // toId is null during a through ball — the receiver is undetermined until landing.
  const passToId = gameState.pass?.toId ?? undefined;
  const score = gameState.score ?? { A: 0, B: 0 };
  const decisions = gameState.decisions;

  const subbedInA = new Set(
    gameState.substitutions.filter((s) => s.team === "A").map((s) => s.playerInId),
  );
  const subbedInB = new Set(
    gameState.substitutions.filter((s) => s.team === "B").map((s) => s.playerInId),
  );

  // Half-time/extra-time: read straight off the engine's own countdown, so the bar tracks
  // exactly what actually gates the pause (including e.g. staying put while `paused`).
  // Full-time: no engine countdown left once matchPhase is 'matchEnd' — use the rAF-driven
  // fraction timed against the same speed-scaled delay that schedules the navigation.
  const overlayProgress =
    matchOverlay === "halfTime" || matchOverlay === "extraTime"
      ? 1 - Math.max(0, Math.min(1, gameState.presentationCountdown / PRESENTATION_DURATION))
      : matchOverlay === "matchEnd"
      ? matchEndProgress
      : undefined;

  return (
    <div className="h-screen overflow-hidden bg-background flex flex-col">
      <GoalOverlay
        scoringTeam={goalFlash?.team ?? null}
        score={goalFlash?.score ?? gameState.score}
        kitColorA={matchKitColors.teamA}
        kitColorB={matchKitColors.teamB}
        nameA={teamAWithCrest?.name}
        nameB={teamBWithCrest?.name}
      />
      {injuryNotice && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-card border border-destructive/40 rounded-lg px-4 py-2 text-sm text-foreground">
          {t("match.injuryNotice", {
            player: injuryNotice.playerName,
            severity: t(`match.injurySeverity.${injuryNotice.severity}`),
          })}
        </div>
      )}
      <MatchOverlay
        kind={matchOverlay}
        score={score}
        kitColorA={matchKitColors.teamA}
        kitColorB={matchKitColors.teamB}
        penaltiesScore={gameState.shootout?.finalScore}
        progress={overlayProgress}
      />

      {/* Scoreboard Header */}
      <header className="bg-card/80 backdrop-blur-sm border-b border-border px-4 py-3 shrink-0">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 flex-wrap">
          <ScoreBar
            scoreA={score.A}
            scoreB={score.B}
            matchTime={gameState.matchTime ?? 0}
            matchPhase={gameState.matchPhase ?? "preMatch"}
            teamA={teamAWithCrest}
            teamB={teamBWithCrest}
            scoreColorA={matchKitColors.teamA}
            scoreColorB={matchKitColors.teamB}
            aggregate={gameState.aggregate}
          />

          {gameState.shootout && (
            <PenaltyShootoutStrip
              shootout={gameState.shootout}
              nameA={teamAWithCrest?.name ?? "A"}
              nameB={teamBWithCrest?.name ?? "B"}
            />
          )}

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setPaused((p) => !p)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary/50 border border-border hover:border-primary/50 transition-all font-semibold text-sm cursor-pointer text-foreground"
            >
              {paused ? <Icon name="play" className="w-4 h-4" /> : <Icon name="pause" className="w-4 h-4" />}
              {paused ? t("match.play") : t("match.pause")}
            </button>
            <div className="flex items-center gap-1 rounded-lg border border-border bg-secondary/50 p-1">
              {GAME_SPEEDS.map((s) => (
                <button
                  key={s}
                  onClick={() => setGameSpeed(s)}
                  className={`px-3 py-1.5 rounded-md font-semibold text-sm cursor-pointer transition-all ${
                    gameSpeed === s
                      ? "bg-primary/20 text-primary"
                      : "text-foreground hover:text-primary"
                  }`}
                >
                  {s}×
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1 rounded-lg border border-border bg-secondary/50 p-1">
              {MENTALITY_OPTIONS.map((m) => (
                <button
                  key={m}
                  onClick={() => handleMentalityChange(m)}
                  className={`px-3 py-1.5 rounded-md font-semibold text-sm cursor-pointer transition-all ${
                    mentality === m
                      ? "bg-primary/20 text-primary"
                      : "text-foreground hover:text-primary"
                  }`}
                >
                  {t(`match.mentality.${m}`)}
                </button>
              ))}
            </div>
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
          </div>
        </div>
      </header>

      {/* Main Match View */}
      <main className="flex-1 flex overflow-hidden min-h-0">
        <TeamPanel
          team="A"
          teamName={teamAWithCrest?.name}
          accentColor={matchKitColors.teamA}
          players={teamA}
          score={score.A}
          ballHolderId={gameState.ballHolderId}
          passFromId={passFromId}
          passToId={passToId}
          decisions={decisions}
          ratings={ratings}
          selectedPlayerId={selectedPlayerId}
          onSelectPlayer={setSelectedPlayerId}
          subsRemaining={gameState.subsRemainingA}
          pendingSubsCount={gameState.pendingSubsA.length}
          subbedInPlayerIds={subbedInA}
        />

        <div className="flex-1 flex flex-col min-w-0">
          <div
            ref={pitchHostRef}
            className="flex-1 flex items-center justify-center min-h-0 overflow-hidden"
          >
            {pitchSize ? (
              <PixiPitch
                key={`${pitchSize.w}x${pitchSize.h}`}
                canvasWidth={pitchSize.w}
                canvasHeight={pitchSize.h}
                paused={paused}
                debugMode={debug}
                initialState={gameState}
                gameSpeed={gameSpeed}
                teamAColor={matchKitColors.teamA}
                teamBColor={matchKitColors.teamB}
              />
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

          {showStats && (
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

        <TeamPanel
          team="B"
          teamName={teamBWithCrest?.name}
          accentColor={matchKitColors.teamB}
          players={teamB}
          score={score.B}
          ballHolderId={gameState.ballHolderId}
          passFromId={passFromId}
          passToId={passToId}
          decisions={decisions}
          ratings={ratings}
          selectedPlayerId={selectedPlayerId}
          onSelectPlayer={setSelectedPlayerId}
          subsRemaining={gameState.subsRemainingB}
          pendingSubsCount={gameState.pendingSubsB.length}
          subbedInPlayerIds={subbedInB}
        />
      </main>

      {showSubPanel && (
        <SubstitutionPanel
          gameState={gameState}
          playerTeam="A"
          ratings={ratings}
          onQueueSub={handleQueueSub}
          onChangeFormation={handleChangeFormation}
          onClose={handleCloseSubPanel}
        />
      )}
    </div>
  );
}
