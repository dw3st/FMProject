/**
 * Tactical styles (user-facing) + internal axis mapping.
 *
 * Players pick one of five predefined styles. Each style maps to a fixed
 * combination of internal axes (pressing_style, defensive_line, width, build_up)
 * via `STYLE_TO_AXES`. Illogical combinations are impossible by construction.
 *
 * Engine consumers (DefenseConfig, AttackConfig, PassLanes, DefensivePositioning,
 * OffBallMovement, DefensiveIntentConfig) keep operating on the axis types —
 * they are converted from the style at apply time.
 */

// ── Internal axis types (consumed by engine configs) ─────────────────────────

/** When the team starts applying pressure. */
export type PressingStyle = "low_block" | "mid_block" | "high_press";

/** Vertical position of the defensive block. */
export type DefensiveLine = "deep" | "normal" | "high";

/** Horizontal compactness of the team. */
export type TeamWidth = "narrow" | "normal" | "wide";

/** How the team progresses the ball. */
export type BuildUpStyle = "direct" | "balanced" | "possession";

/** Internal axis bundle — produced from a TacticalStyle, consumed by engine configs. */
export interface TacticalAxes {
  pressing_style: PressingStyle;
  defensive_line: DefensiveLine;
  width: TeamWidth;
  build_up: BuildUpStyle;
}

// ── User-facing tactical style ────────────────────────────────────────────────

export type TacticalStyle =
  | "counter_attack"
  | "high_press"
  | "possession"
  | "direct_play"
  | "balanced";

export interface TacticalStyleMeta {
  value: TacticalStyle;
  label: string;
  description: string;
  strengths: string[];
  weaknesses: string[];
}

export const TACTICAL_STYLE_OPTIONS: TacticalStyleMeta[] = [
  {
    value: "counter_attack",
    label: "Counter Attack",
    description:
      "Sit deep, absorb pressure, and break forward quickly the moment possession is won.",
    strengths: ["Defensive solidity", "Dangerous on the break", "Low error risk"],
    weaknesses: ["Low possession", "Cedes territory", "Needs pace up front"],
  },
  {
    value: "high_press",
    label: "High Press",
    description:
      "Hunt the ball high up the pitch. Win possession close to the opponent's goal.",
    strengths: ["Wins ball in dangerous areas", "Disrupts build-up"],
    weaknesses: ["Exposed to long balls", "Stamina intensive", "Risky defensive line"],
  },
  {
    value: "possession",
    label: "Possession",
    description:
      "Keep the ball, pass patiently, and probe for openings. Tight, narrow positional play.",
    strengths: ["Ball retention", "Controls tempo", "Low-risk passing"],
    weaknesses: ["Slow to create", "Vulnerable to counters when turnovers happen"],
  },
  {
    value: "direct_play",
    label: "Direct Play",
    description:
      "Move the ball forward quickly with long passes and wide attacks. Stretch the opposition.",
    strengths: ["Fast transitions", "Exploits wide areas", "Hard to press"],
    weaknesses: ["Lower pass completion", "Can isolate striker", "Concedes midfield"],
  },
  {
    value: "balanced",
    label: "Balanced",
    description:
      "No extreme. Solid defensive shape, measured build-up, steady attacking width.",
    strengths: ["Few obvious weaknesses", "Adapts to any opponent"],
    weaknesses: ["No standout phase", "Rarely dominates any area"],
  },
];

/**
 * Returns translated meta for a tactical style. Used by the UI; the constant array
 * above is the English source of truth and the fallback when keys are missing.
 */
export function getTacticalStyleMeta(
  style: TacticalStyle,
  t: (key: string, opts?: Record<string, unknown>) => string | string[],
): TacticalStyleMeta {
  const fallback = TACTICAL_STYLE_OPTIONS.find((s) => s.value === style)!;
  const label = t(`tactics.styles.${style}.label`) as string;
  const description = t(`tactics.styles.${style}.description`) as string;
  const strengths = t(`tactics.styles.${style}.strengths`, { returnObjects: true }) as string[] | string;
  const weaknesses = t(`tactics.styles.${style}.weaknesses`, { returnObjects: true }) as string[] | string;
  return {
    value: style,
    label: typeof label === "string" && label !== `tactics.styles.${style}.label` ? label : fallback.label,
    description: typeof description === "string" && description !== `tactics.styles.${style}.description` ? description : fallback.description,
    strengths: Array.isArray(strengths) ? strengths : fallback.strengths,
    weaknesses: Array.isArray(weaknesses) ? weaknesses : fallback.weaknesses,
  };
}

/**
 * Internal mapping from a tactical style to its axis bundle.
 * Consumed by `applyTeamTacticsConfig` / `applyTeamAttackConfig`.
 */
export const STYLE_TO_AXES: Record<TacticalStyle, TacticalAxes> = {
  counter_attack: { pressing_style: "low_block",  defensive_line: "deep",   width: "narrow", build_up: "direct"     },
  high_press:     { pressing_style: "high_press", defensive_line: "high",   width: "normal", build_up: "direct"     },
  possession:     { pressing_style: "mid_block",  defensive_line: "high",   width: "narrow", build_up: "possession" },
  direct_play:    { pressing_style: "mid_block",  defensive_line: "normal", width: "wide",   build_up: "direct"     },
  balanced:       { pressing_style: "mid_block",  defensive_line: "normal", width: "normal", build_up: "balanced"   },
};

/** Returns the axis bundle for a given tactical style. */
export function axesFor(style: TacticalStyle): TacticalAxes {
  return STYLE_TO_AXES[style];
}

/** The style's axis bundle with the user's per-axis edits on top. */
export function effectiveAxes(style: TacticalStyle, override?: Partial<TacticalAxes>): TacticalAxes {
  return { ...axesFor(style), ...definedAxes(override) };
}

function definedAxes(o?: Partial<TacticalAxes>): Partial<TacticalAxes> {
  const out: Partial<TacticalAxes> = {};
  if (!o) return out;
  if (o.pressing_style) out.pressing_style = o.pressing_style;
  if (o.defensive_line) out.defensive_line = o.defensive_line;
  if (o.width) out.width = o.width;
  if (o.build_up) out.build_up = o.build_up;
  return out;
}

/** True when `override` actually changes at least one axis of the style's bundle. */
export function hasAxesOverride(style: TacticalStyle, override?: Partial<TacticalAxes>): boolean {
  const base = axesFor(style);
  const eff = effectiveAxes(style, override);
  return (Object.keys(base) as (keyof TacticalAxes)[]).some((k) => base[k] !== eff[k]);
}

// ── Live match mentality ────────────────────────────────────────────────────
//
// Mentality is a temporary, unsaved shift applied on top of a team's chosen
// TacticalStyle during a live match (see MatchScreen / TestScreen). The style
// stays the reference for team-intent detection (`IntentDetection` reads the
// style, never the mentality) — mentality only nudges the derived axes.

export type Mentality = "attacking" | "balanced" | "defensive";

export const DEFAULT_MENTALITY: Mentality = "balanced";

export const MENTALITY_OPTIONS: Mentality[] = ["attacking", "balanced", "defensive"];

const PRESSING_STEPS: PressingStyle[] = ["low_block", "mid_block", "high_press"];
const DEFENSIVE_LINE_STEPS: DefensiveLine[] = ["deep", "normal", "high"];

/** Moves `value` `delta` steps along `steps`, clamped (saturating) at both ends. */
function step<T>(steps: T[], value: T, delta: number): T {
  const i = steps.indexOf(value);
  const next = Math.max(0, Math.min(steps.length - 1, i + delta));
  return steps[next]!;
}

/**
 * Applies a live-match mentality shift on top of a style's base axes.
 *
 * - `balanced`   → `axesFor(style)`, unchanged.
 * - `attacking`  → pressing_style and defensive_line each step up one notch
 *                  (saturating at high_press / high), width forced wide,
 *                  build_up forced direct.
 * - `defensive`  → pressing_style and defensive_line each step down one notch
 *                  (saturating at low_block / deep), width forced narrow,
 *                  build_up unchanged.
 *
 * Pure function — does not mutate any per-team config.
 */
export function axesWithMentality(
  style: TacticalStyle,
  mentality: Mentality,
  override?: Partial<TacticalAxes>,
): TacticalAxes {
  const base = effectiveAxes(style, override);
  if (mentality === "balanced") return base;
  if (mentality === "attacking") {
    return {
      pressing_style: step(PRESSING_STEPS, base.pressing_style, 1),
      defensive_line: step(DEFENSIVE_LINE_STEPS, base.defensive_line, 1),
      width: "wide",
      build_up: "direct",
    };
  }
  // defensive
  return {
    pressing_style: step(PRESSING_STEPS, base.pressing_style, -1),
    defensive_line: step(DEFENSIVE_LINE_STEPS, base.defensive_line, -1),
    width: "narrow",
    build_up: base.build_up,
  };
}

// ── Free formation ───────────────────────────────────────────────────────────

/** One slot of a custom formation: zone centre (yards, Team A frame) + the role the zone implies. */
export interface CustomFormationSlot {
  x: number;
  y: number;
  role: string;
}

export interface CustomFormation {
  slots: CustomFormationSlot[];
}

// ── Save shape ────────────────────────────────────────────────────────────────

/** Full tactics save: style + formation + explicit starting lineup (playerIds in slot order). */
export interface TacticsSave {
  tactical_style: TacticalStyle;
  /** Ready-made formation id, or "custom" when `customFormation` is active. */
  formation: string;
  /** Free formation (zone grid). Slot order = lineup order. Active when `formation === "custom"`. */
  customFormation?: CustomFormation;
  /** Axes edited on top of the style's bundle ("Personalizado (base X)"). */
  axesOverride?: Partial<TacticalAxes>;
  /** Ordered player IDs — index maps to formation slot index. May be shorter than 11 if not fully set. */
  lineup: string[];
  /** When true the assistant rests tired starters automatically (default false). */
  assistantRotation?: boolean;
  /** Set-piece takers (player ids); a missing duty = automatic (`set-pieces-play.md` §4). */
  setPieceTakers?: SetPieceTakersSave;
  /**
   * Per-slot player instructions (role variant + individual pressing), index = slot (same as
   * `lineup`); `null`/absent = default (`.claude/rules/game/player-instructions.md`).
   */
  slotInstructions?: (SlotInstruction | null)[];
  /**
   * Saved lineups of the formation screen (#84): up to 3 slots (A, B, C). Kept on the save only;
   * a match never reads them — "Usar" copies one into `formation` / `lineup` / `slotInstructions`.
   */
  lineupPresets?: LineupPresets;
}

// ── Saved lineups (#84) ──────────────────────────────────────────────────────

export type LineupPresetKey = "A" | "B" | "C";

/** One saved lineup: formation (free formation included), XI in slot order and slot instructions. */
export interface LineupPreset {
  formation: string;
  customFormation?: CustomFormation;
  lineup: string[];
  slotInstructions?: (SlotInstruction | null)[];
  /** Game date when it was saved (YYYY-MM-DD). */
  savedOn: string;
}

export type LineupPresets = Partial<Record<LineupPresetKey, LineupPreset>>;

// ── Player instructions (Etapa 27) ───────────────────────────────────────────

/** Role variants (`src/GameEngine/Configs/RoleVariantConfig.ts` → `ROLE_VARIANTS`). */
export type RoleVariantId =
  | "fb_overlap" | "fb_hold" | "fb_inverted"
  | "wb_attack" | "wb_defend"
  | "cb_stopper" | "cb_cover" | "cb_ball"
  | "dm_anchor" | "dm_box"
  | "cm_link" | "cm_box"
  | "am_link" | "am_shadow"
  | "wm_inside"
  | "w_inside"
  | "st_poacher" | "st_target";

/** Individual pressing of a slot. */
export type PressLevel = "less" | "normal" | "more";

/** Instruction of one formation slot; absent fields = default. */
export interface SlotInstruction {
  variant?: RoleVariantId;
  press?: PressLevel;
}

/** One man-marking pair of a match: the user's slot marks an opponent (roster id). */
export interface MatchMark {
  slot: number;
  targetId: string;
}

/** Man-marking chosen for one match day (`SaveMeta.matchMarking`). At most 2 pairs. */
export interface MatchMarking {
  date: string;
  marks: MatchMark[];
}

/** Manager's set-piece takers per duty: up to 3 player ids in order of preference. Absent duty = automatic. */
export interface SetPieceTakersSave {
  corners?:   string[];
  freeKicks?: string[];
  penalties?: string[];
}

export const DEFAULT_TACTICAL_STYLE: TacticalStyle = "balanced";
