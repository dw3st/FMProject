import { shirtName } from "@/Domain/shirtName";
import { useEffect, useRef, type MutableRefObject } from "react";
import { Application, CanvasSource, Container, FillGradient, Graphics, Rectangle, Sprite, Text, TextStyle, Texture } from "pixi.js";
import { faceRasterSize, loadFaceCanvas, markerLabelFontSize, needsLightOutline, playerMarkerRadius, PITCH_COLOR } from "@/GraficsEngine/playerFaces";
import { BALL, CARD_BADGE, EFFECT_DURATION, FATIGUE_BAR, HOLDER_GLOW, MARKER_SHADOW, PITCH_STRIPES, STADIUM, TELEPORT_YDS } from "@/GraficsEngine/pitchStyle";
import { nextSpinAngle } from "@/GraficsEngine/ballSpin";
import { drawnBall, drawnPlayerPositions, interpAlpha, nextRenderPair, samePositions, syncRenderPair, type DrawnBall, type Pos, type RenderPair } from "@/GraficsEngine/renderInterp";
import { blendBall, blendPlayers, isSetPieceStart, startTransition, transitionActive, transitionProgress, transitionSeconds, type SetPieceTransition } from "@/GraficsEngine/setPieceTransition";
import { bookedPlayerIds, fatigueColor, fatigueFill } from "@/GraficsEngine/markerInfo";
import {
  addEffect, advanceEffectClock, effectAlpha, liveEffects, liveTrail, pushTrail, shouldTrail,
  type PitchEffect, type TrailPoint,
} from "@/GraficsEngine/pitchEffects";
import { drawEffect, drawTrail, effectTextAnchor, type EffectCtx } from "@/GraficsEngine/effectsRender";
import { tickState, endCurrentPeriod, applyPlayerInstruction, setManMarksBySlot, swapPlayerPositions } from "@/GameEngine/Domain/gameState";
import { advanceSim, SIM_STEP } from "@/GameEngine/Domain/advanceSim";
import { startSimClock } from "@/GraficsEngine/simClock";
import { createPump, defaultNow } from "@/GraficsEngine/pump";
import { reconcileMatchStateSync } from "@/GraficsEngine/matchStateSync";
import { normalizeGameState } from "@/GameEngine/Domain/RuntimeLineup";
import { getPassLanes } from "@/GameEngine/Domain/PassLanes";
import { playerInterceptionCorridor, computeXG, computeOpenAngle, computeWeightedPressure } from "@/GameEngine/Infrastructure/ActionOutcomes";
import { gameBus } from "@/GameEngine/Infrastructure/EventBus";
import { AERIAL_CONFIG } from "@/GameEngine/Configs/AerialConfig";
import { isAerialKind } from "@/GameEngine/types";
import { evaluateBoxSetPiece } from "@/GameEngine/Domain/SetPieces";
import { SET_PIECE_CONFIG } from "@/GameEngine/Configs/SetPieceConfig";
import { getTeamBuildUp } from "@/GameEngine/Configs/AttackConfig";
import { PITCH_LENGTH, PITCH_WIDTH, GOAL_Y_MIN, GOAL_Y_MAX } from "@/GameEngine/Domain/pitch";
import { mirrorX } from "@/GraficsEngine/pitchMirror";
import { buildMetrics, PITCH_SPEC, type PitchMetrics } from "@/GraficsEngine/pitchMetrics";
import { drawStand, goalPulseAlpha } from "@/GraficsEngine/stadiumRender";
import { assistantForLineX, assistantTarget, OFFICIALS, refereeTarget, stepToward, type AssistantSide, type YdPos } from "@/GraficsEngine/officials";
import { coachGesture, coachSlots, GESTURE_DURATION, type CoachGestureKind } from "@/GraficsEngine/coaches";
import { addAnim, animOffset, isLongShot, liveAnims, type PlayerAnim } from "@/GraficsEngine/playerAnims";
import { drawCoachArms, makeCoach, makeOfficial, setFlagRaised, showCard, type CoachSprite } from "@/GraficsEngine/touchlineRender";
import { seedFrom } from "@/Domain/rng";
import type { TeamId } from "@/GameEngine/types";
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
import type { CrowdMode } from "@/GameEngine/Infrastructure/CrowdGrid";

/** Width of the team-colour ring around a player's face. */
const MARKER_RING_W = 3;

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

/** Mowing stripes inside the pitch rectangle; the background (margins) stays the dark colour. */
function drawStripes(g: Graphics, m: PitchMetrics) {
  const w = m.width / PITCH_STRIPES.COUNT;
  for (let i = 1; i < PITCH_STRIPES.COUNT; i += 2) {
    g.rect(m.marginX + i * w, m.marginY, w, m.height).fill(PITCH_STRIPES.LIGHT);
  }
}

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

  // Corner arcs. Each starts with an explicit moveTo to its own start point: a bare `arc()` on
  // a fresh path joined the arc to the previous pen position, which drew a stray diagonal line
  // in the top-left corner.
  const r = m.cornerArcRadius;
  g.moveTo(x + r, y).arc(x, y, r, 0, Math.PI / 2).stroke(LINE);
  g.moveTo(rx, y + r).arc(rx, y, r, Math.PI / 2, Math.PI).stroke(LINE);
  g.moveTo(rx - r, y + height).arc(rx, y + height, r, Math.PI, 3 * Math.PI / 2).stroke(LINE);
  g.moveTo(x, y + height - r).arc(x, y + height, r, 3 * Math.PI / 2, 2 * Math.PI).stroke(LINE);

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
  /** Cross targets while the holder is in a crossing position; landing point + AERIAL_RADIUS during a high ball. */
  aerial:                boolean;
  /** Set pieces (`set-pieces-play.md`): the wall of a direct free kick, the delivery options of a corner / crossed free kick. */
  setPieces:             boolean;
  /** Player instructions: the role-variant tag under each player, man-marking pairs (dashed line + ring on the target). */
  instructions:          boolean;
}

export const DEFAULT_DEBUG_OVERLAYS: DebugOverlays = {
  passLanes:              true,
  xG:                    true,
  movementTargets:       false,
  interceptionCorridors: true,
  marking:               false,
  throughBallCells:      false,
  switchPlay:            false,
  aerial:                false,
  setPieces:             true,
  instructions:          true,
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
  initialState?: import('@/GameEngine/types').GameState;
  /** Simulation speed multiplier — 0.25 / 0.5 / 1 / 2. Default: 1. */
  gameSpeed?: number;
  /** Called with the nearest GamePlayer when the user clicks on the pitch. */
  onPlayerClick?: (player: import('@/GameEngine/types').GamePlayer) => void;
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
   * Keep the Pixi ticker running while paused (renders every frame). The ticker still
   * calls `pumpSimulation()` every frame in that case, but `pump(paused)` returns 0
   * while paused, so no `tickState`/`advanceSim` call actually happens — it's a no-op
   * beyond advancing the shared pump's internal clock. Required for test-screen
   * features like arrow-key player movement to appear immediately. In normal match
   * mode this should be false (ticker stops on pause → no wasted CPU).
   */
  keepTickerAlive?: boolean;
  /**
   * Populated with a function that extracts the current rendered pitch as a PNG data URL.
   * Null while the Pixi app is uninitialised. Lets a parent (e.g. TestScreen) grab a
   * screenshot to save alongside a debug snapshot.
   */
  captureRef?: import("react").MutableRefObject<(() => Promise<string | null>) | null>;
  /**
   * Face image URL per team and roster id (`faceUrl(...)`), drawn inside each player's marker
   * with a team-colour ring. A player without an entry (or whose face fails to load) keeps the
   * plain team-colour circle; `/test` and the lab don't pass this at all.
   */
  faceUrls?: Partial<Record<import('@/GameEngine/types').TeamId, Record<string, string>>>;
  /** Texts drawn by the pitch effects; English defaults (the live match passes translations). */
  effectLabels?: { save: string; wide: string; offside: string };
  /**
   * Draw the pitch mirrored on the x axis (#98: the user plays away, home side on the left).
   * Drawing only — the game state, the simulation and the click mapping stay in engine yards.
   */
  mirror?: boolean;
  /**
   * Draw-time meter (/test): every PERF_SAMPLE_FRAMES frames gets `{ fps, drawMs }` (ticker FPS and
   * the average time of the frame callback). Absent: no measuring at all.
   */
  perfRef?: MutableRefObject<PitchPerf | null>;
  /**
   * Stadium band with the crowd (spec 2026-10-08-match-visual §1–§2). Read at mount: switching it on
   * or off needs a remount (put it in the `key`); `fill` / `homeTeam` / `neutral` / `seed` changes
   * re-bake the crowd texture. Absent / null: the plain pitch.
   */
  stadium?: PitchStadium | null;
  /** Referee, assistants and both managers on the touchline (§3–§4). Read at mount. */
  officials?: boolean;
  /** Managers' face (server URL) and club colour (CSS hex) per engine team; no face = a disc in the colour. */
  coaches?: Partial<Record<TeamId, { faceUrl?: string; color: string }>>;
  /** A new `seq` plays the gesture on that team's manager (the human's mentality change). */
  coachCue?: { team: TeamId; kind: "attack" | "defend" | "balanced"; seq: number } | null;
}

export interface PitchStadium {
  /** 0..1, attendance / capacity. */
  fill: number;
  /** Engine team of the home club (its fans fill most of the stand). */
  homeTeam: TeamId;
  neutral: boolean;
  /** Fixture id (or "test"): the same game fills the same seats. */
  seed: string;
}

export interface PitchPerf { fps: number; drawMs: number }
const PERF_SAMPLE_FRAMES = 30;

const DEFAULT_EFFECT_LABELS = { save: "SAVE", wide: "WIDE", offside: "OFFSIDE" };

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
  faceUrls,
  effectLabels,
  mirror = false,
  perfRef,
  stadium = null,
  officials = false,
  coaches,
  coachCue = null,
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
  const faceUrlsRef              = useRef(faceUrls);
  const effectLabelsRef          = useRef(effectLabels);
  const mirrorRef                = useRef(mirror);
  const perfRefRef               = useRef(perfRef);
  const stadiumRef               = useRef(stadium);
  const coachesRef               = useRef(coaches);
  /** Set by the Pixi setup: re-bakes the crowd texture from `stadiumRef`. */
  const redrawCrowdRef           = useRef<(() => void) | null>(null);
  /** Set by the Pixi setup: plays a gesture on a team's manager. */
  const coachCueFnRef            = useRef<((team: TeamId, kind: CoachGestureKind) => void) | null>(null);
  const labelsOf = () => effectLabelsRef.current ?? DEFAULT_EFFECT_LABELS;
  /** Set by the Pixi setup: (re)applies `faceUrlsRef` to the markers already on the pitch. */
  const refreshFacesRef          = useRef<(() => void) | null>(null);

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
  useEffect(() => { effectLabelsRef.current = effectLabels; }, [effectLabels]);
  useEffect(() => { mirrorRef.current = mirror; }, [mirror]);
  useEffect(() => { perfRefRef.current = perfRef; }, [perfRef]);
  useEffect(() => { faceUrlsRef.current = faceUrls; refreshFacesRef.current?.(); }, [faceUrls]);
  useEffect(() => { coachesRef.current = coaches; }, [coaches]);
  // Crowd texture: re-baked only when what it shows changes (never per frame).
  useEffect(() => {
    stadiumRef.current = stadium;
    redrawCrowdRef.current?.();
  }, [stadium?.fill, stadium?.homeTeam, stadium?.neutral, stadium?.seed, mirror]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (coachCue) coachCueFnRef.current?.(coachCue.team, coachCue.kind);
  }, [coachCue?.seq]); // eslint-disable-line react-hooks/exhaustive-deps

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
        background: PITCH_COLOR,
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

      const m = buildMetrics(canvasWidth, canvasHeight, { stadium: !!stadiumRef.current });

      // Converts game yards → canvas pixels (mirrored on x when `mirror` is set — drawing only)
      const toPixel = (x: number, y: number) => ({
        px: m.marginX + mirrorX(x, mirrorRef.current) * m.scale,
        py: m.marginY + y * m.scale,
      });

      const fillA = teamAColor ? cssColorToPixiHex(teamAColor) : DEFAULT_TEAM_A;
      const fillB = teamBColor ? cssColorToPixiHex(teamBColor) : DEFAULT_TEAM_B;

      // ── Stadium: stand + crowd baked into ONE texture (spec 2026-10-08-match-visual §2) ──
      // Re-baked only when the fill, the home team, the venue or the mirror change; zero cost per frame.
      let crowdSprite: Sprite | null = null;
      let crowdTexture: Texture | null = null;
      const bakeCrowd = () => {
        const st = stadiumRef.current;
        if (!m.stand || !st) return;
        const g = new Graphics();
        // The home club is drawn on the left when it is team A and the pitch is not mirrored (or B, mirrored).
        const homeLeft = (st.homeTeam === "A") !== mirrorRef.current;
        drawStand(g, m.stand, {
          fill: st.fill,
          homeColor: st.homeTeam === "A" ? fillA : fillB,
          awayColor: st.homeTeam === "A" ? fillB : fillA,
          homeSide: homeLeft ? "left" : "right",
          neutral: st.neutral,
          seed: st.seed,
        });
        const texture = app.renderer.generateTexture({
          target: g,
          resolution: app.renderer.resolution,
          frame: new Rectangle(0, 0, canvasWidth, canvasHeight),
        });
        g.destroy();
        if (!crowdSprite) {
          crowdSprite = new Sprite(texture);
          crowdSprite.eventMode = 'none';
          app.stage.addChildAt(crowdSprite, 0);
        } else {
          crowdSprite.texture = texture;
        }
        crowdTexture?.destroy(true);
        crowdTexture = texture;
      };
      bakeCrowd();
      redrawCrowdRef.current = bakeCrowd;
      /** Start of the last home-goal pulse on the effects clock (null: none running). */
      let crowdPulseAt: number | null = null;

      // Mowing stripes (static, drawn once — the pitch remounts on resize)
      const stripesGraphics = new Graphics();
      drawStripes(stripesGraphics, m);
      app.stage.addChild(stripesGraphics);

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

      // Player-instruction tags (role variant / pressing) — pool of 22, reused every tick
      const instrLabelStyle = new TextStyle({
        fontSize:   9,
        fontFamily: 'monospace',
        fontWeight: 'bold',
        fill:       0x7dd3fc,
        dropShadow: { color: 0x000000, blur: 4, distance: 0, alpha: 1 },
      });
      const instrLabelPool: Text[] = Array.from({ length: 22 }, () => {
        const t = new Text({ text: '', style: instrLabelStyle });
        t.anchor.set(0.5, 0);
        t.visible = false;
        passLabelsCtr.addChild(t);
        return t;
      });

      const world = new Container();
      world.sortableChildren = true;
      app.stage.addChild(world);

      // Ground glow under the ball holder and the stamina bars (redrawn every frame)
      const holderGlowGfx = new Graphics();
      holderGlowGfx.zIndex = -1;
      world.addChild(holderGlowGfx);
      const fatigueGfx = new Graphics();
      fatigueGfx.zIndex = 5; // with the names, under the ball
      world.addChild(fatigueGfx);

      // ── Game state ──
      const stateRef = { current: normalizeGameState(initialState!) };

      // React (MatchScreen) is the source of truth for UI-driven edits queued from a
      // paused UI (substitution panel: pending subs, formation change) — see
      // matchStateSync.ts for exactly which fields are UI-owned and why a snapshot
      // that's behind `stateRef.current` must never be allowed to rewind
      // simulation-owned fields (positions, ball, score, decisions, matchTime, …).
      // MatchScreen's own `useEffect` re-emits `matchStateSync` on every `gameState`
      // change — including the routine ones that just mirror what we ourselves last
      // emitted via `stateChanged` — and because that's a React render + effect
      // round-trip, the echo is very often already behind our own `stateRef.current`
      // by the time it arrives (we pump far more often than a round-trip completes).
      // Naively replacing `stateRef.current` with a stale echo would re-run ticks
      // whose events (goals, tackles, …) Statistics already counted once.
      const unsubMatchStateSync = gameBus.on("matchStateSync", (s) => {
        stateRef.current = reconcileMatchStateSync(stateRef.current, normalizeGameState(s));
      });

      // ── Simulation pump ──
      // `pump` is the single shared elapsed-time tracker (see pump.ts). `carry` is the
      // leftover game-time (always < SIM_STEP) that advanceSim couldn't fit into a
      // whole fixed step last time — threading it through means every `tickState` call
      // still gets exactly `SIM_STEP` of game-time, never a partial step, no matter how
      // irregularly `pumpSimulation` itself gets called.
      //
      // Only ONE of the two pump sources below is actually live at a time (see
      // `shouldWorkerPump`): the Pixi ticker pumps every rendered frame while the tab
      // is visible (smooth, ~60fps), and simClock's Worker pulse (~10fps) takes over
      // only once the ticker can no longer be trusted to keep firing (tab hidden, or
      // stopped for some other reason while not paused). `pump`'s shared `last`
      // timestamp would prevent double-counting even if both fired in the same
      // instant, but keeping only one live avoids the wasted/racing work entirely.
      //
      // Spec: docs/superpowers/specs/2026-09-25-match-live-controls-design.md §3.
      const pump = createPump(defaultNow);
      const simCarryRef = { current: 0 };
      // Render interpolation (spec 2026-10-06-match-smooth-ball §1): the frame draws
      // lerp(pair.prev, current, carry / SIM_STEP). The pump moves the pair (`nextRenderPair`);
      // the draw checks it against the state actually in `stateRef` (`syncRenderPair`), so a
      // swap from outside (matchStateSync, /test commands, tactics change) that moved something
      // is drawn as is.
      let renderPair: RenderPair = { prev: stateRef.current, cur: stateRef.current };
      // Set-piece transition (setPieceTransition.ts): a restart that repositions the teams is drawn as a short
      // eased walk from the last drawn positions to the layout, on a real-time clock frozen while paused.
      // Only when frames are being drawn: with the tab hidden there is no animation.
      let transitionNow = 0;
      let transition: SetPieceTransition | null = null;
      let setPieceStartPending = false;
      let lastDrawnPos: Map<number, Pos> | null = null;
      let lastDrawnBall: DrawnBall | null = null;
      const framesVisible = () =>
        !(typeof document !== 'undefined' && document.hidden) && app.ticker.started;

      const pumpSimulation = () => {
        const elapsedRealSeconds = pump(pausedRef.current);
        if (elapsedRealSeconds <= 0) return;
        const gameSeconds = elapsedRealSeconds * gameSpeedRef.current;
        const prevState = stateRef.current;
        const result = advanceSim(prevState, gameSeconds, simCarryRef.current);
        simCarryRef.current = result.carry;
        renderPair = nextRenderPair(renderPair, { prevState, result, steps: result.steps });
        if (!framesVisible()) {
          transition = null;
          setPieceStartPending = false;
        } else if (isSetPieceStart(prevState, result.state)) {
          setPieceStartPending = true;
        }
        // advanceSim returns the same reference when zero whole steps ran (not enough
        // carried+elapsed time yet, or tickState's own noop paths — e.g. matchEnd, or
        // a frozen presentation/set-piece countdown). Nothing changed: skip the emit.
        if (result.state === prevState) return;
        stateRef.current = result.state;
        gameBus.emit('stateChanged', stateRef.current);
      };

      // The Worker pulse only drives the simulation when the render loop can't be
      // trusted to: the tab is hidden (rAF is frozen/throttled by the browser in that
      // case, Worker timers are not), or the ticker has otherwise stopped while the
      // match isn't actually paused (a defensive fallback — normally the ticker only
      // stops via the paused/keepTickerAlive effect below, i.e. exactly when we don't
      // want to pump anyway, but this keeps the match moving if it ever stops for any
      // other reason).
      const shouldWorkerPump = () =>
        (typeof document !== 'undefined' && document.hidden) ||
        (!app.ticker.started && !pausedRef.current);

      const simClock = startSimClock(() => {
        if (shouldWorkerPump()) pumpSimulation();
      });

      // ── Through-ball cells cache ──
      // Engine emits `throughBallScores` from decideBallHolder when debug is on.
      // We cache the latest payload so the ticker can render the heatmap without
      // re-computing the candidate cells.
      type TbCells = import('@/GameEngine/Infrastructure/EventBus').GameEvents['throughBallScores']['cells'];
      let lastTbCells: TbCells = [];
      let lastTbHolder: number | null = null;
      const unsubTbScores = gameBus.on('throughBallScores', (e) => {
        lastTbCells  = e.cells;
        lastTbHolder = e.playerId;
      });

      // ── Cross targets cache (`crossScores`, emitted by decideBallHolder in debug mode) ──
      type CrossTargets = import('@/GameEngine/Infrastructure/EventBus').GameEvents['crossScores']['targets'];
      let lastCrossTargets: CrossTargets = [];
      let lastCrossHolder: number | null = null;
      const unsubCross = gameBus.on('crossScores', (e) => {
        lastCrossTargets = e.targets;
        lastCrossHolder  = e.playerId;
      });

      // ── Player graphics ──
      // Each marker is a container: team-colour disc, the player's face (once loaded) and a
      // team-colour ring on top. Without a face it reads as the old plain circle.
      const markerR = playerMarkerRadius(m.scale);
      const faceSize = faceRasterSize(markerR - 1, app.renderer.resolution);
      const playerGraphics = new Map<number, Container>();
      const playerLabels   = new Map<number, Text>();
      /** Pixi textures of the faces, per URL: owned by this app, destroyed on unmount. */
      const faceTextures = new Map<string, Texture>();
      let facesDisposed = false;

      const labelStyle = new TextStyle({
        fontSize:   markerLabelFontSize(markerR),
        fontFamily: 'sans-serif',
        fontWeight: '600',
        fill:       0xffffff,
        dropShadow: { color: 0x000000, blur: 3, distance: 0, alpha: 0.9 },
      });

      // A kit that blends into the grass (dark green) gets a thin light outline instead of the
      // usual dark one, per team, so its dots stay visible.
      const outlineOf = (color: number) => needsLightOutline(color)
        ? { width: 2, color: 0xffffff, alpha: 0.9 }
        : { width: 1.5, color: 0x000000, alpha: 0.45 };
      const outlineA = outlineOf(fillA);
      const outlineB = outlineOf(fillB);

      type PitchPlayer = (typeof stateRef.current.players)[0];
      const faceUrlOf = (p: PitchPlayer): string | undefined => faceUrlsRef.current?.[p.team]?.[p.rosterId];

      /** Puts the face texture in the marker (replacing any previous one), under the ring. */
      function setMarkerFace(marker: Container, url: string, texture: Texture): void {
        const old = marker.getChildByLabel('face');
        if (old) { marker.removeChild(old); old.destroy(); }
        const face = new Sprite(texture);
        face.label = 'face';
        face.anchor.set(0.5);
        face.width = face.height = (markerR - 1) * 2;
        marker.addChildAt(face, 2); // above shadow + disc, below the ring
        marker.label = url;
      }

      /** Loads (or reuses) the face of `player` and shows it in its marker when ready. */
      function applyFace(player: PitchPlayer): void {
        const marker = playerGraphics.get(player.id);
        const url = faceUrlOf(player);
        if (!marker || !url || marker.label === url) return;
        const ready = faceTextures.get(url);
        if (ready) { setMarkerFace(marker, url, ready); return; }
        void loadFaceCanvas(url, faceSize).then((canvas) => {
          if (!canvas || facesDisposed) return;
          let texture = faceTextures.get(url);
          if (!texture) {
            texture = new Texture({ source: new CanvasSource({ resource: canvas, transparent: true }) });
            faceTextures.set(url, texture);
          }
          // The marker may have been replaced (substitution) or re-pointed meanwhile.
          const current = playerGraphics.get(player.id);
          if (current && !current.destroyed && faceUrlOf(player) === url) setMarkerFace(current, url, texture);
        });
      }

      /** Create a marker + label for a player and register them in the maps. */
      function addPlayerSprite(player: PitchPlayer): void {
        const color = player.team === "A" ? fillA : fillB;
        const marker = new Container();
        const shadow = new Graphics()
          .ellipse(markerR * MARKER_SHADOW.DX, markerR * MARKER_SHADOW.DY, markerR, markerR * MARKER_SHADOW.SCALE_Y)
          .fill({ color: 0x000000, alpha: MARKER_SHADOW.ALPHA });
        const disc = new Graphics().circle(0, 0, markerR).fill(color);
        const ring = new Graphics()
          .circle(0, 0, markerR - MARKER_RING_W / 2 + 0.5).stroke({ width: MARKER_RING_W, color })
          .circle(0, 0, markerR + 0.5).stroke(player.team === "A" ? outlineA : outlineB);
        const cardBadge = new Graphics()
          .roundRect(markerR * CARD_BADGE.X, markerR * CARD_BADGE.Y, markerR * CARD_BADGE.W, markerR * CARD_BADGE.H, 2)
          .fill(CARD_BADGE.YELLOW)
          .stroke({ width: 1, color: 0x000000, alpha: 0.4 });
        cardBadge.label = "card";
        cardBadge.visible = false;
        marker.addChild(shadow, disc, ring, cardBadge);
        const { px, py } = toPixel(player.x, player.y);
        marker.x = px;
        marker.y = py;
        world.addChild(marker);
        playerGraphics.set(player.id, marker);

        const label = new Text({ text: shirtName(player.name), style: labelStyle });
        label.anchor.set(0.5, 1);
        label.x = px;
        label.y = py - (markerR + 3);
        label.zIndex = 5; // names above every marker, below the ball
        world.addChild(label);
        playerLabels.set(player.id, label);

        applyFace(player);
      }

      /** Remove and destroy the marker + label for a player that left the pitch. */
      function removePlayerSprite(id: number): void {
        const g = playerGraphics.get(id);
        if (g) { world.removeChild(g); g.destroy({ children: true }); playerGraphics.delete(id); }
        const lbl = playerLabels.get(id);
        if (lbl) { world.removeChild(lbl); lbl.destroy(); playerLabels.delete(id); }
      }

      refreshFacesRef.current = () => {
        for (const player of stateRef.current.players) applyFace(player);
      };

      // Track which ids currently have sprites so we can reconcile after substitutions
      let trackedPlayerIds = new Set(stateRef.current.players.map(p => p.id));

      for (const player of stateRef.current.players) {
        addPlayerSprite(player);
      }

      // ── Ball ──
      // Ground shadow (stays on the ground) + the ball, lifted by its illustrative height.
      const ballShadow = new Graphics()
        .ellipse(0, 0, BALL.RADIUS, BALL.RADIUS * BALL.SHADOW_RATIO_Y)
        .fill({ color: 0x000000, alpha: 1 });
      ballShadow.zIndex = -1;
      world.addChild(ballShadow);

      const ball = new Container();
      const ballR = BALL.RADIUS;
      const shade = new FillGradient({
        type: "radial",
        center: { x: 0.38, y: 0.32 }, innerRadius: 0,
        outerCenter: { x: 0.5, y: 0.5 }, outerRadius: 0.5,
        colorStops: [
          { offset: 0, color: BALL.SHADE_LIGHT },
          { offset: 0.5, color: BALL.SHADE_MID },
          { offset: 1, color: BALL.SHADE_RIM },
        ],
        textureSpace: "local",
      });
      ball.addChild(new Graphics().circle(0, 0, ballR).fill(shade));
      // Seams (spin with the distance rolled). Every control point lies inside the ball (radius <= 22.4 of 24), so no mask is needed.
      const seams = new Container();
      const k = ballR / 24; // the reference SVG has radius 24
      seams.addChild(
        new Graphics()
          .moveTo(-20 * k, -6 * k).quadraticCurveTo(-4 * k, -14 * k, 18 * k, -12 * k)
          .stroke({ width: BALL.SEAM_BLUE_W, color: BALL.SEAM_BLUE })
          .moveTo(-18 * k, 10 * k).quadraticCurveTo(0, 2 * k, 20 * k, 8 * k)
          .stroke({ width: BALL.SEAM_BLUE_W, color: BALL.SEAM_BLUE })
          .moveTo(-6 * k, -4 * k).lineTo(6 * k, 6 * k)
          .stroke({ width: BALL.SEAM_RED_W, color: BALL.SEAM_RED })
          .moveTo(-22 * k, 2 * k).quadraticCurveTo(-8 * k, 18 * k, 10 * k, 22 * k)
          .stroke({ width: BALL.SEAM_GREY_W, color: BALL.SEAM_GREY })
          .moveTo(-10 * k, -22 * k).quadraticCurveTo(10 * k, -14 * k, 22 * k, -2 * k)
          .stroke({ width: BALL.SEAM_GREY_W, color: BALL.SEAM_GREY }),
      );
      ball.addChild(seams);
      ball.addChild(
        new Graphics()
          .ellipse(-ballR * 0.3, -ballR * 0.4, ballR * 0.36, ballR * 0.22).fill({ color: 0xffffff, alpha: BALL.GLOSS_ALPHA })
          .circle(0, 0, ballR).stroke({ width: 1, color: 0x000000, alpha: BALL.OUTLINE_ALPHA }),
      );
      let seamAngle = 0;
      let prevBallPx: { x: number; y: number } | null = null;
      ball.zIndex = 10; // always render on top of player sprites
      world.addChild(ball);

      // ── Pitch effects (shot, goal, foul, card, offside) + ball trail ──
      const effectsGfx = new Graphics();
      effectsGfx.zIndex = 8; // above names, below the ball
      world.addChild(effectsGfx);
      const effectTexts = new Map<PitchEffect, Text>();
      const effectTextStyle = new TextStyle({
        fontSize: Math.max(13, Math.round(markerR * 0.9)),
        fontFamily: '"Barlow Condensed", sans-serif',
        fontWeight: '700',
        fill: 0xffffff,
        dropShadow: { color: 0x000000, blur: 3, distance: 0, alpha: 0.9 },
      });
      const effectCtx: EffectCtx = { toPixel, markerR, netDepth: m.goalNetDepth };
      let effectNow = 0;
      let effects: PitchEffect[] = [];
      let trail: TrailPoint[] = [];
      /** The goal shot seen in this tick's shotResolved, consumed by the goalScored that follows. */
      let pendingGoalShot: { toX: number; toY: number } | null = null;

      const pushEffect = (data: Parameters<typeof addEffect>[1], text?: string) => {
        if (document.hidden || !app.ticker.started) return; // no frames drawn: don't queue effects
        effects = addEffect(effects, data, effectNow);
        if (text) {
          const t = new Text({ text, style: effectTextStyle });
          t.anchor.set(0.5, 1);
          t.zIndex = 9;
          world.addChild(t);
          effectTexts.set(effects[effects.length - 1]!, t);
        }
      };
      const playerPos = (id: number) => stateRef.current.players.find((p) => p.id === id);

      const unsubShotFx = gameBus.on("shotResolved", (e) => {
        if (e.isGoal) { pendingGoalShot = { toX: e.toX, toY: e.toY }; return; }
        const labels = labelsOf();
        pushEffect(
          { kind: "shot", fromX: e.fromX, fromY: e.fromY, toX: e.toX, toY: e.toY, result: e.inPosts ? "save" : "wide" },
          e.inPosts ? labels.save : labels.wide,
        );
      });
      const unsubGoalFx = gameBus.on("goalScored", (e) => {
        const dir = stateRef.current.players.find((p) => p.team === e.team)?.attackDir ?? 1;
        const goalX = pendingGoalShot ? pendingGoalShot.toX : dir === 1 ? PITCH_LENGTH : 0;
        const goalY = pendingGoalShot ? pendingGoalShot.toY : PITCH_WIDTH / 2;
        pendingGoalShot = null;
        pushEffect({ kind: "goal", goalX, goalY, color: e.team === "A" ? fillA : fillB });
      });
      const unsubFoulFx = gameBus.on("foul", (e) => pushEffect({ kind: "foul", x: e.x, y: e.y }));
      const unsubCardFx = gameBus.on("card", (e) => {
        const p = playerPos(e.playerId);
        if (!p) return;
        pushEffect({ kind: "card", x: p.x, y: p.y, card: e.card, name: e.playerName }, shirtName(e.playerName));
      });
      const unsubOffsideFx = gameBus.on("offsideCalled", (e) => {
        const p = playerPos(e.receiverId);
        if (!p) return;
        pushEffect({ kind: "offside", lineX: e.lineX ?? null, x: p.x, y: p.y }, labelsOf().offside);
      });

      const framesShown = () => !document.hidden && app.ticker.started;
      const engineGoalX = (dir: number) => (dir === 1 ? PITCH_LENGTH : 0);
      /** Drawn x sign: engine yards → px along x (−1 when the pitch is mirrored). */
      const xSign = () => (mirrorRef.current ? -1 : 1);

      // ── Home-goal pulse of the crowd ──
      const unsubCrowdGoal = gameBus.on("goalScored", (e) => {
        if (!crowdSprite || !framesShown()) return;
        if (stadiumRef.current && e.team === stadiumRef.current.homeTeam) crowdPulseAt = effectNow;
      });

      // ── Player animations: long shot, header, save (spec 2026-10-08-match-visual §5) ──
      let anims: PlayerAnim[] = [];
      const animGfx = new Graphics();
      animGfx.zIndex = 7;
      world.addChild(animGfx);
      const unsubAnimShot = gameBus.on("shot", (e) => {
        if (!framesShown()) return;
        const p = playerPos(e.player);
        if (!p) return;
        const goalX = engineGoalX(p.attackDir);
        if (!isLongShot(p, goalX)) return;
        anims = addAnim(anims, { playerId: p.id, kind: "longShot", dir: { x: goalX - p.x, y: PITCH_WIDTH / 2 - p.y }, side: 1 }, effectNow);
      });
      const unsubAnimHeader = gameBus.on("header", (e) => {
        if (!framesShown()) return;
        const p = playerPos(e.player);
        if (!p) return;
        anims = addAnim(anims, { playerId: p.id, kind: "header", dir: { x: p.attackDir, y: 0 }, side: 1 }, effectNow);
      });
      const keeperSave = (keeperId: number, side: 1 | -1) => {
        anims = addAnim(anims, { playerId: keeperId, kind: "save", dir: { x: 0, y: side }, side }, effectNow);
      };
      const unsubAnimSave = gameBus.on("shotResolved", (e) => {
        if (e.isGoal || !e.inPosts || !framesShown()) return;
        const shooter = playerPos(e.player);
        if (!shooter) return;
        const gk = stateRef.current.players.find((q) => q.team !== shooter.team && q.role === "GK");
        if (!gk) return;
        keeperSave(gk.id, e.toY >= gk.y ? 1 : -1);
      });
      const unsubAnimPenalty = gameBus.on("penaltyResolved", (e) => {
        if (e.scored || e.keeperId === null || !framesShown()) return;
        keeperSave(e.keeperId, seedFrom(`${Math.floor(stateRef.current.matchTime)}:${e.takerId}`) % 2 === 0 ? 1 : -1);
      });

      // ── Referee, assistants, managers (spec 2026-10-08-match-visual §3–§4) ──
      const officialsOn = officials;
      const referee = officialsOn ? makeOfficial(markerR, false) : null;
      const assistantC: Record<AssistantSide, Container | null> = {
        top: officialsOn ? makeOfficial(markerR, true) : null,
        bottom: officialsOn ? makeOfficial(markerR, true) : null,
      };
      // Just under the players' layer: a player is never covered by an official.
      for (const c of [referee, assistantC.top, assistantC.bottom]) if (c) { c.zIndex = -0.5; world.addChild(c); }
      let refPos: YdPos | null = null;
      const arPos: Record<AssistantSide, YdPos | null> = { top: null, bottom: null };
      let lastFoulSpot: YdPos | null = null;
      /** After a card the referee's target stays on the foul spot (passed to refereeTarget as the ball). */
      let refHold: { spot: YdPos; until: number } | null = null;
      let refCard: { card: "yellow" | "red"; until: number } | null = null;
      const flagUntil: Record<AssistantSide, number> = { top: -1, bottom: -1 };
      const unsubRefFoul = gameBus.on("foul", (e) => { lastFoulSpot = { x: e.x, y: e.y }; });
      const unsubRefCard = gameBus.on("card", (e) => {
        if (!officialsOn || !framesShown()) return;
        const spot = lastFoulSpot ?? playerPos(e.playerId) ?? null;
        if (spot) refHold = { spot: { x: spot.x, y: spot.y }, until: effectNow + OFFICIALS.CARD_HOLD_S };
        refCard = { card: e.card, until: effectNow + EFFECT_DURATION.card };
      });
      const unsubArFlag = gameBus.on("offsideCalled", (e) => {
        if (!officialsOn || !framesShown()) return;
        const lineX = e.lineX ?? playerPos(e.receiverId)?.x;
        if (lineX === undefined) return;
        flagUntil[assistantForLineX(lineX)] = effectNow + EFFECT_DURATION.offside;
      });

      // Managers: drawn left = team A unless mirrored. They never switch sides at half time.
      type DrawnSide = "left" | "right";
      const coachSpot = coachSlots(m, canvasHeight);
      const teamOfDrawnSide = (side: DrawnSide): TeamId => ((side === "left") !== mirrorRef.current ? "A" : "B");
      const coachSprites: Partial<Record<DrawnSide, { sprite: CoachSprite; team: TeamId }>> = {};
      const coachGest: Partial<Record<TeamId, { kind: CoachGestureKind; at: number }>> = {};
      if (officialsOn) {
        for (const side of ["left", "right"] as const) {
          const team = teamOfDrawnSide(side);
          const info = coachesRef.current?.[team];
          const color = info?.color ? cssColorToPixiHex(info.color) : team === "A" ? fillA : fillB;
          const sprite = makeCoach(markerR, color);
          sprite.root.x = coachSpot[side].x;
          sprite.root.y = coachSpot[side].y;
          sprite.root.zIndex = -0.6;
          world.addChild(sprite.root);
          coachSprites[side] = { sprite, team };
          const url = info?.faceUrl;
          if (url) {
            const size = faceRasterSize(sprite.headR - 1, app.renderer.resolution);
            void loadFaceCanvas(url, size).then((canvas) => {
              if (!canvas || facesDisposed || sprite.root.destroyed) return;
              let texture = faceTextures.get(url);
              if (!texture) {
                texture = new Texture({ source: new CanvasSource({ resource: canvas, transparent: true }) });
                faceTextures.set(url, texture);
              }
              const face = new Sprite(texture);
              face.anchor.set(0.5);
              face.width = face.height = (sprite.headR - 1) * 2;
              sprite.head.addChild(face);
            });
          }
        }
      }
      const startGesture = (team: TeamId, kind: CoachGestureKind) => {
        if (!officialsOn || !framesShown()) return;
        coachGest[team] = { kind, at: effectNow };
      };
      coachCueFnRef.current = startGesture;
      const unsubCoachGoal = gameBus.on("goalScored", (e) => startGesture(e.team, "celebrate"));

      /** Moves and draws the officials and the managers (once per frame, engine yards in). */
      const drawOfficials = (ball: YdPos, players: YdPos[]) => {
        if (!officialsOn) return;
        const st = stateRef.current;
        const dtGame = pausedRef.current ? 0 : (app.ticker.deltaMS / 1000) * gameSpeedRef.current;
        const holder = st.players.find((p) => p.id === st.ballHolderId);
        const attackDir: 1 | -1 = holder?.attackDir === -1 ? -1 : 1;
        if (refHold && effectNow >= refHold.until) refHold = null;
        const target = refHold
          ? refereeTarget({ ball: refHold.spot, attackDir, players, setPiece: true })
          : refereeTarget({ ball, attackDir, players, setPiece: !!st.setPiece });
        refPos = refPos ? stepToward(refPos, target, dtGame, OFFICIALS.REF_SPEED) : target;
        if (referee) {
          const { px, py } = toPixel(refPos.x, refPos.y);
          referee.x = px;
          referee.y = py;
          if (refCard && effectNow >= refCard.until) refCard = null;
          showCard(referee, refCard?.card ?? null);
        }
        for (const side of ["top", "bottom"] as const) {
          const c = assistantC[side];
          if (!c) continue;
          const t = assistantTarget({ players: st.players, ball }, side);
          const cur = arPos[side];
          const next = cur ? stepToward(cur, t, dtGame, OFFICIALS.AR_SPEED, false) : t;
          arPos[side] = next;
          const { px, py } = toPixel(next.x, next.y);
          c.x = px;
          // Without a stadium there may be no run-off: keep the assistant on the canvas.
          c.y = Math.min(canvasHeight - markerR, Math.max(markerR, py));
          setFlagRaised(c, effectNow < flagUntil[side]);
        }
        for (const side of ["left", "right"] as const) {
          const entry = coachSprites[side];
          if (!entry) continue;
          const g = coachGest[entry.team];
          if (g && effectNow - g.at >= GESTURE_DURATION) delete coachGest[entry.team];
          const live = coachGest[entry.team];
          const pose = live ? coachGesture(live.kind, effectNow - live.at) : coachGesture("balanced", 0);
          const dir = st.players.find((p) => p.team === entry.team)?.attackDir ?? 1;
          drawCoachArms(entry.sprite, markerR, pose, (dir * xSign()) as 1 | -1);
          entry.sprite.root.y = coachSpot[side].y - pose.jumpPx;
        }
      };

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
        const gameX = mirrorX((logicalX - m.marginX) / m.scale, mirrorRef.current);
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
      // Pumps the simulation once per rendered frame (smooth ~60fps while the
      // tab is visible — see pumpSimulation above) and then renders
      // `stateRef.current`. While paused, `pumpSimulation()` is still called
      // every frame — including when `keepTickerAlive` keeps the ticker
      // running — but `pump(true)` returns 0, so it's a no-op that only
      // advances the shared pump's internal clock (no backlog on resume).
      const drawFrame = () => {
        pumpSimulation();

        // Drawn positions: between the last two sim steps. Paused, carry does not move,
        // so alpha (and the drawing) stays frozen.
        const drawState = stateRef.current;
        // A state swapped in from outside the pump that moved something (/test command) ends a transition.
        if (drawState !== renderPair.cur && !samePositions(drawState, renderPair.cur)) transition = null;
        renderPair = syncRenderPair(renderPair, drawState);
        const alpha = interpAlpha(simCarryRef.current, SIM_STEP);
        let drawnPos = drawnPlayerPositions(renderPair.prev, drawState, alpha, TELEPORT_YDS);
        let drawnB = drawnBall(renderPair.prev, drawState, alpha, TELEPORT_YDS);
        transitionNow = advanceEffectClock(transitionNow, app.ticker.deltaMS / 1000, pausedRef.current);
        if (setPieceStartPending) {
          setPieceStartPending = false;
          if (lastDrawnPos && lastDrawnBall && drawState.setPiece) {
            const seconds = transitionSeconds(drawState.setPiece.countdown, gameSpeedRef.current);
            transition = startTransition(lastDrawnPos, lastDrawnBall, transitionNow, seconds);
          }
        }
        if (!transitionActive(transition, transitionNow, drawState)) transition = null;
        if (transition) {
          const k = transitionProgress(transition, transitionNow);
          drawnPos = blendPlayers(transition.fromPlayers, drawnPos, k);
          drawnB = blendBall(transition.fromBall, drawnB, k);
        }
        lastDrawnPos = drawnPos;
        lastDrawnBall = drawnB;

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
        const booked = bookedPlayerIds(stateRef.current.cards);
        holderGlowGfx.clear();
        fatigueGfx.clear();
        const barW = markerR * FATIGUE_BAR.W;
        // ballHolderId keeps the last toucher while the ball travels: glow only on a real holder.
        const st0 = stateRef.current;
        const glowId = st0.pass || st0.shot || st0.looseBall ? null : st0.ballHolderId;
        // Short player animations: an offset on top of the interpolated marker (engine untouched).
        anims = liveAnims(anims, effectNow);
        const animOf = new Map(anims.map((a) => [a.playerId, a] as const));
        animGfx.clear();
        for (const player of stateRef.current.players) {
          const g     = playerGraphics.get(player.id);
          const label = playerLabels.get(player.id);
          if (!g) continue;
          const at = drawnPos.get(player.id) ?? player;
          const { px, py } = toPixel(at.x, at.y);
          const anim = animOf.get(player.id);
          const off = anim ? animOffset(anim, effectNow) : null;
          const liftPx = off ? off.liftYds * m.scale * BALL.LIFT_PX_PER_YD : 0;
          g.x = px + (off ? xSign() * off.dx * m.scale : 0);
          g.y = py + (off ? off.dy * m.scale : 0) - liftPx;
          g.scale.set(off ? off.scale : 1);
          g.rotation = off ? xSign() * off.rotation : 0;
          const markerShadow = g.children[0];
          if (markerShadow) {
            // The shadow stays on the ground while the marker lifts (header), and shrinks.
            markerShadow.y = liftPx / (off?.scale ?? 1);
            markerShadow.scale.set(Math.max(0.6, 1 - (off?.liftYds ?? 0) * 0.25));
          }
          if (anim?.kind === "longShot" && off) {
            // Three short "force lines" behind the shooter.
            const k = (effectNow - anim.startedAt) / anim.duration;
            const ux = -xSign() * anim.dir.x, uy = -anim.dir.y;
            const nx = -uy, ny = ux;
            for (const s of [-1, 0, 1]) {
              const bx0 = g.x + ux * markerR * 1.2 + nx * s * markerR * 0.5;
              const by0 = g.y + uy * markerR * 1.2 + ny * s * markerR * 0.5;
              animGfx.moveTo(bx0, by0).lineTo(bx0 + ux * markerR * 0.9, by0 + uy * markerR * 0.9)
                .stroke({ width: 2, color: 0xffffff, alpha: 0.7 * (1 - k) });
            }
          }
          const badge = g.getChildByLabel("card");
          if (badge) badge.visible = booked.has(player.id);
          if (player.id === glowId) {
            holderGlowGfx
              .ellipse(px, py + markerR * 0.2, markerR * HOLDER_GLOW.RX, markerR * HOLDER_GLOW.RY)
              .fill({ color: 0xffffff, alpha: HOLDER_GLOW.ALPHA });
          }
          const barX = px - barW / 2;
          const barY = py + markerR + FATIGUE_BAR.GAP;
          fatigueGfx
            .roundRect(barX, barY, barW, FATIGUE_BAR.H, 2)
            .fill({ color: 0x000000, alpha: FATIGUE_BAR.TRACK_ALPHA });
          const fill = fatigueFill(player.energy);
          if (fill > 0) {
            fatigueGfx.roundRect(barX, barY, barW * fill, FATIGUE_BAR.H, 2).fill(fatigueColor(player.energy));
          }
          if (label) {
            { const shirt = shirtName(player.name); if (label.text !== shirt) label.text = shirt; }
            label.x = px;
            label.y = py - (markerR + 3);
          }
        }

        // Debug overlays: drawn from the CURRENT engine state on purpose (not interpolated). They show
        // engine data (targets, lanes, marks, cells) computed from that state; anchoring them to the drawn
        // markers would mix two instants. The gap is at most one sim step (~0.15 yd for a player).
        passLinesGfx.clear();
        movementTargetsGfx.clear();
        throughBallGfx.clear();
        for (const lbl of laneLabelPool) lbl.visible = false;
        for (const lbl of instrLabelPool) lbl.visible = false;
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
              const px0 = Math.min(toPixel(cell.x - CELL_W / 2, 0).px, toPixel(cell.x + CELL_W / 2, 0).px);
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

          // ── Aerial: cross targets (holder in a crossing position) ──
          // Each target: zone ring (TARGET_ZONE_RADIUS) + dot coloured by score; the best gets a gold ring.
          if (
            ovl.aerial &&
            !stateRef.current.pass &&
            !stateRef.current.shot &&
            ballHolder &&
            lastCrossHolder === ballHolder.id &&
            lastCrossTargets.length > 0
          ) {
            const best = lastCrossTargets.reduce((a, b) => (b.score > a.score ? b : a));
            for (const t of lastCrossTargets) {
              const { px: tx, py: ty } = toPixel(t.x, t.y);
              const sc = Math.max(0, Math.min(1, t.score));
              throughBallGfx
                .circle(tx, ty, AERIAL_CONFIG.TARGET_ZONE_RADIUS * m.scale)
                .stroke({ width: 1, color: 0x2dd4bf, alpha: 0.35 });
              throughBallGfx.circle(tx, ty, 5).fill({ color: t.gkClaim ? 0xf87171 : 0x2dd4bf, alpha: 0.25 + sc * 0.7 });
              if (t === best && t.score > 0) {
                throughBallGfx.circle(tx, ty, 9).stroke({ width: 2, color: 0xffcc00, alpha: 0.95 });
              }
            }
          }

          // ── Set pieces: wall of a direct free kick; delivery options of a corner / crossed free kick ──
          const sp = stateRef.current.setPiece;
          if (ovl.setPieces && sp && ballHolder && ballHolder.id === sp.takerId) {
            const goalX = ballHolder.attackDir === 1 ? PITCH_LENGTH : 0;
            const { px: bx, py: by } = toPixel(ballHolder.x, ballHolder.y);
            if (sp.variant === 'direct') {
              const { px: gx, py: gy } = toPixel(goalX, (GOAL_Y_MIN + GOAL_Y_MAX) / 2);
              throughBallGfx.moveTo(bx, by).lineTo(gx, gy).stroke({ width: 1, color: 0xbef264, alpha: 0.5 });
              const wall = (sp.wallIds ?? [])
                .map(id => stateRef.current.players.find(p => p.id === id))
                .filter((p): p is NonNullable<typeof p> => !!p);
              for (let i = 0; i < wall.length; i++) {
                const { px: wx, py: wy } = toPixel(wall[i]!.x, wall[i]!.y);
                throughBallGfx.circle(wx, wy, 9).stroke({ width: 2.5, color: 0xbef264, alpha: 0.95 });
                if (i > 0) {
                  const { px: qx, py: qy } = toPixel(wall[i - 1]!.x, wall[i - 1]!.y);
                  throughBallGfx.moveTo(qx, qy).lineTo(wx, wy).stroke({ width: 4, color: 0xbef264, alpha: 0.6 });
                }
              }
            } else if (sp.variant === 'box') {
              const kind = sp.type === 'corner' ? 'corner' : 'free_kick';
              const options = evaluateBoxSetPiece(ballHolder, stateRef.current.players, getTeamBuildUp(ballHolder.team), kind);
              const best = options[0];
              const maxRaw = Math.max(0.01, ...options.map(o => o.raw));
              const R = kind === 'corner' ? SET_PIECE_CONFIG.TARGET_ZONE_RADIUS : SET_PIECE_CONFIG.FK_TARGET_ZONE_RADIUS;
              for (const o of options) {
                const { px: ox, py: oy } = toPixel(o.x, o.y);
                const sc = Math.max(0, Math.min(1, o.raw / maxRaw));
                if (o.kind === 'short') {
                  throughBallGfx.moveTo(bx, by).lineTo(ox, oy).stroke({ width: 1.5, color: 0xbef264, alpha: 0.3 + sc * 0.6 });
                } else {
                  throughBallGfx.circle(ox, oy, R * m.scale).stroke({ width: 1, color: 0xbef264, alpha: 0.35 });
                  throughBallGfx.circle(ox, oy, 5).fill({ color: 0xbef264, alpha: 0.25 + sc * 0.7 });
                }
                if (o === best) throughBallGfx.circle(ox, oy, 10).stroke({ width: 2, color: 0xffcc00, alpha: 0.95 });
              }
            }
          }

          // ── Aerial: landing point + duel radius during a cross / long ball / clearance ──
          if (ovl.aerial && stateRef.current.pass && isAerialKind(stateRef.current.pass.kind)) {
            const pass = stateRef.current.pass;
            const { px: lx, py: ly } = toPixel(pass.toX, pass.toY);
            throughBallGfx.circle(lx, ly, 4).fill({ color: 0x2dd4bf, alpha: 0.9 });
            throughBallGfx
              .circle(lx, ly, AERIAL_CONFIG.AERIAL_RADIUS * m.scale)
              .stroke({ width: 2, color: 0x2dd4bf, alpha: 0.8 });
            for (const player of stateRef.current.players) {
              if (stateRef.current.decisions[player.id]?.type !== 'chase_loose_ball') continue;
              const { px: cx, py: cy } = toPixel(player.x, player.y);
              const color = player.team === 'A' ? 0x66aaff : 0xff7777;
              throughBallGfx.moveTo(cx, cy).lineTo(lx, ly).stroke({ width: 1.5, color, alpha: 0.55 });
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

          // ── Player instructions: variant tags, man-marking pairs ──────────────
          if (ovl.instructions) {
            let li = 0;
            for (const player of stateRef.current.players) {
              const instr = player.instruction;
              if (!instr || li >= instrLabelPool.length) continue;
              const tag = `${instr.variant ?? ''}${instr.press === 'more' ? ' P+' : instr.press === 'less' ? ' P-' : ''}`.trim();
              if (!tag) continue;
              const { px, py } = toPixel(player.x, player.y);
              const lbl = instrLabelPool[li++]!;
              lbl.text = tag;
              lbl.x = px;
              lbl.y = py + 10;
              lbl.visible = true;
            }
            for (const team of ['A', 'B'] as const) {
              for (const pair of stateRef.current.manMarks?.[team] ?? []) {
                const marker = stateRef.current.players.find(p => p.id === pair.markerId);
                const target = stateRef.current.players.find(p => p.id === pair.targetId);
                if (!marker || !target) continue;
                const { px: mx, py: my } = toPixel(marker.x, marker.y);
                const { px: tx, py: ty } = toPixel(target.x, target.y);
                const len = Math.hypot(tx - mx, ty - my);
                if (len > 2) {
                  const ux = (tx - mx) / len;
                  const uy = (ty - my) / len;
                  for (let d = 0; d < len - 2; d += 10) {
                    const e = Math.min(d + 6, len);
                    throughBallGfx.moveTo(mx + ux * d, my + uy * d).lineTo(mx + ux * e, my + uy * e)
                      .stroke({ width: 2, color: 0x38bdf8, alpha: 0.9 });
                  }
                }
                throughBallGfx.circle(tx, ty, 11).stroke({ width: 2, color: 0x38bdf8, alpha: 0.95 });
              }
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

        // Ball: game coords → pixels; a raised ball is drawn higher and bigger, its shadow stays below.
        const ballPos = drawnB;
        const { px: bx, py: by } = toPixel(ballPos.x, ballPos.y);
        const h = drawnB.h;
        seamAngle = nextSpinAngle(seamAngle, prevBallPx, { x: bx, y: by }, ballR, pausedRef.current, BALL.SPIN_TELEPORT_PX, BALL.SPIN_MAX_PER_FRAME);
        prevBallPx = { x: bx, y: by };
        seams.rotation = seamAngle;
        ball.x = bx;
        ball.y = by - h * m.scale * BALL.LIFT_PX_PER_YD;
        ball.scale.set(1 + h * BALL.GROW_PER_YD);
        ballShadow.x = bx + BALL.SHADOW_DX;
        ballShadow.y = by + BALL.SHADOW_DY;
        ballShadow.scale.set(Math.max(BALL.SHADOW_MIN_SCALE, 1 - h * BALL.SHADOW_SHRINK_PER_YD));
        ballShadow.alpha = Math.max(BALL.SHADOW_MIN_ALPHA, BALL.SHADOW_ALPHA * (1 - h / BALL.SHADOW_FADE_YDS));

        // ── Pitch effects + trail (real-time clock, frozen while paused) ──
        effectNow = advanceEffectClock(effectNow, app.ticker.deltaMS / 1000, pausedRef.current);
        drawOfficials(drawnB, [...drawnPos.values()]);
        if (crowdSprite) {
          if (crowdPulseAt !== null && effectNow - crowdPulseAt >= STADIUM.GOAL_PULSE_S) crowdPulseAt = null;
          crowdSprite.alpha = crowdPulseAt === null ? 1 : goalPulseAlpha(effectNow - crowdPulseAt);
        }
        const st = stateRef.current;
        pendingGoalShot = null; // a goal shot only pairs with a goalScored of the same tick
        // The trail follows the DRAWN ball: elevation in yards = h * LIFT (px = h * scale * LIFT).
        trail = liveTrail(
          pushTrail(
            trail,
            !pausedRef.current && shouldTrail(st) ? { x: ballPos.x, y: ballPos.y - h * BALL.LIFT_PX_PER_YD } : null,
            effectNow,
          ),
          effectNow,
        );
        effects = liveEffects(effects, effectNow);
        for (const [fx, txt] of effectTexts) {
          if (!effects.includes(fx)) { world.removeChild(txt); txt.destroy(); effectTexts.delete(fx); }
        }
        effectsGfx.clear();
        drawTrail(effectsGfx, trail, effectNow, effectCtx);
        for (const fx of effects) {
          drawEffect(effectsGfx, fx, effectNow, effectCtx);
          const txt = effectTexts.get(fx);
          const at = txt ? effectTextAnchor(fx, effectNow, effectCtx) : null;
          if (txt && at) {
            // Keep the label inside the canvas (anchor is bottom-centre): shots end on the goal line.
            const half = txt.width / 2 + 4;
            txt.x = Math.min(canvasWidth - half, Math.max(half, at.x));
            txt.y = Math.max(txt.height + 4, at.y);
            txt.alpha = effectAlpha(fx, effectNow);
          }
        }

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
                  const px0 = Math.min(toPixel(c * CELL_W, 0).px, toPixel((c + 1) * CELL_W, 0).px);
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
      };
      // Draw-time meter for /test (`perfRef`): average callback time over 30 frames + ticker FPS.
      let perfFrames = 0;
      let perfMsSum = 0;
      app.ticker.add(() => {
        const meter = perfRefRef.current;
        if (!meter) { drawFrame(); return; }
        const t0 = performance.now();
        drawFrame();
        perfMsSum += performance.now() - t0;
        perfFrames += 1;
        if (perfFrames >= PERF_SAMPLE_FRAMES) {
          meter.current = { fps: app.ticker.FPS, drawMs: perfMsSum / perfFrames };
          perfFrames = 0;
          perfMsSum = 0;
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
        } else if (cmd.type === 'setInstruction') {
          stateRef.current = applyPlayerInstruction(stateRef.current, cmd.team, cmd.slot, cmd.instruction);
        } else if (cmd.type === 'swapPositions') {
          stateRef.current = swapPlayerPositions(stateRef.current, cmd.team, cmd.aId, cmd.bId);
          gameBus.emit('stateChanged', stateRef.current); // the paused panel shows the new slots
        } else if (cmd.type === 'queueSub') {
          const s = stateRef.current;
          const key = cmd.team === 'A' ? 'pendingSubsA' : 'pendingSubsB';
          const queue = s[key];
          const left = (cmd.team === 'A' ? s.subsRemainingA : s.subsRemainingB) - queue.length;
          if (left > 0 && !queue.some(q => q.outId === cmd.outId || q.inId === cmd.inId)) {
            stateRef.current = { ...s, [key]: [...queue, { outId: cmd.outId, inId: cmd.inId }] };
            gameBus.emit('stateChanged', stateRef.current); // the paused panel shows the queued sub
          }
        } else if (cmd.type === 'setManMarks') {
          stateRef.current = setManMarksBySlot(stateRef.current, cmd.team, cmd.marks.map(m => ({ slot: m.slot, targetSlot: m.targetSlot })));
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
            gameBus.emit('matchEnd', {
              score: stateRef.current.score,
              finalEnergy: stateRef.current.players.map(p => ({ id: p.id, team: p.team, energy: p.energy })),
            });
          } else if (cmd.phase === 'endPeriod') {
            stateRef.current = endCurrentPeriod(stateRef.current);
          }
        }
        gameBus.emit('stateChanged', stateRef.current);

        // Re-run the ball holder's decision so the debug panel scores update
        // immediately even when paused (pumpSimulation's pump(paused) returns 0,
        // so no tickState/advanceSim call happens on its own while paused).
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
      // the new weights even while paused (pumpSimulation is a no-op while paused —
      // see above — so nothing else would otherwise re-run tickState here).
      const unsubTactics = gameBus.on('tacticsChanged', () => {
        const { state: next } = tickState(stateRef.current, 0);
        stateRef.current = next;
        gameBus.emit('stateChanged', stateRef.current);
      });

      return () => {
        facesDisposed = true;
        refreshFacesRef.current = null;
        for (const tex of faceTextures.values()) tex.destroy(true);
        faceTextures.clear();
        simClock.destroy();
        unsubMatchStateSync();
        unsubTestCmd();
        unsubTactics();
        unsubTbScores();
        unsubCross();
        unsubShotFx();
        unsubGoalFx();
        unsubFoulFx();
        unsubCardFx();
        unsubOffsideFx();
        unsubCrowdGoal();
        unsubAnimShot();
        unsubAnimHeader();
        unsubAnimSave();
        unsubAnimPenalty();
        unsubRefFoul();
        unsubRefCard();
        unsubArFlag();
        unsubCoachGoal();
        redrawCrowdRef.current = null;
        coachCueFnRef.current = null;
        crowdTexture?.destroy(true);
        crowdTexture = null;
        for (const txt of effectTexts.values()) txt.destroy();
        effectTexts.clear();
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
