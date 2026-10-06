import type { Formation } from "@/GameEngine/types";
import type { MatchMark, PressLevel, SlotInstruction } from "@/types/tacticsTypes";
import { effectiveInstruction, isRoleVariantId, variantFitsRole } from "@/GameEngine/Configs/RoleVariantConfig";

const PRESS_LEVELS: readonly PressLevel[] = ["less", "normal", "more"];

/** Maximum man-marking pairs of a match (`.claude/rules/game/player-instructions.md`). */
const MAX_MATCH_MARKS = 2;

/**
 * Validates a `TacticsSave.slotInstructions` body against the formation it will play in: an array
 * (index = slot) of `null` or `{ variant?, press? }`. An unknown variant or one the slot's role does
 * not accept is an error (400). Returns the cleaned list (default entries become `null`, trailing
 * `null`s dropped; empty = no instructions) or an error code.
 */
export function parseSlotInstructions(
  raw: unknown,
  formation: Formation,
): { ok: true; value: (SlotInstruction | null)[] } | { ok: false; error: string } {
  if (raw === null) return { ok: true, value: [] };
  if (!Array.isArray(raw)) return { ok: false, error: "invalid slot instructions" };
  if (raw.length > formation.attacking.length) return { ok: false, error: "too many slot instructions" };
  const out: (SlotInstruction | null)[] = [];
  for (let i = 0; i < raw.length; i++) {
    const entry = raw[i] as unknown;
    if (entry === null || entry === undefined) { out.push(null); continue; }
    if (typeof entry !== "object" || Array.isArray(entry)) return { ok: false, error: "invalid slot instruction" };
    const src = entry as Record<string, unknown>;
    for (const key of Object.keys(src)) {
      if (key !== "variant" && key !== "press") return { ok: false, error: "invalid slot instruction" };
    }
    const role = formation.attacking[i]!.role;
    const instr: SlotInstruction = {};
    if (src.variant !== undefined && src.variant !== null && src.variant !== "") {
      if (!isRoleVariantId(src.variant)) return { ok: false, error: "unknown role variant" };
      if (!variantFitsRole(src.variant, role)) return { ok: false, error: "role variant does not fit the slot" };
      instr.variant = src.variant;
    }
    if (src.press !== undefined && src.press !== null) {
      if (typeof src.press !== "string" || !PRESS_LEVELS.includes(src.press as PressLevel)) {
        return { ok: false, error: "invalid press level" };
      }
      if (role === "GK" && src.press !== "normal") return { ok: false, error: "goalkeeper takes no pressing" };
      if (src.press !== "normal") instr.press = src.press as PressLevel;
    }
    out.push(instr.variant || instr.press ? instr : null);
  }
  while (out.length > 0 && out[out.length - 1] === null) out.pop();
  return { ok: true, value: out };
}

/**
 * Instructions after a formation change: a variant the new slot's role does not accept falls back
 * to the default (the pressing stays). Default entries become `null`; trailing `null`s dropped.
 */
export function sanitizeSlotInstructions(
  formation: Formation,
  instructions: (SlotInstruction | null)[] | undefined,
): (SlotInstruction | null)[] {
  if (!instructions) return [];
  const out = formation.attacking.map((slot, i) => effectiveInstruction(slot.role, instructions[i]) ?? null);
  while (out.length > 0 && out[out.length - 1] === null) out.pop();
  return out;
}

/**
 * Validates a match-marking body: at most `MAX_MATCH_MARKS` pairs of an outfield slot of the user's
 * formation and an outfield opponent (by roster id, from `opponentIds` / `opponentGoalkeepers`), one
 * slot and one target per pair. Returns the pairs or an error code.
 */
export function parseMatchMarks(
  raw: unknown,
  formation: Formation,
  opponentIds: ReadonlySet<string>,
  opponentGoalkeepers: ReadonlySet<string>,
): { ok: true; value: MatchMark[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) return { ok: false, error: "invalid marks" };
  if (raw.length > MAX_MATCH_MARKS) return { ok: false, error: "too many marks" };
  const out: MatchMark[] = [];
  for (const entry of raw as unknown[]) {
    if (!entry || typeof entry !== "object") return { ok: false, error: "invalid marks" };
    const { slot, targetId } = entry as { slot?: unknown; targetId?: unknown };
    if (typeof slot !== "number" || !Number.isInteger(slot) || slot < 0 || slot >= formation.attacking.length) {
      return { ok: false, error: "invalid marker slot" };
    }
    if (formation.attacking[slot]!.role === "GK") return { ok: false, error: "goalkeeper cannot mark" };
    if (typeof targetId !== "string" || !opponentIds.has(targetId)) return { ok: false, error: "target not in the opponent squad" };
    if (opponentGoalkeepers.has(targetId)) return { ok: false, error: "cannot mark the goalkeeper" };
    if (out.some(m => m.slot === slot || m.targetId === targetId)) return { ok: false, error: "duplicate mark" };
    out.push({ slot, targetId });
  }
  return { ok: true, value: out };
}
