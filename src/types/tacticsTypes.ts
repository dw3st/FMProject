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

// ── Save shape ────────────────────────────────────────────────────────────────

/** Full tactics save: style + formation + explicit starting lineup (playerIds in slot order). */
export interface TacticsSave {
  tactical_style: TacticalStyle;
  formation: string;
  /** Ordered player IDs — index maps to formation slot index. May be shorter than 11 if not fully set. */
  lineup: string[];
}

export const DEFAULT_TACTICAL_STYLE: TacticalStyle = "balanced";
