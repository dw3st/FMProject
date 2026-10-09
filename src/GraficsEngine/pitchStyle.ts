/**
 * Visual constants of the live-match pitch (spec 2026-10-06-match-pitch-visual-design.md).
 * Distances in "marker radii" are multiplied by the marker radius (px); heights are in yards.
 */
/** Mowing stripes across the 115-yard length: LIGHT bands over the flat PITCH_COLOR background. */
export const PITCH_STRIPES = { COUNT: 15, LIGHT: 0x10773a } as const;

/** Ground shadow under each marker (offsets/size in marker radii). */
export const MARKER_SHADOW = { DX: 0.25, DY: 0.35, SCALE_Y: 0.8, ALPHA: 0.3 } as const;

/** Soft glow on the ground under the ball holder (radii in marker radii). */
export const HOLDER_GLOW = { RX: 1.7, RY: 1.4, ALPHA: 0.18 } as const;

/** Card badge in the marker's top-right corner (size/position in marker radii). */
export const CARD_BADGE = { X: 0.45, Y: -1.15, W: 0.42, H: 0.58, YELLOW: 0xffd400 } as const;

/** Stamina bar under each marker: width in marker radii, height/gap in px, colours by band. */
export const FATIGUE_BAR = {
  W: 2.1, H: 4, GAP: 4, TRACK_ALPHA: 0.45,
  OK: 0x5ad16b, MID: 0xf2c94c, LOW: 0xff8a3d,
  OK_FROM: 60, MID_FROM: 40,
} as const;

/** Ball drawing: radius px, ground shadow, how a raised ball is drawn per yard of height. */
export const BALL = {
  RADIUS: 6,
  /** Modern ball: radial shading (centre at CENTRE of the radius, light to rim), seams, fixed gloss, outline. */
  SHADE_CENTRE: 0.3, SHADE_LIGHT: 0xffffff, SHADE_MID: 0xf1f1f1, SHADE_RIM: 0xb9bec4,
  SEAM_BLUE: 0x2457c5, SEAM_RED: 0xe8423a, SEAM_GREY: 0x9aa3ad,
  SEAM_BLUE_W: 1, SEAM_RED_W: 1, SEAM_GREY_W: 0.6,
  GLOSS_ALPHA: 0.7, OUTLINE_ALPHA: 0.35,
  /** A drawn ball move (px per frame) above this is a jump, not a roll: the seams do not spin. */
  SPIN_TELEPORT_PX: 36,
  /** Max seam rotation per frame (rad): faster reads as flicker. */
  SPIN_MAX_PER_FRAME: 0.35,
  SHADOW_ALPHA: 0.35, SHADOW_MIN_ALPHA: 0.1,
  LIFT_PX_PER_YD: 0.6, GROW_PER_YD: 0.06, SHADOW_SHRINK_PER_YD: 0.04, SHADOW_MIN_SCALE: 0.5,
  /** Shadow ellipse height / width, its offset (px) from the ball, and the height (yd) at which it fades to its minimum. */
  SHADOW_RATIO_Y: 0.6, SHADOW_DX: 1.5, SHADOW_DY: 2, SHADOW_FADE_YDS: 12,
} as const;

/** Peak height (yards) of each kind of ball in the air. */
export const BALL_HEIGHT = { CROSS: 6, LONG_BALL: 8, CLEARANCE: 5, SHOT: 1.5, HEADER: 0.5 } as const;

/** Seconds (real time) each pitch effect stays; the last FADE_SHARE of it fades out. */
export const EFFECT_DURATION = { shot: 1.5, goal: 1.5, foul: 1.5, card: 2, offside: 2 } as const;
export const EFFECT_FADE_SHARE = 0.3;

/** Ball trail: passes at least MIN_PASS_YDS long, points kept SECONDS, line width px, max alpha. */
export const TRAIL = { MIN_PASS_YDS: 20, SECONDS: 0.4, WIDTH: 4, ALPHA: 0.6, MAX_GAP_SECONDS: 0.1 } as const;

/** Geometry of the pitch effects (multipliers of the marker radius unless noted). */
export const EFFECT_SHAPE = {
  DASH: 10, DASH_ON: 6, LINE_W: 2, CROSS_W: 3,
  SHOT_RING_INNER: 0.5, SHOT_RING_ALPHA: 0.6,
  NET_BULGE: 0.8, NET_CTRL: 1.6,
  CONFETTI: 12, CONFETTI_R: 2.5, CONFETTI_SPREAD: 0.9, CONFETTI_BASE: 2, CONFETTI_STEP: 0.8, CONFETTI_RINGS: 4, CONFETTI_Y: 1.2, CONFETTI_WHITE_EVERY: 3,
  FOUL_CROSS: 0.6,
  CARD_W: 0.7, CARD_H: 1, CARD_LIFT: 1.8, CARD_TILT: 0.35, CARD_OUTLINE_ALPHA: 0.4,
  OFFSIDE_RING: 1.4,
  TEXT_SHOT: 2.4, TEXT_CARD: 3, TEXT_OFFSIDE: 2.4,
} as const;

/** Effect colours. */
export const EFFECT_COLOR = { HIGHLIGHT: 0xffd34d, WHITE: 0xffffff, RED_CARD: 0xe53935 } as const;

/**
 * Largest move (yards) of a player or the ball in ONE sim step (1/60 s of game) that the renderer still
 * interpolates; anything bigger is a reposition (kickoff, set piece, side switch, substitution) drawn at once.
 * Fastest real moves per step: carry/press up to ~9 yd/s → 0.15 yd; passes and high balls eased at up to
 * 1.5 × 28–30 yd/s → ~0.75 yd; a shot (t × 2/s, smoothstep) peaks at 3 × distance/s → ~1.75 yd from 35 yd,
 * ~2.25 yd from 45 yd. Repositions are tens of yards. 4 leaves room above the longest shot.
 */
export const TELEPORT_YDS = 4;

/** Stadium band around the pitch (spec 2026-10-08-match-visual-design.md). */
export const STADIUM = {
  PITCH_SHRINK: 0.9,
  /** Run-off between the touchline and the stand (officials, technical areas). */
  RUNOFF_YDS: 1.5,
  /** Behind the goals: past the net. */
  END_RUNOFF_YDS: 1,
  SEAT_PX: 5, MAX_SEATS: 6000, CONCRETE_EVERY: 4,
  AWAY_SHARE: 0.12, DEFAULT_FILL: 0.65,
  STAND_COLOR: 0x1f2a36, CONCRETE: 0x2c3946, ROOF_EDGE: 0x445566,
  GOAL_PULSE_S: 0.6,
  /** A stand under works (#137): bare base, scaffolding lines and hazard tape along the pitch. */
  WORKS_BASE: 0x3b3a33, WORKS_SCAFFOLD: 0x6b6a5e, WORKS_TAPE: 0xe0a526, WORKS_TAPE_DARK: 0x1b1b18,
} as const;
