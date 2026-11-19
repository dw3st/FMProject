/**
 * FM-style expected goals (stage 6, `.claude/rules/game-engine/xg.md`): one logistic regression per shot model over
 * seven geometric features. No player attribute enters the xG (finisher and keeper act in the resolution).
 *
 * xG = 1 / (1 + e^−(b + Σ cᵢ·fᵢ)), coefficients and intercepts stored ×1e7 like the source tables.
 */

/** The seven features, in this order everywhere. */
export const XG_FEATURES = [
  'distance',     // clamp(1 − d/60 m, 0, 1): 1 on the goal line
  'occluding',    // max over blockers in the shooter–posts triangle of clamp(1 − r/d, 0, 1)²
  'between',      // players in the triangle / 22 (keeper included)
  'angleLocation',// max(0, 90° − angle off the straight-on axis) / 90
  'angleFacing',  // (180° − angle between the body and the goal) / 180
  'height',       // ball height / 3 m, clamped
  'fraction',     // fraction of the goal mouth visible
] as const;
export type XgFeature = typeof XG_FEATURES[number];

export type XgModelName =
  | 'regular' | 'open_goal_regular' | 'obscured_regular'
  | 'volleys' | 'open_goal_volleys' | 'obscured_volleys'
  | 'headers' | 'open_goal_headers' | 'obscured_headers'
  | 'free_kicks' | 'penalties';

interface RawModel { b: number; c: Record<XgFeature, number> }

const m = (b: number, distance: number, occluding: number, between: number, angleLocation: number,
  angleFacing: number, height: number, fraction: number): RawModel =>
  ({ b, c: { distance, occluding, between, angleLocation, angleFacing, height, fraction } });

/** Coefficients ×1e7 (b, distance, occluding, between, angleLocation, angleFacing, height, fraction). */
const RAW: Record<XgModelName, RawModel> = {
  regular:           m(-109144575, 120869961, -22517725,  -75070643,  29203930,  12997032,         0, -39119932),
  open_goal_regular: m( -98877051,  76596527, -21492408, -119723732,   5204847,  10332743,         0,  33465927),
  obscured_regular:  m(-133337967, 136312914,   -536197, -143024285,  24829961,   6553069,         0,  10693399),
  volleys:           m( -93893671, 107429408, -20343862,  -69734498,  23726126,   8611787, -17538503, -31227516),
  open_goal_volleys: m(-102249599,  80833250, -25796017,  -40947090,    478778,   8781681,   3203674,  34188042),
  obscured_volleys:  m( -92865007, 100495158, -10279064,  -81878226,  18910125,  -1977142, -16510938,   8663226),
  headers:           m(-253328942, 271967052,  -3537157,  -42132922,   7777856,   8437774,  -4772019,  -2495442),
  open_goal_headers: m(-121563668, 131707897, -12450267,  -52728652,  -8988128,  13237777,  -9340369,  11873247),
  obscured_headers:  m(-277576122, 303450175,   -149171,  -50391747,   6633004,  -4424207,   3380852,   -657899),
  free_kicks:        m( -61436926,  62036084, -47614181,   25870020,  -2971294,  11896275,         0,         0),
  penalties:         m(  15629492,          0,        31,          0,         0,          0,         0,         0),
};

const SCALE = 1e7;

export interface XgModel { b: number; c: Readonly<Record<XgFeature, number>> }

/** The models with the ×1e7 scale applied. */
export const XG_MODELS: Readonly<Record<XgModelName, XgModel>> = Object.fromEntries(
  (Object.keys(RAW) as XgModelName[]).map(k => [k, {
    b: RAW[k].b / SCALE,
    c: Object.fromEntries(XG_FEATURES.map(f => [f, RAW[k].c[f] / SCALE])) as Record<XgFeature, number>,
  }]),
) as Record<XgModelName, XgModel>;

export const XG_CONFIG = {
  /** Distance feature: 0 at this many metres from the goal centre. */
  DIST_M: 60,
  /** Half the goal width (m); the goal is 8 yd = 7.32 m. */
  HALF_GOAL_M: 3.66,
  /** Ball height feature: z / HEIGHT_M, z clamped to [0, HEIGHT_M]. */
  HEIGHT_M: 3,
  /** Players counted in "between" are divided by this. */
  BETWEEN_DIV: 22,
  /** Barycentric tolerance of the shooter–posts triangle test. */
  TRIANGLE_TOL: 0.0005,
  /** Shooter's view cone: ± this many degrees around the goal-centre bearing (the "available" goal width). */
  VIEW_CONE_DEG: 45,
  /** A blocker covers a segment this wide (m) across the shot line; the keeper this wide (inferred as the keeper flag). */
  BLOCKER_WIDTH_M: 0.667,
  KEEPER_WIDTH_M: 2.0,
  /** Model by visible fraction: above OPEN → open goal, below OBSCURED → obscured, else the regular model. */
  OPEN_FRACTION: 0.7,
  OBSCURED_FRACTION: 0.15,
  /** A ground shot whose ball is at least this high (m) at contact is a volley. */
  VOLLEY_HEIGHT_M: 0.2,
  /**
   * Ball height of a header until the 3D ball (stage 3) gives the real one. A placeholder input, not a calibration:
   * the header models' height coefficient is small (−0.48 / −0.93 per 3 m).
   */
  HEADER_HEIGHT_M: 2.0,
  /** Shot-quality flags: chance at xG ≥ CHANCE, clear-cut chance at xG ≥ CLEAR_CHANCE. */
  CHANCE: 0.15,
  CLEAR_CHANCE: 0.30,
} as const;
