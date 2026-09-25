import { useEffect, useRef } from "react";
import { Application, Container, Graphics, Text, TextStyle } from "pixi.js";
import { tickState, getBallPos } from "@/GameEngine/Domain/gameState";
import { advanceSim } from "@/GameEngine/Domain/advanceSim";
import { startSimClock } from "@/GraficsEngine/simClock";
import { normalizeGameState } from "@/GameEngine/Domain/RuntimeLineup";
import { getPassLanes } from "@/GameEngine/Domain/PassLanes";
import { playerInterceptionCorridor, computeXG, computeOpenAngle, computeWeightedPressure } from "@/GameEngine/Infrastructure/ActionOutcomes";
import { gameBus } from "@/GameEngine/Infrastructure/EventBus";
import { PITCH_LENGTH, PITCH_WIDTH, GOAL_Y_MIN, GOAL_Y_MAX } from "@/GameEngine/Domain/pitch";
import { decide } from "@/GameEngine/Domain/DecisionTree";
import { detectTeamIntent } from "@/GameEngine/Domain/IntentDetection";
import { getExtraCarryLanes, getPassTargetBias } from "@/GameEngine/Configs/IntentConfig";
import { assignMarkTargets } from "@/GameEngine/Domain/DefensivePositioning";
import {
  computeCrowdGrid,
  attackingTeam,
  maxValue,
  GRID_COLS,
  GRID_ROWS,
  CELL_W,
  CELL_H,
} from "@/GameEngine/Infrastructure/CrowdGrid";
import type { GridMatrix } from "@/GameEngine/Infrastructure/CrowdGrid";
import { DEFAULT_EVAL_CONFIG } from "@/GameEngine/Infrastructure/SpatialEvaluation";
import type { EvaluationConfig } from "@/GameEngine/Infrastructure/SpatialEvaluation";
import type { CrowdMode } from "@/GameInterface/CrowdHeatmapPanel";

const PITCH_SPEC = {
  lengthYds: PITCH_LENGTH,
  widthYds: PITCH_WIDTH,
  centreCircleRadiusYds: 10,
  goalAreaDepthYds: 6,
  goalAreaWidthYds: 18,
  penaltyAreaDepthYds: 18,
  penaltyAreaWidthYds: 44,
  penaltySpotDistanceYds: 12,
  cornerArcRadiusYds: 1,
} as const;

interface PitchMetrics {
  scale: number;
  width: number; height: number;
  marginX: number; marginY: number;
  centreCircleRadius: number;
  goalAreaDepth: number; goalAreaWidth: number;
  penaltyAreaDepth: number; penaltyAreaWidth: number;
  penaltySpotDistance: number;
  cornerArcRadius: number;
  goalNetDepth: number;
}

function buildMetrics(canvasW: number, canvasH: number): PitchMetrics {
  const goalNetDepthYds = 2;
  const totalLengthYds = PITCH_SPEC.lengthYds + 2 * goalNetDepthYds;
  const scale = Math.min(canvasW / totalLengthYds, canvasH / PITCH_SPEC.widthYds);

  const netDepth = Math.round(goalNetDepthYds * scale);
  const pitchW   = Math.round(PITCH_SPEC.lengthYds * scale);
  const pitchH   = Math.round(PITCH_SPEC.widthYds  * scale);

  const totalW      = pitchW + 2 * netDepth;
  const outerMargin = Math.round((canvasW - totalW) / 2);

  return {
    scale,
    width:  pitchW,
    height: pitchH,
    marginX: outerMargin + netDepth,
    marginY: Math.round((canvasH - pitchH) / 2),
    centreCircleRadius:  Math.round(PITCH_SPEC.centreCircleRadiusYds  * scale),
    goalAreaDepth:       Math.round(PITCH_SPEC.goalAreaDepthYds        * scale),
    goalAreaWidth:       Math.round(PITCH_SPEC.goalAreaWidthYds        * scale),
    penaltyAreaDepth:    Math.round(PITCH_SPEC.penaltyAreaDepthYds     * scale),
    penaltyAreaWidth:    Math.round(PITCH_SPEC.penaltyAreaWidthYds     * scale),
    penaltySpotDistance: Math.round(PITCH_SPEC.penaltySpotDistanceYds  * scale),
    cornerArcRadius:     Math.round(PITCH_SPEC.cornerArcRadiusYds      * scale),
    goalNetDepth: netDepth,
  };
}

function drawYardReferences(g: Graphics, labels: Container, m: PitchMetrics) {
  const { marginX: ox, marginY: oy, scale, width, height } = m;

  const GRID = { width: 1,   color: 0xffffff, alpha: 0.20 };
  const TICK = { width: 1.5, color: 0xffffff, alpha: 0.80 };
  const TICK_LEN = 4;
  const PAD      = 3; // gap between touchline and label inside pitch

  const numStyle = new TextStyle({
    fontSize:   9,
    fontFamily: 'monospace',
    fontWeight: 'bold',
    fill:       0xffffff,
    dropShadow: { color: 0x000000, blur: 3, distance: 0, alpha: 1.0 },
  });

  // ── X axis: vertical grid lines + ticks + labels just INSIDE the top touchline ──
  for (let xYd = 0; xYd <= PITCH_LENGTH; xYd += 10) {
    const px = ox + xYd * scale;

    if (xYd > 0 && xYd < PITCH_LENGTH) {
      g.moveTo(px, oy).lineTo(px, oy + height).stroke(GRID);
    }

    // Short tick on the top touchline (always inside so it's never clipped)
    g.moveTo(px, oy).lineTo(px, oy + TICK_LEN).stroke(TICK);

    // Label just below the tick, inside the pitch
    const t = new Text({ text: String(xYd), style: numStyle });
    t.anchor.set(0.5, 0.0); // top-center
    t.x = px;
    t.y = oy + TICK_LEN + PAD;
    labels.addChild(t);
  }

  // ── Y axis: horizontal grid lines + ticks + labels just INSIDE the left touchline ──
  for (let yYd = 0; yYd <= PITCH_WIDTH; yYd += 10) {
    const py = oy + yYd * scale;

    if (yYd > 0 && yYd < PITCH_WIDTH) {
      g.moveTo(ox, py).lineTo(ox + width, py).stroke(GRID);
    }

    // Short tick on the left touchline (inside the pitch)
    g.moveTo(ox, py).lineTo(ox + TICK_LEN, py).stroke(TICK);

    // Label just to the right of the tick, inside the pitch
    const t = new Text({ text: String(yYd), style: numStyle });
    t.anchor.set(0.0, 0.5); // left-center
    t.x = ox + TICK_LEN + PAD;
    t.y = py;
    labels.addChild(t);
  }
}

/** Parse CSS hex (`#rgb`, `#rrggbb`) to Pixi fill color (0xRRGGBB). */
function cssColorToPixiHex(css: string): number {
  const s = css.trim();
  if (!s.startsWith("#")) return 0x888888;
  const hex = s.slice(1);
  if (hex.length === 3) {
    const r = parseInt(hex[0]! + hex[0]!, 16);
    const g = parseInt(hex[1]! + hex[1]!, 16);
    const b = parseInt(hex[2]! + hex[2]!, 16);
    if (![r, g, b].every((n) => Number.isFinite(n))) return 0x888888;
    return (r << 16) | (g << 8) | b;
  }
  if (hex.length >= 6) {
    const n = parseInt(hex.slice(0, 6), 16);
    return Number.isFinite(n) ? n : 0x888888;
  }
  return 0x888888;
}

const DEFAULT_TEAM_A = 0x2d6cdf;
const DEFAULT_TEAM_B = 0xdf3b2d;

function drawPitch(g: Graphics, m: PitchMetrics) {
  const LINE = { width: 2, color: 0xffffff, alpha: 0.9 };
  const { marginX: x, marginY: y, width, height } = m;

  g.rect(x, y, width, height).stroke(LINE);

  const midX    = x + width / 2;
  const centerY = y + height / 2;

  g.moveTo(midX, y).lineTo(midX, y + height).stroke(LINE);
  g.circle(midX, centerY, m.centreCircleRadius).stroke(LINE);

  const hw  = m.goalAreaWidth    / 2;
  const hpw = m.penaltyAreaWidth / 2;
  const rx  = x + width;

  // Left boxes + spot
  g.rect(x, centerY - hw,  m.goalAreaDepth,    m.goalAreaWidth).stroke(LINE);
  g.rect(x, centerY - hpw, m.penaltyAreaDepth, m.penaltyAreaWidth).stroke(LINE);
  g.circle(x + m.penaltySpotDistance, centerY, 2).fill(0xffffff);

  // Right boxes + spot
  g.rect(rx - m.goalAreaDepth,    centerY - hw,  m.goalAreaDepth,    m.goalAreaWidth).stroke(LINE);
  g.rect(rx - m.penaltyAreaDepth, centerY - hpw, m.penaltyAreaDepth, m.penaltyAreaWidth).stroke(LINE);
  g.circle(rx - m.penaltySpotDistance, centerY, 2).fill(0xffffff);

  // Corner arcs
  const r = m.cornerArcRadius;
  g.arc(x,  y,          r, 0,            Math.PI / 2)      .stroke(LINE);
  g.arc(rx, y,          r, Math.PI / 2,  Math.PI)          .stroke(LINE);
  g.arc(rx, y + height, r, Math.PI,      3 * Math.PI / 2)  .stroke(LINE);
  g.arc(x,  y + height, r, 3 * Math.PI / 2, 2 * Math.PI)  .stroke(LINE);

  // Goal nets
  const goalYTop    = y + GOAL_Y_MIN * m.scale;
  const goalYBot    = y + GOAL_Y_MAX * m.scale;
  const goalHeight  = goalYBot - goalYTop;
  const NET = { width: 2, color: 0xffffff, alpha: 0.7 };

  g.rect(x - m.goalNetDepth, goalYTop, m.goalNetDepth, goalHeight).stroke(NET);
  g.rect(rx, goalYTop, m.goalNetDepth, goalHeight).stroke(NET);
}

export interface DebugOverlays {
  passLanes:              boolean;
  xG:                    boolean;
  movementTargets:       boolean;
  interceptionCorridors: boolean;
  marking:               boolean;
  throughBallCells:      boolean;
  switchPlay:            boolean;
}

export const DEFAULT_DEBUG_OVERLAYS: DebugOverlays = {
  passLanes:              true,
  xG:                    true,
  movementTargets:       false,
  interceptionCorridors: true,
  marking:               false,
  throughBallCells:      false,
  switchPlay:            false,
};

interface Props {
  canvasWidth?: number;
  canvasHeight?: number;
  paused?: boolean;
  debugMode?: boolean;
  /** Which debug overlays are enabled (only relevant when debugMode=true). */
  debugOverlays?: DebugOverlays;
  /** Show 10-yard grid lines and axis labels on the pitch for position reference. */
  showYardRefs?: boolean;
  /** Override the initial GameState (e.g. for test scenarios). Uses full match state if omitted. */
  initialState?: import('../GameEngine/types').GameState;
  /** Simulation speed multiplier — 0.25 / 0.5 / 1 / 2. Default: 1. */
  gameSpeed?: number;
  /** Called with the nearest GamePlayer when the user clicks on the pitch. */
  onPlayerClick?: (player: import('../GameEngine/types').GamePlayer) => void;
  /** Called with pitch coordinates (yards) on every click inside the pitch. Fires alongside onPlayerClick. */
  onPitchClick?: (x: number, y: number) => void;
  /** Render the crowd density heatmap overlay on top of the pitch. */
  crowdOverlayEnabled?: boolean;
  /** Which heatmap matrix to render: attack / defense (derived from ball holder) or crowd (sum). */
  crowdOverlayMode?: CrowdMode;
  /** Spatial evaluation config — controls include flags on the heatmap and the radius/falloff guides at the click point. */
  crowdEvalConfig?: EvaluationConfig;
  /** Last clicked pitch coordinate (yards). When set, renders a marker + radius/falloff guides on the heatmap. */
  crowdClickPos?: { x: number; y: number } | null;
  /** Team A (home / user) kit color — CSS hex, e.g. `#a3e635`. Falls back to blue. */
  teamAColor?: string;
  /** Team B (away) kit color — CSS hex. Falls back to red. */
  teamBColor?: string;
  /**
   * Keep the Pixi ticker running while paused (renders every frame but skips tickState).
   * Required for test-screen features like arrow-key player movement to appear immediately.
   * In normal match mode this should be false (ticker stops on pause → no wasted CPU).
   */
  keepTickerAlive?: boolean;
  /**
   * Populated with a function that extracts the current rendered pitch as a PNG data URL.
   * Null while the Pixi app is uninitialised. Lets a parent (e.g. TestScreen) grab a
   * screenshot to save alongside a debug snapshot.
   */
  captureRef?: import("react").MutableRefObject<(() => Promise<string | null>) | null>;
}

export function PixiPitch({
  canvasWidth = 900,
  canvasHeight = 520,
  paused = false,
  debugMode = false,
  debugOverlays = DEFAULT_DEBUG_OVERLAYS,
  showYardRefs = false,
  initialState,
  gameSpeed = 1,
  onPlayerClick,
  onPitchClick,
  crowdOverlayEnabled = false,
  crowdOverlayMode = 'crowd',
  crowdEvalConfig = DEFAULT_EVAL_CONFIG,
  crowdClickPos = null,
  teamAColor,
  teamBColor,
  keepTickerAlive = false,
  captureRef,
}: Props) {
  const hostRef                  = useRef<HTMLDivElement | null>(null);
  const appRef                   = useRef<Application | null>(null);
  const debugModeRef             = useRef(debugMode);
  const debugOverlaysRef         = useRef(debugOverlays);
  const gameSpeedRef             = useRef(gameSpeed);
  const pausedRef                = useRef(paused);
  const onPlayerClickRef         = useRef(onPlayerClick);
  const onPitchClickRef          = useRef(onPitchClick);
  const crowdOverlayEnabledRef   = useRef(crowdOverlayEnabled);
  const crowdOverlayModeRef      = useRef(crowdOverlayMode);
  const crowdEvalConfigRef       = useRef(crowdEvalConfig);
  const crowdClickPosRef         = useRef(crowdClickPos);

  useEffect(() => { onPlayerClickRef.current = onPlayerClick; }, [onPlayerClick]);
  useEffect(() => { onPitchClickRef.current  = onPitchClick;  }, [onPitchClick]);

  // Sync live props into refs so the ticker reads them without re-mounting
  useEffect(() => { debugModeRef.current             = debugMode;             }, [debugMode]);
  useEffect(() => { debugOverlaysRef.current         = debugOverlays;         }, [debugOverlays]);
  useEffect(() => { gameSpeedRef.current             = gameSpeed;             }, [gameSpeed]);
  useEffect(() => { pausedRef.current                = paused;                }, [paused]);
  useEffect(() => { crowdOverlayEnabledRef.current   = crowdOverlayEnabled;   }, [crowdOverlayEnabled]);
  useEffect(() => { crowdOverlayModeRef.current      = crowdOverlayMode;      }, [crowdOverlayMode]);
  useEffect(() => { crowdEvalConfigRef.current       = crowdEvalConfig;       }, [crowdEvalConfig]);
  useEffect(() => { crowdClickPosRef.current         = crowdClickPos;         }, [crowdClickPos]);

  // Stop/start ticker on pause — unless keepTickerAlive is set (test screen needs live rendering)
  useEffect(() => {
    if (keepTickerAlive) return;
    const ticker = appRef.current?.ticker;
    if (!ticker) return;
    paused ? ticker.stop() : ticker.start();
  }, [paused, keepTickerAlive]);

  useEffect(() => {
    if (!hostRef.current) return;
    let disposed = false;
    let initialized = false;

    const run = async () => {
      const app = new Application();
      appRef.current = app;

      await app.init({
        width: canvasWidth,
        height: canvasHeight,
        background: "#0b6b2f",
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        // autoDensity is critical: without it, Pixi sets the canvas's HTML width/height attributes
        // to (logical × resolution) but leaves CSS unset — so the browser lays out the canvas at
        // backing-store size (e.g. 1376×886 instead of 688×443 on a HiDPI display).
        autoDensity: true,
      });

      // Unmounted during init — destroy now and bail.
      // Touching app.canvas before init returns throws (Pixi v8 getter reads through _renderer).
      // The hostRef.current null check covers a race where React unsets the ref (mutation phase)
      // before firing the effect cleanup that flips disposed (passive phase) — they're separate
      // commit phases, so init can resolve in between.
      if (disposed || !hostRef.current) {
        try { app.destroy(true); } catch { /* swallow — already torn down */ }
        appRef.current = null;
        return;
      }

      initialized = true;
      app.ticker.maxFPS = 60;

      hostRef.current.appendChild(app.canvas);

      // Expose a screenshot grabber to the parent (e.g. TestScreen debug-save).
      if (captureRef) {
        captureRef.current = async () => {
          try {
            return await app.renderer.extract.base64({ target: app.stage, format: "png" });
          } catch {
            return null;
          }
        };
      }

      const m = buildMetrics(canvasWidth, canvasHeight);

      // Converts game yards → canvas pixels
      const toPixel = (x: number, y: number) => ({
        px: m.marginX + x * m.scale,
        py: m.marginY + y * m.scale,
      });

      // Pitch lines
      const pitchGraphics = new Graphics();
      drawPitch(pitchGraphics, m);
      app.stage.addChild(pitchGraphics);

      // Yard reference grid (optional — always static, drawn once)
      if (showYardRefs) {
        const yardGridGfx   = new Graphics();
        const yardLabelsCtr = new Container();
        drawYardReferences(yardGridGfx, yardLabelsCtr, m);
        app.stage.addChild(yardGridGfx);
        app.stage.addChild(yardLabelsCtr);
      }

      // Pass-lane overlay (debug only — sits between pitch and players)
      const passLinesGfx = new Graphics();
      app.stage.addChild(passLinesGfx);

      // Movement target arrows (debug only)
      const movementTargetsGfx = new Graphics();
      app.stage.addChild(movementTargetsGfx);

      // Through-ball candidate cells (debug only — heatmap of scored target cells)
      const throughBallGfx = new Graphics();
      throughBallGfx.eventMode = 'none';
      app.stage.addChild(throughBallGfx);

      // Score labels for each lane — pool of 11 (max teammates), reused every tick
      const laneScoreStyle = new TextStyle({
        fontSize:   9,
        fontFamily: 'monospace',
        fontWeight: 'bold',
        fill:       0xffffff,
        dropShadow: { color: 0x000000, blur: 4, distance: 0, alpha: 1 },
      });
      const passLabelsCtr = new Container();
      app.stage.addChild(passLabelsCtr);
      const laneLabelPool: Text[] = Array.from({ length: 11 }, () => {
        const t = new Text({ text: '', style: laneScoreStyle });
        t.anchor.set(0.5, 0.5);
        t.visible = false;
        passLabelsCtr.addChild(t);
        return t;
      });

      // Shot chance label — shown near ball holder in debug mode
      const shotLblStyle = new TextStyle({
        fontSize:   11,
        fontFamily: 'monospace',
        fontWeight: 'bold',
        fill:       0xff8800,
        dropShadow: { color: 0x000000, blur: 4, distance: 0, alpha: 1 },
      });
      const shotLbl = new Text({ text: '', style: shotLblStyle });
      shotLbl.anchor.set(0.5, 1);
      shotLbl.visible = false;
      passLabelsCtr.addChild(shotLbl);

      const world = new Container();
      world.sortableChildren = true;
      app.stage.addChild(world);

      // ── Game state ──
      const stateRef = { current: normalizeGameState(initialState!) };

      // React (MatchScreen) is the source of truth for UI-driven fields (pending subs,
      // benches, etc.). Keep the Pixi simulation ref aligned on every snapshot.
      const unsubMatchStateSync = gameBus.on("matchStateSync", (s) => {
        stateRef.current = normalizeGameState(s);
      });

      // ── Simulation clock ──
      // Drives tickState from its own pulse (Worker timer, or a main-thread
      // setInterval fallback) instead of the Pixi ticker (rAF), so the match
      // keeps advancing while the tab is backgrounded — rAF is frozen/throttled
      // by the browser in that case, Worker timers are not. See simClock.ts and
      // .claude/rules — spec: docs/superpowers/specs/2026-09-25-match-live-controls-design.md §3.
      // The Pixi ticker below only renders `stateRef.current`; it never calls tickState.
      const simClock = startSimClock((elapsedRealSeconds) => {
        if (pausedRef.current) return;
        const gameSeconds = elapsedRealSeconds * gameSpeedRef.current;
        if (gameSeconds <= 0) return;
        const { state: nextState } = advanceSim(stateRef.current, gameSeconds);
        stateRef.current = nextState;
        gameBus.emit('stateChanged', stateRef.current);
      });

      // ── Through-ball cells cache ──
      // Engine emits `throughBallScores` from decideBallHolder when debug is on.
      // We cache the latest payload so the ticker can render the heatmap without
      // re-computing the candidate cells.
      type TbCells = import('../GameEngine/Infrastructure/EventBus').GameEvents['throughBallScores']['cells'];
      let lastTbCells: TbCells = [];
      let lastTbHolder: number | null = null;
      const unsubTbScores = gameBus.on('throughBallScores', (e) => {
        lastTbCells  = e.cells;
        lastTbHolder = e.playerId;
      });

      // ── Through-ball chase commits cache ──
      type ChaseCommit = import('../GameEngine/Infrastructure/EventBus').GameEvents['chaseCommit'];
      let lastChase: ChaseCommit | null = null;
      const unsubChase = gameBus.on('chaseCommit', (e) => {
        lastChase = e;
      });

      // ── Player graphics ──
      const playerGraphics = new Map<number, Graphics>();
      const playerLabels   = new Map<number, Text>();

      const labelStyle = new TextStyle({
        fontSize:   9,
        fontFamily: 'sans-serif',
        fontWeight: '600',
        fill:       0xffffff,
        dropShadow: { color: 0x000000, blur: 3, distance: 0, alpha: 0.8 },
      });

      const fillA = teamAColor ? cssColorToPixiHex(teamAColor) : DEFAULT_TEAM_A;
      const fillB = teamBColor ? cssColorToPixiHex(teamBColor) : DEFAULT_TEAM_B;

      /** Create a sprite + label for a player and register them in the maps. */
      function addPlayerSprite(player: (typeof stateRef.current.players)[0]): void {
        const color = player.team === "A" ? fillA : fillB;
        const g = new Graphics();
        g.circle(0, 0, 10).fill(color);
        g.circle(0, 0, 10).stroke({ width: 2, color: 0x000000, alpha: 0.35 });
        const { px, py } = toPixel(player.x, player.y);
        g.x = px;
        g.y = py;
        world.addChild(g);
        playerGraphics.set(player.id, g);

        const label = new Text({ text: player.name, style: labelStyle });
        label.anchor.set(0.5, 1);
        label.x = px;
        label.y = py - 12;
        world.addChild(label);
        playerLabels.set(player.id, label);
      }

      /** Remove and destroy the sprite + label for a player that left the pitch. */
      function removePlayerSprite(id: number): void {
        const g = playerGraphics.get(id);
        if (g) { world.removeChild(g); g.destroy(); playerGraphics.delete(id); }
        const lbl = playerLabels.get(id);
        if (lbl) { world.removeChild(lbl); lbl.destroy(); playerLabels.delete(id); }
      }

      // Track which ids currently have sprites so we can reconcile after substitutions
      let trackedPlayerIds = new Set(stateRef.current.players.map(p => p.id));

      for (const player of stateRef.current.players) {
        addPlayerSprite(player);
      }

      // ── Ball ──
      const ball = new Graphics();
      ball.circle(0, 0, 6).fill(0xffffff);
      ball.circle(0, 0, 6).stroke({ width: 2, color: 0x000000, alpha: 0.25 });
      ball.zIndex = 10; // always render on top of player sprites
      world.addChild(ball);

      // ── Crowd heatmap overlay ──
      // Added LAST so it draws on top of pitch lines, players, and debug overlays.
      // Alpha is set per-cell during rendering so the underlying game stays visible.
      // eventMode='none' is critical: the heatmap is a pure visual layer — it must
      // never intercept clicks, otherwise the user can't click on cells / players underneath.
      const crowdHeatmapGfx = new Graphics();
      crowdHeatmapGfx.eventMode = 'none';
      app.stage.addChild(crowdHeatmapGfx);

      // ── Player + pitch click handler ──
      const handleCanvasClick = (e: MouseEvent) => {
        const playerCb = onPlayerClickRef.current;
        const pitchCb  = onPitchClickRef.current;
        if (!playerCb && !pitchCb) return;
        const canvasEl = app.canvas as HTMLCanvasElement;
        const rect = canvasEl.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;

        // Map CSS click coords → logical canvas coords. The canvas's CSS size is
        // not guaranteed to equal its logical size (devicePixelRatio scaling, flex
        // compression, autoDensity differences) so we derive the scale from the rect.
        const cssX = e.clientX - rect.left;
        const cssY = e.clientY - rect.top;
        const logicalX = cssX * (canvasWidth  / rect.width);
        const logicalY = cssY * (canvasHeight / rect.height);

        // Logical canvas → game (yards). m is built from logical dims, so this works.
        const gameX = (logicalX - m.marginX) / m.scale;
        const gameY = (logicalY - m.marginY) / m.scale;

        if (playerCb) {
          let nearest: (typeof stateRef.current.players)[0] | null = null;
          let nearestDist = Infinity;
          for (const p of stateRef.current.players) {
            const d = Math.hypot(p.x - gameX, p.y - gameY);
            if (d < nearestDist && d < 6) { nearest = p; nearestDist = d; }
          }
          if (nearest) playerCb(nearest);
        }

        // Always fire onPitchClick when the click is inside the pitch — independent of
        // whether a player was hit. The pitch click feeds the spatial evaluation panel.
        if (pitchCb && gameX >= 0 && gameX <= PITCH_LENGTH && gameY >= 0 && gameY <= PITCH_WIDTH) {
          pitchCb(gameX, gameY);
        }
      };
      (app.canvas as HTMLCanvasElement).style.cursor = 'pointer';
      app.canvas.addEventListener('click', handleCanvasClick);

      // ── Animation loop ──
      // Rendering only — the simulation itself is advanced by simClock above,
      // independent of this rAF-driven ticker. This ticker still runs (or is
      // stopped on pause, see the paused/keepTickerAlive effect) purely to draw
      // `stateRef.current` and to keep debug-overlay/testCommand visuals live.
      app.ticker.add(() => {
        // Reconcile player sprites after substitutions — new player ids get fresh
        // sprites; old ids no longer on the pitch have their sprites destroyed.
        const currentPlayerIds = new Set(stateRef.current.players.map(p => p.id));
        if (currentPlayerIds.size !== trackedPlayerIds.size ||
            stateRef.current.players.some(p => !trackedPlayerIds.has(p.id))) {
          for (const player of stateRef.current.players) {
            if (!playerGraphics.has(player.id)) addPlayerSprite(player);
          }
          for (const id of trackedPlayerIds) {
            if (!currentPlayerIds.has(id)) removePlayerSprite(id);
          }
          trackedPlayerIds = currentPlayerIds;
        }

        // Players: game pos → pixels (exact position). Name must refresh every frame so
        // substitutions update the label on the pitch.
        for (const player of stateRef.current.players) {
          const g     = playerGraphics.get(player.id);
          const label = playerLabels.get(player.id);
          if (!g) continue;
          const { px, py } = toPixel(player.x, player.y);
          g.x = px;
          g.y = py;
          if (label) {
            if (label.text !== player.name) label.text = player.name;
            label.x = px;
            label.y = py - 12;
          }
        }

        // Debug overlays
        passLinesGfx.clear();
        movementTargetsGfx.clear();
        throughBallGfx.clear();
        for (const lbl of laneLabelPool) lbl.visible = false;
        shotLbl.visible = false;
        if (debugModeRef.current) {
          const ovl        = debugOverlaysRef.current;
          const ballHolder = stateRef.current.players.find(p => p.id === stateRef.current.ballHolderId);

          // ── Through-ball candidate cells — heatmap of scored target cells ──
          // Red (low) → yellow (mid) → green (high). Alpha scales with score so weak
          // cells barely show. Best cell gets a gold marker on top.
          if (
            ovl.throughBallCells &&
            !stateRef.current.pass &&
            !stateRef.current.shot &&
            ballHolder &&
            lastTbHolder === ballHolder.id &&
            lastTbCells.length > 0
          ) {
            const cellW = CELL_W * m.scale;
            const cellH = CELL_H * m.scale;
            for (let i = 0; i < lastTbCells.length; i++) {
              const cell = lastTbCells[i]!;
              const s = Math.max(0, Math.min(1, cell.score));
              // Red (low) → yellow (0.5) → green (high)
              const cr = s < 0.5 ? 255 : Math.round((1 - s) * 2 * 255);
              const cg = s < 0.5 ? Math.round(s * 2 * 255) : 255;
              const cb = 80;
              const color = (cr << 16) | (cg << 8) | cb;
              const alpha = 0.18 + s * 0.45;
              const px0 = m.marginX + (cell.x - CELL_W / 2) * m.scale;
              const py0 = m.marginY + (cell.y - CELL_H / 2) * m.scale;
              throughBallGfx.rect(px0, py0, cellW, cellH).fill({ color, alpha });
            }
            // Best cell — gold ring
            const best = lastTbCells[0]!;
            const { px: bx, py: by } = toPixel(best.x, best.y);
            throughBallGfx
              .circle(bx, by, Math.max(cellW, cellH) * 0.7)
              .stroke({ width: 2, color: 0xffcc00, alpha: 0.95 });
          }

          // ── Sprint paths during through-ball flight — chasers' lines to landing ──
          if (ovl.throughBallCells && stateRef.current.pass?.kind === 'through') {
            const pass = stateRef.current.pass;
            const { px: lx, py: ly } = toPixel(pass.toX, pass.toY);
            // Pulsing landing marker
            throughBallGfx
              .circle(lx, ly, 6)
              .stroke({ width: 2, color: 0xffcc00, alpha: 0.9 });
            throughBallGfx
              .circle(lx, ly, 12)
              .stroke({ width: 1, color: 0xffcc00, alpha: 0.4 });

            // Sprint paths for each player currently chasing
            for (const player of stateRef.current.players) {
              const dec = stateRef.current.decisions[player.id];
              if (dec?.type !== 'chase_loose_ball') continue;
              const { px: cx, py: cy } = toPixel(player.x, player.y);
              const color = player.team === 'A' ? 0x66aaff : 0xff7777;
              throughBallGfx.moveTo(cx, cy).lineTo(lx, ly).stroke({ width: 1.8, color, alpha: 0.65 });
              // Small triangle near the chaser as predicted-winner marker
              throughBallGfx.circle(cx, cy, 4).stroke({ width: 1.5, color, alpha: 0.9 });
            }
          }

          // ── Interception corridors — rings around each defending player ──
          if (ovl.interceptionCorridors && ballHolder) {
            for (const player of stateRef.current.players) {
              if (player.team === ballHolder.team) continue;
              const corridorYds = playerInterceptionCorridor(player);
              const corridorPx  = corridorYds * m.scale;
              const { px: ppx, py: ppy } = toPixel(player.x, player.y);
              passLinesGfx
                .circle(ppx, ppy, corridorPx)
                .stroke({ width: 1, color: 0x44ffff, alpha: 0.35 });
            }
          }

          // ── Movement targets — dashed line + arrowhead to targetPosition ──
          if (ovl.movementTargets) {
            for (const player of stateRef.current.players) {
              const tp  = player.targetPosition;
              const dx  = tp.x - player.x;
              const dy  = tp.y - player.y;
              const len = Math.sqrt(dx * dx + dy * dy);
              if (len < 0.5) continue; // skip if essentially at target

              const { px: sx, py: sy } = toPixel(player.x, player.y);
              const { px: ex, py: ey } = toPixel(tp.x, tp.y);
              const color = player.team === 'A' ? 0x88aaff : 0xff8888;

              // Dashed line: alternating drawn/skipped segments
              const DASH_PX = 5;
              const GAP_PX  = 4;
              const totalPx = Math.sqrt((ex - sx) ** 2 + (ey - sy) ** 2);
              const ux = (ex - sx) / totalPx;
              const uy = (ey - sy) / totalPx;
              let dist = 0;
              let draw = true;
              while (dist < totalPx - 2) {
                const segLen = Math.min(draw ? DASH_PX : GAP_PX, totalPx - dist);
                if (draw) {
                  movementTargetsGfx
                    .moveTo(sx + ux * dist, sy + uy * dist)
                    .lineTo(sx + ux * (dist + segLen), sy + uy * (dist + segLen))
                    .stroke({ width: 1.2, color, alpha: 0.55 });
                }
                dist += segLen;
                draw = !draw;
              }

              // Small arrowhead at destination
              const ang = Math.atan2(ey - sy, ex - sx);
              const H   = 6;
              movementTargetsGfx
                .moveTo(ex, ey)
                .lineTo(ex - H * Math.cos(ang - 0.5), ey - H * Math.sin(ang - 0.5))
                .stroke({ width: 1.5, color, alpha: 0.7 });
              movementTargetsGfx
                .moveTo(ex, ey)
                .lineTo(ex - H * Math.cos(ang + 0.5), ey - H * Math.sin(ang + 0.5))
                .stroke({ width: 1.5, color, alpha: 0.7 });
            }

            // Decision-intent arrows for carry / support_run / create_space
            for (const player of stateRef.current.players) {
              const dec = stateRef.current.decisions[player.id];
              if (!dec) continue;
              if (dec.type !== 'carry' && dec.type !== 'support_run' && dec.type !== 'create_space') continue;
              const ARROW_YDS = 8;
              const { px: sx, py: sy } = toPixel(player.x, player.y);
              const { px: ex, py: ey } = toPixel(
                player.x + dec.dx * ARROW_YDS,
                player.y + dec.dy * ARROW_YDS,
              );
              const color = dec.type === 'carry' ? 0xffcc00 : dec.type === 'support_run' ? 0x44ffcc : 0xcc88ff;
              movementTargetsGfx.moveTo(sx, sy).lineTo(ex, ey).stroke({ width: 2, color, alpha: 0.8 });
              const ang = Math.atan2(ey - sy, ex - sx);
              const H   = 8;
              movementTargetsGfx.moveTo(ex, ey).lineTo(ex - H * Math.cos(ang - 0.45), ey - H * Math.sin(ang - 0.45)).stroke({ width: 2, color, alpha: 0.8 });
              movementTargetsGfx.moveTo(ex, ey).lineTo(ex - H * Math.cos(ang + 0.45), ey - H * Math.sin(ang + 0.45)).stroke({ width: 2, color, alpha: 0.8 });
            }

            // Dribble decision — line to target defender
            for (const player of stateRef.current.players) {
              const dec = stateRef.current.decisions[player.id];
              if (dec?.type !== 'dribble') continue;
              const target = stateRef.current.players.find(p => p.id === dec.targetId);
              if (!target) continue;
              const { px: sx, py: sy } = toPixel(player.x, player.y);
              const { px: ex, py: ey } = toPixel(target.x, target.y);
              movementTargetsGfx.moveTo(sx, sy).lineTo(ex, ey).stroke({ width: 1.5, color: 0xff44ff, alpha: 0.65 });
            }
          }

          // ── Marking assignments ──────────────────────────────────────────────
          if (ovl.marking && ballHolder) {
            const defendingTeam = ballHolder.team === 'A' ? 'B' : 'A';
            const marks = assignMarkTargets(stateRef.current.players, defendingTeam);
            for (const [defId, oppId] of marks) {
              const defender = stateRef.current.players.find(p => p.id === defId);
              const opponent = stateRef.current.players.find(p => p.id === oppId);
              if (!defender || !opponent) continue;
              const { px: dx, py: dy } = toPixel(defender.x, defender.y);
              const { px: ox, py: oy } = toPixel(opponent.x, opponent.y);

              // Dashed orange line from defender → marked opponent
              const totalPx = Math.sqrt((ox - dx) ** 2 + (oy - dy) ** 2);
              if (totalPx < 2) continue;
              const ux = (ox - dx) / totalPx;
              const uy = (oy - dy) / totalPx;
              let dist = 0;
              let draw = true;
              while (dist < totalPx - 2) {
                const segLen = Math.min(draw ? 6 : 4, totalPx - dist);
                if (draw) {
                  passLinesGfx
                    .moveTo(dx + ux * dist, dy + uy * dist)
                    .lineTo(dx + ux * (dist + segLen), dy + uy * (dist + segLen))
                    .stroke({ width: 1.5, color: 0xff9900, alpha: 0.6 });
                }
                dist += segLen;
                draw = !draw;
              }

              // Small dot on the marked player
              passLinesGfx.circle(ox, oy, 5).stroke({ width: 1.5, color: 0xff9900, alpha: 0.8 });
            }
          }

          // ── Pass-lane overlay + carry arrow — only while ball is held ───
          if (!stateRef.current.pass && !stateRef.current.shot && ballHolder) {
            const { px: hx, py: hy } = toPixel(ballHolder.x, ballHolder.y);
            const holderDecision = stateRef.current.decisions[ballHolder.id];

            if (ovl.passLanes) {
              // Pass lane lines (green / red) + score labels
              const lanes = getPassLanes(stateRef.current);
              for (let i = 0; i < lanes.length; i++) {
                const lane = lanes[i]!;
                const { px: tx, py: ty } = toPixel(lane.toX, lane.toY);
                const color = lane.open ? 0x22ff88 : 0xff4444;
                const alpha = lane.open ? 0.55 : 0.28;
                passLinesGfx.moveTo(hx, hy).lineTo(tx, ty).stroke({ width: 1.5, color, alpha });
                passLinesGfx.circle(tx, ty, 3).fill({ color, alpha });

                const lbl = laneLabelPool[i];
                if (lbl) {
                  lbl.text    = lane.score.toFixed(2);
                  lbl.x       = (hx + tx) / 2;
                  lbl.y       = (hy + ty) / 2 - 6;
                  lbl.tint    = color;
                  lbl.alpha   = lane.open ? 0.95 : 0.65;
                  lbl.visible = true;
                }
              }

              // Carry intention arrow (yellow) — only when passLanes is on
              if (holderDecision?.type === 'carry') {
                const ARROW_YDS = 10;
                const { px: ex, py: ey } = toPixel(
                  ballHolder.x + holderDecision.dx * ARROW_YDS,
                  ballHolder.y + holderDecision.dy * ARROW_YDS,
                );
                passLinesGfx.moveTo(hx, hy).lineTo(ex, ey).stroke({ width: 2.5, color: 0xffcc00, alpha: 0.75 });
                const ang = Math.atan2(ey - hy, ex - hx);
                const H   = 9;
                passLinesGfx.moveTo(ex, ey).lineTo(ex - H * Math.cos(ang - 0.45), ey - H * Math.sin(ang - 0.45)).stroke({ width: 2, color: 0xffcc00, alpha: 0.75 });
                passLinesGfx.moveTo(ex, ey).lineTo(ex - H * Math.cos(ang + 0.45), ey - H * Math.sin(ang + 0.45)).stroke({ width: 2, color: 0xffcc00, alpha: 0.75 });
              }
            }

            // ── switch_play overlay (violet) ─────────────────────────────
            // Generic: reads the intent's additive descriptors from the
            // registry and resolves their geometry exactly like the engine —
            // never gated on the intent name.
            if (ovl.switchPlay) {
              const intent = stateRef.current.teamIntent[ballHolder.team];
              const VIOLET = 0xa78bfa;

              // Far-flank carry lane — mirror DecisionTree's resolution.
              for (const extra of getExtraCarryLanes(intent)) {
                if (extra.dir !== 'far_flank') continue;
                const towardFar = ballHolder.y < PITCH_WIDTH / 2 ? 1 : -1;
                const fdx = ballHolder.attackDir * 0.2;
                const fdy = towardFar;
                const mag = Math.sqrt(fdx * fdx + fdy * fdy);
                const LANE_YDS = 13;
                const { px: ex, py: ey } = toPixel(
                  ballHolder.x + (fdx / mag) * LANE_YDS,
                  ballHolder.y + (fdy / mag) * LANE_YDS,
                );
                passLinesGfx.moveTo(hx, hy).lineTo(ex, ey).stroke({ width: 2.5, color: VIOLET, alpha: 0.8 });
                const ang = Math.atan2(ey - hy, ex - hx);
                const H = 9;
                passLinesGfx.moveTo(ex, ey).lineTo(ex - H * Math.cos(ang - 0.45), ey - H * Math.sin(ang - 0.45)).stroke({ width: 2, color: VIOLET, alpha: 0.8 });
                passLinesGfx.moveTo(ex, ey).lineTo(ex - H * Math.cos(ang + 0.45), ey - H * Math.sin(ang + 0.45)).stroke({ width: 2, color: VIOLET, alpha: 0.8 });
              }

              // Far-side pass receivers — highlight teammates the switch targets.
              const passBias = getPassTargetBias(intent);
              if (passBias && passBias.kind === 'far_flank') {
                const holderFromCentre = ballHolder.y - PITCH_WIDTH / 2;
                if (holderFromCentre !== 0) {
                  for (const p of stateRef.current.players) {
                    if (p.team !== ballHolder.team || p.id === ballHolder.id) continue;
                    const recvFromCentre = p.y - PITCH_WIDTH / 2;
                    if (Math.sign(recvFromCentre) !== -Math.sign(holderFromCentre)) continue;
                    const { px: rx, py: ry } = toPixel(p.x, p.y);
                    passLinesGfx.circle(rx, ry, 9).stroke({ width: 2, color: VIOLET, alpha: 0.85 });
                  }
                }
              }
            }

            // ── xG label (orange) ────────────────────────────────────────
            if (ovl.xG) {
              const attackDir  = ballHolder.attackDir as 1 | -1;
              const goalX      = attackDir === 1 ? PITCH_SPEC.lengthYds : 0;
              const distToGoal = Math.abs(goalX - ballHolder.x);
              const openAngle  = computeOpenAngle(ballHolder.x, ballHolder.y, goalX);
              const defenders  = stateRef.current.players.filter(p => p.team !== ballHolder.team);
              const pressure   = computeWeightedPressure(ballHolder, defenders);
              const xg = computeXG(distToGoal, openAngle, pressure);
              shotLbl.text    = `xG ${Math.round(xg * 100)}%`;
              shotLbl.x       = hx;
              shotLbl.y       = hy - 20;
              shotLbl.visible = true;
            }
          }
        }

        // Ball: game coords → pixels
        const ballPos = getBallPos(stateRef.current);
        const { px: bx, py: by } = toPixel(ballPos.x, ballPos.y);
        ball.x = bx;
        ball.y = by;

        // ── Crowd heatmap overlay (drawn on top with per-cell alpha) ──
        crowdHeatmapGfx.clear();
        if (crowdOverlayEnabledRef.current) {
          const grid = computeCrowdGrid(stateRef.current);
          const mode = crowdOverlayModeRef.current;
          const cfg = crowdEvalConfigRef.current;
          const holderTeam = attackingTeam(stateRef.current);

          // Pick the matrix to render. Include flags filter teams out of the heatmap
          // so the slider has a visible effect on the pitch, not just the eval panel.
          let matrix: GridMatrix | null = null;
          if (mode === 'crowd') {
            if (cfg.includeTeamA && cfg.includeTeamB)      matrix = grid.crowd;
            else if (cfg.includeTeamA)                     matrix = grid.teamA;
            else if (cfg.includeTeamB)                     matrix = grid.teamB;
          } else if (mode === 'attack' && holderTeam) {
            const includeAtk = holderTeam === 'A' ? cfg.includeTeamA : cfg.includeTeamB;
            if (includeAtk) matrix = holderTeam === 'A' ? grid.teamA : grid.teamB;
          } else if (mode === 'defense' && holderTeam) {
            const includeDef = holderTeam === 'A' ? cfg.includeTeamB : cfg.includeTeamA;
            if (includeDef) matrix = holderTeam === 'A' ? grid.teamB : grid.teamA;
          }

          // Color per mode: attack = blue, defense = red, crowd = amber.
          const baseColor =
            mode === 'attack'  ? { r: 60,  g: 140, b: 255 } :
            mode === 'defense' ? { r: 255, g: 80,  b: 80  } :
                                 { r: 255, g: 200, b: 80  };

          if (matrix) {
            const max = maxValue(matrix);
            if (max > 0) {
              const cellW = CELL_W * m.scale;
              const cellH = CELL_H * m.scale;
              for (let r = 0; r < GRID_ROWS; r++) {
                for (let c = 0; c < GRID_COLS; c++) {
                  const v = matrix[r]![c]!;
                  if (v === 0) continue;
                  const t = v / max;                  // 0..1 normalised intensity
                  // Lerp white → baseColor by t. Higher t = more saturated team color.
                  const cr = Math.round(255 + (baseColor.r - 255) * t);
                  const cg = Math.round(255 + (baseColor.g - 255) * t);
                  const cb2 = Math.round(255 + (baseColor.b - 255) * t);
                  const color = (cr << 16) | (cg << 8) | cb2;
                  const px0 = m.marginX + c * CELL_W * m.scale;
                  const py0 = m.marginY + r * CELL_H * m.scale;
                  // Per-cell alpha scales with intensity so weak cells barely show.
                  const alpha = 0.15 + t * 0.45;
                  crowdHeatmapGfx.rect(px0, py0, cellW, cellH).fill({ color, alpha });
                }
              }
            }
          }

          // ── Click marker + radius / falloff guides ──
          // Makes the radius slider and falloff toggle visibly affect the pitch.
          const clickPos = crowdClickPosRef.current;
          if (clickPos) {
            const { px, py } = toPixel(clickPos.x, clickPos.y);
            const radiusPx = cfg.radius * m.scale;

            // Outer radius circle (white, dashed-feel via stroke alpha)
            crowdHeatmapGfx.circle(px, py, radiusPx)
              .stroke({ width: 2, color: 0xffffff, alpha: 0.7 });

            // Falloff guide circles at 75% / 50% / 25% influence
            // linear:  weight = 1 - d/r → d = r * (1 - w)
            // exp:     weight = exp(-d / (r/3)) → d = -ln(w) * r / 3
            for (const w of [0.75, 0.5, 0.25]) {
              const d =
                cfg.falloff === 'linear'
                  ? cfg.radius * (1 - w)
                  : -Math.log(w) * cfg.radius / 3;
              const dPx = d * m.scale;
              if (dPx > 1) {
                crowdHeatmapGfx.circle(px, py, dPx)
                  .stroke({ width: 1, color: 0xffffff, alpha: 0.25 });
              }
            }

            // Center dot
            crowdHeatmapGfx.circle(px, py, 3).fill({ color: 0xffffff, alpha: 0.95 });
            crowdHeatmapGfx.circle(px, py, 3).stroke({ width: 1, color: 0x000000, alpha: 0.6 });
          }
        }
      });

      // ── Test command handler (mutates stateRef directly for debug tools) ──
      const unsubTestCmd = gameBus.on('testCommand', cmd => {
        if (cmd.type === 'movePlayer') {
          stateRef.current = {
            ...stateRef.current,
            players: stateRef.current.players.map(p =>
              p.id === cmd.id ? { ...p, x: cmd.x, y: cmd.y } : p
            ),
          };
        } else if (cmd.type === 'giveBall') {
          const prev = stateRef.current.players.find(p => p.id === stateRef.current.ballHolderId);
          const next = stateRef.current.players.find(p => p.id === cmd.id);
          let teamIntent = stateRef.current.teamIntent;
          if (next && (!prev || prev.team !== next.team)) {
            const winner = next.team;
            const loser: 'A' | 'B' = winner === 'A' ? 'B' : 'A';
            const newIntent = detectTeamIntent({ ...stateRef.current, ballHolderId: cmd.id }, winner);
            teamIntent = { ...teamIntent, [winner]: newIntent, [loser]: 'balanced' };
            gameBus.emit('teamIntentChanged', { teamIntent });
          }
          stateRef.current = {
            ...stateRef.current,
            ballHolderId: cmd.id,
            pass: null,
            shot: null,
            looseBall: null,
            teamIntent,
          };
        } else if (cmd.type === 'patchPlayers') {
          stateRef.current = { ...stateRef.current, players: cmd.players };
        } else if (cmd.type === 'setTeamIntent') {
          const teamIntent = { ...stateRef.current.teamIntent, [cmd.team]: cmd.intent };
          stateRef.current = { ...stateRef.current, teamIntent };
          gameBus.emit('teamIntentChanged', { teamIntent });
        } else if (cmd.type === 'triggerPhase') {
          if (cmd.phase === 'halfTime') {
            stateRef.current = {
              ...stateRef.current,
              matchPhase: 'halfTime',
              presentationCountdown: 4,
              pass: null,
              shot: null,
              looseBall: null,
            };
            gameBus.emit('halfTime', {
              score: stateRef.current.score,
              extraTime: Math.round(stateRef.current.extraTimeSecond / 60),
            });
          } else if (cmd.phase === 'matchEnd') {
            stateRef.current = { ...stateRef.current, matchPhase: 'matchEnd' };
            gameBus.emit('matchEnd', { score: stateRef.current.score });
          }
        }
        gameBus.emit('stateChanged', stateRef.current);

        // Re-run the ball holder's decision so the debug panel scores update
        // immediately even when paused (tickState doesn't run while paused).
        const s = stateRef.current;
        const holder = s.players.find(p => p.id === s.ballHolderId);
        if (holder) {
          // Pass the same crowd grid the engine would build so debug scores match
          // what tickState would produce (carry path-clearness uses it).
          const grid = computeCrowdGrid(s);
          decide(holder, holder, true, false, s.players, null, s.possessionTime, s.setPiece, grid, s.teamIntent);
        }
      });

      // ── Tactics-change handler ───────────────────────────────────────────
      // Run a zero-dt tick so decisions + targetPositions are recomputed with
      // the new weights even while paused (ticker skips tickState when paused).
      const unsubTactics = gameBus.on('tacticsChanged', () => {
        const { state: next } = tickState(stateRef.current, 0);
        stateRef.current = next;
        gameBus.emit('stateChanged', stateRef.current);
      });

      return () => {
        simClock.destroy();
        unsubMatchStateSync();
        unsubTestCmd();
        unsubTactics();
        unsubTbScores();
        unsubChase();
      };
    };

    let cleanup: (() => void) | null = null;
    run().then(c => { cleanup = c ?? null; });

    return () => {
      disposed = true;
      cleanup?.();
      if (captureRef) captureRef.current = null;
      const app = appRef.current;
      appRef.current = null;
      // If init never completed, run() will destroy the app once it resolves (sees disposed).
      if (!initialized || !app) return;
      if (app.canvas?.parentNode) app.canvas.parentNode.removeChild(app.canvas);
      app.destroy(true);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      ref={hostRef}
      style={{ borderRadius: 12, border: "1px solid rgba(255,255,255,0.15)", flexShrink: 0 }}
    />
  );
}
