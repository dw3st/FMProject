/**
 * One validation for a tactics `PUT`, shared by the club's tactics (`/api/saves/:id/tactics`) and the national
 * team's (`/api/saves/:saveId/national/coach/tactics`): a partial body is merged over the stored tactics, every
 * part checked by its own parser. Pure.
 */
import { formationForTactics } from "@/Domain/matchFormations";
import { CUSTOM_FORMATION_ID, parseAxesOverride, parseCustomFormation } from "@/Domain/formation/zones";
import { parseSetPieceTakers } from "@/Domain/tactics/setPieceTakers";
import { parseSlotInstructions, sanitizeSlotInstructions } from "@/Domain/tactics/slotInstructions";
import { parseLineupPresets } from "@/Domain/tactics/lineupPresets";
import type { Formation } from "@/GameEngine/types";
import type { TacticsSave } from "@/types/tacticsTypes";

export type TacticsBodyResult =
  | { ok: true; value: TacticsSave; /** The formation the saved tactics play. */ formation: Formation }
  | { ok: false; error: string };

/** `existing` with the fields of `body` on top; the first invalid part stops it with its error text. */
export function mergeTacticsBody(existing: TacticsSave, body: Partial<TacticsSave>): TacticsBodyResult {
  let customFormation = existing.customFormation;
  if (body.customFormation !== undefined) {
    const parsed = parseCustomFormation(body.customFormation);
    if (!parsed) return { ok: false, error: "invalid custom formation" };
    customFormation = parsed;
  }
  let axesOverride = existing.axesOverride;
  if (body.axesOverride !== undefined) {
    const parsed = parseAxesOverride(body.axesOverride);
    if (!parsed) return { ok: false, error: "invalid axes override" };
    axesOverride = Object.keys(parsed).length ? parsed : undefined;
  }
  let setPieceTakers = existing.setPieceTakers;
  if (body.setPieceTakers !== undefined) {
    const parsed = parseSetPieceTakers(body.setPieceTakers);
    if (!parsed) return { ok: false, error: "invalid set-piece takers" };
    setPieceTakers = Object.keys(parsed).length ? parsed : undefined;
  }
  const formationId = body.formation ?? existing.formation;
  if (formationId === CUSTOM_FORMATION_ID && !customFormation) {
    return { ok: false, error: "custom formation missing" };
  }
  // Player instructions are per slot of the formation being saved: a body list is validated
  // against it (an unknown / misfit variant is an error), a kept list is sanitized (formation change).
  const formation = formationForTactics({ formation: formationId, customFormation });
  let slotInstructions = sanitizeSlotInstructions(formation, existing.slotInstructions);
  if (body.slotInstructions !== undefined) {
    const parsed = parseSlotInstructions(body.slotInstructions, formation);
    if (!parsed.ok) return { ok: false, error: parsed.error };
    slotInstructions = parsed.value;
  }
  // Saved lineups (#84): validated whole (each preset against its own formation); never played.
  let lineupPresets = existing.lineupPresets;
  if (body.lineupPresets !== undefined) {
    const parsed = parseLineupPresets(body.lineupPresets);
    if (!parsed.ok) return { ok: false, error: parsed.error };
    lineupPresets = Object.keys(parsed.value).length ? parsed.value : undefined;
  }

  const value: TacticsSave = {
    formation:      formationId,
    tactical_style: body.tactical_style ?? existing.tactical_style,
    lineup:         body.lineup         ?? existing.lineup,
    assistantRotation: body.assistantRotation ?? existing.assistantRotation ?? false,
    ...(customFormation ? { customFormation } : {}),
    ...(axesOverride ? { axesOverride } : {}),
    ...(setPieceTakers ? { setPieceTakers } : {}),
    ...(slotInstructions.length > 0 ? { slotInstructions } : {}),
    ...(lineupPresets ? { lineupPresets } : {}),
  };
  return { ok: true, value, formation };
}
