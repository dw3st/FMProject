/**
 * Key of `TacticsSave.lastLineups` (the XI remembered per formation). A ready formation is keyed by its id; a free
 * formation by its shape (`custom:` + every slot's role and position, in slot order), so an XI remembered from one
 * free shape never lands on another whose slots differ (report 4749dd0e: players changed position). Pure.
 */
import { CUSTOM_FORMATION_ID } from "@/Domain/formation/zones";
import type { CustomFormation } from "@/types/tacticsTypes";

/** Signature of a free formation's slots: role@x,y per slot, in slot order. */
export function customShapeSignature(custom: CustomFormation): string {
  return custom.slots.map((s) => `${s.role}@${Math.round(s.x)},${Math.round(s.y)}`).join("|");
}

/** The `lastLineups` key of a formation; null for a free formation without its shape. */
export function lastLineupKey(formation: string, customFormation?: CustomFormation | null): string | null {
  if (formation !== CUSTOM_FORMATION_ID) return formation;
  return customFormation ? `${CUSTOM_FORMATION_ID}:${customShapeSignature(customFormation)}` : null;
}

/** The XI remembered for a formation (and, for a free one, its shape); undefined without one. */
export function lastLineupFor(
  lastLineups: Record<string, string[]> | undefined, formation: string, customFormation?: CustomFormation | null,
): string[] | undefined {
  const key = lastLineupKey(formation, customFormation);
  return key ? lastLineups?.[key] : undefined;
}
