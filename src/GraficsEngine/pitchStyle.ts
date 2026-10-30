import { LED_ADS, type LedLang } from "@/GraficsEngine/ledAds";
/**
 * Visual constants of the live-match pitch (spec 2026-10-06-match-pitch-visual-design.md).
 * Distances in "marker radii" are multiplied by the marker radius (px); heights are in yards.
 */
/** Mowing stripes across the 115-yard length: LIGHT bands over the flat PITCH_COLOR background. */
export const PITCH_STRIPES = { COUNT: 15, LIGHT: 0x10773a } as const;

/**
 * Worn-pitch drawing (spec 2026-10-16-pitch-types §3): base colours by band, patches, the synthetic grass.
 * PITCH_COLOR (the canvas background) stays the pristine base.
 */
export const PITCH_WEAR = {
  BASE_FADED: 0x16652f, BASE_WORN: 0x2c6330, BASE_ROTTEN: 0x4a5a2a,
  LIGHT_FADED: 0x197238,
  YELLOW: 0x7f7a3a, DIRT: 0x7e6236, DIRT_DARK: 0x6b4f2a, MUD: 0x5c4124, MUD_DARK: 0x4e3a20, PUDDLE: 0x7a948a,
  SYNTH_BASE: 0x158a44, SYNTH_LIGHT: 0x1c9a50,
} as const;

/**
 * Match look 4.39 (mock approved 2026-10-28): chalk lines with a soft glow, goals with a net mesh, corner flags,
 * grass grain and a soft centre light, marker volume, name pills, a stamina bar, a heading chevron and a pulsing ring
 * under the ball holder. Sizes in px unless noted ("marker radii" for HOLDER).
 */
export const MATCH_LOOK = {
  /** The ball holder's face beside his name pill, × the marker diameter (4.41.19). */
  HOLDER_FACE: 1.6,
  LINE_W: 1.8, LINE_GLOW_W: 5, LINE_GLOW_ALPHA: 0.16,
  GOAL: { POST_W: 3, MESH_ROWS: 6, MESH_COLS: 4, MESH_ALPHA: 0.3, NET_FILL: 0.06 },
  FLAG: { POLE: 11, W: 7, H: 6, COLOR: 0xf2c230 },
  GRAIN: { SIZE: 128, ALPHA: 0.045 },
  CENTRE_LIGHT: 0.04, EDGE_DARK: 0.1,
  RIM: 0.22,
  PILL: { PAD_X: 5, PAD_Y: 1, STRIP: 3, ALPHA: 0.62, LIFT: 5 },
  /** Stamina bar above the head: gap over the marker and height (px), width in marker radii, corner radius. */
  STAMINA_BAR: { GAP: 3, H: 3, W: 1.8, R: 1.5 },
  CHEVRON: { DIST: 6, SIZE: 4, MIN_PX: 0.35, SMOOTH: 0.15, ALPHA: 0.85 },
  HOLDER: { R: 1.55, PULSE: 0.18, HZ: 1, COLOR: 0xffec96, ALPHA: 0.55 },
} as const;

/** Ground shadow under each marker (offsets/size in marker radii). */
export const MARKER_SHADOW = { DX: 0.25, DY: 0.35, SCALE_Y: 0.8, ALPHA: 0.3 } as const;

/** Soft glow on the ground under the ball holder (radii in marker radii). */
export const HOLDER_GLOW = { RX: 1.7, RY: 1.4, ALPHA: 0.18 } as const;

/** Card badge in the marker's top-right corner (size/position in marker radii). */
export const CARD_BADGE = { X: 0.45, Y: -1.15, W: 0.42, H: 0.58, YELLOW: 0xffd400 } as const;

/** Stamina bar under each marker: width in marker radii, height/gap in px, colours by band. */
/** A substitute walks on from the halfway line, OFF_YDS outside the bench-side touchline, in S seconds (4.41.15). */
export const SUB_WALK = { S: 2.4, OFF_YDS: 3 } as const;

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
  OFFSIDE_RING: 1.4, OFFSIDE_STRIP: 0.16,
  TEXT_SHOT: 2.4, TEXT_CARD: 3, TEXT_OFFSIDE: 2.4,
} as const;

/** Effect colours. */
export const EFFECT_COLOR = { HIGHLIGHT: 0xffd34d, WHITE: 0xffffff, RED_CARD: 0xe53935 } as const;

/**
 * Largest move (yards) between two sim steps (`SIM_STEP`, 0.2 real s) that the drawing interpolates; anything bigger
 * is a reposition (kickoff, set piece, side switch, substitution) drawn at once. Players move at most ~1.5 yd per
 * step (measured p99.9 1.54), repositions are tens of yards.
 */
export const TELEPORT_YDS = 4;

/**
 * Same for the ball: a pass or high ball travels up to ~9 yd per step and a shot up to ~3 × its distance per second
 * (~27 yd from 45 yd). A kickoff reset is ~57 yd.
 */
export const BALL_TELEPORT_YDS = 30;

/**
 * LED boards around the pitch (4.38.21, Winning Eleven style): big framed boards on the apron (4.41.15, `ledBoards`), a made-up ad on each,
 * all flipping every SWITCH_S (a ripple of FLIP_STAGGER_S per panel, FLIP_S each); a goal shows on every panel for GOAL_S.
 */
export const LED = {
  /** Board screen in yards (art preview: 25.6 × 1.6 m), the frame around it. */
  BOARD_YDS: 27.4, SCREEN_YDS: 1.75, GOAL: 0xf2c230,
  SWITCH_S: 9, FLIP_S: 0.3, FLIP_STAGGER_S: 0.03, GOAL_S: 10,
} as const;

/**
 * The LED board housing (4.42, tester report): a vector frame refined by FLUX (`data_process/assets/led`), 1024 × 96,
 * its screen rectangle transparent. Loaded with the new visual.
 */
export const LED_FRAME = { FILE: "led/led-frame.png", W: 1024, H: 96, SCREEN: { x: 12, y: 12, w: 1000, h: 64 } } as const;

/** Where the LED boards stand (centre in pitch yards, rotation): the art preview's layout scaled to the pitch. */
export function ledBoards(): { x: number; y: number; rot: number; len?: number }[] {
  const L = 115, Wd = 74;
  const xs = [12.9, 42.4, 71.8, 101.3].map((x) => (x * L) / 115);
  return [
    ...xs.map((x) => ({ x, y: -5.45, rot: 0 })),
    // Below the bottom touchline: shorter and in the corners, clear of the benches (tester report, 4.41.17).
    { x: 9, y: Wd + 3.25, rot: 0, len: 0.55 }, { x: L - 9, y: Wd + 3.25, rot: 0, len: 0.55 },
    { x: -5.7, y: Wd / 2, rot: -Math.PI / 2 }, { x: L + 5.7, y: Wd / 2, rot: Math.PI / 2 },
  ];
}

/**
 * The ad of a panel in a flip cycle: random per match, cycle and panel, never the same as the panel before it. The text
 * is in `lang`; the pick does not depend on it, so a language switch only translates the boards.
 */
export function ledAdFor(seed: string, cycle: number, panel: number, lang: LedLang): { text: string; bg: number; fg: number } {
  const pick = (k: number) => {
    let h = 2166136261;
    for (const ch of `${seed}:${cycle}:${k}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    return (h >>> 0) % LED_ADS.length;
  };
  let i = pick(panel);
  if (panel > 0 && i === pick(panel - 1)) i = (i + 1) % LED_ADS.length;
  const ad = LED_ADS[i]!;
  return { text: ad.text[lang], bg: ad.bg, fg: ad.fg };
}

/** Stadium band around the pitch (spec 2026-10-08-match-visual-design.md). */
export const STADIUM = {
  /**
   * The art preview's proportions (4.41.15, tester report): an apron between the pitch and the stand, where the LED
   * boards, the photographers and the benches stand. Above the top touchline RUNOFF_YDS; behind each goal line
   * GOAL_NET + END_RUNOFF_YDS; below the bottom touchline BENCH_RUNOFF_YDS (the assistant's lane AR_LANE_YDS, then the
   * benches down to BENCH_END_YDS). The pitch is sized so that every stand keeps at least MIN_STAND_YDS.
   */
  RUNOFF_YDS: 7.9,
  END_RUNOFF_YDS: 6.1,
  BENCH_RUNOFF_YDS: 10.5,
  MIN_STAND_YDS: 5.6,
  AR_LANE_YDS: 1.8,
  BENCH_END_YDS: 7.8,
  /** Technical areas: this far below the bottom touchline. */
  TECH_AREA_YDS: 0.85,
  /**
   * Seats: SEAT_PX wide, ROW_DEPTH seat widths deep (the stand texture shows between the rows, as in the preview).
   * Every BLOCK_SEATS seats along a row share a fill (some blocks fuller than others).
   */
  SEAT_PX: 5, MAX_SEATS: 6000, CONCRETE_EVERY: 4, ROW_DEPTH: 2, BLOCK_SEATS: 16,
  /** The players' tunnel (tester report): mid bottom stand, TUNNEL_FRAC of the inner width, no fans in it. */
  TUNNEL_FRAC: 0.045, TUNNEL_FLOOR: 0x0b0f14, TUNNEL_WALL: 0x4a5664,
  AWAY_SHARE: 0.12, DEFAULT_FILL: 0.65,
  STAND_COLOR: 0x1f2a36, CONCRETE: 0x2c3946, ROOF_EDGE: 0x445566,
  GOAL_PULSE_S: 0.6,
  /** A stand under works (#137): bare base, scaffolding lines and hazard tape along the pitch. */
  WORKS_BASE: 0x3b3a33, WORKS_SCAFFOLD: 0x6b6a5e, WORKS_TAPE: 0xe0a526, WORKS_TAPE_DARK: 0x1b1b18,
} as const;

/**
 * Match light by the time of day and the weather (spec 2026-10-16-match-lighting). Minutes are relative to sunset.
 * Shadow sizes in marker radii; stand shadow depth as a fraction of the pitch width.
 */
export const LIGHTING = {
  GOLDEN_FROM: -90, DUSK_FROM: -30, NIGHT_FROM: 30,
  WARM: { COLOR: 0xffb347, MAX: 0.1 },
  NIGHT: { COLOR: 0x061a33, MAX: 0.38, VIGNETTE: 0.45, FLOOD: 0.22 },
  /**
   * Stadium shadow (4.30, like FM): from the sun's side stand, 30% of the pitch in the afternoon up to 70% at sunset
   * (× the stand's height, at most MAX_SHARE), and from the end stand the sun leans toward (END_DAY → 1 × its reach),
   * cool and see-through (the mowing stays visible). Edges fade over SOFT yards. LIT: the sunlit grass, brighter and
   * yellower. Roof lines and corners come from the stadium (`stadiumSun`).
   */
  STAND: {
    MIN_DEPTH: 0.3, MAX_DEPTH: 0.7, MAX_SHARE: 0.85, ALPHA: 0.42, COLOR: 0x08202a, LEAN: 0.15,
    END_DAY: 0.35, SOFT: 3, LIT: { COLOR: 0xfff0a0, ALPHA: 0.1 },
  },
  /**
   * Real stadium (4.31): a stand's shadow reaches height ÷ tan(sun elevation), less SETBACK metres (the stand stands
   * back from the touchline), at most MAX_REACH × the height; the sun fades out below FADE_ELEVATION degrees. The
   * players' sun shadow grows from LEN (sun at LOW_FROM° or higher) to SUN_SHADOW.LEN_LOW (LOW_TO° or lower).
   */
  REAL: { SETBACK: 6, MAX_REACH: 12, FADE_ELEVATION: 3, LOW_FROM: 35, LOW_TO: 8 },
  /**
   * Vignette and floodlight glow (4.31.4): radial gradient stops [position 0..1, alpha] baked into textures; the
   * glow reaches GLOW_RADIUS × the canvas's longer side from each corner. STRENGTH scales the night's values.
   */
  GRADIENTS: {
    VIGNETTE: [[0, 0], [0.55, 0], [0.8, 0.35], [1, 1]] as [number, number][],
    GLOW: [[0, 1], [0.25, 0.7], [0.55, 0.3], [0.8, 0.08], [1, 0]] as [number, number][],
    VIGNETTE_STRENGTH: 0.7, GLOW_RADIUS: 0.5, GLOW_STRENGTH: 1,
  },
  /** Covered stadium: the lights always on at least FLOOD, the night outside only NIGHT_SCALE as dark. */
  COVERED: { FLOOD: 0.6, NIGHT_SCALE: 0.5 },
  /**
   * Player shadows (4.31.3): soft, dark green, round and under the player. LEN = how far the oval's centre sits from
   * the marker centre toward the shadow's direction (1 = the rim), WIDTH / TIP its radii along / across it.
   */
  SHADOW_COLOR: 0x021a0a,
  CONTACT_SHADOW: { ALPHA: 0.6, ANGLE: 0.95, OFFSET: 0.42, RX: 0.95, RY: 0.75 },
  SUN_SHADOW: { ALPHA: 0.75, LEN: 0.35, LEN_GOLDEN: 0.5, LEN_LOW: 0.55, WIDTH: 1.05, WIDTH_LOW: 1.25, TIP: 0.85, SIDE: 0.5 },
  FLOOD_SHADOW: { ALPHA: 0.35, LEN: 0.3, WIDTH: 0.95, TIP: 0.8 },
  /** Share of the sun shadows kept by each weather; the rest is a grey veil. */
  SUN_BY_WEATHER: { sunny: 1, clear: 1, hot: 1, wind: 1, cold: 0.5, partlyCloudy: 0.5, cloudy: 0, rain: 0, snow: 0 },
  VEIL: { COLOR: 0x6a7a80, BY_WEATHER: { partlyCloudy: 0.05, cloudy: 0.14, rain: 0.2, snow: 0.12, cold: 0.06 } },
} as const;

export { LED_ADS };
