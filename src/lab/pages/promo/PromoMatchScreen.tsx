/**
 * Promo Match Screen — minimal, clean match render for promo video recording.
 *
 * Boots from a pre-built GameState scenario (e.g. the El Clásico through-ball
 * moment). The ScenarioEditor floating panel lets you swap between built-in
 * and custom-saved scenarios, paste your own JSON, capture the live state,
 * and save snapshots — without leaving the page.
 *
 * URL params:
 *   ?scenario=<id>   load a specific scenario by id (default: el-clasico)
 *   ?speed=<N>       engine speed multiplier 0.5..8 (default: 2)
 *   ?yards=1         show 10-yard reference grid
 *   ?debug=1         enable engine debug mode
 *   ?paused=1        start paused
 *   ?nav=hide        hide LabNav + ScenarioEditor (for clean recording)
 *
 * Run:  bun run lab
 *       open http://localhost:4000/promo
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { PixiPitch } from "@/GraficsEngine/PixiPitch";
import type { DebugOverlays } from "@/GraficsEngine/PixiPitch";
import { ScoreBar } from "@/GameInterface/ScoreBar";
import { GoalOverlay } from "@/GameInterface/GoalOverlay";
import { applyTeamTacticsConfig } from "@/GameEngine/Configs/DefenseConfig";
import { applyTeamAttackConfig } from "@/GameEngine/Configs/AttackConfig";
import { gameBus } from "@/GameEngine/Infrastructure/EventBus";
import { resolveMatchTeamKitColors } from "@/GameInterface/matchTeamColors";
import {
  clearBroadcastLine,
  getBroadcastLine,
  onBroadcastLine,
} from "@/GameInterface/Broadcast/BroadcastLog";
import "@/GameInterface/Broadcast/BroadcastSubscriber";
import type { GameState, TeamId, MatchPhase } from "@/GameEngine/types";
import {
  type Scenario,
  DEFAULT_SCENARIO_ID,
  getScenario,
} from "./scenarios";
import { ScenarioEditor } from "./ScenarioEditor";

// Real Madrid + Barcelona kit colors come from the scenario's _meta.
const FALLBACK_HOME = { primary: "#FFFFFF", secondary: "#FEBE10", name: "Real Madrid" };
const FALLBACK_AWAY = { primary: "#A50044", secondary: "#004D98", name: "Barcelona" };

// Everything off — clean recording surface.
const PROMO_OVERLAYS: DebugOverlays = {
  passLanes: false,
  xG: false,
  movementTargets: false,
  interceptionCorridors: false,
  marking: false,
  throughBallCells: false,
  switchPlay: false,
};

// URL params.
const url = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
const SPEED = Math.max(0.5, Math.min(8, Number(url.get("speed") ?? "2")));
const DEBUG = url.get("debug") === "1";
const SHOW_YARDS = url.get("yards") === "1";
const PAUSED = url.get("paused") === "1";
const INITIAL_SCENARIO_ID = url.get("scenario") ?? DEFAULT_SCENARIO_ID;

export function PromoMatchScreen() {
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [score, setScore] = useState<{ A: number; B: number }>({ A: 0, B: 0 });
  const [matchTime, setMatchTime] = useState(0);
  const [matchPhase, setMatchPhase] = useState<MatchPhase>("preMatch");
  const [scoringTeam, setScoringTeam] = useState<TeamId | null>(null);
  const [broadcastLine, setBroadcastLine] = useState<string>(() => getBroadcastLine());
  const pitchHostRef = useRef<HTMLDivElement | null>(null);
  const [pitchSize, setPitchSize] = useState<{ w: number; h: number } | null>(null);
  const liveStateRef = useRef<GameState | null>(null);
  // Bumping replayKey forces PixiPitch to re-mount and re-initialise from
  // initialState — gives a clean "rewind to start of scenario" for retakes.
  const [replayKey, setReplayKey] = useState(0);
  const [restartFlash, setRestartFlash] = useState(false);

  // 1) Load the initial scenario from URL (or the default).
  useEffect(() => {
    applyTeamTacticsConfig("A", "balanced");
    applyTeamAttackConfig("A", "balanced");
    applyTeamTacticsConfig("B", "balanced");
    applyTeamAttackConfig("B", "balanced");

    const initial = getScenario(INITIAL_SCENARIO_ID) ?? getScenario(DEFAULT_SCENARIO_ID);
    if (initial) {
      setScenario(initial);
      // Reset score / clock from the loaded state.
      setScore(initial.state.score);
      setMatchTime(initial.state.matchTime);
      setMatchPhase(initial.state.matchPhase);
    }
  }, []);

  // 2) Pitch sizing — full window minus the score bar and broadcast strip.
  useEffect(() => {
    const measure = () => {
      const host = pitchHostRef.current;
      if (!host) return;
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (w <= 0 || h <= 0) return;
      const ASPECT = 124 / 80;
      const widthFromHeight = h * ASPECT;
      const cw = widthFromHeight <= w ? widthFromHeight : w;
      const ch = widthFromHeight <= w ? h : w / ASPECT;
      setPitchSize({ w: Math.floor(cw), h: Math.floor(ch) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (pitchHostRef.current) ro.observe(pitchHostRef.current);
    return () => ro.disconnect();
  }, [scenario]);

  // 3) Engine subscriptions — drive scoreboard + capture live state for export.
  useEffect(() => {
    const unsub1 = gameBus.on("stateChanged", (s) => {
      liveStateRef.current = s;
      setScore(s.score);
      setMatchTime(s.matchTime);
      setMatchPhase(s.matchPhase);
    });
    const unsub2 = gameBus.on("goalScored", (e) => {
      setScoringTeam(e.team);
      window.setTimeout(() => setScoringTeam(null), 3000);
    });
    return () => {
      unsub1();
      unsub2();
    };
  }, []);

  // 4) Broadcast ticker.
  useEffect(() => onBroadcastLine(setBroadcastLine), []);
  useEffect(() => () => clearBroadcastLine(), []);

  // Handler for the ScenarioEditor — swap to a new scenario without reloading.
  const handleLoadScenario = useCallback((next: Scenario) => {
    setScenario(next);
    setScore(next.state.score);
    setMatchTime(next.state.matchTime);
    setMatchPhase(next.state.matchPhase);
    setScoringTeam(null);
    liveStateRef.current = next.state;
    setReplayKey((k) => k + 1);
    // Sync the URL so refreshes preserve the choice (but don't trigger navigation).
    const params = new URLSearchParams(window.location.search);
    params.set("scenario", next.meta.id);
    window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
  }, []);

  // Rewind the current scenario to its saved start. Used by the R keybind and
  // the Restart button in the scenario editor.
  const restartScenario = useCallback(() => {
    if (!scenario) return;
    setScore(scenario.state.score);
    setMatchTime(scenario.state.matchTime);
    setMatchPhase(scenario.state.matchPhase);
    setScoringTeam(null);
    liveStateRef.current = scenario.state;
    setReplayKey((k) => k + 1);
    setRestartFlash(true);
    window.setTimeout(() => setRestartFlash(false), 700);
  }, [scenario]);

  // R / Cmd+R-safe keybind. Restarts the active scenario unless the user is
  // typing in an input/textarea/contenteditable element.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "r" && e.key !== "R") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return; // don't hijack Cmd+R
      const t = e.target as HTMLElement | null;
      if (t) {
        const tag = t.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        if (t.isContentEditable) return;
      }
      e.preventDefault();
      restartScenario();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [restartScenario]);

  const getLiveState = useCallback(() => liveStateRef.current, []);

  // Kit colors / team meta — fall back to RM/Barça if scenario doesn't override.
  const homeName = scenario?.meta.homeName ?? FALLBACK_HOME.name;
  const awayName = scenario?.meta.awayName ?? FALLBACK_AWAY.name;

  const matchKit = resolveMatchTeamKitColors(
    { primary: FALLBACK_HOME.primary, secondary: FALLBACK_HOME.secondary },
    { primary: FALLBACK_AWAY.primary, secondary: FALLBACK_AWAY.secondary },
  );

  const teamAMeta = {
    name: homeName,
    primaryColor: FALLBACK_HOME.primary,
    secondaryColor: FALLBACK_HOME.secondary,
    logoUrl: "/api/logos/la_liga/real_madrid",
  };
  const teamBMeta = {
    name: awayName,
    primaryColor: FALLBACK_AWAY.primary,
    secondaryColor: FALLBACK_AWAY.secondary,
    logoUrl: "/api/logos/la_liga/barcelona",
  };

  if (!scenario) {
    return (
      <div className="h-screen flex items-center justify-center bg-background text-foreground">
        <div className="text-center space-y-2">
          <div className="font-display font-black uppercase tracking-widest text-xl text-primary glow-text">
            Loading scenario…
          </div>
          <div className="text-sm text-muted-foreground">
            {INITIAL_SCENARIO_ID}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-background overflow-hidden">
      {/* Score bar */}
      <div className="px-6 py-4 border-b border-border bg-card/40 flex items-center justify-center">
        <ScoreBar
          scoreA={score.A}
          scoreB={score.B}
          matchTime={matchTime}
          matchPhase={matchPhase}
          teamA={teamAMeta}
          teamB={teamBMeta}
          scoreColorA={matchKit.teamA}
          scoreColorB={matchKit.teamB}
        />
      </div>

      {/* Pitch */}
      <div ref={pitchHostRef} className="flex-1 flex items-center justify-center min-h-0 px-6 py-4">
        {pitchSize ? (
          <PixiPitch
            // Re-mount when the scenario id or replay counter changes so
            // PixiPitch re-initialises from initialState (it only reads
            // initialState on mount). Bumping replayKey = rewind to start.
            key={`${scenario.meta.id}-${replayKey}-${pitchSize.w}x${pitchSize.h}`}
            canvasWidth={pitchSize.w}
            canvasHeight={pitchSize.h}
            paused={PAUSED}
            debugMode={DEBUG}
            showYardRefs={SHOW_YARDS}
            initialState={scenario.state}
            gameSpeed={SPEED}
            teamAColor={matchKit.teamA}
            teamBColor={matchKit.teamB}
            debugOverlays={PROMO_OVERLAYS}
          />
        ) : (
          <span className="text-muted-foreground font-mono text-sm">Sizing pitch…</span>
        )}
      </div>

      {/* Broadcast ticker */}
      <div className="px-6 py-3 border-t border-border bg-card/40 flex items-center gap-3">
        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest shrink-0">
          Broadcast
        </span>
        <span className="text-sm text-foreground truncate flex-1">
          {broadcastLine || (
            <span className="text-muted-foreground italic">Waiting for action…</span>
          )}
        </span>
        <span
          className="text-[10px] uppercase tracking-widest text-muted-foreground shrink-0 flex items-center gap-1.5 hidden"
          title="Press R to restart the scenario from the beginning"
        >
          press
          <kbd className="bg-secondary border border-border rounded px-1.5 py-0.5 text-[10px] font-mono font-bold text-primary">
            R
          </kbd>
          to restart
        </span>
      </div>

      {/* Restart flash overlay — brief flicker on the pitch so retake feel is obvious */}
      {restartFlash && (
        <div
          className="absolute inset-0 pointer-events-none z-40"
          style={{
            background:
              "radial-gradient(ellipse at center, oklch(0.75 0.18 var(--team-hue) / 0.18) 0%, transparent 70%)",
          }}
        />
      )}

      {/* Goal celebration */}
      <GoalOverlay
        scoringTeam={scoringTeam}
        score={score}
        kitColorA={matchKit.teamA}
        kitColorB={matchKit.teamB}
      />

      {/* Scenario editor — hidden by ?nav=hide */}
      <ScenarioEditor
        activeId={scenario.meta.id}
        onLoad={handleLoadScenario}
        getLiveState={getLiveState}
        onRestart={restartScenario}
      />
    </div>
  );
}
