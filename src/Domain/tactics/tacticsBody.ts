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
import { lastLineupKey } from "@/Domain/tactics/lastLineups";
import { isLevel, parseTeamInstructions } from "@/Domain/tactics/teamInstructions";
import { ROTATION_FITNESS_OPTIONS } from "@/Domain/lineupHelpers";
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
  // Team instructions (stage 20): a body object replaces the stored ones whole (`null` / `{}` clears).
  let teamInstructions = existing.teamInstructions;
  if (body.teamInstructions !== undefined) {
    const parsed = parseTeamInstructions(body.teamInstructions);
    if (!parsed.ok) return { ok: false, error: parsed.error };
    teamInstructions = parsed.value;
  }
  let mentality = existing.mentality;
  if (body.mentality !== undefined) {
    const m = body.mentality as unknown;
    if (m !== null && !isLevel(m)) return { ok: false, error: "invalid mentality" };
    mentality = m === null || m === 0 ? undefined : m;
  }
  let rotationFitness = existing.assistantRotationFitness;
  if (body.assistantRotationFitness !== undefined) {
    if (!ROTATION_FITNESS_OPTIONS.includes(body.assistantRotationFitness)) return { ok: false, error: "invalid rotation fitness" };
    rotationFitness = body.assistantRotationFitness;
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

  const lineup = body.lineup ?? existing.lineup;
  // The XI of each formation is remembered (report 2026-11-16); the client never writes this map. A free formation is
  // keyed by its shape (`lastLineupKey`), so another free shape never inherits these slots.
  const memoryKey = lastLineupKey(formationId, customFormation);
  const lastLineups = memoryKey && lineup.some(Boolean)
    ? { ...(existing.lastLineups ?? {}), [memoryKey]: lineup }
    : existing.lastLineups;
  const value: TacticsSave = {
    formation:      formationId,
    tactical_style: body.tactical_style ?? existing.tactical_style,
    lineup,
    assistantRotation: body.assistantRotation ?? existing.assistantRotation ?? false,
    ...(rotationFitness !== undefined ? { assistantRotationFitness: rotationFitness } : {}),
    ...(customFormation ? { customFormation } : {}),
    ...(axesOverride ? { axesOverride } : {}),
    ...(teamInstructions ? { teamInstructions } : {}),
    ...(mentality ? { mentality } : {}),
    ...(setPieceTakers ? { setPieceTakers } : {}),
    ...(slotInstructions.length > 0 ? { slotInstructions } : {}),
    ...(lineupPresets ? { lineupPresets } : {}),
    ...(lastLineups ? { lastLineups } : {}),
  };
  return { ok: true, value, formation };
}
