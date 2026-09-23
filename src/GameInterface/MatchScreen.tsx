import { useState, useEffect, useRef, useMemo, useCallback, lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import type { Fixture } from "@/types/calendarTypes";
import type { Squad } from "@/types/playerTypes";
import { Pause, Play, BarChart3, Settings, ArrowRightLeft } from "lucide-react";
import { PixiPitch } from "@/GraficsEngine/PixiPitch";
import { createMatchState, changeFormation } from "@/GameEngine/Domain/gameState";
import { gameBus } from "@/GameEngine/Infrastructure/EventBus";
import { setDebugMode } from "@/GameEngine/Suport/DebugLog";
import { initRatings, getAllRatings } from "@/GameEngine/Domain/PlayerRating";
import { initStats } from "@/GameEngine/Domain/Statistics";
import "@/GameEngine/Suport/DebugSubscriber";
import "@/GameInterface/Broadcast/BroadcastSubscriber";
import "@/GameEngine/Domain/Statistics";
import type { GameState, TeamId, Formation, PendingSub } from "@/GameEngine/types";
import type { TacticsSave } from "@/types/tacticsTypes";
import { DEFAULT_TACTICAL_STYLE } from "@/types/tacticsTypes";
import { loadSession } from "@/GameInterface/gameSession";
import { formationForSimId } from "@/Domain/matchFormations";
import { autoFillLineup } from "@/Domain/lineupHelpers";
import { getFormationSlots } from "@/types/formationSlots";
import type { FormationShape } from "@/types/formationSlots";
import { SubstitutionPanel } from "@/GameInterface/SubstitutionPanel";

const MATCH_END_TO_RESULT_MS = 3500;
import { applyTeamTacticsConfig } from "@/GameEngine/Configs/DefenseConfig";
import { applyTeamAttackConfig } from "@/GameEngine/Configs/AttackConfig";
import { TeamPanel } from "@/GameInterface/TeamPanel";
import { ScoreBar, type TeamMeta } from "@/GameInterface/ScoreBar";
import { clubLogoUrl } from "@/GameInterface/Components/ClubLogo";
import { StatsPanel } from "@/GameInterface/StatsPanel";

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
  const [debug, setDebug] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [paused, setPaused] = useState(false);
  const [gameSpeed, setGameSpeed] = useState(1);
  const [showSubPanel, setShowSubPanel] = useState(false);
  const [goalFlash, setGoalFlash] = useState<{
    team: TeamId;
    score: { A: number; B: number };
  } | null>(null);
  const [matchOverlay, setMatchOverlay] = useState<"halfTime" | "matchEnd" | null>(null);
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
        applyTeamTacticsConfig("A", tactics.tactical_style);
        applyTeamAttackConfig("A", tactics.tactical_style);
        applyTeamTacticsConfig("B", DEFAULT_TACTICAL_STYLE);
        applyTeamAttackConfig("B", DEFAULT_TACTICAL_STYLE);

        const opponentPlayers = data.opponentSquad?.players ?? data.mySquad.players;
        const oppSlots = getFormationSlots(data.oppFormation as unknown as FormationShape, "attacking");
        const oppLineup = autoFillLineup(oppSlots, opponentPlayers);
        const state = createMatchState(
          data.mySquad.players,
          data.myFormation,
          opponentPlayers,
          data.oppFormation,
          data.myLineup,
          oppLineup,
        );
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
          logoUrl: clubLogoUrl(data.save.leagueSlug, data.save.clubId),
        });
        if (data.opponentSquad) {
          const oppStem = data.opponentSquad.slug ?? data.opponentSquad.id;
          setTeamBMeta({
            name: data.opponentSquad.name,
            primaryColor: data.opponentSquad.colors[0],
            secondaryColor: data.opponentSquad.colors[1],
            logoUrl: clubLogoUrl(data.save.leagueSlug, oppStem),
          });
        }
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
    return gameBus.on("halfTime", () => {
      if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
      setMatchOverlay("halfTime");
      overlayTimerRef.current = setTimeout(() => setMatchOverlay(null), 3500);
    });
  }, []);

  useEffect(() => {
    const unsub = gameBus.on("matchEnd", () => {
      if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
      setMatchOverlay("matchEnd");
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
      }, MATCH_END_TO_RESULT_MS);
    });
    return () => {
      unsub();
      if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
    };
  }, []);

  useEffect(() => {
    return onBroadcastLine(setBroadcastLine);
  }, []);

  useEffect(() => {
    setDebugMode(debug);
  }, [debug]);

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

  if (loadError) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-lg text-center space-y-3">
          <p className="text-destructive font-black font-display uppercase tracking-wider text-sm">{t("common.cannotStartMatch")}</p>
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

  return (
    <div className="h-screen overflow-hidden bg-background flex flex-col">
      <GoalOverlay
        scoringTeam={goalFlash?.team ?? null}
        score={goalFlash?.score ?? gameState.score}
        kitColorA={matchKitColors.teamA}
        kitColorB={matchKitColors.teamB}
      />
      <MatchOverlay
        kind={matchOverlay}
        score={score}
        kitColorA={matchKitColors.teamA}
        kitColorB={matchKitColors.teamB}
      />

      {/* Scoreboard Header */}
      <header className="bg-card/80 backdrop-blur-sm border-b border-border px-4 py-3 shrink-0">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <ScoreBar
            scoreA={score.A}
            scoreB={score.B}
            matchTime={gameState.matchTime ?? 0}
            matchPhase={gameState.matchPhase ?? "preMatch"}
            teamA={teamAMeta}
            teamB={teamBMeta}
            scoreColorA={matchKitColors.teamA}
            scoreColorB={matchKitColors.teamB}
          />

          <div className="flex items-center gap-2">
            <button
              onClick={() => setPaused((p) => !p)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary/50 border border-border hover:border-primary/50 transition-all font-semibold text-sm cursor-pointer text-foreground"
            >
              {paused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
              {paused ? t("match.play") : t("match.pause")}
            </button>
            <button
              onClick={() => setGameSpeed((s) => (s === 1 ? 2 : 1))}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg border transition-all font-semibold text-sm cursor-pointer ${
                gameSpeed === 2
                  ? "bg-primary/20 text-primary border-primary/50"
                  : "bg-secondary/50 border-border hover:border-primary/50 text-foreground"
              }`}
            >
              2×
            </button>
            <button
              onClick={handleOpenSubPanel}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all font-semibold text-sm cursor-pointer ${
                gameState.pendingSubsA.length > 0
                  ? "bg-amber-500/20 text-amber-400 border-amber-500/50"
                  : gameState.subsRemainingA > 0
                  ? "bg-secondary/50 border-border hover:border-primary/50 text-foreground"
                  : "bg-secondary/30 border-border/50 text-muted-foreground cursor-not-allowed"
              }`}
            >
              <ArrowRightLeft className="w-4 h-4" />
              {t("match.subs", { remaining: gameState.subsRemainingA })}
            </button>
            <button
              onClick={() => setShowStats((s) => !s)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all font-semibold text-sm cursor-pointer ${
                showStats
                  ? "bg-primary text-primary-foreground border-primary glow-primary-sm"
                  : "bg-secondary/50 border-border hover:border-primary/50 text-foreground"
              }`}
            >
              <BarChart3 className="w-4 h-4" />
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
              <Settings className="w-4 h-4" />
              {t("match.debug")}
            </button>
          </div>
        </div>
      </header>

      {/* Main Match View */}
      <main className="flex-1 flex overflow-hidden min-h-0">
        <TeamPanel
          team="A"
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
              <span className="text-muted-foreground text-sm font-mono">{t("common.sizingPitch")}</span>
            )}
          </div>
          {/* Broadcast ticker */}
          <div className="px-4 py-2 border-t border-border bg-card/40">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mr-2">{t("common.broadcast")}</span>
            <span className="text-sm text-foreground">
              {broadcastLine || <span className="text-muted-foreground italic">{t("common.waitingForAction")}</span>}
            </span>
          </div>

          {showStats && (
            <StatsPanel
              players={gameState.players}
              substitutions={gameState.substitutions ?? []}
              teamColorA={matchKitColors.teamA}
              teamColorB={matchKitColors.teamB}
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
