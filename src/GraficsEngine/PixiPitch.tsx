import { GOAL_CENTRE_Y, keeperGoalX } from '@/GameEngine/Domain/Keeper';
import { KEEPER_CONFIG } from '@/GameEngine/Configs/KeeperConfig';
import { shirtName } from "@/Domain/shirtName";
import { useEffect, useRef, type MutableRefObject } from "react";
import { Application, Assets, Spritesheet, CanvasSource, Container, FillGradient, Graphics, Particle as FanParticle, ParticleContainer, Rectangle, Sprite, Text, TextStyle, Texture, TilingSprite, CanvasTextMetrics } from "pixi.js";
import { CROWD_MOTION, fanLooks, fanPose, handFlagAngle } from "@/GraficsEngine/crowdMotion";
import { bindAtlas, buildArtCrowdAtlas, buildCrowdAtlas, type ArtCrowdSheet, type FanArms } from "@/GraficsEngine/crowdFigures";
import { benchPropSpots } from "@/GraficsEngine/benchProps";
import { BENCH_HAIR, BENCH_SKIN, BENCH_VIEW, benchKits, benchLayout, benchLook, benchPose, benchShown, photographerSpots } from "@/GraficsEngine/benchView";
import { faceRasterSize, loadCrestCanvas, loadFaceCanvas, loadImage, markerLabelFontSize, needsLightOutline, playerMarkerRadius, PITCH_COLOR } from "@/GraficsEngine/playerFaces";
import { BALL, CARD_BADGE, FLAG_SPRITE, LED, LED_FRAME, ledAdFor, ledBoards, SUB_WALK, EFFECT_DURATION, FATIGUE_BAR, HOLDER_GLOW, LIGHTING, MARKER_SHADOW, MATCH_LOOK, STADIUM, TELEPORT_YDS, BALL_TELEPORT_YDS } from "@/GraficsEngine/pitchStyle";
import { matchClockMinutes, matchLighting, minutesOf, type Lighting } from "@/GraficsEngine/matchLighting";
import { shadowPolygons } from "@/GraficsEngine/playerShadow";
import { particleAt, weatherParticles, type Particle } from "@/GraficsEngine/weatherParticles";
import { stadiumShadeGrid } from "@/GraficsEngine/stadiumShadow";
import type { MatchWeather } from "@/Domain/matchday/matchConditions";
import type { StadiumSun } from "@/Domain/matchday/stadiumSun";
import { pitchSurface, type PitchSurface, type SurfaceShape } from "@/GraficsEngine/pitchSurface";
import { PAINTED_TURF, paintedOverlay, paintedPlacement, paintedTurfId } from "@/GraficsEngine/paintedTurf";
import { GRASS_PHOTO, grassPhoto } from "@/GraficsEngine/grassPhoto";
import { gameArtUrl, newVisualOn, paintedBackdrop } from "@/Domain/art/paintedFaces";
import { prefersReducedMotion, type PitchQuality } from "@/GraficsEngine/motionPrefs";
import { bounceHeight } from "@/GraficsEngine/ballHeight";
import { jostleOffsets } from "@/GraficsEngine/setPieceJostle";
import { arrivedMates, celebrationPositions, planCelebration, walkBackPositions, type CelebrationPlan } from "@/GraficsEngine/goalCelebration";
import { CAMERA, recordFrame, REPLAY, replayAt, replayClip, stepCamera, type CameraView, type ReplayFrame } from "@/GraficsEngine/matchCamera";
import { assistantSideStep, OFFICIAL_SPRITE, officialPose, officialTints, type OfficialKind, type OfficialPoseState } from "@/GraficsEngine/officialSprite";
import { KNEE_SLIDE_SHARE, THROW_IN_HOLD, addAction, liveActions, newMotion, PLAYER_SPRITE, poseOf, spriteLook, spriteScale, SPRITE_LAYERS, stepMotion, type SpriteAction, type SpriteAtlas, type SpriteMotion } from "@/GraficsEngine/playerSprite";
import { STADIUM_ART, loadStadiumArt, type StadiumArt } from "@/GraficsEngine/stadiumArt";
import { FX_ART, loadFxArt, type FxArt } from "@/GraficsEngine/fxArt";
import { matchHasFog } from "@/Domain/matchday/matchFog";
import { FOG, fogTexture } from "@/GraficsEngine/fogArt";
import { SpritePool } from "@/GraficsEngine/spritePool";
import type { ShellSprite } from "@/GraficsEngine/stadiumAtmosphere";
import { BALL_SPRITE, GOAL_SPRITE, ballSpriteFrame, nextBallRoll, nextSpinAngle } from "@/GraficsEngine/ballSpin";
import { coneStrength, paintFloodCones } from "@/GraficsEngine/floodCones";
import { penaltyRunUp } from "@/GraficsEngine/penaltyRunUp";
import { FOUL_CONFIG } from "@/GameEngine/Configs/FoulConfig";
import { drawnBall, drawnPlayerPositions, interpAlpha, nextRenderPair, samePositions, syncRenderPair, type DrawnBall, type Pos, type RenderPair } from "@/GraficsEngine/renderInterp";
import { blendBall, blendPlayers, isSetPieceStart, startTransition, transitionActive, transitionProgress, transitionSeconds, type SetPieceTransition } from "@/GraficsEngine/setPieceTransition";
import { bookedPlayerIds, fatigueColor, fatigueFill } from "@/GraficsEngine/markerInfo";
import { ledLang, type LedLang } from "@/GraficsEngine/ledAds";
import { bystanders, clearOfBenches, cornerFlags, dashes, EXTRAS, ledFit, ledMarqueeX, ledTransition, standCorners, techArea, vendorAlong, vendors } from "@/GraficsEngine/stadiumExtras";
import i18n from "@/i18n/i18n";
import {
  addEffect, advanceEffectClock, effectAlpha, liveEffects, liveTrail, pushTrail, shouldTrail,
  type PitchEffect, type TrailPoint,
} from "@/GraficsEngine/pitchEffects";
import { drawEffect, drawTrail, effectTextAnchor, type EffectCtx } from "@/GraficsEngine/effectsRender";
import { tickState, endCurrentPeriod, applyPenaltyOutcome, applyPlayerInstruction, setManMarksBySlot, swapPlayerPositions, fillInjuryVacancy } from "@/GameEngine/Domain/gameState";
import { advanceSim, SIM_STEP } from "@/GameEngine/Domain/advanceSim";
import { startSimClock } from "@/GraficsEngine/simClock";
import { createPump, defaultNow } from "@/GraficsEngine/pump";
import { reconcileMatchStateSync } from "@/GraficsEngine/matchStateSync";
import { heldBallId, remoteDrawnBall, remotePositions, withFramePositions, type RemoteFeed } from "@/GraficsEngine/remoteInterp";
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
import { mirrorX, mirrorY } from "@/GraficsEngine/pitchMirror";
import { buildMetrics, PITCH_SPEC, type PitchMetrics, type StandGeometry } from "@/GraficsEngine/pitchMetrics";
import { STAND_TILE_ROTATION, drawDecor, drawStandBase, drawStandDetails, drawStandEdges, goalPulseAlpha } from "@/GraficsEngine/stadiumRender";
import { decorRects } from "@/GraficsEngine/stadiumDecor";
import type { StadiumDecor } from "@/types/achievementTypes";
import { crowdSeats, seatCellPx, standConcreteRows, standSideRects, worksSides, standTunnel } from "@/GraficsEngine/crowd";
import {
  ATMOSPHERE, burstLength, fireworks, flareSmoke, phoneAlpha, phoneLights, towerPanel, towerSpots,
  type CelebrationBurst, type PhoneLight,
} from "@/GraficsEngine/stadiumAtmosphere";
import {
  benchRect, COACH_WALK_FRAC, coachWalkOffset, startStretcher, STRETCHER,
  stretcherPose, type StretcherRun,
} from "@/GraficsEngine/matchExtras";
import type { MowingPattern, StandId, TurfType } from "@/types/facilityTypes";
import { followAt, smoothDamp, smoothPlayers, SMOOTH_ASSISTANT_S, type Follow } from "@/GraficsEngine/smoothFollow";
import { assistantForLineX, assistantTarget, OFFICIALS, refereeTarget, stepToward, type AssistantSide, type YdPos } from "@/GraficsEngine/officials";
import { coachGesture, coachSlots, GESTURE_DURATION, type CoachGestureKind } from "@/GraficsEngine/coaches";
import { addAnim, animOffset, isLongShot, liveAnims, STYLE, type PlayerAnim } from "@/GraficsEngine/playerAnims";
import { drawCoachArms, makeCoach, makeOfficial, setFlagRaised, showCard, type CoachSprite } from "@/GraficsEngine/touchlineRender";
import { mulberry32, seedFrom } from "@/Domain/rng";
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

/** The grass area around the pitch (inside the stand, or the whole canvas). */
function runOffRect(m: PitchMetrics) {
  return m.stand?.inner ?? { x: 0, y: 0, w: 2 * m.marginX + m.width, h: 2 * m.marginY + m.height };
}

/** Surface shapes (mowing, wear) in canvas px; rings go to their own masked layer. */
function drawShapes(g: Graphics, rings: Graphics, m: PitchMetrics, shapes: SurfaceShape[], mirror: boolean) {
  const px = (x: number) => m.marginX + mirrorX(x, mirror) * m.scale;
  const py = (y: number) => m.marginY + mirrorY(y, mirror) * m.scale;
  for (const sh of shapes) {
    if (sh.kind === "rect") {
      const x1 = px(sh.x), x2 = px(sh.x + sh.w), y1 = py(sh.y), y2 = py(sh.y + sh.h);
      g.rect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1)).fill({ color: sh.color, alpha: sh.alpha });
    } else if (sh.kind === "poly") {
      const pts: number[] = [];
      for (let i = 0; i < sh.points.length; i += 2) pts.push(px(sh.points[i]!), py(sh.points[i + 1]!));
      g.poly(pts).fill({ color: sh.color, alpha: sh.alpha });
    } else {
      rings.circle(px(sh.cx), py(sh.cy), sh.r * m.scale).stroke({ width: sh.width * m.scale, color: sh.color, alpha: sh.alpha });
    }
  }
}

/** The pitch surface (`pitchSurface.ts`); the run-off around the pitch takes the same base colour. */
function drawSurface(g: Graphics, rings: Graphics, m: PitchMetrics, s: PitchSurface, mirror: boolean) {
  // A worn pitch has no bright green frame: the run-off (inside the stand, or the whole canvas) gets the base too.
  const runOff = runOffRect(m);
  g.rect(runOff.x, runOff.y, runOff.w, runOff.h).fill(s.base);
  drawShapes(g, rings, m, s.shapes, mirror);
}

/** A straight line drawn as dashes (failing paint on a rotten pitch). */
function dashedLine(g: Graphics, x1: number, y1: number, x2: number, y2: number, style: { width: number; color: number; alpha: number }) {
  const len = Math.hypot(x2 - x1, y2 - y1);
  const dash = 14, gap = 5;
  for (let d = 0; d < len; d += dash + gap) {
    const a = d / len, b = Math.min(1, (d + dash) / len);
    g.moveTo(x1 + (x2 - x1) * a, y1 + (y2 - y1) * a).lineTo(x1 + (x2 - x1) * b, y1 + (y2 - y1) * b).stroke(style);
  }
}

function drawPitch(
  g: Graphics, m: PitchMetrics,
  line: { alpha: number; dashed: boolean; width?: number; goals?: boolean } = { alpha: 0.9, dashed: false },
) {
  const LINE = { width: line.width ?? MATCH_LOOK.LINE_W, color: 0xf5f8f0, alpha: line.alpha };
  const { marginX: x, marginY: y, width, height } = m;
  /** Straight line: solid, or dashed on a rotten pitch. */
  const seg = (x1: number, y1: number, x2: number, y2: number) => {
    if (line.dashed) dashedLine(g, x1, y1, x2, y2, LINE);
    else g.moveTo(x1, y1).lineTo(x2, y2).stroke(LINE);
  };
  const box = (bx: number, by: number, bw: number, bh: number) => {
    if (!line.dashed) { g.rect(bx, by, bw, bh).stroke(LINE); return; }
    seg(bx, by, bx + bw, by);
    seg(bx + bw, by, bx + bw, by + bh);
    seg(bx + bw, by + bh, bx, by + bh);
    seg(bx, by + bh, bx, by);
  };

  box(x, y, width, height);

  const midX    = x + width / 2;
  const centerY = y + height / 2;

  seg(midX, y, midX, y + height);
  g.circle(midX, centerY, m.centreCircleRadius).stroke(LINE);

  const hw  = m.goalAreaWidth    / 2;
  const hpw = m.penaltyAreaWidth / 2;
  const rx  = x + width;

  // Left boxes + spot
  box(x, centerY - hw,  m.goalAreaDepth,    m.goalAreaWidth);
  box(x, centerY - hpw, m.penaltyAreaDepth, m.penaltyAreaWidth);
  g.circle(x + m.penaltySpotDistance, centerY, 2).fill({ color: 0xffffff, alpha: line.alpha });
  g.circle(midX, centerY, 2).fill({ color: 0xffffff, alpha: line.alpha });

  // Right boxes + spot
  box(rx - m.goalAreaDepth,    centerY - hw,  m.goalAreaDepth,    m.goalAreaWidth);
  box(rx - m.penaltyAreaDepth, centerY - hpw, m.penaltyAreaDepth, m.penaltyAreaWidth);
  g.circle(rx - m.penaltySpotDistance, centerY, 2).fill({ color: 0xffffff, alpha: line.alpha });

  // Corner arcs. Each starts with an explicit moveTo to its own start point: a bare `arc()` on
  // a fresh path joined the arc to the previous pen position, which drew a stray diagonal line
  // in the top-left corner.
  const r = m.cornerArcRadius;
  g.moveTo(x + r, y).arc(x, y, r, 0, Math.PI / 2).stroke(LINE);
  g.moveTo(rx, y + r).arc(rx, y, r, Math.PI / 2, Math.PI).stroke(LINE);
  g.moveTo(rx - r, y + height).arc(rx, y + height, r, Math.PI, 3 * Math.PI / 2).stroke(LINE);
  g.moveTo(x, y + height - r).arc(x, y + height, r, 3 * Math.PI / 2, 2 * Math.PI).stroke(LINE);

  if (line.goals === false) return;
  // Goals (4.39): a net mesh with depth, the back bar's shadow, white posts with round caps.
  const goalYTop = y + GOAL_Y_MIN * m.scale;
  const goalYBot = y + GOAL_Y_MAX * m.scale;
  const L = MATCH_LOOK.GOAL;
  for (const gx of [x, rx]) {
    const depth = m.goalNetDepth * (gx === x ? -1 : 1);
    const back = gx + depth;
    g.rect(Math.min(gx, back), goalYTop, Math.abs(depth), goalYBot - goalYTop).fill({ color: 0xffffff, alpha: L.NET_FILL });
    for (let i = 1; i < L.MESH_ROWS; i++) {
      const yy = goalYTop + (goalYBot - goalYTop) * i / L.MESH_ROWS;
      g.moveTo(gx, yy).lineTo(back, yy).stroke({ width: 0.8, color: 0xffffff, alpha: L.MESH_ALPHA });
    }
    for (let i = 1; i < L.MESH_COLS; i++) {
      const xx = gx + depth * i / L.MESH_COLS;
      g.moveTo(xx, goalYTop).lineTo(xx, goalYBot).stroke({ width: 0.8, color: 0xffffff, alpha: L.MESH_ALPHA });
    }
    g.moveTo(back, goalYTop + 2).lineTo(back, goalYBot + 2).stroke({ width: 4, color: 0x000000, alpha: 0.3 });
    g.moveTo(gx, goalYTop).lineTo(back, goalYTop).lineTo(back, goalYBot).lineTo(gx, goalYBot)
      .stroke({ width: L.POST_W, color: 0xffffff, alpha: 1, cap: "round", join: "round" });
    g.circle(gx, goalYTop, L.POST_W * 0.9).fill(0xffffff);
    g.circle(gx, goalYBot, L.POST_W * 0.9).fill(0xffffff);
  }
  // Corner flags: drawn on their own layer (`drawCornerFlags`), above the boards (tester report).
}

/**
 * The stand corners rounded into a bowl (tester report): outside the quarter curve around each inner corner the dark
 * concourse behind the stand, the curve edged like the roof (`standCorners`).
 */
function drawStandCorners(g: Graphics, stand: StandGeometry) {
  const t = stand.thickness;
  for (const c of standCorners(stand)) {
    const tw = c.sx < 0 ? t.left : t.right, th = c.sy < 0 ? t.top : t.bottom;
    if (c.r <= 1 || tw <= 0 || th <= 0) continue;
    const pts: number[] = [c.cx + c.sx * c.r, c.cy, c.cx + c.sx * tw, c.cy, c.cx + c.sx * tw, c.cy + c.sy * th, c.cx, c.cy + c.sy * th, c.cx, c.cy + c.sy * c.r];
    const N = 18;
    for (let i = 1; i < N; i++) {
      const a = (i / N) * (Math.PI / 2);
      pts.push(c.cx + c.sx * c.r * Math.sin(a), c.cy + c.sy * c.r * Math.cos(a));
    }
    g.poly(pts).fill(0x0c1118);
    // A few concentric steps of the concourse, then the curve's roof edge.
    for (let k = 1; k <= 3; k++) {
      const rr = c.r + (Math.min(tw, th) * 0.6 * k) / 3;
      g.moveTo(c.cx + c.sx * rr, c.cy);
      for (let i = 1; i <= N; i++) {
        const a = (i / N) * (Math.PI / 2);
        g.lineTo(c.cx + c.sx * rr * Math.cos(a), c.cy + c.sy * rr * Math.sin(a));
      }
      g.stroke({ width: 1, color: 0x1d2733, alpha: 0.9 });
    }
    g.moveTo(c.cx + c.sx * c.r, c.cy);
    for (let i = 1; i <= N; i++) {
      const a = (i / N) * (Math.PI / 2);
      g.lineTo(c.cx + c.sx * c.r * Math.cos(a), c.cy + c.sy * c.r * Math.sin(a));
    }
    g.stroke({ width: 2, color: STADIUM.ROOF_EDGE });
  }
}

/** The light layer: stand shadow, warm and grey veils, night darkness, vignette and floodlight glow. */
function drawLight(
  g: Graphics, l: Lighting,
  toPx: (x: number, y: number) => { px: number; py: number }, w: number, h: number,
) {
  g.clear();
  if (l.warm.alpha > 0.005) g.rect(0, 0, w, h).fill({ color: l.warm.color, alpha: l.warm.alpha });
  if (l.veil.alpha > 0.005) g.rect(0, 0, w, h).fill({ color: l.veil.color, alpha: l.veil.alpha });
  if (l.dark.alpha > 0.005) g.rect(0, 0, w, h).fill({ color: l.dark.color, alpha: l.dark.alpha });
  // Vignette and floodlight glow: smooth gradient sprites (`lightGradients`), set by `updateLight`.
}

/**
 * Light shadows of one marker: a soft contact shadow, plus the sun's cast one or four faint ones under the floodlights
 * (`playerShadow.ts`), in marker radii -> px. The drawn pitch is turned 180 degrees with `mirror`, so are the shadows.
 */
function drawLightShadows(g: Graphics, l: Lighting | null, r: number, mirror: boolean) {
  g.clear();
  if (!l) return;
  // Soft, tapered, dark green shapes (`playerShadow.ts`), in marker radii → px.
  for (const s of l.shadows) {
    for (const p of shadowPolygons(s, mirror)) {
      g.poly(p.points.map((v) => v * r)).fill({ color: LIGHTING.SHADOW_COLOR, alpha: p.alpha });
    }
  }
}

/** Light of the match (spec 2026-10-16-match-lighting). */
export interface PitchLighting {
  /** Kickoff and sunset, "HH:MM". */
  kickoff: string;
  sunset: string;
  weather: MatchWeather | "wind_rain";
  sun: StadiumSun;
  /** Match date ("YYYY-MM-DD"): a real stadium's sun is computed for it. */
  date?: string;
  /** Seed of the rain / snow particles. */
  seed: string;
  /** Minutes since midnight: fixes the time instead of following the match clock (/test). */
  clockOverride?: number;
  /** Fog (art phase 9, drawing only): forced on or off (/test); absent = `matchHasFog`. */
  fog?: boolean;
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
  /** Active keeper (`Keeper.ts`): sweeper zone, wide high-ball zone, 1v1 rush range and his current target. */
  keeper:                boolean;
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
  keeper:                false,
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
  /** Second kit colours (the marker border is split in the two, 4.38.21). Absent: white. */
  teamAColor2?: string;
  teamBColor2?: string;
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
  effectLabels?: { save: string; wide: string; offside: string; cornerSave?: string; cornerDeflect?: string };
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
  /**
   * The match pitch (spec 2026-10-16-pitch-types): condition, grass, mowing and the seed of the patches.
   * Absent: crisp stripes, as before. Changes redraw the surface (never per frame).
   */
  pitch?: { condition: number; turf: TurfType; mowing: MowingPattern; seed: string; ground?: string } | null;
  /**
   * Light of the match (spec 2026-10-16-match-lighting): kickoff and sunset, weather, where the sun sets over the
   * stadium, the seed of the particles. Light layer redrawn when the match clock moves a minute; player shadows
   * redrawn when the light changes; rain / snow on the effects clock. Absent / null: nothing new is drawn.
   */
  lighting?: PitchLighting | null;
  /**
   * Referee, assistants and both managers on the touchline (§3–§4). Read at mount. An object also gives the
   * officials' faces (server URLs, `refereeFaceUrl`); `true` = officials without faces (a disc in the kit).
   */
  officials?: boolean | PitchOfficials;
  /** Managers' face (server URL) and club colour (CSS hex) per engine team; no face = a disc in the colour. */
  coaches?: Partial<Record<TeamId, { faceUrl?: string; color: string }>>;
  /** A new `seq` plays the gesture on that team's manager (the human's mentality change). */
  coachCue?: { team: TeamId; kind: "attack" | "defend" | "balanced"; seq: number } | null;
  /**
   * A new `seq` shows a card over that team's manager (`var.md` §4, a complaint). A red also takes him off the
   * touchline once the card is gone (sent to the stands).
   */
  coachCard?: { team: TeamId; card: "yellow" | "red"; seq: number } | null;
  /**
   * Visual 2 (#129): stretcher after an injury, managers pacing their technical areas, the benches,
   * the net shaking, the scoring side's fans jumping and the scorer's celebration. Read every frame.
   */
  extras?: boolean;
  /** Teams whose players show the stamina bar (absent = both; the live match passes only the user's side). */
  staminaTeams?: TeamId[];
  /**
   * Remote mode (multiplayer part 7): the server runs the match. The pitch never simulates; it draws the state it
   * gets through `matchStateSync` (adopted as is) and blends the players and the ball between the last two position
   * frames of `frames` (`remoteInterp.ts`). Read at mount. Absent = the pitch runs the match itself, as always.
   */
  remote?: RemoteFeed | null;
  /** Camera (art phase 5): `follow` zooms in and follows the ball. Absent: the whole pitch, as always. */
  camera?: "fixed" | "follow";
  /** Slow-motion replay of a goal (art phase 5): the page holds the match while it plays. Never in remote mode. */
  replay?: boolean;
  /** Told when a goal replay starts and ends (the page shows its tag). */
  onReplay?: (on: boolean) => void;
  /** A new value ends the goal replay that is playing (the page's Skip button). */
  skipReplaySeq?: number;
  /** Graphics quality (art phase 8): `light` draws a calm pitch (no fireworks, flashes, crowd motion, weather). */
  quality?: PitchQuality;
  /** Art phase 9: the art pack's slimmer players ("Mais realista") instead of the current ones. Read at mount. */
  realPlayers?: boolean;
  /** Figures (the art sprites) or discs with the face (4.41.19); switched live. Absent: figures. */
  markers?: "figures" | "discs";
}

export interface PitchOfficials {
  refereeFace?: string;
  assistantFaces?: [string | undefined, string | undefined];
}

export interface PitchStadium {
  /** 0..1, attendance / capacity. */
  fill: number;
  /** Engine team of the home club (its fans fill most of the stand). */
  homeTeam: TeamId;
  neutral: boolean;
  /** Fixture id (or "test"): the same game fills the same seats. */
  seed: string;
  /** Club stands under works on the day (#137): drawn empty, as a building site. */
  works?: StandId[];
  /** The manager's decorations in the home end (achievements), human club's home games only. */
  decor?: StadiumDecor;
  /** A big game: flares with smoke (and fireworks at night) at kickoff and at every home goal. */
  bigMatch?: boolean;
  /** The home club's two colours (CSS): flags, banners and scarves of the crowd. Absent: the kit and white. */
  homeColors?: [string, string];
  /** URL of the home crest, shown on the crowd's flags and banners (4.38.14). */
  homeCrest?: string;
  /**
   * LED boards around the pitch (4.38.21): panels of made-up ads that flip now and then (`ledAdFor`), and after a goal
   * the goal text (`{name}` and `{minute}` replaced) on every panel. Absent: no boards.
   */
  led?: { goal: string; lang?: LedLang };
}

export interface PitchPerf { fps: number; drawMs: number }
const PERF_SAMPLE_FRAMES = 30;

const DEFAULT_EFFECT_LABELS = { save: "SAVE", wide: "WIDE", offside: "OFFSIDE", cornerSave: "SAVED · CORNER", cornerDeflect: "DEFLECTED · CORNER" };

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
  teamAColor2,
  teamBColor2,
  keepTickerAlive = false,
  captureRef,
  faceUrls,
  effectLabels,
  mirror = false,
  perfRef,
  stadium = null,
  pitch = null,
  lighting = null,
  officials = false,
  coaches,
  coachCue = null,
  coachCard = null,
  extras = false,
  staminaTeams,
  remote = null,
  camera = "fixed",
  replay = false,
  onReplay,
  skipReplaySeq = 0,
  quality = "high",
  realPlayers = false,
  markers = "figures",
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
  /** Second kit colours, read every frame: they can arrive after the pitch mounts (the roster loads later). */
  const secondColorsRef          = useRef({ A: teamAColor2, B: teamBColor2 });
  secondColorsRef.current = { A: teamAColor2, B: teamBColor2 };
  const effectLabelsRef          = useRef(effectLabels);
  const mirrorRef                = useRef(mirror);
  const perfRefRef               = useRef(perfRef);
  const stadiumRef               = useRef(stadium);
  const pitchRef                 = useRef(pitch);
  const lightingRef              = useRef(lighting);
  /** Bumped when the light inputs change: forces the light layer and the shadows to redraw. */
  const lightGenRef              = useRef(0);
  const coachesRef               = useRef(coaches);
  const extrasRef                = useRef(extras);
  const cameraRef                = useRef(camera);
  const qualityRef               = useRef(quality);
  const replayRef                = useRef(replay);
  const markersRef               = useRef(markers);
  const onReplayRef              = useRef(onReplay);
  const skipReplayFnRef          = useRef<(() => void) | null>(null);
  const staminaTeamsRef          = useRef(staminaTeams);
  staminaTeamsRef.current = staminaTeams;
  /** Set by the Pixi setup: re-bakes the crowd texture from `stadiumRef`. */
  const redrawCrowdRef           = useRef<(() => void) | null>(null);
  /** Set by the Pixi setup: redraws the pitch surface and lines from `pitchRef`. */
  const redrawSurfaceRef         = useRef<(() => void) | null>(null);
  /** Set by the Pixi setup: plays a gesture on a team's manager. */
  const coachCueFnRef            = useRef<((team: TeamId, kind: CoachGestureKind) => void) | null>(null);
  const coachCardFnRef           = useRef<((team: TeamId, card: "yellow" | "red") => void) | null>(null);
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
  useEffect(() => { extrasRef.current = extras; }, [extras]);
  useEffect(() => { cameraRef.current = camera; }, [camera]);
  useEffect(() => { markersRef.current = markers; }, [markers]);
  useEffect(() => { qualityRef.current = quality; }, [quality]);
  useEffect(() => { replayRef.current = replay; }, [replay]);
  useEffect(() => { onReplayRef.current = onReplay; }, [onReplay]);
  useEffect(() => { if (skipReplaySeq > 0) skipReplayFnRef.current?.(); }, [skipReplaySeq]);
  // Stadium flags read at event time (big game): the ref follows every prop change.
  useEffect(() => { stadiumRef.current = stadium; }, [stadium]);
  // Crowd texture: re-baked only when what it shows changes (never per frame).
  useEffect(() => {
    stadiumRef.current = stadium;
    redrawCrowdRef.current?.();
  }, [stadium?.fill, stadium?.homeTeam, stadium?.neutral, stadium?.seed, stadium?.works?.join(","), stadium?.decor?.banner, stadium?.decor?.flag, stadium?.decor?.mosaic, stadium?.homeColors?.join(","), stadium?.homeCrest, mirror]); // eslint-disable-line react-hooks/exhaustive-deps
  // Pitch surface: redrawn only when the pitch of the day (or the mirror) changes.
  useEffect(() => {
    pitchRef.current = pitch;
    redrawSurfaceRef.current?.();
  }, [pitch?.condition, pitch?.turf, pitch?.mowing, pitch?.seed, mirror]); // eslint-disable-line react-hooks/exhaustive-deps
  // Match light: read by the ticker; a change of its inputs forces one redraw (the mirror is in the redraw key).
  useEffect(() => {
    lightingRef.current = lighting;
    lightGenRef.current++;
    redrawSurfaceRef.current?.();
  }, [lighting?.kickoff, lighting?.sunset, lighting?.weather, lighting?.sun.stadiumId, lighting?.sun.side, lighting?.sun.lean, lighting?.sun.covered, lighting?.date, lighting?.seed, lighting?.clockOverride, lighting?.fog, lighting == null]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (coachCue) coachCueFnRef.current?.(coachCue.team, coachCue.kind);
  }, [coachCue?.seq]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (coachCard) coachCardFnRef.current?.(coachCard.team, coachCard.card);
  }, [coachCard?.seq]); // eslint-disable-line react-hooks/exhaustive-deps

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
        // At most 1.5× (light quality: 1×): a 2× display filled 4× the pixels for fog, light and crowd (perf audit 4.41.29).
        resolution: qualityRef.current === "light" ? 1 : Math.min(1.5, window.devicePixelRatio || 1),
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

      // Converts game yards → canvas pixels (turned 180° when `mirror` is set — drawing only, #142)
      const toPixel = (x: number, y: number) => ({
        px: m.marginX + mirrorX(x, mirrorRef.current) * m.scale,
        py: m.marginY + mirrorY(y, mirrorRef.current) * m.scale,
      });

      const fillA = teamAColor ? cssColorToPixiHex(teamAColor) : DEFAULT_TEAM_A;
      const fillB = teamBColor ? cssColorToPixiHex(teamBColor) : DEFAULT_TEAM_B;
      // Second colour of each kit (marker border, number tag): white when unknown or the same as the kit.
      const secondOf = (css: string | undefined, kit: number) => {
        const c = css ? cssColorToPixiHex(css) : 0xffffff;
        return c === kit ? (kit === 0xffffff ? 0x1a1a1a : 0xffffff) : c;
      };
      let fillA2 = secondOf(secondColorsRef.current.A, fillA);
      let fillB2 = secondOf(secondColorsRef.current.B, fillB);

      // ── Stadium: stand + crowd baked into ONE texture (spec 2026-10-08-match-visual §2) ──
      // Re-baked only when the fill, the home team, the venue or the mirror change; zero cost per frame.
      // The empty stand is a plain Graphics; each side's fans one sprite of their own box, so the
      // scoring side's fans can jump (#129) and the home fans pulse.
      const crowdLayer = new Container();
      crowdLayer.eventMode = 'none';
      app.stage.addChildAt(crowdLayer, 0);
      let crowdBase: Graphics | null = null;
      let crowdCorners: Graphics | null = null;
      // The art pack's stadium pieces (art phase 9): stand textures, tunnel, towers, benches, LED frame.
      let stadiumArt: StadiumArt | null = null;
      let fxArt: FxArt | null = null;
      let crowdBaseArt: Container | null = null;
      /** Each side's fans, baked in tiles that move on their own (`crowdMotion.ts`). */
      /** One fan: his seat, motion, and the particles he is made of (body, scarf, head). */
      type Fan = {
        x: number; baseY: number; phase: number; speed: number; flag: boolean; skin: number; hair: number;
        body: FanParticle; scarf: FanParticle | null; head: FanParticle;
      };
      /** Each side's fans: a ParticleContainer of small people (`crowdFigures.ts`) that move on their own. */
      const crowdFans: Record<"home" | "away", { layer: ParticleContainer; fans: Fan[] } | null> = { home: null, away: null };
      let crowdAtlas: ReturnType<typeof buildCrowdAtlas> | null = null;
      /** The art crowd pieces (art phase 4), loaded with the new visual; until then the drawn figures. */
      let crowdArt: ArtCrowdSheet | null = null;
      let crowdAtlasSource: CanvasSource | null = null;
      let figureSize = 6;
      /** Height (px) of a fans' jump: under half a seat. */
      let crowdDecor: Graphics | null = null;
      /** Waving flags over the home stands (crowd motion), set by every bake; drawn every frame with extras. */
      let flagColor = fillA;
      /** The home club's second colour (flags, banners, scarves): white when only one is known. */
      let flagColor2 = 0xffffff;
      const flagGfx = new Graphics();
      flagGfx.eventMode = 'none';
      /** Crests on the flags and banners: one sprite per hand flag and per banner, placed every frame. */
      const crestLayer = new Container();
      crestLayer.eventMode = 'none';
      let crestTexture: Texture | null = null;
      let crestBake = 0;
      let flagCrests: Sprite[] = [];
      const rebuildCrests = () => {
        for (const s of flagCrests) s.destroy();
        flagCrests = [];
        if (!crestTexture) return;
        const nFlags = (crowdFans.home?.fans.filter((f) => f.flag).length ?? 0) + (crowdFans.away?.fans.filter((f) => f.flag).length ?? 0);
        const mk = () => { const s = new Sprite(crestTexture!); s.anchor.set(0.5); s.visible = false; crestLayer.addChild(s); return s; };
        flagCrests = Array.from({ length: nFlags }, mk);
      };
      /** Phone light candidates of the filled seats (stadium atmosphere), set by every bake. */
      let phones: PhoneLight[] = [];
      const bakeCrowd = () => {
        const st = stadiumRef.current;
        if (!m.stand || !st) return;
        for (const k of ["home", "away"] as const) {
          crowdFans[k]?.layer.destroy();
          crowdFans[k] = null;
        }
        crowdBase?.destroy();
        // The home club is drawn on the left when it is team A and the pitch is not mirrored (or B, mirrored).
        const homeLeft = (st.homeTeam === "A") !== mirrorRef.current;
        const works = worksSides(st.works, mirrorRef.current);
        crowdBase = new Graphics();
        drawStandBase(crowdBase, m.stand, works);
        drawStandEdges(crowdBase, m.stand);
        crowdLayer.addChild(crowdBase);
        crowdBaseArt?.destroy({ children: true });
        crowdBaseArt = null;
        if (stadiumArt) {
          // The empty stand texture under the fans (darkened, as in the art preview), the construction one where a
          // stand is under works; then the walkways, the tunnel and the hazard tape over it.
          const art = stadiumArt;
          const layer = new Container();
          const shade = new Graphics();
          const cell = seatCellPx(m.stand);
          const workSet = new Set<string>(works ?? []);
          for (const r of standSideRects(m.stand)) {
            if (r.w <= 0 || r.h <= 0) continue;
            const site = workSet.has(r.side);
            const tile = new TilingSprite({ texture: site ? art.standWorks : art.standEmpty, width: r.w, height: r.h });
            tile.position.set(r.x, r.y);
            tile.tileRotation = STAND_TILE_ROTATION[r.side];
            tile.tileScale.set((cell * STADIUM.ROW_DEPTH) / STADIUM_ART.SEAT_PX);
            layer.addChild(tile);
            if (!site) shade.rect(r.x, r.y, r.w, r.h).fill({ color: 0x0b0f1a, alpha: STADIUM_ART.SHADE });
          }
          layer.addChild(shade);
          const details = new Graphics();
          drawStandDetails(details, m.stand, works, true);
          drawStandEdges(details, m.stand);
          layer.addChild(details);
          const t = standTunnel(m.stand);
          if (t) {
            // The canopy's mouth faces the pitch (the sprite's mouth is at its bottom).
            const s = new Sprite(art.tunnel);
            s.anchor.set(0.5);
            s.rotation = Math.PI;
            s.width = t.w; s.height = t.h;
            s.position.set(t.x + t.w / 2, t.y + t.h / 2);
            s.tint = st.homeColors ? cssColorToPixiHex(st.homeColors[0]) : st.homeTeam === "A" ? fillA : fillB;
            layer.addChild(s);
          }
          crowdLayer.addChild(layer);
          crowdBaseArt = layer;
        }
        // The stand corners rounded into a bowl (tester report: square stands): the corner outside the curve is the
        // dark concourse behind the stand, the curve edged like the roof.
        crowdCorners?.destroy();
        crowdCorners = new Graphics();
        drawStandCorners(crowdCorners, m.stand);
        crowdLayer.addChild(crowdCorners);
        const seats = crowdSeats({
          stand: m.stand,
          fill: st.fill,
          homeColor: st.homeTeam === "A" ? fillA : fillB,
          awayColor: st.homeTeam === "A" ? fillB : fillA,
          homeSide: homeLeft ? "left" : "right",
          neutral: st.neutral,
          seed: st.seed,
          works,
        });
        const cell = seatCellPx(m.stand);
        figureSize = cell * CROWD_MOTION.FIGURE;
        flagColor = st.homeColors ? cssColorToPixiHex(st.homeColors[0]) : st.homeTeam === "A" ? fillA : fillB;
        flagColor2 = st.homeColors ? cssColorToPixiHex(st.homeColors[1]) : 0xffffff;
        if (flagColor2 === flagColor) flagColor2 = 0xffffff;
        // The crest is loaded once per bake; the sprites appear when it arrives.
        const bake = ++crestBake;
        crestTexture?.destroy(true);
        crestTexture = null;
        if (st.homeCrest && !st.neutral) {
          void loadCrestCanvas(st.homeCrest, 64).then((canvas) => {
            if (!canvas || bake !== crestBake || disposed) return;
            crestTexture = Texture.from(canvas);
            rebuildCrests();
          });
        }
        phones = phoneLights(seats, st.seed);
        // The figures' atlas: one canvas, so each side renders in a single ParticleContainer.
        crowdAtlasSource?.destroy();
        crowdAtlas = crowdArt ? buildArtCrowdAtlas(crowdArt, flagColor) : buildCrowdAtlas(flagColor, flagColor2);
        crowdAtlasSource = new CanvasSource({ resource: crowdAtlas.canvas, transparent: true });
        const frames = bindAtlas(crowdAtlas, crowdAtlasSource);
        const scale = figureSize / crowdAtlas.frame.SCALE;
        const anchorY = crowdAtlas.frame.FOOT_Y / crowdAtlas.frame.SIZE;
        const headIndex = crowdAtlas.headIndex;
        const make = (texture: Texture, x: number, y: number, tint?: number) => new FanParticle({
          texture, x, y, scaleX: scale, scaleY: scale, anchorX: 0.5, anchorY, ...(tint !== undefined ? { tint } : {}),
        });
        for (const k of ["home", "away"] as const) {
          // Back rows first, so the fans nearer the bottom of the screen stand in front.
          const mine = seats.filter((seat) => seat.team === k).sort((a, b) => a.y - b.y || a.x - b.x);
          if (mine.length === 0) continue;
          const looks = fanLooks(mine, cell, `${st.seed}:${k}`);
          const layer = new ParticleContainer({
            texture: frames.body[0]!,
            dynamicProperties: { position: true, uvs: true, color: false, vertex: false, rotation: false },
          });
          layer.eventMode = 'none';
          const fans: Fan[] = [];
          mine.forEach((seat, i) => {
            const look = looks[i]!;
            // The figure stands on the seat: its feet half a cell below the seat's centre.
            const baseY = seat.y + cell * 0.5;
            const body = make(frames.body[0]!, seat.x, baseY, seat.color);
            const scarf = look.scarf ? make(frames.scarf[0], seat.x, baseY) : null;
            const head = make(frames.heads[headIndex(look.skin, look.hair, 0)]!, seat.x, baseY);
            layer.addParticle(body);
            if (scarf) layer.addParticle(scarf);
            layer.addParticle(head);
            fans.push({ x: seat.x, baseY, phase: look.phase, speed: look.speed, flag: look.flag, skin: look.skin, hair: look.hair, body, scarf, head });
          });
          crowdLayer.addChild(layer);
          crowdFans[k] = { layer, fans };
        }
        crowdLayer.addChild(flagGfx); // hand flags and banners over the fans
        crowdLayer.addChild(crestLayer);
        rebuildCrests();
        // The manager's decorations (achievements): over the home end, unless it is under works.
        crowdDecor?.destroy();
        crowdDecor = null;
        const homeSide = homeLeft ? "left" : "right";
        if (st.decor && !st.neutral && !works.includes(homeSide)) {
          const rects = decorRects(m.stand, homeSide, st.decor);
          if (rects.length > 0) {
            crowdDecor = new Graphics();
            drawDecor(crowdDecor, rects, st.homeTeam === "A" ? fillA : fillB);
            crowdLayer.addChild(crowdDecor);
          }
        }
      };
      bakeCrowd();
      redrawCrowdRef.current = bakeCrowd;
      /** Start of the last home-goal pulse on the effects clock (null: none running). */
      let crowdPulseAt: number | null = null;
      /** The scoring side's fans jumping (#129): which fans, since when (effects clock). */
      let crowdJump: { side: "home" | "away"; at: number } | null = null;

      // Pitch surface: mowing pattern and wear (static; redrawn only when the pitch changes)
      const surfaceGraphics = new Graphics();
      const ringsGraphics = new Graphics();
      const ringsMask = new Graphics().rect(m.marginX, m.marginY, m.width, m.height).fill(0xffffff);
      ringsGraphics.mask = ringsMask;
      // Painted turf (art phase 1, `paintedTurf.ts`): the grass of the painted backdrop over the base, cropped to the
      // grass area; the game's own wear goes over it (`wearGraphics`). Loaded on demand; until then, the drawn turf.
      const turfSprite = new Sprite();
      turfSprite.visible = false;
      turfSprite.eventMode = 'none';
      const turfRect = runOffRect(m);
      const turfMask = new Graphics().rect(turfRect.x, turfRect.y, turfRect.w, turfRect.h).fill(0xffffff);
      turfSprite.mask = turfMask;
      const wearGraphics = new Graphics();
      let turfTexture: { url: string; texture: Texture } | null = null;
      let turfLoading: string | null = null;
      let turfDisposed = false;
      // Photo grass (4.41.17): the art pack's texture over the drawn bands, when the painted pitch is not used.
      const photoGrass = new TilingSprite({ texture: Texture.EMPTY, width: turfRect.w, height: turfRect.h });
      photoGrass.position.set(turfRect.x, turfRect.y);
      photoGrass.alpha = GRASS_PHOTO.ALPHA;
      photoGrass.visible = false;
      photoGrass.eventMode = 'none';
      let photoLoading: string | null = null;
      let photoShown: string | null = null;
      app.stage.addChild(surfaceGraphics, photoGrass, turfSprite, turfMask, ringsGraphics, ringsMask, wearGraphics);

      // Grass grain and a soft centre light over the mowing (4.39): one tiling noise texture and one radial
      // gradient, baked once, under the lines.
      const grainCanvas = document.createElement('canvas');
      grainCanvas.width = grainCanvas.height = MATCH_LOOK.GRAIN.SIZE;
      const grainCtx = grainCanvas.getContext('2d');
      if (grainCtx) {
        const img = grainCtx.createImageData(grainCanvas.width, grainCanvas.height);
        for (let k = 0; k < img.data.length; k += 4) {
          const v = Math.random();
          const light = v > 0.5;
          img.data[k] = light ? 220 : 0; img.data[k + 1] = light ? 255 : 20; img.data[k + 2] = light ? 200 : 0;
          img.data[k + 3] = Math.round(Math.abs(v - 0.5) * 2 * MATCH_LOOK.GRAIN.ALPHA * 255);
        }
        grainCtx.putImageData(img, 0, 0);
      }
      const grainTexture = new Texture({ source: new CanvasSource({ resource: grainCanvas, transparent: true }) });
      const grain = new TilingSprite({ texture: grainTexture, width: m.width, height: m.height });
      grain.x = m.marginX; grain.y = m.marginY;
      grain.eventMode = 'none';
      const centreCanvas = document.createElement('canvas');
      centreCanvas.width = centreCanvas.height = 256;
      const centreCtx = centreCanvas.getContext('2d');
      if (centreCtx) {
        const grd = centreCtx.createRadialGradient(128, 128, 10, 128, 128, 128);
        grd.addColorStop(0, `rgba(255,255,220,${MATCH_LOOK.CENTRE_LIGHT})`);
        grd.addColorStop(0.6, 'rgba(255,255,220,0)');
        grd.addColorStop(1, `rgba(0,0,0,${MATCH_LOOK.EDGE_DARK})`);
        centreCtx.fillStyle = grd;
        centreCtx.fillRect(0, 0, 256, 256);
      }
      const centreTexture = new Texture({ source: new CanvasSource({ resource: centreCanvas, transparent: true }) });
      const centreLight = new Sprite(centreTexture);
      centreLight.x = m.marginX; centreLight.y = m.marginY;
      centreLight.width = m.width; centreLight.height = m.height;
      centreLight.eventMode = 'none';
      app.stage.addChild(grain, centreLight);

      // Pitch lines (alpha / dashes follow the surface): a soft chalk glow under a crisp line.
      const pitchGraphics = new Graphics();
      const drawSurfaceNow = () => {
        const input = pitchRef.current ?? { condition: 100, turf: "natural", mowing: "stripes", seed: "" };
        surfaceGraphics.clear();
        ringsGraphics.clear();
        wearGraphics.clear();
        // Snow (art phase 9): the painted snowy pitch, unless the roof is closed.
        const li = lightingRef.current;
        const snowy = li?.weather === "snow" && !li.sun.covered;
        const turfUrl = (snowy ? paintedBackdrop("match-backdrop-snow") : null) ?? (() => { const id = paintedTurfId(input); return id ? paintedBackdrop(id) : null; })();
        let lines: { lineAlpha: number; dashedLines: boolean };
        if (turfUrl && turfTexture?.url === turfUrl) {
          // Painted: base under the crop's edges, the painted grass, then the wash of the band and the game's wear.
          const o = paintedOverlay(input);
          const r = runOffRect(m);
          surfaceGraphics.rect(r.x, r.y, r.w, r.h).fill(o.washColor);
          const pl = paintedPlacement({ x: m.marginX, y: m.marginY, w: m.width, h: m.height }, mirrorRef.current);
          turfSprite.texture = turfTexture.texture;
          turfSprite.pivot.set(pl.pivotX, pl.pivotY);
          turfSprite.position.set(pl.x, pl.y);
          turfSprite.scale.set(pl.scaleX, pl.scaleY);
          turfSprite.rotation = pl.rotation;
          turfSprite.visible = true;
          photoGrass.visible = false;
          grain.visible = false;
          if (o.washAlpha > 0) wearGraphics.rect(r.x, r.y, r.w, r.h).fill({ color: o.washColor, alpha: o.washAlpha });
          drawShapes(wearGraphics, ringsGraphics, m, o.shapes, mirrorRef.current);
          lines = o;
        } else {
          const s = pitchSurface(input);
          turfSprite.visible = false;
          grain.visible = true;
          drawSurface(surfaceGraphics, ringsGraphics, m, s, mirrorRef.current);
          lines = s;
          if (newVisualOn()) {
            const ph = grassPhoto(input);
            const url = gameArtUrl(`pitch/${ph.id}.png`);
            photoGrass.tint = ph.tint;
            if (photoShown === url) photoGrass.visible = true;
            else if (photoLoading !== url) {
              photoLoading = url;
              void Assets.load<Texture>(url).then((tex) => {
                if (turfDisposed || !tex) return;
                photoGrass.texture = tex;
                photoGrass.tileScale.set((GRASS_PHOTO.TILE_YDS * m.scale) / tex.width);
                photoShown = url;
                redrawSurfaceRef.current?.();
              }).catch(() => { /* the drawn bands stay */ });
            }
          } else photoGrass.visible = false;
          if (turfUrl && turfLoading !== turfUrl) {
            turfLoading = turfUrl;
            void Assets.load<Texture>(turfUrl).then((tex) => {
              if (turfDisposed || !tex) return;
              const F = PAINTED_TURF.FRAME;
              turfTexture?.texture.destroy(false);
              turfTexture = { url: turfUrl, texture: new Texture({ source: tex.source, frame: new Rectangle(F.x, F.y, F.w, F.h) }) };
              redrawSurfaceRef.current?.();
            }).catch(() => { /* the drawn turf stays */ });
          }
        }
        pitchGraphics.clear();
        drawPitch(pitchGraphics, m, { alpha: lines.lineAlpha * MATCH_LOOK.LINE_GLOW_ALPHA, dashed: lines.dashedLines, width: MATCH_LOOK.LINE_GLOW_W, goals: false });
        drawPitch(pitchGraphics, m, { alpha: lines.lineAlpha, dashed: lines.dashedLines, goals: !goalArt });
      };
      // The art pack's goals (art phase 9): the net under the players, the frame over them (`goal/goal.json`).
      let goalArt: { net: Sprite[]; frame: Sprite[] } | null = null;
      const goalNetLayer = new Container();
      goalNetLayer.eventMode = 'none';
      drawSurfaceNow();
      redrawSurfaceRef.current = drawSurfaceNow;
      app.stage.addChild(pitchGraphics, goalNetLayer);

      // Match light (time of day, weather): above the pitch, its lines and the stand, below the players.
      // Redrawn every 10 game-seconds (or when the light inputs / mirror change), never per frame.
      const lightGraphics = new Graphics();
      lightGraphics.eventMode = 'none';
      // Stadium shadow (`stadiumShadow.ts`): a yard-per-pixel grid in a canvas texture stretched over the pitch
      // (linear filtering smooths it), under the veils of the light layer. Redrawn with the light layer.
      const shadeCanvas = document.createElement('canvas');
      const shadeCtx = shadeCanvas.getContext('2d');
      let shadeTexture: Texture | null = null;
      const shadeSprite = new Sprite();
      shadeSprite.eventMode = 'none';
      shadeSprite.visible = false;
      app.stage.addChild(shadeSprite);
      const drawShade = (l: Lighting | null, sun: StadiumSun | null) => {
        if (!l || !sun || !shadeCtx || l.stand.alpha <= 0.005) { shadeSprite.visible = false; return; }
        const S = LIGHTING.STAND;
        const grid = stadiumShadeGrid(sun, l.stand.depth * PITCH_WIDTH, l.stand.endDepth, S.LEAN, S.SOFT);
        if (shadeCanvas.width !== grid.w || shadeCanvas.height !== grid.h) {
          shadeCanvas.width = grid.w; shadeCanvas.height = grid.h;
          shadeTexture?.destroy(true);
          shadeTexture = null;
        }
        const img = shadeCtx.createImageData(grid.w, grid.h);
        const dark = l.stand.color, lit = S.LIT.COLOR;
        for (let k = 0; k < grid.cells.length; k++) {
          const v = grid.cells[k]!;
          // Shade over the shadow, warm light over the sun, mixed across the soft edge.
          const aShade = l.stand.alpha * v, aLit = l.stand.litAlpha * (1 - v);
          const a = aShade + aLit;
          const t = a > 0 ? aShade / a : 0;
          const o = k * 4;
          img.data[o]     = Math.round(((lit >> 16) & 255) * (1 - t) + ((dark >> 16) & 255) * t);
          img.data[o + 1] = Math.round(((lit >> 8) & 255) * (1 - t) + ((dark >> 8) & 255) * t);
          img.data[o + 2] = Math.round((lit & 255) * (1 - t) + (dark & 255) * t);
          img.data[o + 3] = Math.round(Math.min(1, a) * 255);
        }
        shadeCtx.putImageData(img, 0, 0);
        if (!shadeTexture) { shadeTexture = Texture.from(shadeCanvas); shadeSprite.texture = shadeTexture; }
        else shadeTexture.source.update();
        const p0 = toPixel(grid.x0, grid.y0), p1 = toPixel(grid.x0 + grid.w, grid.y0 + grid.h);
        shadeSprite.position.set(p0.px, p0.py);
        shadeSprite.scale.set((p1.px - p0.px) / grid.w, (p1.py - p0.py) / grid.h);
        shadeSprite.visible = true;
      };
      app.stage.addChild(lightGraphics);
      // Vignette and floodlight glow (4.31.4): radial gradients baked once into small canvas textures and stretched,
      // so they fade smoothly (drawn as stacked circles / strokes they showed as bands on a large screen).
      const gradientTexture = (stops: [number, number][], rgb: string): Texture => {
        const c = document.createElement('canvas');
        c.width = c.height = 256;
        const ctx = c.getContext('2d')!;
        const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
        for (const [at, alpha] of stops) grad.addColorStop(at, `rgba(${rgb},${alpha})`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 256, 256);
        return Texture.from(c);
      };
      const G = LIGHTING.GRADIENTS;
      const vignetteTexture = gradientTexture(G.VIGNETTE, '0,0,0');
      const glowTexture = gradientTexture(G.GLOW, '255,255,255');
      const vignetteSprite = new Sprite(vignetteTexture);
      vignetteSprite.eventMode = 'none';
      vignetteSprite.visible = false;
      // The texture's circle (radius 128) reaches the canvas corners: the edges darken, the middle stays clear.
      vignetteSprite.anchor.set(0.5);
      vignetteSprite.position.set(canvasWidth / 2, canvasHeight / 2);
      vignetteSprite.width = canvasWidth * Math.SQRT2;
      vignetteSprite.height = canvasHeight * Math.SQRT2;
      app.stage.addChild(vignetteSprite);
      const glowRadius = Math.max(canvasWidth, canvasHeight) * G.GLOW_RADIUS;
      const glowSprites = ([[0, 0], [canvasWidth, 0], [0, canvasHeight], [canvasWidth, canvasHeight]] as const).map(([x, y]) => {
        const sp = new Sprite(glowTexture);
        sp.eventMode = 'none';
        sp.visible = false;
        sp.anchor.set(0.5);
        sp.position.set(x, y);
        sp.width = sp.height = glowRadius * 2;
        app.stage.addChild(sp);
        return sp;
      });
      // With the stadium, the glow comes from the floodlight towers in the corners (none under a closed roof).
      const towersOn = !!m.stand && !lightingRef.current?.sun.covered;
      if (m.stand && towersOn) {
        towerSpots(m.stand).forEach((t, i) => {
          const p = towerPanel(t);
          glowSprites[i]!.position.set(p.x, p.y);
        });
      }
      const drawGradients = (l: Lighting | null) => {
        const v = l ? l.vignette * G.VIGNETTE_STRENGTH : 0;
        vignetteSprite.visible = v > 0.005;
        vignetteSprite.alpha = v;
        const f = l ? LIGHTING.NIGHT.FLOOD * l.flood * G.GLOW_STRENGTH : 0;
        for (const sp of glowSprites) { sp.visible = f > 0.005; sp.alpha = f; }
      };
      let currentLight: Lighting | null = null;
      let lastLightKey = "";
      let shadowKey = "";
      /** Set once the markers exist: redraws every marker's light shadows. */
      let refreshShadows: (l: Lighting | null) => void = () => {};
      const updateLight = () => {
        const li = lightingRef.current;
        if (!li) {
          if (currentLight) { lightGraphics.clear(); drawShade(null, null); drawGradients(null); currentLight = null; lastLightKey = ""; shadowKey = ""; refreshShadows(null); }
          return;
        }
        const clock = li.clockOverride ?? matchClockMinutes(stateRef.current, minutesOf(li.kickoff));
        // Every 10 game-seconds: the stadium shadow grows smoothly toward sunset instead of jumping each minute.
        const key = `${Math.floor(clock * 6)}|${mirrorRef.current}|${lightGenRef.current}`;
        if (key === lastLightKey) return;
        lastLightKey = key;
        const weather = li.weather === "wind_rain" ? "rain" : li.weather;
        currentLight = matchLighting({ clock, sunset: minutesOf(li.sunset), weather, sun: li.sun, date: li.date });
        drawShade(currentLight, currentLight.stand.profile);
        drawLight(lightGraphics, currentLight, toPixel, canvasWidth, canvasHeight);
        drawGradients(currentLight);
        // Player shadows: only when they actually change (the sun shadow grows slowly toward sunset).
        const sk = `${mirrorRef.current}|${currentLight.shadows.map((s) => `${s.kind},${s.angle.toFixed(2)},${s.length.toFixed(2)},${s.alpha.toFixed(3)}`).join(";")}`;
        if (sk !== shadowKey) { shadowKey = sk; refreshShadows(currentLight); }
      };

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
      /** Smoothed drawn speed of each marker (px per frame), for the heading chevron. */
      const markerVel = new Map<number, { x: number; y: number; vx: number; vy: number }>();
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
        // Remote: the server's state is the truth (adopted below, with the set-piece walk).
        if (remote) return;
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
      /** Bounce of a loose high ball: which landing it is (its start time) and when it was first drawn. */
      let bounceKey: number | null = null;
      /** Box jostling of this frame (engine yards per player), drawn on the marker. */
      let jostle: Map<number, Pos> | null = null;
      let bounceAt = 0;
      let lastDrawnBall: DrawnBall | null = null;
      const framesVisible = () =>
        !(typeof document !== 'undefined' && document.hidden) && app.ticker.started;

      // Remote mode: every state from the server is adopted as is; a restart that repositions the teams starts the
      // set-piece walk, like a simulated step would. Positions keep following the frames (`drawFrame`).
      const unsubRemoteState = remote
        ? gameBus.on("matchStateSync", (s) => {
            const before = stateRef.current;
            const incoming: import('@/GameEngine/types').GameState = { ...s, pendingSubsA: s.pendingSubsA ?? [], pendingSubsB: s.pendingSubsB ?? [] };
            const last = remote.frames.current.last;
            const next = last ? withFramePositions(incoming, last) : incoming;
            if (!framesVisible()) {
              transition = null;
              setPieceStartPending = false;
            } else if (isSetPieceStart(before, next)) {
              setPieceStartPending = true;
            }
            stateRef.current = next;
          })
        : null;
      let remoteSeenSeq = -1;

      // Goal replay (art phase 5, `matchCamera.ts`): the drawn positions of the last seconds are kept; after a goal
      // they play back slowly while the simulation is held. Drawing only, never in remote mode or with the tab hidden.
      let replayBuf: ReplayFrame<Pos, DrawnBall>[] = [];
      let replayClock = 0;
      let replayPending: { goalAt: number } | null = null;
      let replayRun: { clip: ReplayFrame<Pos, DrawnBall>[]; started: number } | null = null;
      const endReplay = () => {
        if (!replayRun) return;
        replayRun = null;
        onReplayRef.current?.(false);
      };
      skipReplayFnRef.current = endReplay;
      // Goal celebration (`goalCelebration.ts`): the scorer runs off and the team-mates join him while the match is
      // held, then everyone walks back to the kickoff; the replay plays after it. Drawing only.
      let celebration: {
        plan: CelebrationPlan; started: number; ball: DrawnBall; arrived: Set<number>;
        walkFrom: Map<number, Pos> | null; walkStarted: number; clip: ReplayFrame<Pos, DrawnBall>[] | null;
      } | null = null;
      const unsubReplay = gameBus.on("goalScored", (e) => {
        if (remote || !framesVisible()) return;
        // The celebration is cheap to draw: only reduced motion skips it (the replay also skips light quality).
        if (reducedMotion) { if (replayRef.current && !calm()) replayPending = { goalAt: replayClock }; return; }
        const clip = replayRef.current && !calm() ? replayClip(replayBuf, replayClock) : null;
        const st = stateRef.current;
        const scorer = st.players.find((p) => p.id === e.scorerId);
        const plan = extrasRef.current && lastDrawnPos && lastDrawnBall && scorer
          ? planCelebration({
            scorerId: e.scorerId, positions: lastDrawnPos,
            players: st.players.map((p) => ({ id: p.id, team: p.team, keeper: p.role === "GK" })),
            attackDir: scorer.attackDir, seed: `${e.minute}:${e.scorerId}:${e.score.A}:${e.score.B}`,
            gameSpeed: gameSpeedRef.current,
          })
          : null;
        if (plan && lastDrawnBall) {
          celebration = { plan, started: replayClock, ball: { ...lastDrawnBall }, arrived: new Set(), walkFrom: null, walkStarted: 0, clip };
          return;
        }
        if (replayRef.current && !calm()) replayPending = { goalAt: replayClock };
      });
      // Reduced motion or light quality (art phase 8, `motionPrefs.ts`): a calm pitch.
      const reducedMotion = prefersReducedMotion();
      const calm = () => reducedMotion || qualityRef.current === "light";
      let cam: CameraView = { zoom: 1, x: canvasWidth / 2, y: canvasHeight / 2 };

      const pumpSimulation = () => {
        // Remote mode: the server simulates; nothing to pump here.
        if (remote) return;
        // A replay holds the match; with the tab hidden there is no replay.
        if (replayRun && !framesVisible()) endReplay();
        if (celebration && !framesVisible()) celebration = null;
        const elapsedRealSeconds = pump(pausedRef.current || replayRun !== null || celebration !== null);
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
      // Rasterised at the holder's big face size (4.41.19), so it stays sharp there; the disc scales it down.
      const faceSize = faceRasterSize((markerR - 1) * MATCH_LOOK.HOLDER_FACE, app.renderer.resolution);
      const playerGraphics = new Map<number, Container>();
      const playerLabels   = new Map<number, Text>();
      /** Name pill behind each label (4.39): redrawn only when the name changes. */
      const playerPills    = new Map<number, { g: Graphics; text: string; face?: Sprite; faceUrl?: string }>();
      /** Pixi textures of the faces, per URL: owned by this app, destroyed on unmount. */
      const faceTextures = new Map<string, Texture>();
      let facesDisposed = false;
      // Players as animated sprites (art phase 2, `playerSprite.ts`): the atlases load on demand; until then (or with the
      // new visual off) the disc with the face, as before.
      let spriteSheets: Record<SpriteAtlas, Spritesheet> | null = null;
      const spriteMotion = new Map<number, SpriteMotion>();
      let spriteActions: SpriteAction[] = [];
      const bodyPose = new WeakMap<Container, string>();
      // Officials, managers and medics as sprites (art phase 3, `officialSprite.ts`), from their own atlas.
      let officialSheet: Spritesheet | null = null;
      let onOfficialsReady: (() => void) | null = null;

      const labelStyle = new TextStyle({
        fontSize:   markerLabelFontSize(markerR),
        fontFamily: 'sans-serif',
        fontWeight: '700',
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

      /** The marker shows the sprite figure (it has one and the mode is figures), else the disc with the face. */
      function figureShown(marker: Container): boolean {
        return !!marker.getChildByLabel('body') && markersRef.current !== "discs";
      }
      // The disc's painted rim (4.41.19, vector layout refined with FLUX): tinted with the kit over the two-tone border.
      let rimTexture: Texture | null = null;
      function addRim(marker: Container, team: TeamId): void {
        if (!rimTexture || marker.getChildByLabel('rim')) return;
        const rim = new Sprite(rimTexture);
        rim.label = 'rim';
        rim.anchor.set(0.5);
        // The rim's outer edge is at 0.49 of the image: it lands on the marker edge.
        rim.width = rim.height = (markerR + 0.5) / 0.49;
        rim.tint = team === "A" ? fillA : fillB;
        const ring = marker.getChildByLabel('ring');
        marker.addChildAt(rim, ring ? marker.getChildIndex(ring) + 1 : marker.children.length);
        rim.visible = !figureShown(marker);
      }

      /** Puts the face texture in the marker (replacing any previous one), under the ring. */
      function setMarkerFace(marker: Container, url: string, texture: Texture): void {
        const old = marker.getChildByLabel('face');
        if (old) { marker.removeChild(old); old.destroy(); }
        const face = new Sprite(texture);
        face.label = 'face';
        face.anchor.set(0.5);
        face.width = face.height = (markerR - 1) * 2;
        face.visible = !figureShown(marker);
        marker.addChildAt(face, 3); // above the light shadows, shadow + disc, below the ring
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

      /** The marker border: the kit on the upper left half, the second colour on the other, a thin edge outside. */
      function drawMarkerRing(ring: Graphics, team: TeamId): void {
        const rw = MARKER_RING_W, rr = markerR - rw / 2 + 0.5;
        ring.clear()
          .arc(0, 0, rr, Math.PI * 0.75, Math.PI * 1.75).stroke({ width: rw, color: team === "A" ? fillA : fillB })
          .arc(0, 0, rr, -Math.PI * 0.25, Math.PI * 0.75).stroke({ width: rw, color: team === "A" ? fillA2 : fillB2 })
          .circle(0, 0, markerR + 0.5).stroke(team === "A" ? outlineA : outlineB);
      }

      /**
       * A dark rounded pill behind the name with a strip of the team colour (local coordinates: label anchor). `faceW`
       * px more on the left for the player's face (sprite players, art phase 2).
       */
      function drawPill(g: Graphics, label: Text, color: number, faceW = 0): void {
        const P = MATCH_LOOK.PILL;
        const w = label.width + P.PAD_X * 2 + faceW, h = label.height + P.PAD_Y * 2;
        const x0 = -w / 2 - faceW / 2;
        g.clear()
          .roundRect(x0 + faceW / 2, -h + P.PAD_Y, w, h, h / 2).fill({ color: 0x070b14, alpha: P.ALPHA })
          .roundRect(x0 + faceW / 2, -h + P.PAD_Y, P.STRIP, h, h / 2).fill({ color, alpha: 0.95 });
      }

      // Shirt numbers (4.41.17): each player keeps his own for the whole match. Starters get their slot at kickoff
      // (1 = keeper … 11), the bench 12 on in its order, anyone else the next free number of his team. Until 4.41.12
      // the tag showed the slot, so a substitute took the number of the player he replaced (tester report).
      const shirtNumbers = new Map<number, number>();
      {
        const s0 = stateRef.current;
        for (const p of s0.players) shirtNumbers.set(p.id, p.slotIndex + 1);
        for (const bench of [s0.benchA, s0.benchB]) {
          bench.forEach((p, i) => { if (!shirtNumbers.has(p.id)) shirtNumbers.set(p.id, 12 + i); });
        }
      }
      const shirtNumberOf = (p: PitchPlayer): number => {
        const n = shirtNumbers.get(p.id);
        if (n !== undefined) return n;
        const used = new Set([...stateRef.current.players, ...stateRef.current.benchA, ...stateRef.current.benchB]
          .filter((q) => q.team === p.team).map((q) => shirtNumbers.get(q.id)).filter((x): x is number => x !== undefined));
        let k = 12;
        while (used.has(k)) k++;
        shirtNumbers.set(p.id, k);
        return k;
      };

      /** Create a marker + label for a player and register them in the maps. */
      function addPlayerSprite(player: PitchPlayer): void {
        const color = player.team === "A" ? fillA : fillB;
        const marker = new Container();
        const shadow = new Graphics()
          .ellipse(markerR * MARKER_SHADOW.DX, markerR * MARKER_SHADOW.DY, markerR, markerR * MARKER_SHADOW.SCALE_Y)
          .fill({ color: 0x000000, alpha: MARKER_SHADOW.ALPHA });
        const disc = new Graphics().circle(0, 0, markerR).fill(color);
        disc.label = "disc";
        // Border in the kit's two colours (4.38.21, mock option B): the kit on the upper left half, the second
        // colour on the other, with a thin dark edge outside.
        const ring = new Graphics();
        ring.label = "ring";
        drawMarkerRing(ring, player.team);
        const color2 = player.team === "A" ? fillA2 : fillB2;
        // Number tag under the marker: the player's own shirt number (`shirtNumberOf`), in the kit.
        const tagW = markerR * 1.15, tagH = markerR * 0.72;
        const numTag = new Graphics()
          .roundRect(-tagW / 2, markerR * 0.62, tagW, tagH, 3).fill(color)
          .roundRect(-tagW / 2, markerR * 0.62, tagW, tagH, 3).stroke({ width: 1, color: 0x000000, alpha: 0.35 });
        const numText = new Text({
          text: String(shirtNumberOf(player)),
          style: new TextStyle({ fontSize: Math.max(8, Math.round(markerR * 0.62)), fontFamily: 'sans-serif', fontWeight: '800', fill: color2 }),
        });
        numText.anchor.set(0.5);
        numText.y = markerR * 0.62 + tagH / 2;
        numText.label = "num";
        // Card: a small tilted card at the marker's top-right.
        const cw = markerR * CARD_BADGE.W, ch = markerR * CARD_BADGE.H;
        const cardBadge = new Graphics()
          .roundRect(-cw / 2, -ch / 2, cw, ch, 2)
          .fill(CARD_BADGE.YELLOW)
          .stroke({ width: 1, color: 0x000000, alpha: 0.4 });
        cardBadge.x = markerR * CARD_BADGE.X + cw / 2;
        cardBadge.y = markerR * CARD_BADGE.Y + ch / 2;
        cardBadge.rotation = 0.2;
        // Volume: a darker rim at the bottom of the marker. The white crescent over the face came out (tester report).
        const gloss = new Graphics()
          .moveTo(Math.cos(Math.PI * 0.15) * (markerR - 1.5), Math.sin(Math.PI * 0.15) * (markerR - 1.5))
          .arc(0, 0, markerR - 1.5, Math.PI * 0.15, Math.PI * 0.85).stroke({ width: 2, color: 0x000000, alpha: MATCH_LOOK.RIM });
        cardBadge.label = "card";
        cardBadge.visible = false;
        gloss.label = "gloss";
        // Light shadows (time of day): empty without `lighting`; redrawn only when the light changes. With the
        // light on they include a soft contact shadow, so the old hard one is hidden.
        shadow.label = "contactShadow";
        shadow.visible = !currentLight;
        const lightShadow = new Graphics();
        lightShadow.label = "lightShadow";
        drawLightShadows(lightShadow, currentLight, markerR, mirrorRef.current);
        marker.addChild(lightShadow, shadow, disc, ring, gloss, numTag, numText, cardBadge);
        const { px, py } = toPixel(player.x, player.y);
        marker.x = px;
        marker.y = py;
        world.addChild(marker);
        playerGraphics.set(player.id, marker);

        const label = new Text({ text: shirtName(player.name), style: labelStyle });
        label.anchor.set(0.5, 1);
        label.x = px;
        label.y = py - (markerR + MATCH_LOOK.PILL.LIFT);
        label.zIndex = 5; // names above every marker, below the ball
        const pill = new Graphics();
        pill.zIndex = 4.9;
        drawPill(pill, label, color);
        world.addChild(pill, label);
        playerLabels.set(player.id, label);
        playerPills.set(player.id, { g: pill, text: label.text });

        applyFace(player);
        addBody(player);
      }

      /**
       * The player's sprite body (six tinted layers) over his ground ring: the disc, its rim and the face hide (the face
       * goes to the name pill). Nothing without the atlases.
       */
      function addBody(player: PitchPlayer): void {
        const marker = playerGraphics.get(player.id);
        if (!spriteSheets || !marker || marker.getChildByLabel('body')) return;
        const teamKit = player.team === "A" ? fillA : fillB;
        const keeper = player.role === "GK";
        // The keeper wears his own kit, far from his team's (the bench's keeper colours), with a dark trim.
        const kit = keeper ? benchKits(["GK"], teamKit)[0]! : teamKit;
        const look = spriteLook(player.rosterId ?? String(player.id));
        const trim = keeper ? PLAYER_SPRITE.KEEPER_TRIM : player.team === "A" ? fillA2 : fillB2;
        const tints: Record<string, number> = { socks: kit, shirt: kit, trim, skin: look.skin, hair: look.hair };
        const body = new Container();
        body.label = 'body';
        body.scale.set(spriteScale(markerR));
        for (const layer of SPRITE_LAYERS) {
          const sp = new Sprite(spriteSheets.player.textures[`player-idle-${layer}.png`] ?? Texture.EMPTY);
          sp.anchor.set(PLAYER_SPRITE.ANCHOR.x, PLAYER_SPRITE.ANCHOR.y);
          sp.label = layer;
          const t = tints[layer];
          if (t !== undefined) sp.tint = t;
          body.addChild(sp);
        }
        const ring = marker.getChildByLabel('ring');
        marker.addChildAt(body, ring ? marker.getChildIndex(ring) + 1 : marker.children.length);
        addRim(marker, player.team);
        const fig = markersRef.current !== "discs";
        body.visible = fig;
        for (const l of ['disc', 'gloss', 'face', 'rim']) {
          const c = marker.getChildByLabel(l);
          if (c) c.visible = !fig;
        }
        const { px, py } = toPixel(player.x, player.y);
        spriteMotion.set(player.id, newMotion(px / m.scale, py / m.scale));
      }

      /** Shows the frame `base` of `atlas` on a body (only the textures that change). */
      function setPose(body: Container, atlas: SpriteAtlas, base: string): void {
        const key = `${atlas}:${base}`;
        if (!spriteSheets || bodyPose.get(body) === key) return;
        const sheet = spriteSheets[atlas];
        for (const layer of SPRITE_LAYERS) {
          const sp = body.getChildByLabel(layer) as Sprite | null;
          const tex = sheet.textures[`${base}-${layer}.png`];
          if (sp && tex) sp.texture = tex;
        }
        bodyPose.set(body, key);
      }

      /** A figure of the officials atlas (six tinted layers), as wide as a player times the kind's scale. */
      function makeFigureBody(kind: OfficialKind, tints: Record<string, number>): Container {
        const body = new Container();
        body.label = 'body';
        body.scale.set(spriteScale(markerR * OFFICIAL_SPRITE.SCALE[kind]));
        for (const layer of SPRITE_LAYERS) {
          const sp = new Sprite(Texture.EMPTY);
          sp.anchor.set(PLAYER_SPRITE.ANCHOR.x, PLAYER_SPRITE.ANCHOR.y);
          sp.label = layer;
          const t = tints[layer];
          if (t !== undefined) sp.tint = t;
          body.addChild(sp);
        }
        return body;
      }

      /** Shows the frame `base` of the officials atlas on a figure. */
      function setFigurePose(body: Container, base: string): void {
        const key = `officials:${base}`;
        if (!officialSheet || bodyPose.get(body) === key) return;
        for (const layer of SPRITE_LAYERS) {
          const sp = body.getChildByLabel(layer) as Sprite | null;
          const tex = officialSheet.textures[`${base}-${layer}.png`];
          if (sp && tex) sp.texture = tex;
        }
        bodyPose.set(body, key);
      }

      /**
       * Puts a figure in an official's / manager's container (after its shadow): the drawn disc, head and flag hide.
       * Nothing without the atlas.
       */
      function attachFigure(c: Container | null, kind: OfficialKind, id: string, clubColor?: number): void {
        if (!officialSheet || !c || c.destroyed || c.getChildByLabel('body')) return;
        const body = makeFigureBody(kind, officialTints(kind, id, clubColor));
        c.addChildAt(body, Math.min(1, c.children.length));
        for (const l of ['disc', 'head', 'flagUp', 'flagDown']) {
          const ch = c.getChildByLabel(l);
          if (ch) ch.visible = false;
        }
      }

      /** Remove and destroy the marker + label for a player that left the pitch. */
      function removePlayerSprite(id: number): void {
        const g = playerGraphics.get(id);
        if (g && subOuts.has(id)) {
          // Substituted (4.41.24, art review): he walks off to the bench side instead of vanishing.
          subOuts.delete(id);
          playerGraphics.delete(id);
          walkOffs.set(id, { g, fromX: g.x, fromY: g.y, at: effectNow });
        } else if (g) { world.removeChild(g); g.destroy({ children: true }); playerGraphics.delete(id); }
        const lbl = playerLabels.get(id);
        if (lbl) { world.removeChild(lbl); lbl.destroy(); playerLabels.delete(id); }
        const pl = playerPills.get(id);
        if (pl) { world.removeChild(pl.g); pl.g.destroy(); pl.face?.destroy(); playerPills.delete(id); }
      }

      refreshFacesRef.current = () => {
        for (const player of stateRef.current.players) applyFace(player);
      };

      refreshShadows = (l) => {
        for (const marker of playerGraphics.values()) {
          const ls = marker.getChildByLabel("lightShadow") as Graphics | null;
          if (ls) drawLightShadows(ls, l, markerR, mirrorRef.current);
          const contact = marker.getChildByLabel("contactShadow");
          if (contact) contact.visible = !l;
        }
      };
      updateLight(); // first light before the markers are created (they draw the current shadows)

      // Track which ids currently have sprites so we can reconcile after substitutions
      let trackedPlayerIds = new Set(stateRef.current.players.map(p => p.id));

      for (const player of stateRef.current.players) {
        addPlayerSprite(player);
      }
      if (newVisualOn()) {
        void Promise.all([
          Assets.load<Spritesheet>(gameArtUrl(realPlayers ? "player/player-real-atlas.json" : "player/player-atlas.json")),
          Assets.load<Spritesheet>(gameArtUrl("keeper/keeper-atlas.json")),
        ]).then(([player, keeper]) => {
          if (facesDisposed || !player || !keeper) return;
          // The realistic atlas has the same frames named `player-real-…`: read them under the usual names.
          const sheet = realPlayers
            ? ({ textures: Object.fromEntries(Object.entries(player.textures).map(([k, t]) => [k.replace(/^player-real-/, "player-"), t])) } as unknown as Spritesheet)
            : player;
          spriteSheets = { player: sheet, keeper };
          if (!rimTexture) {
            void Assets.load<Texture>(gameArtUrl("player/disc-rim.png")).then((tex) => {
              if (facesDisposed || !tex) return;
              rimTexture = tex;
              for (const p of stateRef.current.players) { const mk = playerGraphics.get(p.id); if (mk) addRim(mk, p.team); }
            }).catch(() => { /* the drawn border stays */ });
          }
          for (const p of stateRef.current.players) addBody(p);
        }).catch(() => { /* the discs stay */ });
        void (async () => {
          const json = await fetch(gameArtUrl("crowd/crowd-atlas.json")).then((r) => (r.ok ? r.json() : null)) as { frames: Record<string, { frame: { x: number; y: number; w: number; h: number } }> } | null;
          const image = json ? await loadImage(gameArtUrl("crowd/crowd-atlas.png")) : null;
          if (!json || !image || facesDisposed) return;
          crowdArt = { image, frames: Object.fromEntries(Object.entries(json.frames).map(([k, v]) => [k, v.frame])) };
          redrawCrowdRef.current?.();
        })().catch(() => { /* the drawn crowd stays */ });
        void loadFxArt().then((art) => { if (!facesDisposed && art) fxArt = art; });
        void loadStadiumArt().then((art) => {
          if (facesDisposed || !art) return;
          stadiumArt = art;
          redrawCrowdRef.current?.();
        });
        void Assets.load<Spritesheet>(gameArtUrl("officials/officials-atlas.json")).then((sheet) => {
          if (facesDisposed || !sheet) return;
          officialSheet = sheet;
          onOfficialsReady?.();
        }).catch(() => { /* the drawn officials stay */ });
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
      // The art pack's ball (art phase 9): an 8-frame roll turned to the direction of travel, over the drawn ball.
      let ballFrames: Texture[] | null = null;
      const ballSprite = new Sprite();
      ballSprite.anchor.set(0.5);
      ballSprite.visible = false;
      ballSprite.scale.set((ballR * 2) / BALL_SPRITE.SIZE);
      ball.addChild(ballSprite);
      let ballRoll = { roll: 0, heading: 0 };
      if (newVisualOn()) {
        void Assets.load<Spritesheet>(gameArtUrl("ball/ball-atlas.json")).then((sheet) => {
          if (facesDisposed || !sheet) return;
          const frames = Array.from({ length: BALL_SPRITE.FRAMES }, (_, i) => sheet.textures[`ball-spin-0${i + 1}.png`]);
          if (frames.some((t) => !t)) return;
          ballFrames = frames as Texture[];
          for (const c of ball.children) c.visible = c === ballSprite;
          ballSprite.visible = true;
        }).catch(() => { /* the drawn ball stays */ });
        void Promise.all([Assets.load<Texture>(gameArtUrl("goal/goal-net.png")), Assets.load<Texture>(gameArtUrl("goal/goal-frame.png"))])
          .then(([netTex, frameTex]) => {
            if (facesDisposed || !netTex || !frameTex) return;
            const G = GOAL_SPRITE;
            const scale = ((GOAL_Y_MAX - GOAL_Y_MIN) * m.scale) / (G.POSTS[1] - G.POSTS[0]);
            const cy = m.marginY + m.height / 2;
            const make = (tex: Texture, gx: number, left: boolean) => {
              const s = new Sprite(tex);
              s.anchor.set(0.5, G.GOAL_LINE_Y / G.H);
              s.scale.set(scale);
              s.position.set(gx, cy);
              // The sprite's net points up (−y): to the left of the left goal line, to the right of the right one.
              s.rotation = left ? -Math.PI / 2 : Math.PI / 2;
              s.eventMode = 'none';
              return s;
            };
            const ends: [number, boolean][] = [[m.marginX, true], [m.marginX + m.width, false]];
            goalArt = { net: ends.map(([x, l]) => make(netTex, x, l)), frame: ends.map(([x, l]) => make(frameTex, x, l)) };
            goalNetLayer.addChild(...goalArt.net);
            for (const f of goalArt.frame) { f.zIndex = 11; world.addChild(f); }
            redrawSurfaceRef.current?.();
          }).catch(() => { /* the drawn goals stay */ });
      }
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

      // ── Play lines (4.38.21, mock option B): the pass toward its receiver, the shot's arc, the impact ring ──
      const playGfx = new Graphics();
      playGfx.zIndex = -0.3; // over the grass, under the players
      playGfx.eventMode = 'none';
      world.addChild(playGfx);
      let impacts: { x: number; y: number; at: number }[] = [];
      const unsubImpact = gameBus.on("shotResolved", (e) => {
        if (framesShown()) impacts = [...impacts.slice(-2), { x: e.toX, y: e.toY, at: effectNow }];
      });
      /** A dashed line between two pixel points. */
      const dashed = (g: Graphics, ax: number, ay: number, bx: number, by: number, style: { width: number; color: number; alpha: number }) => {
        const d = Math.hypot(bx - ax, by - ay), dash = Math.max(4, markerR * 0.45), n = Math.floor(d / (dash * 2));
        for (let i = 0; i < n; i++) {
          const t0 = (i * 2 * dash) / d, t1 = Math.min(1, ((i * 2 + 1) * dash) / d);
          g.moveTo(ax + (bx - ax) * t0, ay + (by - ay) * t0).lineTo(ax + (bx - ax) * t1, ay + (by - ay) * t1);
        }
        g.stroke(style);
      };
      const drawPlayLines = (ball: { x: number; y: number }, positions: Map<number, { x: number; y: number }>) => {
        playGfx.clear();
        const st = stateRef.current;
        const { px: bx, py: by } = toPixel(ball.x, ball.y);
        if (st.pass && st.pass.toId !== null) {
          const to = positions.get(st.pass.toId) ?? st.players.find((p) => p.id === st.pass!.toId);
          if (to) {
            const { px: tx, py: ty } = toPixel(to.x, to.y);
            dashed(playGfx, bx, by, tx, ty, { width: 1.5, color: 0xffffff, alpha: 0.55 });
            playGfx.circle(tx, ty, markerR * 1.4).stroke({ width: 1.5, color: 0xffffff, alpha: 0.7 });
          }
        }
        if (st.shot) {
          const a = toPixel(st.shot.fromX, st.shot.fromY), b = toPixel(st.shot.toX, st.shot.toY);
          const lift = Math.min(60, Math.hypot(b.px - a.px, b.py - a.py) * 0.18);
          playGfx.moveTo(a.px, a.py).quadraticCurveTo((a.px + b.px) / 2, Math.min(a.py, b.py) - lift, b.px, b.py)
            .stroke({ width: 2, color: 0xffe678, alpha: 0.75 });
        }
        impacts = impacts.filter((i) => effectNow - i.at < 0.6);
        for (const i of impacts) {
          const k = (effectNow - i.at) / 0.6, { px, py } = toPixel(i.x, i.y);
          playGfx.circle(px, py, markerR * (0.5 + k * 2.5)).stroke({ width: 2, color: 0xffffff, alpha: 1 - k });
        }
      };
      // A shot saved or deflected behind for a corner (same tick): the label says so instead of "wide".
      let lastShotFx: { at: number; effect: PitchEffect | undefined } | null = null;
      const unsubShotFx = gameBus.on("shotResolved", (e) => {
        if (e.isGoal) { pendingGoalShot = { toX: e.toX, toY: e.toY }; return; }
        const labels = labelsOf();
        const before = effects.length;
        pushEffect(
          { kind: "shot", fromX: e.fromX, fromY: e.fromY, toX: e.toX, toY: e.toY, result: e.inPosts ? "save" : "wide" },
          e.inPosts ? labels.save : labels.wide,
        );
        lastShotFx = { at: effectNow, effect: effects.length > before ? effects[effects.length - 1] : undefined };
      });
      const unsubCornerFx = gameBus.on("cornerAwarded", (e) => {
        const text = lastShotFx && lastShotFx.at === effectNow && lastShotFx.effect ? effectTexts.get(lastShotFx.effect) : undefined;
        const labels = labelsOf();
        const label = e.source === "save" ? labels.cornerSave : e.source === "deflection" ? labels.cornerDeflect : undefined;
        if (text && label) text.text = label;
        lastShotFx = null;
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
        const st = stadiumRef.current;
        if (!st || !framesShown()) return;
        if (e.team === st.homeTeam) crowdPulseAt = effectNow;
        if (extrasRef.current) crowdJump = { side: e.team === st.homeTeam ? "home" : "away", at: effectNow };
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
      // Fouls (leva 2): the fouled player is thrown on along the challenge and rolls, the offender steps into it.
      const unsubAnimFoul = gameBus.on("foul", (e) => {
        if (!framesShown()) return;
        const fouled = playerPos(e.fouledId), offender = playerPos(e.offenderId);
        if (!fouled || !offender) return;
        const dir = { x: fouled.x - offender.x, y: fouled.y - offender.y };
        if (Math.hypot(dir.x, dir.y) < 0.01) { dir.x = -fouled.attackDir; dir.y = 0; }
        const side: 1 | -1 = seedFrom(`tumble:${e.fouledId}:${e.minute}`) % 2 === 0 ? 1 : -1;
        anims = addAnim(anims, { playerId: fouled.id, kind: "tumble", dir, side }, effectNow);
        anims = addAnim(anims, { playerId: offender.id, kind: "lunge", dir, side: 1 }, effectNow);
      });
      // Styles (leva 3): a good dribbler beats his man with a step-over or a turn on the ball; a pass played first
      // time (within a moment of receiving it) pops.
      const unsubAnimDribble = gameBus.on("dribble", (e) => {
        if (!e.success || !framesShown()) return;
        const p = playerPos(e.player), d = playerPos(e.targetId);
        if (!p || !d || p.runtimeStats.withBall.dribbling < STYLE.SKILL_DRIBBLING) return;
        const roll = seedFrom(`skill:${e.player}:${Math.floor(stateRef.current.matchTime)}`) % 2;
        anims = addAnim(anims, {
          playerId: p.id, kind: roll === 0 ? "stepover" : "spin",
          dir: { x: d.x - p.x || p.attackDir, y: d.y - p.y }, side: p.id % 2 === 0 ? 1 : -1,
        }, effectNow);
      });
      const receivedAt = new Map<number, number>();
      const unsubAnimReceived = gameBus.on("passCompleted", (e) => { receivedAt.set(e.toId, effectNow); });
      const unsubAnimFirstTime = gameBus.on("passAttempted", (e) => {
        const at = receivedAt.get(e.player);
        receivedAt.delete(e.player);
        if (at === undefined || effectNow - at > STYLE.FIRST_TIME_S || !framesShown()) return;
        anims = addAnim(anims, { playerId: e.player, kind: "flick", dir: { x: 1, y: 0 }, side: 1 }, effectNow);
      });
      // A contested high ball: both go up together; the loser sometimes ends on the ground.
      const unsubAnimAerial = gameBus.on("aerialDuel", (e) => {
        if (!framesShown()) return;
        const w = playerPos(e.winnerId), l = playerPos(e.loserId);
        if (!w || !l) return;
        anims = addAnim(anims, { playerId: w.id, kind: "jump", dir: { x: e.x - w.x, y: e.y - w.y }, side: 1 }, effectNow);
        anims = addAnim(anims, { playerId: l.id, kind: "jump", dir: { x: e.x - l.x, y: e.y - l.y }, side: 1 }, effectNow);
        act(w.id, "header");
        act(l.id, seedFrom(`duel:${e.winnerId}:${e.loserId}:${Math.round(e.x * 10)}`) % 4 === 0 ? "fall" : "header");
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
      // Goal celebration (#129): the scorer (and the assister) hop and turn.
      const unsubAnimCelebrate = gameBus.on("goalScored", (e) => {
        // A celebration on the pitch starts the poses on arrival instead (goalCelebration.ts).
        if (!extrasRef.current || !framesShown() || celebration) return;
        for (const id of [e.scorerId, e.assistId]) {
          if (id === undefined || !playerPos(id)) continue;
          anims = addAnim(anims, { playerId: id, kind: "celebrate", dir: { x: 1, y: 0 }, side: id % 2 === 0 ? 1 : -1 }, effectNow);
        }
      });

      // ── Sprite poses (art phase 2): the engine's events start a short action of the player's sprite ──
      /** The taker of the current throw-in: his throw shows the throw frame. */
      let throwTaker: number | null = null;
      const act = (playerId: number | null | undefined, kind: SpriteAction["kind"], side: 1 | -1 = 1) => {
        if (playerId === null || playerId === undefined || !spriteSheets || !framesShown()) return;
        spriteActions = addAction(spriteActions, { playerId, kind, side }, effectNow);
      };
      const unsubPoses = [
        gameBus.on("shot", (e) => act(e.player, "kick")),
        gameBus.on("header", (e) => act(e.player, "header")),
        // The preview's choice: a keeper throws a short ball, a long pass is a kick, a short one a pass.
        gameBus.on("passAttempted", (e) => {
          const d = e.distance ?? 0;
          if (e.player === throwTaker) { throwTaker = null; act(e.player, "throwGo"); return; }
          act(e.player, playerPos(e.player)?.role === "GK" ? (d < 32 ? "throw" : "kick") : d < 22 ? "pass" : "kick");
        }),
        gameBus.on("passCompleted", (e) => act(e.toId, "receive")),
        gameBus.on("crossStarted", (e) => act(e.player, "kick")),
        gameBus.on("longBallStarted", (e) => act(e.player, "kick")),
        gameBus.on("throughBallStarted", (e) => act(e.player, "pass")),
        gameBus.on("tackle", (e) => act(e.player, e.success ? "tackle" : "tackleStand")),
        gameBus.on("foul", (e) => { act(e.fouledId, "fall"); act(e.offenderId, "appeal"); }),
        gameBus.on("gkClaim", (e) => act(e.keeperId, e.claimed ? "catch" : "punch")),
        gameBus.on("injury", (e) => act(e.playerId, "injured")),
        gameBus.on("goalScored", (e) => {
          if (celebration) return;
          // Some goals are celebrated with a knee slide (stable per scorer and minute).
          const slide = mulberry32(seedFrom(`slide:${e.scorerId}:${e.minute}`))() < KNEE_SLIDE_SHARE;
          act(e.scorerId, slide ? "kneeSlide" : "celebrate");
          act(e.assistId, "celebrate");
        }),
        gameBus.on("shotResolved", (e) => {
          if (e.isGoal || !e.inPosts) return;
          const shooter = playerPos(e.player);
          const gk = shooter && stateRef.current.players.find((q) => q.team !== shooter.team && q.role === "GK");
          if (gk) act(gk.id, "dive", e.toY >= gk.y ? 1 : -1);
        }),
      ];

      // ── Stretcher (#129): two medics in from the nearest touchline, out with the injured player ──
      const stretcherGfx = new Graphics();
      stretcherGfx.zIndex = 6;
      stretcherGfx.eventMode = 'none';
      world.addChild(stretcherGfx);
      let stretchers: { run: StretcherRun; color: number; medics?: Container[] }[] = [];
      const unsubStretcher = gameBus.on("injury", (e) => {
        if (!extrasRef.current || !framesShown()) return;
        const at = lastDrawnPos?.get(e.playerId) ?? playerPos(e.playerId);
        if (!at) return;
        const { px, py } = toPixel(at.x, at.y);
        const tun = m.stand ? standTunnel(m.stand) : null;
        const mouth = tun ? { x: tun.x + tun.w / 2, y: tun.y + Math.min(tun.h, tun.w * 1.5) } : undefined;
        stretchers = [...stretchers, { run: startStretcher({ x: px, y: py }, m, effectNow, mouth), color: e.team === "A" ? fillA : fillB }];
      });
      const drawStretchers = () => {
        stretcherGfx.clear();
        if (stretchers.length === 0) return;
        const w = markerR * 1.1, h = markerR * 2.6, medic = markerR * 0.55;
        for (const st of stretchers) {
          if (!stretcherPose(st.run, effectNow).done) continue;
          for (const c of st.medics ?? []) c.destroy({ children: true });
        }
        stretchers = stretchers.filter((st) => !stretcherPose(st.run, effectNow).done);
        for (const [si, st] of stretchers.entries()) {
          const pose = stretcherPose(st.run, effectNow);
          const showPatient = pose.carrying || effectNow - st.run.startedAt >= STRETCHER.IN_S;
          stretcherGfx.roundRect(pose.x - w / 2, pose.y - h / 2, w, h, 2).fill(0xf2f2f2).stroke({ width: 1, color: 0x000000, alpha: 0.4 });
          if (showPatient) stretcherGfx.circle(pose.x, pose.y, markerR * 0.7).fill(st.color).stroke({ width: 1, color: 0xffffff, alpha: 0.8 });
          // Sprite medics (art phase 3): run in, kneel by the player, carry him off.
          if (officialSheet) {
            if (!st.medics) {
              st.medics = [-1, 1].map((end) => {
                const c = new Container();
                c.zIndex = 6.1;
                c.eventMode = 'none';
                world.addChild(c);
                c.addChild(makeFigureBody("medic", officialTints("medic", `medic:${si}:${end}`)));
                return c;
              });
            }
            const t = effectNow - st.run.startedAt;
            const kneel = t >= STRETCHER.IN_S && t < STRETCHER.IN_S + STRETCHER.HOLD_S;
            for (const [k, end] of [-1, 1].entries()) {
              const c = st.medics[k]!;
              c.x = pose.x;
              c.y = pose.y + end * (h / 2 + medic * 0.8);
              animateFigure(c, "medic", null, { kneel }, kneel ? (end < 0 ? Math.PI / 2 : -Math.PI / 2) : undefined);
            }
            continue;
          }
          for (const end of [-1, 1]) {
            const my = pose.y + end * (h / 2 + medic * 0.8);
            stretcherGfx.circle(pose.x, my, medic).fill(0xffffff).stroke({ width: 1, color: 0x000000, alpha: 0.4 });
            stretcherGfx.rect(pose.x - medic * 0.55, my - medic * 0.16, medic * 1.1, medic * 0.32).fill(0xd62020);
            stretcherGfx.rect(pose.x - medic * 0.16, my - medic * 0.55, medic * 0.32, medic * 1.1).fill(0xd62020);
          }
        }
      };

      // ── Figure motion (art phase 3): the players' gait and turning for officials, managers and medics ──
      const figureMotion = new WeakMap<Container, { m: SpriteMotion; side: boolean }>();
      /**
       * Steps a figure's motion from its container's drawn position and shows its frame. `look` (px) is where it faces
       * when standing; `face` (radians) forces the facing (an assistant side-stepping, a medic kneeling).
       */
      function animateFigure(c: Container, kind: OfficialKind, look: { x: number; y: number } | null, s: OfficialPoseState, face?: number): void {
        const body = c.getChildByLabel('body') as Container | null;
        if (!body) return;
        const dtS = pausedRef.current ? 0 : app.ticker.deltaMS / 1000;
        const pos = { x: c.x / m.scale, y: c.y / m.scale };
        const prev = figureMotion.get(c) ?? { m: newMotion(pos.x, pos.y), side: true };
        let mo = stepMotion(prev.m, pos, dtS, look ? { x: look.x / m.scale, y: look.y / m.scale } : null);
        const side = kind === "assistant" ? assistantSideStep(prev.side, mo.vx) : false;
        const forced = face ?? (kind === "assistant" && side ? (c.y < m.marginY + m.height / 2 ? Math.PI / 2 : -Math.PI / 2) : undefined);
        if (forced !== undefined) {
          const d = Math.atan2(Math.sin(forced - mo.angle), Math.cos(forced - mo.angle));
          mo = { ...mo, angle: mo.angle + d * Math.min(1, dtS * 6) };
        }
        figureMotion.set(c, { m: mo, side });
        setFigurePose(body, officialPose(kind, mo, { ...s, sideStep: side }));
        body.rotation = mo.angle + Math.PI / 2;
      }

      // ── Referee, assistants, managers (spec 2026-10-08-match-visual §3–§4) ──
      const officialsOn = !!officials;
      const officialFaces = typeof officials === "object" ? officials : {};
      const referee = officialsOn ? makeOfficial(markerR, false) : null;
      const assistantC: Record<AssistantSide, Container | null> = {
        top: officialsOn ? makeOfficial(markerR, true) : null,
        bottom: officialsOn ? makeOfficial(markerR, true) : null,
      };
      /** The face (server SVG, rasterised once) over the official's kit disc; until it loads, the disc. */
      const attachOfficialFace = (c: Container | null, url: string | undefined) => {
        const head = c?.getChildByLabel("head") as Container | null | undefined;
        if (!c || !head || !url) return;
        const r = (head as Container & { faceR?: number }).faceR ?? markerR * 0.6;
        void loadFaceCanvas(url, faceRasterSize(r, app.renderer.resolution)).then((canvas) => {
          if (!canvas || facesDisposed || c.destroyed) return;
          let texture = faceTextures.get(url);
          if (!texture) {
            texture = new Texture({ source: new CanvasSource({ resource: canvas, transparent: true }) });
            faceTextures.set(url, texture);
          }
          const face = new Sprite(texture);
          face.anchor.set(0.5);
          face.width = face.height = r * 2;
          head.addChild(face);
        });
      };
      attachOfficialFace(referee, officialFaces.refereeFace);
      attachOfficialFace(assistantC.top, officialFaces.assistantFaces?.[0]);
      attachOfficialFace(assistantC.bottom, officialFaces.assistantFaces?.[1]);
      // Just under the players' layer: a player is never covered by an official.
      for (const c of [referee, assistantC.top, assistantC.bottom]) if (c) { c.zIndex = -0.5; world.addChild(c); }
      let refPos: YdPos | null = null;
      const arPos: Record<AssistantSide, Follow | null> = { top: null, bottom: null };
      const playerFollow = new Map<number, Follow>();
      let lastFoulSpot: YdPos | null = null;
      /** After a card the referee's target stays on the foul spot (passed to refereeTarget as the ball). */
      let refHold: { spot: YdPos; until: number } | null = null;
      let refCard: { card: "yellow" | "red"; until: number } | null = null;
      const flagUntil: Record<AssistantSide, number> = { top: -1, bottom: -1 };
      const unsubRefFoul = gameBus.on("foul", (e) => {
        lastFoulSpot = { x: e.x, y: e.y };
        // The referee runs to where it happened (a card holds him there longer).
        if (officialsOn && framesShown()) refHold = { spot: { x: e.x, y: e.y }, until: effectNow + OFFICIALS.FOUL_HOLD_S };
      });
      const unsubRefCard = gameBus.on("card", (e) => {
        if (!officialsOn || !framesShown()) return;
        const spot = lastFoulSpot ?? playerPos(e.playerId) ?? null;
        if (spot) refHold = { spot: { x: spot.x, y: spot.y }, until: effectNow + OFFICIALS.CARD_HOLD_S };
        refCard = { card: e.card, until: effectNow + EFFECT_DURATION.card };
        // The booked player's two nearest team-mates protest (leva 2).
        const booked = playerPos(e.playerId);
        if (!booked) return;
        const mates = stateRef.current.players
          .filter((q) => q.team === booked.team && q.id !== booked.id && q.role !== "GK")
          .map((q) => ({ id: q.id, d: Math.hypot(q.x - booked.x, q.y - booked.y) }))
          .filter((q) => q.d < 18)
          .sort((a, b) => a.d - b.d)
          .slice(0, 2);
        for (const q of mates) act(q.id, "appeal");
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
      const coachSprites: Partial<Record<DrawnSide, { sprite: CoachSprite; team: TeamId; color: number }>> = {};
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
          coachSprites[side] = { sprite, team, color };
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
      // Manager cards (`var.md` §4): shown like the referee's; a red sends him off once it is gone.
      const coachCards: Partial<Record<TeamId, { card: "yellow" | "red"; until: number }>> = {};
      const coachOff: Partial<Record<TeamId, true>> = {};
      coachCardFnRef.current = (team, cardKind) => {
        coachCards[team] = { card: cardKind, until: effectNow + EFFECT_DURATION.card };
        if (cardKind === "red") coachOff[team] = true;
      };
      const unsubCoachGoal = gameBus.on("goalScored", (e) => startGesture(e.team, "celebrate"));

      // The fourth official (art phase 3): between the technical areas, the board up on a substitution.
      const walkOns = new Map<number, { from: Pos; at: number }>();
      /** Players going off on a substitution (removed from the state, still drawn walking to the touchline). */
      const subOuts = new Set<number>();
      const walkOffs = new Map<number, { g: Container; fromX: number; fromY: number; at: number }>();
      /** The fourth official's board: who goes off and who comes on (shirt numbers, 4.41.24). */
      let boardNums: { out: number; in: number; team: TeamId } | null = null;
      let boardTag: { c: Container; out: Text; inn: Text; key: string } | null = null;
      let fourth: Container | null = null;
      let boardUntil = -1;
      const unsubFourth = gameBus.on("playerSubstituted", (e) => {
        if (officialsOn && framesShown()) boardUntil = effectNow + OFFICIAL_SPRITE.BOARD_S;
        // The substitute comes on from the halfway line by the benches (drawn bottom touchline) instead of appearing
        // in his slot (art preview, 4.41.15). Drawing only.
        walkOns.set(e.inId, { from: { x: PITCH_LENGTH / 2, y: mirrorRef.current ? -SUB_WALK.OFF_YDS : PITCH_WIDTH + SUB_WALK.OFF_YDS }, at: effectNow });
        // An injured player leaves on the stretcher (`matchExtras`), not walking.
        if (e.reason !== 'injury') subOuts.add(e.outId);
        boardNums = { out: e.outId, in: e.inId, team: e.team };
      });
      onOfficialsReady = () => {
        if (!officialsOn) return;
        attachFigure(referee, "referee", "referee");
        attachFigure(assistantC.top, "assistant", "assistant:top");
        attachFigure(assistantC.bottom, "assistant", "assistant:bottom");
        for (const side of ["left", "right"] as const) {
          const entry = coachSprites[side];
          if (entry) attachFigure(entry.sprite.root, "coach", `coach:${entry.team}`, entry.color);
        }
        if (!fourth) {
          fourth = new Container();
          fourth.zIndex = -0.6;
          fourth.eventMode = 'none';
          fourth.x = (coachSpot.left.x + coachSpot.right.x) / 2;
          fourth.y = coachSpot.left.y;
          world.addChild(fourth);
          fourth.addChild(makeFigureBody("fourth", officialTints("fourth", "fourth")));
        }
      };
      if (officialSheet) onOfficialsReady();

      // Benches beside the technical areas (#129): redrawn only when a bench changes size.
      const benchGfx = new Graphics();
      benchGfx.zIndex = -0.7;
      benchGfx.eventMode = 'none';
      world.addChild(benchGfx);
      // The art pack's dugout (art phase 9): the bench under the substitutes, its translucent roof over them.
      const benchArt: Record<"left" | "right", { bench: Sprite; roof: Sprite } | null> = { left: null, right: null };
      // Drinks by the benches (tester report, mock option B): a painted cooler box and bottles, only with the new visual.
      let propTex: { cooler: Texture; bottle: Texture } | null = null;
      const propSprites: Record<"left" | "right", Sprite[]> = { left: [], right: [] };
      if (newVisualOn()) {
        void Promise.all([Assets.load<Texture>(gameArtUrl("bench/cooler-box.png")), Assets.load<Texture>(gameArtUrl("bench/water-bottle.png"))])
          .then(([cooler, bottle]) => { if (!facesDisposed && cooler && bottle) propTex = { cooler, bottle }; })
          .catch(() => { /* no props */ });
      }
      const placeProps = (side: "left" | "right", box: { x: number; y: number; w: number; h: number } | null) => {
        if (!box || !propTex) { for (const sp of propSprites[side]) sp.visible = false; return; }
        const spots = benchPropSpots(box, side, markerR, stadiumRef.current?.seed ?? "match");
        const all = [{ tex: propTex.cooler, s: spots.cooler }, ...spots.bottles.map((b) => ({ tex: propTex!.bottle, s: b }))];
        all.forEach(({ tex, s: spot }, i) => {
          let sp = propSprites[side][i];
          if (!sp) {
            sp = new Sprite(tex); sp.anchor.set(0.5); sp.zIndex = -0.695; sp.eventMode = 'none';
            world.addChild(sp); propSprites[side][i] = sp;
          }
          sp.width = spot.w; sp.height = spot.h; sp.rotation = spot.rotation;
          sp.position.set(spot.x, spot.y); sp.visible = true;
        });
      };
      /** Last goal per team (effects clock), for the bench celebration. */
      let benchGoal: { team: TeamId; at: number } | null = null;
      const unsubBenchGoal = gameBus.on("goalScored", (e) => { benchGoal = { team: e.team, at: effectNow }; });
      /**
       * The benches (4.38.16, mock option A): a covered dugout seen from above, below the assistant's lane (never on the
       * pitch), the substitutes as small heads and shoulders in the kit, fidgeting, up now and then, arms raised when
       * their team scores; keepers in their own colours.
       */
      const drawBenches = (ballPx: { x: number; y: number }) => {
        const st = stateRef.current;
        benchGfx.clear();
        // The players' path from the tunnel to the touchline: a dark mat with light edges (with the stadium).
        const tunnel = m.stand ? standTunnel(m.stand) : null;
        if (tunnel) {
          const top = m.marginY + m.height;
          const h = tunnel.y - top;
          benchGfx.rect(tunnel.x, top, tunnel.w, h).fill({ color: 0x232c37, alpha: 0.7 });
          benchGfx.rect(tunnel.x, top, 1, h).fill({ color: 0xdcecf7, alpha: 0.5 }).rect(tunnel.x + tunnel.w - 1, top, 1, h).fill({ color: 0xdcecf7, alpha: 0.5 });
        }
        if (!(officialsOn && extrasRef.current)) {
          for (const a of Object.values(benchArt)) if (a) a.bench.visible = a.roof.visible = false;
          placeProps("left", null); placeProps("right", null);
          return;
        }
        const touchY = m.marginY + m.height;
        const laneEnd = touchY + STADIUM.AR_LANE_YDS * m.scale;
        const runoffEnd = m.stand ? touchY + STADIUM.BENCH_END_YDS * m.scale : canvasHeight;
        for (const side of ["left", "right"] as const) {
          const team = teamOfDrawnSide(side);
          const b = benchRect(coachSpot[side], side, m, markerR);
          const all = team === "A" ? st.benchA : st.benchB;
          const bench = benchShown(all.map((p) => p.role)).map((i) => all[i]!);
          // Every bench has the same seats (tester report): fewer substitutes leave empty seats, never a shorter bench.
          const L = benchLayout(BENCH_VIEW.MAX_SHOWN, b.x + b.w / 2, b.w, laneEnd, runoffEnd - 1, 0, markerR);
          const box = L.box;
          placeProps(side, box);
          if (stadiumArt) {
            let a = benchArt[side];
            if (!a) {
              a = { bench: new Sprite(stadiumArt.bench), roof: new Sprite(stadiumArt.benchRoof) };
              a.bench.zIndex = -0.71; a.roof.zIndex = -0.699;
              a.bench.eventMode = a.roof.eventMode = 'none';
              world.addChild(a.bench, a.roof);
              benchArt[side] = a;
            }
            for (const s of [a.bench, a.roof]) {
              s.position.set(box.x - 3, box.y);
              s.width = box.w + 6; s.height = box.h;
              s.visible = true;
            }
          } else {
          // Dugout: dark floor, the bench along the back, side walls, a light roof edge toward the pitch.
          benchGfx.rect(box.x - 3, box.y, box.w + 6, box.h).fill({ color: 0x11171f, alpha: 0.95 });
          benchGfx.rect(box.x, box.y + box.h - box.h * 0.28, box.w, box.h * 0.22).fill(0x2b3846);
          benchGfx.rect(box.x - 3, box.y, 2, box.h).fill(0x3a4756).rect(box.x + box.w + 1, box.y, 2, box.h).fill(0x3a4756);
          }
          const kit = team === "A" ? fillA : fillB;
          const kits = benchKits(bench.map((p) => p.role), kit);
          const goalAge = benchGoal && benchGoal.team === team ? effectNow - benchGoal.at : null;
          const u = L.fig; // one unit: the shoulders' half width
          // Empty seats (the art bench has its own seats).
          if (!stadiumArt) for (const seat of L.seats) {
            benchGfx.roundRect(seat.x - u * 0.85, seat.y - u * 0.25, u * 1.7, u * 1.15, u * 0.3).fill({ color: 0x2b3846, alpha: 0.9 });
          }
          L.seats.forEach((seat, i) => {
            const p = bench[i];
            if (!p) return;
            const look = benchLook(String(p.rosterId ?? p.id));
            const pose = benchPose(look.phase, effectNow, ballPx.x - seat.x, -1, goalAge);
            const x = seat.x, y = seat.y - pose.up * u * 0.7 + pose.bob * u * 0.1;
            if (pose.arms > 0.05) {
              for (const k of [-1, 1]) {
                benchGfx.moveTo(x + k * u * 0.8, y).lineTo(x + k * u, y - u * 1.15 * pose.arms)
                  .stroke({ width: Math.max(1, u * 0.45), color: kits[i]!, cap: "round" });
              }
            }
            benchGfx.ellipse(x, y + u * 0.25, u, u * 0.6).fill(kits[i]!);
            const hx = x + pose.lookX * u * 0.8;
            benchGfx.circle(hx, y - u * 0.2, u * 0.55).fill(BENCH_SKIN[look.skin]!);
            const hair = BENCH_HAIR[look.hair];
            if (hair !== undefined) benchGfx.circle(hx - pose.lookX * u * 0.3, y, u * 0.48).fill(hair);
          });
          if (!stadiumArt) benchGfx.rect(box.x - 3, box.y, box.w + 6, Math.max(1, u * 0.28)).fill({ color: 0xdcecf7, alpha: 0.55 });
        }
      };
      /**
       * Photographers behind both goal lines (tester report): small, seen from above like the benches, a camera toward
       * the pitch; a flash now and then and a burst of flashes when a shot goes toward their goal.
       */
      const photoGfx = new Graphics();
      photoGfx.zIndex = -0.69;
      photoGfx.eventMode = 'none';
      world.addChild(photoGfx);
      // Sprite photographers (art phase 4): one figure per spot, under the flashes.
      const photoLayer = new Container();
      photoLayer.zIndex = -0.695;
      photoLayer.eventMode = 'none';
      world.addChild(photoLayer);
      const photoFigures: Container[] = [];
      const flashLayer = new Container();
      flashLayer.zIndex = -0.685;
      flashLayer.eventMode = 'none';
      world.addChild(flashLayer);
      const flashPool = new SpritePool(flashLayer, "add");
      const photoBurst: Record<"left" | "right", number> = { left: -99, right: -99 };
      const unsubPhotoShot = gameBus.on("shot", (e) => {
        const p = playerPos(e.player);
        if (!p) return;
        const gx = toPixel(engineGoalX(p.attackDir), PITCH_WIDTH / 2).px;
        photoBurst[gx < m.marginX + m.width / 2 ? "left" : "right"] = effectNow;
      });
      const photoSpots = photographerSpots(stadiumRef.current?.seed ?? "match");
      const drawPhotographers = (lastBallForPhotos: YdPos) => {
        photoGfx.clear();
        flashPool.begin();
        photoLayer.visible = officialsOn && extrasRef.current && !!m.stand;
        if (!(officialsOn && extrasRef.current && m.stand)) return;
        const u = markerR * 0.4; // the same unit as the benches
        const midY = m.marginY + m.height / 2;
        photoSpots.forEach((ph, i) => {
            const side = ph.side;
            // `out` points away from the pitch; the camera looks the other way.
            const out = side === "left" ? -1 : 1;
            const lineX = side === "left" ? m.marginX : m.marginX + m.width;
            const x = lineX + out * (m.goalNetDepth + u * 0.6);
            const y = midY + ph.along * m.scale;
            const burstSide = side;
            const look = benchLook(`photo:${side}:${i}`);
            const cx = -out, cy = 0;
            // Sprite photographers (art phase 4): idle, the camera up when the play is near their goal or after a shot.
            const burstAge = effectNow - photoBurst[side];
            if (officialSheet) {
              let c = photoFigures[i];
              if (!c) {
                c = new Container();
                c.eventMode = 'none';
                c.addChild(makeFigureBody("photographer", officialTints("photographer", `photo:${side}:${i}`)));
                photoLayer.addChild(c);
                photoFigures[i] = c;
              }
              c.x = x;
              c.y = y;
              const ballX = toPixel(lastBallForPhotos.x, lastBallForPhotos.y).px;
              const near = Math.abs(ballX - lineX) < m.width * 0.28;
              animateFigure(c, "photographer", null, { shoot: near || (burstAge >= 0 && burstAge < 2.2) }, out < 0 ? 0 : Math.PI);
            }
            const camX0 = x + cx * u * 1.1, camY0 = y + cy * u * 1.1;
            if (officialSheet) {
              if (calm()) return;
              const period = burstAge >= 0 && burstAge < 2.2 ? 0.35 : 3.5 + (i % 3);
              const ph0 = (effectNow + look.phase * 2) % period;
              if (ph0 < 0.09 && (burstAge < 2.2 || (Math.floor((effectNow + look.phase * 2) / period) + i) % 2 === 0)) {
                const a = 1 - ph0 / 0.09;
                const fx = camX0 + cx * u * 0.6, fy = camY0 + cy * u * 0.6;
                if (fxArt) {
                  // The art pack's flash: grow, peak, fade.
                  const s = flashPool.next(fxArt.flash[Math.min(3, Math.floor((1 - a) * 4))]!);
                  s.position.set(fx, fy);
                  s.width = s.height = u * FX_ART.FLASH_SIZE;
                } else {
                  photoGfx.circle(fx, fy, u * 1.8).fill({ color: 0xffffff, alpha: 0.35 * a });
                  photoGfx.circle(fx, fy, u * 0.7).fill({ color: 0xffffff, alpha: 0.9 * a });
                }
              }
              return;
            }
            // Shadow, body (dark jacket, a bib), the camera toward the pitch (cx, cy), the head.
            photoGfx.ellipse(x + u * 0.15, y + u * 0.3, u * 1.05, u * 0.7).fill({ color: 0x000000, alpha: 0.3 });
            photoGfx.ellipse(x, y, cy ? u : u * 0.62, cy ? u * 0.62 : u).fill(0x2b3846);
            photoGfx.ellipse(x, y, cy ? u * 0.7 : u * 0.4, cy ? u * 0.4 : u * 0.7).fill(0xf2a33a);
            const camX = x + cx * u * 1.1, camY = y + cy * u * 1.1;
            photoGfx.rect(camX - u * 0.42, camY - u * 0.42, u * 0.84, u * 0.84).fill(0x15191f);
            photoGfx.circle(camX + cx * u * 0.4, camY + cy * u * 0.4, u * 0.28).fill(0x3d4a59);
            photoGfx.circle(x - cx * u * 0.15, y - cy * u * 0.15, u * 0.5).fill(BENCH_SKIN[look.skin]!);
            const hair = BENCH_HAIR[look.hair];
            if (hair !== undefined) photoGfx.circle(x - cx * u * 0.3, y - cy * u * 0.3, u * 0.44).fill(hair);
            // Flash: a short white burst; many in a row right after a shot toward that goal.
            if (calm()) return;
            const burst = effectNow - photoBurst[burstSide];
            const period = burst >= 0 && burst < 2.2 ? 0.35 : 3.5 + (i % 3);
            const ph0 = (effectNow + look.phase * 2) % period;
            if (ph0 < 0.09 && (burst < 2.2 || (Math.floor((effectNow + look.phase * 2) / period) + i) % 2 === 0)) {
              const a = 1 - ph0 / 0.09;
              const fx = camX + cx * u * 0.6, fy = camY + cy * u * 0.6;
              photoGfx.circle(fx, fy, u * 1.8).fill({ color: 0xffffff, alpha: 0.35 * a });
              photoGfx.circle(fx, fy, u * 0.7).fill({ color: 0xffffff, alpha: 0.9 * a });
            }
        });
      };
      // ── LED boards (4.38.21, reworked 4.42 after tester reports): a glowing dot-matrix screen in a metal housing,
      // ads in the home club's language that change together with a transition running along the ground (slide, wipe
      // or squeeze); after a goal every board shows the goal, fitted or scrolling inside the screen ──
      const ledLayer = new Container();
      ledLayer.zIndex = -0.68;
      ledLayer.eventMode = 'none';
      world.addChild(ledLayer);
      type LedSlot = { root: Container; bg: Graphics; text: Text; textW: number; scroll: boolean; since: number };
      type LedPanel = {
        panel: Container; screen: Container; slots: [LedSlot, LedSlot]; cur: 0 | 1;
        scan: Graphics; wipe: Graphics; w: number; h: number; order: number; shown: string;
        trans: { kind: ReturnType<typeof ledTransition>; at: number } | null; phase: number;
      };
      const ledPanels: LedPanel[] = [];
      const ledSeed = stadiumRef.current?.seed ?? "match";
      let ledFramed = false;
      /** The dot-matrix grid laid over every screen: dark gaps between the LED pixels. */
      let ledDots: Texture | null = null;
      if (typeof document !== "undefined") {
        const c = document.createElement("canvas");
        c.width = c.height = 4;
        const g2 = c.getContext("2d");
        if (g2) {
          g2.fillStyle = "rgba(0,0,0,0.28)";
          g2.fillRect(0, 0, 4, 4);
          g2.clearRect(0, 0, 3, 3);
          g2.fillStyle = "rgba(255,255,255,0.10)";
          g2.fillRect(0, 0, 1, 1);
          ledDots = Texture.from(c);
          ledDots.source.scaleMode = "nearest";
        }
      }
      const ledTextStyle = (h: number) => new TextStyle({
        fontSize: Math.round(h * 0.78), fontFamily: '"Barlow Condensed", "Arial Narrow", sans-serif', fontWeight: '700',
        fill: 0xffffff, letterSpacing: Math.max(1, h * 0.06),
        dropShadow: { color: 0xffffff, blur: Math.max(1, h * 0.12), distance: 0, alpha: 0.55, angle: 0 },
      });
      const makeSlot = (w: number, h: number): LedSlot => {
        const root = new Container();
        root.pivot.set(w / 2, h / 2);
        root.position.set(w / 2, h / 2);
        const bg = new Graphics();
        const text = new Text({ text: "", style: ledTextStyle(h) });
        // Crisp at the board's small size (tester report 4.41.20: the text was unreadable under the dot grid).
        text.resolution = Math.max(2, app.renderer.resolution * 2);
        text.anchor.set(0.5);
        text.position.set(w / 2, h / 2);
        root.addChild(bg, text);
        return { root, bg, text, textW: 0, scroll: false, since: 0 };
      };
      if (m.stand && stadiumRef.current?.led) {
        // Big framed boards on the apron (art preview, 4.41.15): four above the top touchline, two below the bottom
        // one (in the corners, kept clear of the benches and technical areas), one standing behind each goal.
        const h = Math.max(5, LED.SCREEN_YDS * m.scale);
        // Bench and technical-area spans in pitch yards: the bottom boards never touch them (tester report).
        const benchSpans: [number, number][] = (["left", "right"] as const).map((side) => {
          const b = benchRect(coachSpot[side], side, m, markerR);
          const a = techArea(b, coachSpot[side].x, m.width * COACH_WALK_FRAC, m.marginY + m.height, m.scale);
          return [(a.x - m.marginX) / m.scale, (a.x + a.w - m.marginX) / m.scale];
        });
        let order = 0;
        for (const sp0 of ledBoards()) {
          let sp = sp0;
          if (sp.y > PITCH_WIDTH) {
            const c = clearOfBenches({ x: sp.x, len: LED.BOARD_YDS * (sp.len ?? 1) }, benchSpans);
            if (!c) continue;
            sp = { ...sp, x: c.x, len: c.len / LED.BOARD_YDS };
          }
          const w = LED.BOARD_YDS * (sp.len ?? 1) * m.scale;
          const board = new Container();
          board.x = m.marginX + sp.x * m.scale; board.y = m.marginY + sp.y * m.scale; board.rotation = sp.rot;
          ledLayer.addChild(board);
          const panel = new Container();
          panel.x = -w / 2; panel.y = -h / 2;
          const screen = new Container();
          const back = new Graphics().rect(0, 0, w, h).fill(0x05070a);
          const slots: [LedSlot, LedSlot] = [makeSlot(w, h), makeSlot(w, h)];
          const wipe = new Graphics();
          wipe.blendMode = "add";
          wipe.visible = false;
          const scan = new Graphics().rect(0, 0, w, Math.max(1, h * 0.2)).fill({ color: 0xffffff, alpha: 0.07 });
          scan.blendMode = "add";
          screen.addChild(back, slots[0].root, slots[1].root, wipe);
          if (ledDots) {
            const dots = new TilingSprite({ texture: ledDots, width: w, height: h });
            dots.tileScale.set(Math.max(0.5, h / 24));
            screen.addChild(dots);
          }
          // A soft gloss on the upper half of the glass, then the slow refresh band.
          screen.addChild(new Graphics().rect(0, 0, w, h * 0.42).fill({ color: 0xffffff, alpha: 0.05 }), scan);
          const mask = new Graphics().rect(0, 0, w, h).fill(0xffffff);
          screen.mask = mask;
          panel.addChild(screen, mask);
          board.addChild(panel);
          ledPanels.push({ panel, screen, slots, cur: 0, scan, wipe, w, h, order, shown: "", trans: null, phase: (order * 0.37) % 1 });
          order++;
        }
        // The housing (FLUX-refined art): the new frame with the new visual; else the art pack's (in `drawLed`).
        if (newVisualOn() && ledPanels.length > 0) {
          ledFramed = true;
          void Assets.load<Texture>(gameArtUrl(LED_FRAME.FILE)).then((tex) => {
            if (!tex || ledPanels[0]!.panel.destroyed) return;
            for (const p of ledPanels) {
              const s = new Sprite(tex);
              const sx = p.w / LED_FRAME.SCREEN.w, sy = p.h / LED_FRAME.SCREEN.h;
              s.position.set(-LED_FRAME.SCREEN.x * sx, -LED_FRAME.SCREEN.y * sy);
              s.scale.set(sx, sy);
              p.panel.addChild(s);
            }
          }).catch(() => { ledFramed = false; });
        }
      }
      let ledGoal: { text: string; at: number } | null = null;
      const unsubLedGoal = gameBus.on("goalScored", (e) => {
        const tpl = stadiumRef.current?.led?.goal;
        if (!tpl) return;
        const scorer = stateRef.current.players.find((p) => p.id === e.scorerId);
        const name = scorer ? shirtName(scorer.name).toUpperCase() : "";
        ledGoal = { text: tpl.replace("{name}", name).replace("{minute}", String(e.minute + 1)), at: effectNow };
      });
      /** Puts a text on a slot: background, colour and glow, fitted to the screen or set to scroll. */
      const fillSlot = (s: LedSlot, w: number, h: number, text: string, bg: number, fg: number) => {
        s.bg.clear().rect(0, 0, w, h).fill(bg);
        s.text.text = text;
        s.text.style.fill = fg;
        s.text.style.dropShadow = { color: fg, blur: Math.max(1, h * 0.12), distance: 0, alpha: 0.55, angle: 0 };
        s.textW = CanvasTextMetrics.measureText(text, s.text.style).width;
        const fit = ledFit(s.textW, w * 0.92);
        s.scroll = fit.scroll;
        s.text.scale.set(fit.scale, 1);
        s.text.x = w / 2;
        s.since = effectNow;
      };
      const drawLed = () => {
        if (ledPanels.length === 0) return;
        if (stadiumArt && !ledFramed) {
          // The art pack's LED frame around every panel (its screen rectangle over the panel).
          ledFramed = true;
          const F = STADIUM_ART.LED;
          for (const p of ledPanels) {
            const s = new Sprite(stadiumArt.ledFrame);
            const sx = p.w / F.SCREEN.w, sy = p.h / F.SCREEN.h;
            s.position.set(-F.SCREEN.x * sx, -F.SCREEN.y * sy);
            s.scale.set(sx, sy);
            p.panel.addChild(s);
          }
        }
        if (ledGoal && effectNow - ledGoal.at > LED.GOAL_S) ledGoal = null;
        const cycle = Math.floor(effectNow / LED.SWITCH_S);
        const into = effectNow - cycle * LED.SWITCH_S;
        const lang: LedLang = stadiumRef.current?.led?.lang ?? ledLang(i18n.language);
        const T = EXTRAS.LED.TRANSITION_S;
        for (const p of ledPanels) {
          // The change runs along the boards: each panel a moment after the one before it.
          const delay = (p.order % 24) * LED.FLIP_STAGGER_S * 3;
          const showCycle = into >= delay ? cycle : cycle - 1;
          if (ledGoal) {
            // Goal: straight on the current slot, blinking, no transition; a long text scrolls through the blink.
            const cur = p.slots[p.cur];
            const blink = Math.floor((effectNow - ledGoal.at) * 3) % 2 === 0;
            const key = `goal:${ledGoal.at}:${blink}`;
            if (p.shown !== key) {
              const same = p.shown.startsWith(`goal:${ledGoal.at}:`);
              const since = cur.since;
              fillSlot(cur, p.w, p.h, ledGoal.text, blink ? LED.GOAL : 0x06090d, blink ? 0x06090d : LED.GOAL);
              if (same) cur.since = since;
              p.shown = key;
              p.trans = null;
            }
          } else {
            const key = `ad:${showCycle}:${lang}`;
            if (p.shown !== key) {
              const ad = ledAdFor(ledSeed, showCycle, p.order, lang);
              const instant = p.shown === "" || p.shown.startsWith("goal:") || calm();
              p.shown = key;
              if (instant) {
                fillSlot(p.slots[p.cur], p.w, p.h, ad.text, ad.bg, ad.fg);
                p.trans = null;
              } else {
                p.cur = p.cur === 0 ? 1 : 0;
                fillSlot(p.slots[p.cur], p.w, p.h, ad.text, ad.bg, ad.fg);
                p.trans = { kind: ledTransition(ledSeed, showCycle), at: effectNow };
              }
            }
          }
          // Transition between the old slot and the new one.
          const now = p.slots[p.cur], old = p.slots[p.cur === 0 ? 1 : 0];
          const k = p.trans ? Math.min(1, (effectNow - p.trans.at) / T) : 1;
          const e = k * k * (3 - 2 * k);
          now.root.visible = true;
          old.root.visible = !!p.trans && k < 1;
          now.root.alpha = old.root.alpha = 1;
          now.root.scale.set(1); old.root.scale.set(1);
          now.root.y = old.root.y = p.h / 2;
          p.wipe.visible = false;
          if (p.trans && k < 1) {
            if (p.trans.kind === "slide") {
              old.root.y = p.h / 2 - e * p.h;
              now.root.y = p.h / 2 + (1 - e) * p.h;
            } else if (p.trans.kind === "wipe") {
              old.root.alpha = 1 - e;
              now.root.alpha = e;
              p.wipe.visible = true;
              p.wipe.clear().rect(e * p.w - p.h * 0.6, 0, p.h * 1.2, p.h).fill({ color: 0xffffff, alpha: 0.55 * (1 - Math.abs(2 * k - 1)) });
            } else {
              old.root.scale.set(1, Math.max(0, 1 - 2 * e));
              now.root.scale.set(1, Math.max(0, 2 * e - 1));
              old.root.visible = e < 0.5;
            }
          } else if (p.trans) {
            p.trans = null;
          }
          // A long text scrolls across the screen instead of spilling out of it (tester report).
          for (const s of p.slots) if (s.scroll) s.text.x = ledMarqueeX(effectNow - s.since, p.w, s.textW, p.h);
          // The slow refresh band and a faint breathing of the brightness.
          if (!calm()) {
            p.scan.y = ((effectNow / 2.6 + p.phase) % 1) * (p.h * 1.4) - p.h * 0.2;
            p.screen.alpha = 0.95 + 0.05 * Math.sin((effectNow + p.phase * 6) * 1.7);
          }
        }
      };
      // ── Around the pitch (4.42, tester reports): the technical areas, a crest mat at the tunnel, the corner flags, TV
      // cameras at the corners, a reporter behind a bottom board, stewards at the foot of the stands and vendors walking
      // the stands. Seen from above, the figures at the bench unit (0.4 × the marker radius). Drawing only. ──
      const unitPx = markerR * 0.4;
      // Technical areas: dashed white lines on the grass around each bench and the manager's walk (static).
      const techGfx = new Graphics();
      techGfx.zIndex = -0.72;
      techGfx.eventMode = 'none';
      world.addChild(techGfx);
      if (officialsOn) {
        const touchY = m.marginY + m.height;
        const laneEnd = touchY + STADIUM.AR_LANE_YDS * m.scale;
        const runoffEnd = m.stand ? touchY + STADIUM.BENCH_END_YDS * m.scale : canvasHeight - 2;
        const T = EXTRAS.TECH;
        for (const side of ["left", "right"] as const) {
          const b = benchRect(coachSpot[side], side, m, markerR);
          const a = techArea({ x: b.x, y: laneEnd, w: b.w, h: runoffEnd - 1 - laneEnd }, coachSpot[side].x, m.width * COACH_WALK_FRAC, touchY, m.scale);
          const lines: [number, number, number, number][] = [
            [a.x, a.y + a.h, a.x, a.y], [a.x, a.y, a.x + a.w, a.y], [a.x + a.w, a.y, a.x + a.w, a.y + a.h],
          ];
          for (const [x0, y0, x1, y1] of lines) {
            for (const [p, q, r2, s2] of dashes(x0, y0, x1, y1, T.DASH, T.GAP)) techGfx.moveTo(p, q).lineTo(r2, s2);
          }
          techGfx.stroke({ width: 1.4, color: 0xffffff, alpha: T.ALPHA });
        }
      }
      // The home crest on a round mat where the tunnel meets the pitch (static; the crest arrives when loaded).
      const crestMat = new Container();
      crestMat.zIndex = -0.698;
      crestMat.eventMode = 'none';
      world.addChild(crestMat);
      {
        const st = stadiumRef.current;
        const tunnel = m.stand ? standTunnel(m.stand) : null;
        if (tunnel && st && !st.neutral) {
          const touchY = m.marginY + m.height;
          const laneEnd = touchY + STADIUM.AR_LANE_YDS * m.scale;
          const cx = tunnel.x + tunnel.w / 2, cy = touchY + (tunnel.y - touchY) * 0.6;
          const r = Math.max(4, Math.min(2.4 * m.scale, (tunnel.y - laneEnd) * 0.42));
          const ring = st.homeColors ? cssColorToPixiHex(st.homeColors[0]) : st.homeTeam === "A" ? fillA : fillB;
          const ring2 = st.homeColors ? cssColorToPixiHex(st.homeColors[1]) : 0xffffff;
          const g = new Graphics();
          g.circle(cx + 1, cy + 1.5, r).fill({ color: 0x000000, alpha: 0.3 });
          g.circle(cx, cy, r).fill(ring);
          g.circle(cx, cy, r * 0.86).fill(ring2);
          g.circle(cx, cy, r * 0.8).fill(0x101820);
          crestMat.addChild(g);
          if (st.homeCrest) {
            void loadCrestCanvas(st.homeCrest, 128).then((canvas) => {
              if (!canvas || crestMat.destroyed) return;
              const sp = new Sprite(Texture.from(canvas));
              sp.anchor.set(0.5);
              sp.position.set(cx, cy);
              sp.width = sp.height = r * 1.25;
              crestMat.addChild(sp);
            });
          }
        }
      }
      // Corner flags: seen from above, the pole and the pennant pointing into the pitch, swaying a little.
      const flagCornerGfx = new Graphics();
      flagCornerGfx.zIndex = -0.66;
      flagCornerGfx.eventMode = 'none';
      world.addChild(flagCornerGfx);
      const cornerFlagSpots = cornerFlags(m);
      const flagColorOf = () => {
        const st = stadiumRef.current;
        return st?.homeColors && !st.neutral ? cssColorToPixiHex(st.homeColors[0]) : MATCH_LOOK.FLAG.COLOR;
      };
      // The painted pennant (4.41.24, FLUX-refined, user report): cloth tinted with the home colour, its shadow, the pole.
      type FlagSprites = { shadow: Sprite; cloth: Sprite; pole: Sprite };
      let flagSprites: FlagSprites[] | null = null;
      if (newVisualOn()) {
        void Promise.all([Assets.load<Texture>(gameArtUrl("flag/corner-cloth.png")), Assets.load<Texture>(gameArtUrl("flag/corner-pole.png"))])
          .then(([clothTex, poleTex]) => {
            if (facesDisposed || !clothTex || !poleTex || flagCornerGfx.destroyed) return;
            flagSprites = cornerFlagSpots.map(() => {
              const mk = (tex: Texture) => { const sp = new Sprite(tex); sp.anchor.set(FLAG_SPRITE.POLE_X, FLAG_SPRITE.POLE_Y); sp.zIndex = -0.66; sp.eventMode = 'none'; world.addChild(sp); return sp; };
              const shadow = mk(clothTex);
              shadow.tint = 0x000000;
              shadow.alpha = 0.28;
              return { shadow, cloth: mk(clothTex), pole: mk(poleTex) };
            });
          }).catch(() => { /* the drawn flags stay */ });
      }
      const drawCornerFlags = () => {
        const F = EXTRAS.FLAG;
        const u = Math.max(1.6, unitPx);
        const color = flagColorOf();
        flagCornerGfx.clear();
        cornerFlagSpots.forEach((f, i) => {
          const sway = extrasRef.current && !calm() ? Math.sin(effectNow * F.HZ * Math.PI * 2 + i * 1.3) * F.SWAY : 0;
          const a = Math.atan2(f.dy, f.dx) + sway;
          const L = u * F.LEN;
          const fs = flagSprites?.[i];
          if (fs) {
            const k = L / FLAG_SPRITE.CLOTH_PX;
            for (const sp of [fs.shadow, fs.cloth, fs.pole]) { sp.scale.set(k); sp.rotation = a; sp.position.set(f.x, f.y); }
            fs.shadow.position.set(f.x + 1.5, f.y + 2);
            fs.cloth.tint = color;
            return;
          }
          const tipX = f.x + Math.cos(a) * L, tipY = f.y + Math.sin(a) * L;
          // The pennant: a triangle from the pole, its free corner swinging; a short shadow under it.
          const nx = -Math.sin(a) * L * 0.45, ny = Math.cos(a) * L * 0.45;
          flagCornerGfx.poly([f.x + 1.5, f.y + 2, tipX + 1.5, tipY + 2, f.x + nx + 1.5, f.y + ny + 2]).fill({ color: 0x000000, alpha: 0.25 });
          flagCornerGfx.poly([f.x, f.y, tipX, tipY, f.x + nx * 0.9, f.y + ny * 0.9]).fill(color).stroke({ width: 1, color: 0x101418, alpha: 0.7 });
          flagCornerGfx.circle(f.x, f.y, u * F.POLE).fill(0xf4f4f4).stroke({ width: 1, color: 0x101418, alpha: 0.8 });
        });
      };
      drawCornerFlags();
      // People around the pitch.
      const crewGfx = new Graphics();
      crewGfx.zIndex = -0.689;
      crewGfx.eventMode = 'none';
      world.addChild(crewGfx);
      let reporterAt: { x: number; y: number } | null = null;
      {
        const bottom = ledPanels.length > 0 ? ledBoards().filter((b) => b.y > PITCH_WIDTH) : [];
        const st = stadiumRef.current;
        if (bottom.length > 0 && st && m.stand) {
          // Behind the first bottom board (between it and the stand), toward the corner.
          const b0 = bottom[0]!;
          const bx = m.marginX + Math.min(b0.x, 10) * m.scale;
          const by = m.marginY + b0.y * m.scale + (LED.SCREEN_YDS * m.scale) / 2;
          reporterAt = { x: bx, y: by + unitPx * 4.5 };
        }
      }
      const crew = m.stand ? bystanders(m, unitPx, reporterAt) : [];
      const walkways = m.stand ? standConcreteRows(m.stand) : [];
      const sellers = m.stand ? vendors(stadiumRef.current?.seed ?? "match", walkways.length) : [];
      /** One person seen from above: shoulders across the facing, the body, the head with its hair to the back. */
      const person = (g: Graphics, x: number, y: number, face: number, body: number, u: number, look: { skin: number; hair: number }, cap?: number) => {
        const fx = Math.cos(face), fy = Math.sin(face);
        const px = -fy, py = fx;
        g.ellipse(x + u * 0.2, y + u * 0.35, u * 1.05, u * 0.75).fill({ color: 0x000000, alpha: 0.28 });
        g.circle(x + px * u * 0.6, y + py * u * 0.6, u * 0.45).fill(body);
        g.circle(x - px * u * 0.6, y - py * u * 0.6, u * 0.45).fill(body);
        g.circle(x, y, u * 0.62).fill(body);
        g.circle(x + fx * u * 0.08, y + fy * u * 0.08, u * 0.46).fill(BENCH_SKIN[look.skin]!);
        if (cap !== undefined) {
          g.circle(x - fx * u * 0.06, y - fy * u * 0.06, u * 0.42).fill(cap);
          g.circle(x + fx * u * 0.36, y + fy * u * 0.36, u * 0.22).fill(cap);
        } else {
          const hair = BENCH_HAIR[look.hair];
          if (hair !== undefined) g.circle(x - fx * u * 0.12, y - fy * u * 0.12, u * 0.4).fill(hair);
        }
      };
      const drawCrew = (ballPx: { x: number; y: number }) => {
        crewGfx.clear();
        const on = officialsOn && extrasRef.current && !!m.stand;
        if (!on) return;
        const u = unitPx;
        crew.forEach((c, i) => {
          const look = benchLook(`crew:${c.kind}:${i}`);
          if (c.kind === "tv" || c.kind === "crew") {
            // The camera follows the ball (TV), or looks at the reporter (crew).
            const face = c.kind === "tv" ? Math.atan2(ballPx.y - c.y, ballPx.x - c.x) : c.face;
            const fx = Math.cos(face), fy = Math.sin(face);
            if (c.kind === "tv") {
              for (const k of [0, 2.1, 4.2]) {
                crewGfx.moveTo(c.x, c.y).lineTo(c.x + Math.cos(face + k + 0.5) * u * 1.3, c.y + Math.sin(face + k + 0.5) * u * 1.3);
              }
              crewGfx.stroke({ width: Math.max(1, u * 0.18), color: 0x2a2f36 });
            }
            person(crewGfx, c.x - fx * u * 0.9, c.y - fy * u * 0.9, face, 0x1d2630, u, look);
            const cx2 = c.x + fx * u * 0.4, cy2 = c.y + fy * u * 0.4;
            const len = c.kind === "tv" ? 1.5 : 1.0, wid = c.kind === "tv" ? 0.85 : 0.6;
            const px = -fy, py = fx;
            crewGfx.poly([
              cx2 - fx * u * len / 2 - px * u * wid / 2, cy2 - fy * u * len / 2 - py * u * wid / 2,
              cx2 + fx * u * len / 2 - px * u * wid / 2, cy2 + fy * u * len / 2 - py * u * wid / 2,
              cx2 + fx * u * len / 2 + px * u * wid / 2, cy2 + fy * u * len / 2 + py * u * wid / 2,
              cx2 - fx * u * len / 2 + px * u * wid / 2, cy2 - fy * u * len / 2 + py * u * wid / 2,
            ]).fill(0x15191f);
            crewGfx.circle(cx2 + fx * u * len / 2, cy2 + fy * u * len / 2, u * 0.26).fill(0x4a5b6e);
            if (c.kind === "tv") crewGfx.circle(cx2 - fx * u * 0.2, cy2 - fy * u * 0.2, u * 0.12).fill({ color: 0xff3b30, alpha: Math.floor(effectNow * 1.5 + i) % 2 ? 1 : 0.3 });
          } else if (c.kind === "reporter") {
            person(crewGfx, c.x, c.y, c.face, 0x1f3a68, u, look);
            const fx = Math.cos(c.face), fy = Math.sin(c.face);
            crewGfx.circle(c.x + fx * u * 0.9 + fy * u * 0.4, c.y + fy * u * 0.9 - fx * u * 0.4, u * 0.22).fill(0x111111);
          } else {
            // Stewards face the crowd, now and then glancing at the play.
            const glance = Math.sin(effectNow * 0.35 + i * 2.1) > 0.75;
            const face = glance ? c.face + Math.PI : c.face;
            person(crewGfx, c.x, c.y, face, EXTRAS.STEWARD_VEST, u, look);
            const fx = Math.cos(face), fy = Math.sin(face);
            crewGfx.moveTo(c.x + fy * u * 0.9, c.y - fx * u * 0.9).lineTo(c.x - fy * u * 0.9, c.y + fx * u * 0.9)
              .stroke({ width: Math.max(1, u * 0.2), color: EXTRAS.STEWARD_STRIPE, alpha: 0.9 });
          }
        });
        // Vendors walking the stand's walkways, a tray in front, a cap.
        if (!m.stand) return;
        const inner = m.stand.inner;
        const tunnel = standTunnel(m.stand);
        sellers.forEach((v, i) => {
          const w = walkways[v.row];
          if (!w) return;
          const horizontal = w.side === "top" || w.side === "bottom";
          const a0 = horizontal ? Math.max(w.x, inner.x) : Math.max(w.y, inner.y);
          const a1 = horizontal ? Math.min(w.x + w.w, inner.x + inner.w) : Math.min(w.y + w.h, inner.y + inner.h);
          const t = calm() ? 0 : effectNow;
          const { at, dir } = vendorAlong(v, t, a1 - a0, m.scale);
          let x = horizontal ? a0 + at : w.x + w.w / 2;
          const y = horizontal ? w.y + w.h / 2 : a0 + at;
          if (tunnel && w.side === "bottom" && x > tunnel.x - u && x < tunnel.x + tunnel.w + u) x = tunnel.x - u;
          const face = horizontal ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
          const bob = calm() ? 0 : Math.sin(effectNow * 6 + i) * u * 0.08;
          const look = benchLook(`vendor:${i}`);
          person(crewGfx, x, y + bob, face, v.shirt, u, look, 0xd8312b);
          const fx = Math.cos(face), fy = Math.sin(face);
          crewGfx.rect(x + fx * u * 0.95 - u * 0.45, y + fy * u * 0.95 - u * 0.45 + bob, u * 0.9, u * 0.9).fill(0xf2efe6).stroke({ width: 0.8, color: 0x6b5b3a });
        });
      };
      const coachWalkHalf = m.width * COACH_WALK_FRAC;

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
          const ballPx = toPixel(ball.x, ball.y);
          animateFigure(referee, "referee", { x: ballPx.px, y: ballPx.py }, { card: !!refCard });
        }
        for (const side of ["top", "bottom"] as const) {
          const c = assistantC[side];
          if (!c) continue;
          const t = assistantTarget({ players: st.players, ball }, side);
          const cur = arPos[side];
          // Eases into the run and brakes at the line (tester report: full speed on, full stop, looked stiff).
          const next = !cur || Math.hypot(t.x - cur.x, t.y - cur.y) > OFFICIALS.SNAP_DIST
            ? followAt(t) : smoothDamp(cur, t, SMOOTH_ASSISTANT_S, dtGame, OFFICIALS.AR_SPEED);
          arPos[side] = next;
          const { px, py } = toPixel(next.x, next.y);
          c.x = px;
          // Without a stadium there may be no run-off: keep the assistant on the canvas.
          c.y = Math.min(canvasHeight - markerR, Math.max(markerR, py));
          setFlagRaised(c, effectNow < flagUntil[side]);
          animateFigure(c, "assistant", null, { flagUp: effectNow < flagUntil[side] });
        }
        if (fourth) {
          const ballPx = toPixel(ball.x, ball.y);
          const up = effectNow < boardUntil;
          animateFigure(fourth, "fourth", { x: ballPx.px, y: ballPx.py }, { board: up });
          // The board's numbers over him: off in red, on in green.
          if (up && boardNums) {
            if (!boardTag) {
              const c = new Container();
              c.zIndex = -0.59;
              c.eventMode = 'none';
              const style = (fill: number) => new TextStyle({ fontSize: Math.max(10, Math.round(markerR * 0.85)), fontFamily: 'sans-serif', fontWeight: '800', fill });
              const bg = new Graphics();
              bg.label = "bg";
              const out = new Text({ text: "", style: style(0xff4d4d) });
              const inn = new Text({ text: "", style: style(0x4dff7a) });
              out.anchor.set(0.5); inn.anchor.set(0.5);
              c.addChild(bg, out, inn);
              world.addChild(c);
              boardTag = { c, out, inn, key: "" };
            }
            const inP = stateRef.current.players.find((p) => p.id === boardNums!.in);
            const outN = shirtNumbers.get(boardNums.out);
            const key = `${outN}|${inP ? shirtNumberOf(inP) : ""}`;
            if (boardTag.key !== key) {
              boardTag.key = key;
              boardTag.out.text = outN !== undefined ? String(outN) : "";
              boardTag.inn.text = inP ? String(shirtNumberOf(inP)) : "";
              const w = Math.max(boardTag.out.width, boardTag.inn.width) + 8, h = boardTag.out.height + 2;
              boardTag.out.position.set(-w / 2 - 1, 0);
              boardTag.inn.position.set(w / 2 + 1, 0);
              (boardTag.c.getChildByLabel("bg") as Graphics).clear()
                .roundRect(-w - 2, -h / 2, w * 2 + 4, h, 3).fill({ color: 0x05070a, alpha: 0.92 }).stroke({ width: 1, color: 0x9aa3b2, alpha: 0.6 });
            }
            boardTag.c.visible = true;
            boardTag.c.position.set(fourth.x, fourth.y - markerR * 2.4);
          } else if (boardTag) boardTag.c.visible = false;
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
          entry.sprite.root.x = coachSpot[side].x + (extrasRef.current ? coachWalkOffset(effectNow, side === "left" ? 0 : 2.4, coachWalkHalf) : 0);
          const shown = coachCards[entry.team];
          if (shown && effectNow >= shown.until) delete coachCards[entry.team];
          showCard(entry.sprite.root, coachCards[entry.team]?.card ?? null);
          entry.sprite.root.visible = !coachOff[entry.team] || !!coachCards[entry.team];
          const ballPx = toPixel(ball.x, ball.y);
          // Pointing through a gesture; on a goal, alternating with the arms down.
          const point = !!live && (live.kind !== "celebrate" || Math.floor((effectNow - live.at) * 4) % 2 === 0);
          animateFigure(entry.sprite.root, "coach", { x: ballPx.px, y: ballPx.py }, { point });
        }
      };

      // ── Crowd heatmap overlay ──
      // Added LAST so it draws on top of pitch lines, players, and debug overlays.
      // Alpha is set per-cell during rendering so the underlying game stays visible.
      // eventMode='none' is critical: the heatmap is a pure visual layer — it must
      // never intercept clicks, otherwise the user can't click on cells / players underneath.
      // ── Stadium atmosphere (4.39): floodlight towers, phone lights at night, flares and fireworks in a big game ──
      // Masked to the stand band (never over the pitch), above the light veils so the lights shine. Drawing only.
      const atmosphere = new Container();
      atmosphere.eventMode = 'none';
      const towerG = new Graphics();
      const phoneG = new Graphics();
      const smokeG = new Graphics();
      const sparkG = new Graphics();
      atmosphere.addChild(phoneG);
      // Smoke drifts under the players and may spill over the touchline; fireworks burst over everything, briefly.
      const smokeLayer = new Container();
      smokeLayer.eventMode = 'none';
      smokeLayer.addChild(smokeG);
      // The art pack's smoke puffs, flare sparks and firework bursts (art phase 9).
      const smokePool = new SpritePool(smokeLayer);
      const fireLayer = new Container();
      fireLayer.eventMode = 'none';
      const firePool = new SpritePool(fireLayer, "add");
      app.stage.addChildAt(smokeLayer, app.stage.getChildIndex(world));
      sparkG.eventMode = 'none';
      let atmosphereMask: Graphics | null = null;
      if (m.stand) {
        atmosphereMask = new Graphics();
        for (const r of standSideRects(m.stand)) atmosphereMask.rect(r.x, r.y, r.w, r.h);
        atmosphereMask.fill(0xffffff);
        atmosphere.mask = atmosphereMask;
        app.stage.addChild(atmosphereMask);
      }
      app.stage.addChild(atmosphere, sparkG, fireLayer);
      const towers = m.stand && towersOn ? towerSpots(m.stand) : [];
      // The towers' light on the pitch at night (art preview): painted once, faded with the floodlight level, under
      // the players. The towers stand at the stand's inner corners, outside the stand mask.
      let coneSprite: Sprite | null = null;
      if (towers.length > 0 && typeof document !== "undefined") {
        const c = document.createElement("canvas");
        c.width = canvasWidth; c.height = canvasHeight;
        const g2 = c.getContext("2d");
        if (g2) {
          paintFloodCones(g2, towers, m);
          coneSprite = new Sprite(Texture.from(c));
          coneSprite.blendMode = "add";
          coneSprite.eventMode = 'none';
          coneSprite.alpha = 0;
          app.stage.addChildAt(coneSprite, app.stage.getChildIndex(world));
        }
      }
      let towersLitKey = "";
      let phonesDrawnAt = -Infinity;
      let phoneBoostAt: number | null = null;
      let bursts: CelebrationBurst[] = [];
      const lightsOn = () => (currentLight?.flood ?? 0) >= ATMOSPHERE.LIGHTS_ON;
      const towerSprites = new Container();
      towerSprites.eventMode = 'none';
      app.stage.addChild(towerG, towerSprites);
      const drawTowers = () => {
        if (coneSprite) {
          const a = coneStrength(currentLight?.flood ?? 0);
          coneSprite.alpha = a;
          coneSprite.visible = a > 0.01;
        }
        const lit = lightsOn();
        const key = `${towers.length}|${lit}|${!!stadiumArt}`;
        if (key === towersLitKey) return;
        towersLitKey = key;
        towerG.clear();
        towerSprites.removeChildren().forEach((c) => c.destroy());
        if (stadiumArt) {
          // The art pack's tower: lamps toward the pitch, greyed while the floodlights are off.
          for (const t of towers) {
            const s = new Sprite(stadiumArt.tower);
            s.anchor.set(0.5);
            s.position.set(t.x, t.y);
            s.rotation = t.angle - Math.PI / 2;
            s.width = s.height = t.size * STADIUM_ART.TOWER_SIZE;
            s.tint = lit ? 0xffffff : STADIUM_ART.TOWER_OFF_TINT;
            towerSprites.addChild(s);
          }
          return;
        }
        const T = ATMOSPHERE.TOWER;
        for (const t of towers) {
          const p = towerPanel(t);
          towerG.moveTo(t.x, t.y).lineTo(p.x, p.y).stroke({ width: Math.max(1.5, t.size * 0.08), color: T.MAST_COLOR });
          const w = t.size * T.PANEL_W, h = t.size * T.PANEL_H;
          // The panel lies across the line to the pitch centre.
          const ux = -Math.sin(t.angle), uy = Math.cos(t.angle);
          const fx = Math.cos(t.angle) * h / 2, fy = Math.sin(t.angle) * h / 2;
          towerG.poly([
            p.x - ux * w / 2 - fx, p.y - uy * w / 2 - fy,
            p.x + ux * w / 2 - fx, p.y + uy * w / 2 - fy,
            p.x + ux * w / 2 + fx, p.y + uy * w / 2 + fy,
            p.x - ux * w / 2 + fx, p.y - uy * w / 2 + fy,
          ]).fill({ color: lit ? T.PANEL_ON : T.PANEL_OFF, alpha: lit ? 1 : 0.85 });
        }
      };
      const drawPhones = () => {
        const on = lightsOn() && phones.length > 0 && !!stadiumRef.current;
        if (!on) {
          if (phonesDrawnAt !== -Infinity) { phoneG.clear(); phonesDrawnAt = -Infinity; }
          return;
        }
        if (effectNow - phonesDrawnAt < ATMOSPHERE.PHONES.REDRAW_S && effectNow >= phonesDrawnAt) return;
        phonesDrawnAt = effectNow;
        const boosted = phoneBoostAt !== null && effectNow - phoneBoostAt < ATMOSPHERE.PHONES.GOAL_BOOST_S;
        if (!boosted) phoneBoostAt = null;
        phoneG.clear();
        const r = m.stand ? Math.max(0.8, seatCellPx(m.stand) * 0.22) : 1;
        for (const p of phones) {
          const a = phoneAlpha(p, effectNow, boosted);
          if (a <= 0) continue;
          phoneG.circle(p.x, p.y, r).fill({ color: ATMOSPHERE.PHONES.COLOR, alpha: a });
        }
      };
      let burstsDrawn = false;
      const drawBursts = () => {
        if (bursts.length === 0) {
          if (burstsDrawn) { smokePool.begin(); firePool.begin(); smokeG.clear(); sparkG.clear(); burstsDrawn = false; }
          return;
        }
        burstsDrawn = true;
        bursts = bursts.filter((b) => effectNow - b.at <= burstLength(b));
        smokeG.clear();
        sparkG.clear();
        smokePool.begin();
        firePool.begin();
        const fx = fxArt;
        for (const b of bursts) {
          const { glows, puffs } = flareSmoke(b, effectNow);
          if (fx) {
            // Sprites: a grey puff tinted with the smoke, the burning tip of each flare (additive).
            for (const q of puffs) {
              const s = smokePool.next(fx.smoke[q.n]!);
              s.position.set(q.x, q.y);
              s.width = s.height = q.r * FX_ART.PUFF_SIZE;
              s.tint = q.color;
              s.alpha = Math.min(1, q.alpha * FX_ART.PUFF_ALPHA);
            }
            for (const g of glows) {
              const s = firePool.next(fx.spark);
              s.position.set(g.x, g.y);
              s.width = s.height = g.r * FX_ART.SPARK_SIZE;
              s.tint = ATMOSPHERE.FLARES.GLOW;
              s.alpha = g.alpha;
            }
            const shells: ShellSprite[] = [];
            for (const k of fireworks(b, effectNow, shells)) {
              if (k.glow) sparkG.circle(k.x, k.y, k.r * 2.6).fill({ color: k.color, alpha: k.alpha * k.glow * 0.35 });
              sparkG.circle(k.x, k.y, k.r).fill({ color: k.color, alpha: k.alpha });
            }
            for (const sh of shells) {
              // Two neighbouring frames crossfaded, as the atlas asks.
              const pos = Math.min(FX_ART.FIRE_FRAMES - 0.001, sh.t * FX_ART.FIRE_FRAMES);
              const f = Math.floor(pos), fr = pos - f;
              const frames = fx.fire[sh.style]!;
              for (const [frame, w] of [[f, 1 - fr], [f + 1, fr]] as const) {
                if (frame >= FX_ART.FIRE_FRAMES || w <= 0.01) continue;
                const s = firePool.next(frames[frame]!);
                s.position.set(sh.x, sh.y);
                s.rotation = sh.rotation;
                const size = sh.radius * FX_ART.FIRE_SIZE;
                s.width = size; s.height = size;
                s.scale.x *= sh.flip;
                s.tint = sh.color;
                s.alpha = sh.alpha * w;
              }
            }
            continue;
          }
          for (const q of puffs) smokeG.circle(q.x, q.y, q.r).fill({ color: q.color, alpha: q.alpha });
          for (const g of glows) {
            // Soft layered glow: wide halo, warm body, bright core.
            sparkG.circle(g.x, g.y, g.r * 2.6).fill({ color: ATMOSPHERE.FLARES.GLOW, alpha: g.alpha * 0.14 });
            sparkG.circle(g.x, g.y, g.r * 1.6).fill({ color: ATMOSPHERE.FLARES.GLOW, alpha: g.alpha * 0.28 });
            sparkG.circle(g.x, g.y, g.r).fill({ color: 0xffb27a, alpha: g.alpha * 0.8 });
            sparkG.circle(g.x, g.y, g.r * 0.55).fill({ color: 0xfff1de, alpha: g.alpha });
          }
          for (const k of fireworks(b, effectNow)) {
            if (k.glow) sparkG.circle(k.x, k.y, k.r * 2.6).fill({ color: k.color, alpha: k.alpha * k.glow * 0.35 });
            sparkG.circle(k.x, k.y, k.r).fill({ color: k.color, alpha: k.alpha });
          }
        }
      };
      const startBurst = () => {
        const st = stadiumRef.current;
        if (!m.stand || !st?.bigMatch || !framesShown()) return;
        const homeLeft = (st.homeTeam === "A") !== mirrorRef.current;
        const sides = standSideRects(m.stand);
        const end = sides.find((r) => r.side === (homeLeft ? "left" : "right"))!;
        bursts = [...bursts, {
          at: effectNow, seed: `${st.seed}:${bursts.length}`, end,
          sky: sides.filter((r) => r.side === "top" || r.side === "bottom"),
          color: st.homeTeam === "A" ? fillA : fillB, night: lightsOn(),
        }];
      };
      const unsubBurstStart = gameBus.on("matchStart", () => startBurst());
      const unsubBurstTest = gameBus.on("testCommand", (cmd) => { if (cmd.type === "celebrate") startBurst(); });
      const unsubBurstGoal = gameBus.on("goalScored", (e) => {
        const st = stadiumRef.current;
        if (!st || !framesShown()) return;
        if (e.team === st.homeTeam || st.neutral) {
          phoneBoostAt = effectNow;
          startBurst();
        }
      });
      const drawAtmosphere = () => {
        drawTowers();
        if (calm()) {
          // No phone lights, flares or fireworks: what was drawn goes.
          phoneG.clear();
          phonesDrawnAt = -Infinity;
          bursts = [];
          smokeG.clear();
          sparkG.clear();
          smokePool.begin();
          firePool.begin();
          return;
        }
        drawPhones();
        drawBursts();
      };

      // Rain / snow over the players (match light), on the effects clock: frozen while paused, never drawn with the
      // tab hidden (no frames). Below the debug heatmap.
      const particleGraphics = new Graphics();
      particleGraphics.eventMode = 'none';
      app.stage.addChild(particleGraphics);
      // Fog (art phase 9, drawing only, `matchFog.ts`): two layers of the art pack's fog texture drifting at different
      // speeds over the whole canvas. Frozen while paused (effects clock); still with reduced motion or light quality.
      const fogLayers: TilingSprite[] = [];
      let fogLoading = false;
      const drawFog = () => {
        const li = lightingRef.current;
        const on = !!li && newVisualOn() && (li.fog ?? matchHasFog(li.weather, li.seed, li.sun.covered));
        if (!on) { for (const f of fogLayers) f.visible = false; return; }
        if (fogLayers.length === 0) {
          const url = paintedBackdrop("fog");
          if (!url || fogLoading) return;
          fogLoading = true;
          void fogTexture(url).then((tex) => {
            if (turfDisposed || !tex) return;
            for (const L of FOG.LAYERS) {
              const t = new TilingSprite({ texture: tex, width: canvasWidth, height: canvasHeight });
              t.tileScale.set(L.scale);
              t.alpha = L.alpha;
              t.eventMode = 'none';
              app.stage.addChildAt(t, app.stage.getChildIndex(particleGraphics) + 1);
              fogLayers.push(t);
            }
          });
          return;
        }
        FOG.LAYERS.forEach((L, i) => {
          const f = fogLayers[i]!;
          f.visible = true;
          if (calm()) return;
          f.tilePosition.set(effectNow * L.drift, effectNow * L.drift * 0.3);
        });
      };
      let particles: Particle[] = [];
      let particleSeedKey = "";
      const drawParticles = () => {
        const li = lightingRef.current;
        if (li && !calm() && !li.sun.covered && (li.weather === "rain" || li.weather === "snow" || li.weather === "wind_rain")) {
          const pk = `${li.weather}|${li.seed}`;
          if (particleSeedKey !== pk) { particles = weatherParticles(li.weather, li.seed); particleSeedKey = pk; }
          particleGraphics.clear();
          let drops = false;
          let flakes = false;
          for (const p of particles) {
            if (p.kind !== "drop") continue;
            const q = particleAt(p, effectNow);
            const x = q.x * canvasWidth, y = q.y * canvasHeight;
            const len = p.size * canvasHeight;
            particleGraphics.moveTo(x, y).lineTo(x - (p.vx / p.vy) * len, y - len);
            drops = true;
          }
          if (drops) particleGraphics.stroke({ width: 1, color: 0xcfe3ef, alpha: 0.35 });
          for (const p of particles) {
            if (p.kind !== "flake") continue;
            const q = particleAt(p, effectNow);
            particleGraphics.circle(q.x * canvasWidth, q.y * canvasHeight, p.size);
            flakes = true;
          }
          if (flakes) particleGraphics.fill({ color: 0xffffff, alpha: 0.8 });
        } else if (particleSeedKey !== "") {
          particles = [];
          particleSeedKey = "";
          particleGraphics.clear();
        }
      };

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
        const gameY = mirrorY((logicalY - m.marginY) / m.scale, mirrorRef.current);

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
        let drawnPos: Map<number, Pos>;
        let drawnB: DrawnBall;
        if (remote) {
          // Remote: the state follows the newest frame (officials, clicks, overlays read it); the drawing blends the
          // last two frames by real time.
          const frames = remote.frames.current;
          if (frames.last && frames.seq !== remoteSeenSeq) {
            remoteSeenSeq = frames.seq;
            stateRef.current = withFramePositions(stateRef.current, frames.last);
          }
          const st = stateRef.current;
          const rp = remotePositions(frames, defaultNow(), remote.stepMs, TELEPORT_YDS, BALL_TELEPORT_YDS);
          drawnPos = rp ? rp.players : drawnPlayerPositions(st, st, 1, TELEPORT_YDS);
          drawnB = rp ? remoteDrawnBall(st, rp.ball) : drawnBall(st, st, 1, BALL_TELEPORT_YDS);
        } else {
          const drawState = stateRef.current;
          // A state swapped in from outside the pump that moved something (/test command) ends a transition.
          if (drawState !== renderPair.cur && !samePositions(drawState, renderPair.cur)) transition = null;
          renderPair = syncRenderPair(renderPair, drawState);
          const alpha = interpAlpha(simCarryRef.current, SIM_STEP);
          drawnPos = drawnPlayerPositions(renderPair.prev, drawState, alpha, TELEPORT_YDS, renderPair.pprev);
          drawnB = drawnBall(renderPair.prev, drawState, alpha, BALL_TELEPORT_YDS);
        }
        const drawState = stateRef.current;
        // A high ball that dropped loose bounces a few times (drawing only).
        {
          const lb = drawState.looseBall;
          const aerial = lb && (lb.source === "cross" || lb.source === "long_ball" || lb.source === "clearance");
          if (aerial && lb.startTime !== bounceKey) { bounceKey = lb.startTime; bounceAt = transitionNow; }
          if (!aerial) bounceKey = null;
          else if (!remote) drawnB = { ...drawnB, h: Math.max(drawnB.h, bounceHeight(transitionNow - bounceAt)) };
        }
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
        if (walkOns.size > 0) {
          const next = new Map(drawnPos);
          for (const [id, w] of walkOns) {
            const t = (effectNow - w.at) / SUB_WALK.S;
            const to = drawnPos.get(id);
            if (t >= 1 || !to) { walkOns.delete(id); continue; }
            const k = t <= 0 ? 0 : t * t * (3 - 2 * t);
            next.set(id, { x: w.from.x + (to.x - w.from.x) * k, y: w.from.y + (to.y - w.from.y) * k });
          }
          drawnPos = next;
        }
        // Eased drawing (tester report): continuous velocity across the 0.2 s sim steps, no kink at each step.
        if (!replayRun) {
          const dtS = pausedRef.current ? 0 : app.ticker.deltaMS / 1000;
          drawnPos = smoothPlayers(playerFollow, drawnPos, dtS, gameSpeedRef.current, TELEPORT_YDS);
        }
        // In-match penalty: the taker's run-up with the stutter while the countdown runs, the ball on the spot.
        {
          const sp = stateRef.current.setPiece;
          jostle = null;
          // A direct free kick: the taker places the ball and steps back, then runs in (leva 2).
          if (sp?.type === 'free_kick' && sp.variant === 'direct' && sp.position && !replayRun) {
            const taker = stateRef.current.players.find((p) => p.id === sp.takerId);
            if (taker) {
              const k = 1 - sp.countdown / SET_PIECE_CONFIG.DIRECT_FREE_KICK_COUNTDOWN;
              const off = penaltyRunUp(k);
              const next = new Map(drawnPos);
              next.set(taker.id, { x: sp.position.x - taker.attackDir * off.back, y: sp.position.y + taker.attackDir * off.side });
              drawnPos = next;
              drawnB = { ...drawnB, x: sp.position.x, y: sp.position.y, h: 0 };
            }
          }
          // Corner or crossed free kick: the pairs in the box push and pull while the taker waits.
          if (sp && sp.variant === 'box' && sp.countdown > 0 && !replayRun && !reducedMotion) {
            const taker = stateRef.current.players.find((p) => p.id === sp.takerId);
            if (taker) {
              const offs = jostleOffsets(
                stateRef.current.players.map((p) => ({ id: p.id, team: p.team, keeper: p.role === "GK" })),
                drawnPos, taker.team, engineGoalX(taker.attackDir), effectNow,
              );
              // On the marker only (like the short animations): the figure's gait and facing never see it.
              jostle = offs;
            }
          }
          if (sp?.type === 'penalty' && !replayRun) {
            const taker = stateRef.current.players.find((p) => p.id === sp.takerId);
            const spot = sp.position ?? (taker ? { x: taker.x, y: taker.y } : null);
            if (taker && spot) {
              const k = 1 - sp.countdown / FOUL_CONFIG.PENALTY_COUNTDOWN;
              const off = penaltyRunUp(k);
              const next = new Map(drawnPos);
              next.set(taker.id, { x: spot.x - taker.attackDir * off.back, y: spot.y + taker.attackDir * off.side });
              drawnPos = next;
              drawnB = { ...drawnB, x: spot.x, y: spot.y, h: 0 };
            }
          }
        }
        // Goal replay: record, or draw the recorded frames slowly.
        const dtReal = pausedRef.current ? 0 : app.ticker.deltaMS / 1000;
        replayClock += dtReal;
        if (celebration) {
          const c = celebration;
          const t = replayClock - c.started;
          if (t < c.plan.duration) {
            const pos = celebrationPositions(c.plan, t);
            const next = new Map(drawnPos);
            for (const [id, q] of pos) if (next.has(id)) next.set(id, q);
            drawnPos = next;
            drawnB = c.ball;
            // Poses: the scorer celebrates on arrival (knee slide at the end of a long run), the team-mates as they reach him.
            if (t >= c.plan.arrival && !c.arrived.has(c.plan.scorerId)) {
              c.arrived.add(c.plan.scorerId);
              act(c.plan.scorerId, c.plan.slide ? "kneeSlide" : "celebrate");
              anims = addAnim(anims, { playerId: c.plan.scorerId, kind: "celebrate", dir: { x: 1, y: 0 }, side: 1 }, effectNow);
            }
            for (const id of arrivedMates(c.plan, t)) {
              if (c.arrived.has(id)) continue;
              c.arrived.add(id);
              act(id, "celebrate");
            }
          } else {
            if (!c.walkFrom) {
              c.walkFrom = celebrationPositions(c.plan, c.plan.duration);
              c.walkStarted = replayClock;
            }
            const k = (replayClock - c.walkStarted) / c.plan.walkBack;
            if (k >= 1) {
              celebration = null;
              if (c.clip) {
                replayRun = { clip: c.clip, started: replayClock };
                onReplayRef.current?.(true);
              }
            } else {
              drawnPos = walkBackPositions(c.walkFrom, drawnPos, k);
              const e = k * k * (3 - 2 * k);
              drawnB = { x: c.ball.x + (drawnB.x - c.ball.x) * e, y: c.ball.y + (drawnB.y - c.ball.y) * e, h: 0 };
            }
          }
        }
        if (replayRun) {
          const at = replayAt(replayRun.clip, replayClock - replayRun.started);
          if (!at) endReplay();
          else {
            const k = at.k;
            const pos = new Map<number, Pos>();
            for (const [id, a] of at.a.players) {
              const b = at.b.players.get(id) ?? a;
              pos.set(id, { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
            }
            drawnPos = pos;
            const ba = at.a.ball, bb = at.b.ball;
            drawnB = { x: ba.x + (bb.x - ba.x) * k, y: ba.y + (bb.y - ba.y) * k, h: ba.h + (bb.h - ba.h) * k };
          }
        } else if (!remote && replayRef.current && !celebration) {
          replayBuf = recordFrame(replayBuf, { t: replayClock, players: drawnPos, ball: drawnB });
          if (replayPending && replayClock - replayPending.goalAt >= REPLAY.DELAY_S) {
            const clip = replayClip(replayBuf, replayPending.goalAt);
            replayPending = null;
            if (clip) {
              replayRun = { clip, started: replayClock };
              onReplayRef.current?.(true);
            }
          }
        }
        lastDrawnPos = drawnPos;
        lastDrawnBall = drawnB;
        const heldId = heldBallId(stateRef.current, drawnPos, drawnB, Boolean(remote));
        drawPlayLines(drawnB, drawnPos);

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
        // Substituted players walking off (eased to the bench side of the halfway line, fading at the end).
        for (const [id, w] of walkOffs) {
          const t = (effectNow - w.at) / SUB_WALK.S;
          if (t >= 1 || w.g.destroyed) {
            if (!w.g.destroyed) { world.removeChild(w.g); w.g.destroy({ children: true }); }
            walkOffs.delete(id);
            continue;
          }
          const k = t <= 0 ? 0 : t * t * (3 - 2 * t);
          const to = toPixel(PITCH_LENGTH / 2, mirrorRef.current ? -SUB_WALK.OFF_YDS : PITCH_WIDTH + SUB_WALK.OFF_YDS);
          w.g.x = w.fromX + (to.px - w.fromX) * k;
          w.g.y = w.fromY + (to.py - w.fromY) * k;
          w.g.alpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
        }

        // Players: game pos → pixels (exact position). Name must refresh every frame so
        // substitutions update the label on the pitch.
        const booked = bookedPlayerIds(stateRef.current.cards);
        holderGlowGfx.clear();
        fatigueGfx.clear();
        // The second kit colours came in after the mount: redraw the borders and the numbers once.
        {
          const a2 = secondOf(secondColorsRef.current.A, fillA), b2 = secondOf(secondColorsRef.current.B, fillB);
          if (a2 !== fillA2 || b2 !== fillB2) {
            fillA2 = a2; fillB2 = b2;
            for (const p of stateRef.current.players) {
              const mk = playerGraphics.get(p.id);
              const ring = mk?.getChildByLabel("ring") as Graphics | null;
              if (ring) drawMarkerRing(ring, p.team);
              const num = mk?.getChildByLabel("num") as Text | null;
              if (num) num.style.fill = p.team === "A" ? fillA2 : fillB2;
            }
          }
        }
        // ballHolderId keeps the last toucher while the ball travels: glow only on a real holder.
        const st0 = stateRef.current;
        const glowId = heldId;
        // Short player animations: an offset on top of the interpolated marker (engine untouched).
        anims = liveAnims(anims, effectNow);
        const animOf = new Map(anims.map((a) => [a.playerId, a] as const));
        spriteActions = liveActions(spriteActions, effectNow);
        const actionOf = new Map(spriteActions.map((a) => [a.playerId, a] as const));
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
          const jo = jostle?.get(player.id);
          g.x = px + (off ? xSign() * off.dx * m.scale : 0) + (jo ? xSign() * jo.x * m.scale : 0);
          g.y = py + (off ? xSign() * off.dy * m.scale : 0) + (jo ? xSign() * jo.y * m.scale : 0) - liftPx;
          g.scale.set(off ? off.scale : 1);
          // The mirror is a 180° turn (#142): the offset flips on both axes, an angle stays as is.
          g.rotation = off ? off.rotation : 0;
          const markerShadow = g.children[0];
          if (markerShadow) {
            // The shadow stays on the ground while the marker lifts (header), and shrinks.
            markerShadow.y = liftPx / (off?.scale ?? 1);
            markerShadow.scale.set(Math.max(0.6, 1 - (off?.liftYds ?? 0) * 0.25));
          }
          if (anim?.kind === "flick" && off) {
            // A first-time pass: a quick ring around the player.
            const k = (effectNow - anim.startedAt) / anim.duration;
            animGfx.circle(g.x, g.y, markerR * (1.2 + 0.8 * k)).stroke({ width: 2, color: 0xffffff, alpha: 0.55 * (1 - k) });
          }
          if (anim?.kind === "longShot" && off) {
            // Three short "force lines" behind the shooter.
            const k = (effectNow - anim.startedAt) / anim.duration;
            const ux = -xSign() * anim.dir.x, uy = -xSign() * anim.dir.y;
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
          const bodyC = g.getChildByLabel('body') as Container | null;
          if (bodyC) {
            // Figures or discs, switched live (4.41.19).
            const fig = markersRef.current !== "discs";
            if (bodyC.visible !== fig) {
              bodyC.visible = fig;
              for (const l of ['disc', 'gloss', 'face', 'rim']) {
                const c = g.getChildByLabel(l);
                if (c) c.visible = !fig;
              }
            }
          }
          const body = bodyC?.visible ? bodyC : null;
          if (body) {
            const prevM = spriteMotion.get(player.id) ?? newMotion(px / m.scale, py / m.scale);
            const dtS = pausedRef.current ? 0 : app.ticker.deltaMS / 1000;
            const ballPx = toPixel(drawnB.x, drawnB.y);
            const mo = stepMotion(prevM, { x: px / m.scale, y: py / m.scale }, dtS, { x: ballPx.px / m.scale, y: ballPx.py / m.scale });
            spriteMotion.set(player.id, mo);
            const action = actionOf.get(player.id) ?? null;
            // A dive's side as drawn: the engine side (+y / -y, turned with the mirror) against the keeper's right hand.
            const diveSide = action?.kind === "dive" && Math.sin(mo.angle + Math.PI / 2) * action.side * (mirrorRef.current ? -1 : 1) >= 0 ? "right" : "left";
            const sp = stateRef.current.setPiece;
            const throwing = sp?.type === "throw_in" && sp.takerId === player.id;
            if (throwing) throwTaker = player.id;
            const pose = poseOf(mo, action, effectNow, player.role === "GK", diveSide, throwing ? THROW_IN_HOLD : undefined);
            setPose(body, pose.atlas, pose.base);
            // The sprite faces -y: turn it to where he faces, against the marker's own animation turn.
            body.rotation = mo.angle + Math.PI / 2 - g.rotation;
          }
          if (player.id === glowId) {
            // A gold ring pulsing on the ground under the ball holder.
            const H = MATCH_LOOK.HOLDER;
            const pulse = Math.sin(effectNow * H.HZ * Math.PI * 2);
            const rr = markerR * (H.R + H.PULSE * pulse);
            holderGlowGfx
              .ellipse(px, py + markerR * 0.15, markerR * HOLDER_GLOW.RX, markerR * HOLDER_GLOW.RY)
              .fill({ color: 0xffffff, alpha: HOLDER_GLOW.ALPHA * 0.5 })
              .ellipse(px, py + 1, rr, rr * 0.85)
              .stroke({ width: 2, color: H.COLOR, alpha: H.ALPHA + 0.2 * pulse });
          }
          // Stamina as a straight bar above the head, filling left to right (only the user's players live).
          const B = MATCH_LOOK.STAMINA_BAR;
          const showStamina = !staminaTeamsRef.current || staminaTeamsRef.current.includes(player.team);
          const bw = markerR * B.W, bx = px - bw / 2, by = py - markerR - B.GAP - B.H;
          if (showStamina) fatigueGfx.roundRect(bx - 1, by - 1, bw + 2, B.H + 2, B.R + 1).fill({ color: 0x000000, alpha: FATIGUE_BAR.TRACK_ALPHA });
          const fill = fatigueFill(player.energy);
          if (showStamina && fill > 0) {
            fatigueGfx.roundRect(bx, by, Math.max(B.R * 2, bw * fill), B.H, B.R).fill({ color: fatigueColor(player.energy) });
          }
          // Heading chevron: where the drawn marker is going (smoothed), only when it really moves.
          const prevV = markerVel.get(player.id);
          const C = MATCH_LOOK.CHEVRON;
          if (prevV) {
            const dx = px - prevV.x, dy = py - prevV.y;
            const jump = Math.hypot(dx, dy) > markerR * 2;
            prevV.vx = jump ? 0 : prevV.vx * (1 - C.SMOOTH) + dx * C.SMOOTH;
            prevV.vy = jump ? 0 : prevV.vy * (1 - C.SMOOTH) + dy * C.SMOOTH;
            prevV.x = px; prevV.y = py;
            const sp = Math.hypot(prevV.vx, prevV.vy);
            if (sp > C.MIN_PX) {
              const a = Math.atan2(prevV.vy, prevV.vx);
              const cxp = px + Math.cos(a) * (markerR + C.DIST), cyp = py + Math.sin(a) * (markerR + C.DIST);
              fatigueGfx.moveTo(cxp + Math.cos(a) * C.SIZE, cyp + Math.sin(a) * C.SIZE)
                .lineTo(cxp + Math.cos(a + 2.4) * C.SIZE * 0.9, cyp + Math.sin(a + 2.4) * C.SIZE * 0.9)
                .lineTo(cxp + Math.cos(a - 2.4) * C.SIZE * 0.9, cyp + Math.sin(a - 2.4) * C.SIZE * 0.9)
                .fill({ color: 0xffffff, alpha: Math.min(1, C.ALPHA * sp / (C.MIN_PX * 3)) });
            }
          } else {
            markerVel.set(player.id, { x: px, y: py, vx: 0, vy: 0 });
          }
          if (label) {
            // Names only of the ball holder and of who the pass goes to (all of them in debug).
            const named = debugModeRef.current || player.id === heldId || player.id === st0.pass?.toId;
            label.visible = named;
            const pillG = playerPills.get(player.id);
            if (pillG) pillG.g.visible = named;
            { const shirt = shirtName(player.name); if (label.text !== shirt) label.text = shirt; }
            label.x = px;
            // The name sits over the stamina bar when both show.
            label.y = py - (markerR + MATCH_LOOK.PILL.LIFT + (showStamina ? B.GAP + B.H : 0));
            const pill = playerPills.get(player.id);
            if (pill) {
              // Sprite players: the face goes in the pill, left of the name (the marker has none).
              const P = MATCH_LOOK.PILL;
              const faceUrl = figureShown(g) ? faceUrlOf(player) : undefined;
              const faceTex = faceUrl ? faceTextures.get(faceUrl) : undefined;
              // The ball holder's face is big, beside the pill (4.41.19, tester report: too small to see who it is).
              const bigFace = !!faceTex && player.id === heldId;
              const faceD = !faceTex ? 0 : bigFace ? markerR * 2 * MATCH_LOOK.HOLDER_FACE : label.height + P.PAD_Y * 2 - 4;
              const faceW = faceD > 0 && !bigFace ? faceD + 3 : 0;
              const pillKey = `${label.text}|${faceW}`;
              if (pill.text !== pillKey) { drawPill(pill.g, label, player.team === "A" ? fillA : fillB, faceW); pill.text = pillKey; }
              if (faceTex && (!pill.face || pill.faceUrl !== faceUrl)) {
                pill.face?.destroy();
                pill.face = new Sprite(faceTex);
                pill.face.anchor.set(0.5);
                pill.face.zIndex = 5;
                world.addChild(pill.face);
                pill.faceUrl = faceUrl;
              }
              // The name moves right to make room for the face.
              label.x = px + faceW / 2;
              pill.g.x = px;
              pill.g.y = label.y;
              if (pill.face) {
                pill.face.visible = named && faceD > 0;
                pill.face.width = pill.face.height = faceD;
                pill.face.x = bigFace
                  ? px - (label.width + P.PAD_X * 2) / 2 - faceD / 2 + 2
                  : px - (label.width + P.PAD_X * 2 + faceW) / 2 + P.STRIP + faceD / 2 + 1;
                pill.face.y = label.y - label.height / 2;
              }
            }
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
              const py0 = Math.min(toPixel(0, cell.y - CELL_H / 2).py, toPixel(0, cell.y + CELL_H / 2).py);
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
          // ── Active keeper — zones and target (`Keeper.ts`) ──
          if (ovl.keeper) {
            for (const gk of stateRef.current.players) {
              if (gk.role !== 'GK') continue;
              const goalX = keeperGoalX(gk);
              const dir = gk.attackDir;
              const rect = (d0: number, d1: number, half: number, color: number, alpha: number) => {
                const pts = [
                  toPixel(goalX + dir * d0, GOAL_CENTRE_Y - half), toPixel(goalX + dir * d1, GOAL_CENTRE_Y - half),
                  toPixel(goalX + dir * d1, GOAL_CENTRE_Y + half), toPixel(goalX + dir * d0, GOAL_CENTRE_Y + half),
                ];
                passLinesGfx.poly(pts.flatMap(q => [q.px, q.py])).stroke({ width: 1, color, alpha });
              };
              rect(0, KEEPER_CONFIG.SWEEP_RANGE, KEEPER_CONFIG.SWEEP_HALF_WIDTH, 0xbef264, 0.35);
              rect(6, KEEPER_CONFIG.HIGH_CLAIM_DEPTH, KEEPER_CONFIG.HIGH_CLAIM_HALF_WIDTH, 0x5eead4, 0.5);
              const c = toPixel(goalX, GOAL_CENTRE_Y);
              passLinesGfx.circle(c.px, c.py, KEEPER_CONFIG.RUSH_RANGE * m.scale).stroke({ width: 1, color: 0xfacc15, alpha: 0.25 });
              const { px: gx, py: gy } = toPixel(gk.x, gk.y);
              const { px: tx, py: ty } = toPixel(gk.targetPosition.x, gk.targetPosition.y);
              passLinesGfx.moveTo(gx, gy).lineTo(tx, ty).stroke({ width: 2, color: 0xbef264, alpha: 0.9 });
              passLinesGfx.circle(tx, ty, 3).fill({ color: 0xbef264, alpha: 0.9 });
            }
          }

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
        let { px: bx, py: by } = toPixel(ballPos.x, ballPos.y);
        // A held ball sits at the holder's feet, just in front of the marker (never over the face, tester report):
        // toward where he runs, or toward the goal he attacks when he stands still.
        {
          const stB = stateRef.current;
          const holder = heldId === null ? null : stB.players.find((p) => p.id === heldId);
          const hg = holder ? playerGraphics.get(holder.id) : undefined;
          if (holder && hg) {
            const v = markerVel.get(holder.id);
            const sp = v ? Math.hypot(v.vx, v.vy) : 0;
            const dx = sp > 0.15 ? v!.vx / sp : holder.attackDir * xSign(), dy = sp > 0.15 ? v!.vy / sp : 0;
            const reach = markerR + ballR * 0.9;
            bx = hg.x + dx * reach; by = hg.y + dy * reach;
          }
        }
        const h = drawnB.h;
        seamAngle = nextSpinAngle(seamAngle, prevBallPx, { x: bx, y: by }, ballR, pausedRef.current, BALL.SPIN_TELEPORT_PX, BALL.SPIN_MAX_PER_FRAME);
        if (ballFrames) {
          ballRoll = nextBallRoll(ballRoll, prevBallPx, { x: bx, y: by }, ballR, pausedRef.current, BALL.SPIN_TELEPORT_PX, BALL.SPIN_MAX_PER_FRAME);
          ballSprite.texture = ballFrames[ballSpriteFrame(ballRoll.roll)]!;
          ballSprite.rotation = ballRoll.heading;
          // In snow the ball is orange, as in real snow matches.
          ballSprite.tint = lightingRef.current?.weather === "snow" ? BALL_SPRITE.SNOW_TINT : 0xffffff;
        }
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
        drawParticles();
        drawFog();
        updateLight();
        drawAtmosphere();
        drawOfficials(drawnB, [...drawnPos.values()]);
        { const bp = toPixel(drawnB.x, drawnB.y); drawBenches({ x: bp.px, y: bp.py }); drawCrew({ x: bp.px, y: bp.py }); }
        drawPhotographers(drawnB);
        if (extrasRef.current) drawLed();
        drawCornerFlags();
        drawStretchers();
        // Camera: the whole pitch, or zoomed on the ball (following, or during a replay).
        {
          const want = replayRun ? CAMERA.REPLAY_ZOOM : cameraRef.current === "follow" && !calm() ? CAMERA.FOLLOW_ZOOM : 1;
          const bp = toPixel(drawnB.x, drawnB.y);
          cam = stepCamera(cam, want, { x: bp.px, y: bp.py }, canvasWidth, canvasHeight, app.ticker.deltaMS / 1000);
          app.stage.scale.set(cam.zoom);
          app.stage.pivot.set(cam.x, cam.y);
          app.stage.position.set(canvasWidth / 2, canvasHeight / 2);
        }
        effectCtx.netShake = extrasRef.current;
        if (crowdPulseAt !== null && effectNow - crowdPulseAt >= STADIUM.GOAL_PULSE_S) crowdPulseAt = null;
        const homeAlpha = crowdPulseAt === null ? 1 : goalPulseAlpha(effectNow - crowdPulseAt);
        if (crowdJump && effectNow - crowdJump.at >= CROWD_MOTION.GOAL_S) crowdJump = null;
        // Each fan bounces softly, the wave raises the arms as it goes round, the scoring side jumps (with extras).
        const centre = { x: m.marginX + m.width / 2, y: m.marginY + m.height / 2 };
        const moving = extrasRef.current && !calm();
        flagGfx.clear();
        let flagCrestIdx = 0;
        for (const s of flagCrests) s.visible = false;
        const frames = crowdAtlas?.frames;
        const H = CROWD_MOTION.HAND_FLAG;
        const sz = figureSize;
        for (const k of ["home", "away"] as const) {
          const side = crowdFans[k];
          if (!side || !frames) continue;
          if (k === "home") side.layer.alpha = homeAlpha;
          if (!moving) continue;
          const goalAge = crowdJump?.side === k ? effectNow - crowdJump.at : null;
          // The other side's fans hold their heads while the scorers celebrate (art crowd only: it has that pose).
          const conceded = !!crowdJump && crowdJump.side !== k && frames.body.length > 2;
          const headIndex = crowdAtlas!.headIndex;
          for (const f of side.fans) {
            const pose = fanPose({ x: f.x, y: f.baseY, phase: f.phase, speed: f.speed }, effectNow, sz, centre, 0, goalAge);
            const y = f.baseY - pose.lift;
            const up = pose.arms > 0.5 ? 1 : 0;
            const arms: FanArms = conceded ? 2 : up;
            f.body.y = y; f.head.y = y;
            const bodyTex = frames.body[arms]!;
            if (f.body.texture !== bodyTex) f.body.texture = bodyTex;
            const headTex = frames.heads[headIndex(f.skin, f.hair, arms)]!;
            if (f.head.texture !== headTex) f.head.texture = headTex;
            if (f.scarf) {
              f.scarf.y = y;
              if (f.scarf.texture !== frames.scarf[up]) f.scarf.texture = frames.scarf[up];
            }
            if (f.flag) {
              // A small flag on a stick, held in the right hand, swinging side to side.
              const a = handFlagAngle(f, effectNow, pose.arms);
              const hx = f.x + sz * 0.34, hy = y - sz * (0.1 + 0.55 * pose.arms);
              const tx = hx + Math.sin(a) * sz * H.STICK, ty = hy - Math.cos(a) * sz * H.STICK;
              const fw = sz * H.W, fh = sz * H.H, flap = Math.sin(effectNow * 7 + f.phase) * fh * 0.18;
              flagGfx.moveTo(hx, hy).lineTo(tx, ty).stroke({ width: Math.max(0.8, sz * 0.07), color: 0xcfcfcf });
              // The club's main colour, flapping a little, with the crest in the middle.
              flagGfx.moveTo(tx, ty).lineTo(tx + fw, ty + flap).lineTo(tx + fw, ty + fh + flap).lineTo(tx, ty + fh)
                .fill({ color: flagColor, alpha: 0.97 });
              const crest = flagCrests[flagCrestIdx++];
              if (crest) {
                crest.visible = true;
                crest.position.set(tx + fw / 2, ty + fh / 2 + flap / 2);
                crest.width = crest.height = Math.min(fw, fh) * 0.9;
              }
              flagGfx.circle(hx, hy, Math.max(0.8, sz * 0.08)).fill(0xd8a37a);
            }
          }
        }
        const st = stateRef.current;
        // The trail starts once the ball has left the kicker's marker: drawn from his centre it crossed his face (report).
        const overKicker = (sk: typeof st) => {
          const kid = sk.shot ? sk.shot.shooterId : sk.pass?.fromId;
          const kg = kid !== undefined ? playerGraphics.get(kid) : undefined;
          if (!kg) return false;
          const { px, py } = toPixel(ballPos.x, ballPos.y);
          return Math.hypot(px - kg.x, py - kg.y) < markerR + ballR;
        };
        pendingGoalShot = null; // a goal shot only pairs with a goalScored of the same tick
        // The trail follows the DRAWN ball: elevation in yards = h * LIFT (px = h * scale * LIFT).
        trail = liveTrail(
          pushTrail(
            trail,
            !pausedRef.current && shouldTrail(st) && !overKicker(st) ? { x: ballPos.x, y: ballPos.y - h * BALL.LIFT_PX_PER_YD } : null,
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
                  const py0 = Math.min(toPixel(0, r * CELL_H).py, toPixel(0, (r + 1) * CELL_H).py);
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
        if (remote) return; // a server-run match is never edited from the page
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
        } else if (cmd.type === 'varPatch') {
          stateRef.current = { ...stateRef.current, ...cmd.patch };
        } else if (cmd.type === 'setInstruction') {
          stateRef.current = applyPlayerInstruction(stateRef.current, cmd.team, cmd.slot, cmd.instruction);
        } else if (cmd.type === 'swapPositions') {
          stateRef.current = swapPlayerPositions(stateRef.current, cmd.team, cmd.aId, cmd.bId);
          gameBus.emit('stateChanged', stateRef.current); // the paused panel shows the new slots
        } else if (cmd.type === 'setPenaltyInteractive') {
          stateRef.current = { ...stateRef.current, penaltyInteractive: cmd.teams.length > 0 ? cmd.teams : undefined };
        } else if (cmd.type === 'penaltyOutcome') {
          stateRef.current = applyPenaltyOutcome(stateRef.current, cmd.outcome);
          gameBus.emit('stateChanged', stateRef.current);
        } else if (cmd.type === 'setManualInjurySubs') {
          const s = stateRef.current;
          const manual = { ...s.manualInjurySubs };
          if (cmd.on) manual[cmd.team] = true; else delete manual[cmd.team];
          stateRef.current = { ...s, manualInjurySubs: manual };
        } else if (cmd.type === 'fillVacancy') {
          stateRef.current = fillInjuryVacancy(stateRef.current, cmd.team, cmd.injuredId, cmd.inId);
          gameBus.emit('stateChanged', stateRef.current); // the paused panel shows the newcomer
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
        if (remote) return; // the server re-ticks its own match
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
        unsubRemoteState?.();
        unsubTestCmd();
        unsubTactics();
        unsubTbScores();
        unsubCross();
        unsubShotFx();
        unsubCornerFx();
        unsubGoalFx();
        unsubFoulFx();
        unsubCardFx();
        unsubOffsideFx();
        unsubCrowdGoal();
        unsubBurstStart();
        unsubBurstTest();
        unsubBurstGoal();
        unsubAnimShot();
        unsubAnimHeader();
        unsubAnimFoul();
        unsubAnimDribble();
        unsubAnimReceived();
        unsubAnimFirstTime();
        unsubAnimAerial();
        unsubAnimSave();
        unsubAnimPenalty();
        unsubRefFoul();
        unsubRefCard();
        unsubArFlag();
        unsubCoachGoal();
        unsubReplay();
        unsubFourth();
        onOfficialsReady = null;
        unsubBenchGoal();
        unsubLedGoal();
        unsubImpact();
        unsubPhotoShot();
        unsubAnimCelebrate();
        for (const off of unsubPoses) off();
        unsubStretcher();
        redrawCrowdRef.current = null;
        redrawSurfaceRef.current = null;
        coachCueFnRef.current = null;
        coachCardFnRef.current = null;
        for (const k of ["home", "away"] as const) crowdFans[k]?.layer.destroy();
        crowdAtlasSource?.destroy();
        crestTexture?.destroy(true);
        grainTexture.destroy(true);
        centreTexture.destroy(true);
        turfDisposed = true;
        turfTexture?.texture.destroy(false);
        // The stadium shadow's canvas texture (`drawShade`): one per match, freed with it.
        shadeTexture?.destroy(true);
        shadeTexture = null;
        vignetteTexture.destroy(true);
        glowTexture.destroy(true);
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
