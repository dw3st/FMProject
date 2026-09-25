import { TACTICAL_STYLE_OPTIONS, DEFAULT_MENTALITY } from "@/types/tacticsTypes";
import type { TacticalStyle, Mentality } from "@/types/tacticsTypes";
import type { Variant } from "@/lab/types";

export function tacticLabel(style: TacticalStyle): string {
  return TACTICAL_STYLE_OPTIONS.find((o) => o.value === style)?.label ?? style;
}

const MENTALITY_LABEL: Record<Mentality, string> = {
  attacking: "Attacking",
  balanced:  "Balanced",
  defensive: "Defensive",
};

/**
 * Auto-label for a single variant: "4-3-3 · High Press", or
 * "4-3-3 · High Press · Attacking" when mentality is set and not "balanced"
 * (balanced is the no-op default and stays implicit in the label).
 */
export function generateVariantLabel(
  formation: string,
  style: TacticalStyle,
  mentality?: Mentality,
): string {
  const base = `${formation} · ${tacticLabel(style)}`;
  if (!mentality || mentality === DEFAULT_MENTALITY) return base;
  return `${base} · ${MENTALITY_LABEL[mentality]}`;
}

/** Auto-name for the whole scenario based on its variant pool. */
export function generateScenarioName(variants: Variant[]): string {
  if (variants.length === 0) return "Untitled";

  const formations = [...new Set(variants.map((v) => v.formation))];
  const tactics    = [...new Set(variants.map((v) => v.tacticalStyle))];

  if (formations.length === 1 && tactics.length === 1) {
    return generateVariantLabel(formations[0]!, tactics[0]! as TacticalStyle);
  }
  if (formations.length === 1) {
    return `${formations[0]} — ${tactics.length} tactics`;
  }
  if (tactics.length === 1) {
    return `${formations.length} formations — ${tacticLabel(tactics[0]! as TacticalStyle)}`;
  }
  return `${formations.length} formations × ${tactics.length} tactics`;
}
