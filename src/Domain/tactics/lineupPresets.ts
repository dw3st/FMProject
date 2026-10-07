import type { RosterPlayer } from "@/types/playerTypes";
import type {
  CustomFormation,
  LineupPreset,
  LineupPresetKey,
  LineupPresets,
  SlotInstruction,
} from "@/types/tacticsTypes";
import { getFormationSlots } from "@/types/formationSlots";
import type { FormationShape } from "@/types/formationSlots";
import { CUSTOM_FORMATION_ID, parseCustomFormation } from "@/Domain/formation/zones";
import { FORMATION_IDS, formationForTactics } from "@/Domain/matchFormations";
import { parseSlotInstructions, sanitizeSlotInstructions } from "@/Domain/tactics/slotInstructions";
import { replaceUnavailableStarters } from "@/Domain/lineupHelpers";
import { isInjured } from "@/Domain/injury/injury";
import { isUnavailable } from "@/Domain/discipline/discipline";
import { getMainRole } from "@/Domain/roles";
import { slotValue } from "@/Domain/positions/positionAptitude";

/** The saved-lineup slots of the formation screen (#84). */
export const LINEUP_PRESET_KEYS: readonly LineupPresetKey[] = ["A", "B", "C"];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** What the formation screen holds when the manager saves a preset. */
export interface LineupPresetSource {
  formation: string;
  customFormation?: CustomFormation | null;
  lineup: string[];
  slotInstructions?: (SlotInstruction | null)[];
}

/**
 * Builds a preset from the screen state: the formation (the free formation when active), the XI
 * (padded / cut to 11) and the per-slot instructions sanitized for that formation.
 */
export function buildLineupPreset(source: LineupPresetSource, savedOn: string): LineupPreset {
  const custom = source.formation === CUSTOM_FORMATION_ID ? source.customFormation ?? undefined : undefined;
  const formation = formationForTactics({ formation: source.formation, customFormation: custom });
  const lineup = source.lineup.slice(0, 11).map((id) => id ?? "");
  while (lineup.length < 11) lineup.push("");
  const slotInstructions = sanitizeSlotInstructions(formation, source.slotInstructions);
  return {
    formation: source.formation,
    ...(custom ? { customFormation: custom } : {}),
    lineup,
    ...(slotInstructions.length > 0 ? { slotInstructions } : {}),
    savedOn,
  };
}

/**
 * Validates `TacticsSave.lineupPresets` from a PUT body: an object keyed by A/B/C, each entry a
 * preset or `null` (= empty slot). The formation must be a ready-made id or "custom" with a valid
 * free formation; the lineup up to 11 player ids (strings, "" = empty); the instructions are checked
 * against the preset's own formation. `null` clears every preset.
 */
export function parseLineupPresets(raw: unknown): { ok: true; value: LineupPresets } | { ok: false; error: string } {
  if (raw === null) return { ok: true, value: {} };
  if (typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "invalid lineup presets" };
  const out: LineupPresets = {};
  for (const [key, entry] of Object.entries(raw as Record<string, unknown>)) {
    if (!LINEUP_PRESET_KEYS.includes(key as LineupPresetKey)) return { ok: false, error: "unknown lineup preset slot" };
    if (entry === null || entry === undefined) continue;
    const parsed = parsePreset(entry);
    if (!parsed.ok) return parsed;
    out[key as LineupPresetKey] = parsed.value;
  }
  return { ok: true, value: out };
}

function parsePreset(raw: unknown): { ok: true; value: LineupPreset } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "invalid lineup preset" };
  const src = raw as Record<string, unknown>;
  for (const key of Object.keys(src)) {
    if (!["formation", "customFormation", "lineup", "slotInstructions", "savedOn"].includes(key)) {
      return { ok: false, error: "invalid lineup preset" };
    }
  }
  const { formation, lineup, savedOn } = src;
  if (typeof formation !== "string") return { ok: false, error: "invalid preset formation" };
  let customFormation: CustomFormation | undefined;
  if (formation === CUSTOM_FORMATION_ID) {
    const parsed = parseCustomFormation(src.customFormation);
    if (!parsed) return { ok: false, error: "invalid preset custom formation" };
    customFormation = parsed;
  } else if (!FORMATION_IDS.includes(formation)) {
    return { ok: false, error: "unknown preset formation" };
  }
  if (!Array.isArray(lineup) || lineup.length > 11 || lineup.some((id) => typeof id !== "string" || id.length > 64)) {
    return { ok: false, error: "invalid preset lineup" };
  }
  const ids = (lineup as string[]).filter(Boolean);
  if (new Set(ids).size !== ids.length) return { ok: false, error: "duplicate player in preset" };
  if (typeof savedOn !== "string" || !ISO_DATE.test(savedOn)) return { ok: false, error: "invalid preset date" };
  const playFormation = formationForTactics({ formation, customFormation });
  let slotInstructions: (SlotInstruction | null)[] = [];
  if (src.slotInstructions !== undefined) {
    const parsed = parseSlotInstructions(src.slotInstructions, playFormation);
    if (!parsed.ok) return parsed;
    slotInstructions = parsed.value;
  }
  return {
    ok: true,
    value: {
      formation,
      ...(customFormation ? { customFormation } : {}),
      lineup: [...(lineup as string[])],
      ...(slotInstructions.length > 0 ? { slotInstructions } : {}),
      savedOn,
    },
  };
}

/** One starter of a preset swapped on use. */
export interface PresetReplacement {
  /** Saved player id (may no longer be in the squad when `reason === "left"`). */
  out: string;
  /** Replacement id; "" when nobody was available. */
  in: string;
  slot: number;
  reason: "injured" | "suspended" | "left";
}

/** Result of using a preset: everything the tactics save takes, plus the swaps made. */
export interface AppliedLineupPreset {
  formation: string;
  customFormation?: CustomFormation;
  lineup: string[];
  slotInstructions: (SlotInstruction | null)[];
  replaced: PresetReplacement[];
}

/**
 * Applies a preset to today's squad: a saved player who left the squad is replaced by the best
 * available player of the slot's line (by `slotValue`, any available player as a fallback), and an
 * injured or suspended one by `replaceUnavailableStarters` (the same rule the saved lineup follows
 * on match day).
 */
export function applyLineupPreset(preset: LineupPreset, players: RosterPlayer[], date: string): AppliedLineupPreset {
  const formation = formationForTactics(preset);
  const slots = getFormationSlots(formation as unknown as FormationShape);
  const inSquad = new Set(players.map((p) => p.id));
  const lineup = slots.map((_, i) => preset.lineup[i] ?? "");
  const replaced: PresetReplacement[] = [];

  // 1. Players who left the squad (or empty slots of the preset).
  const used = new Set(lineup.filter((id) => id && inSquad.has(id)));
  for (let i = 0; i < slots.length; i++) {
    const id = lineup[i]!;
    if (id && inSquad.has(id)) continue;
    const role = slots[i]!.role;
    const available = players.filter((p) => !used.has(p.id) && !isUnavailable(p, date));
    const sameLine = available.filter((p) => p.positions.includes(role) || getMainRole(p.positions[0] ?? "CM") === getMainRole(role));
    const pool = sameLine.length > 0 ? sameLine : available;
    const pick = [...pool].sort((a, b) => slotValue(b, role) - slotValue(a, role))[0];
    lineup[i] = pick?.id ?? "";
    if (pick) used.add(pick.id);
    if (id) replaced.push({ out: id, in: pick?.id ?? "", slot: i, reason: "left" });
  }

  // 2. Injured or suspended starters.
  const byId = new Map(players.map((p) => [p.id, p]));
  const swapped = replaceUnavailableStarters(slots, lineup, players, date);
  for (const r of swapped.replaced) {
    const slot = lineup.indexOf(r.out);
    const starter = byId.get(r.out);
    replaced.push({ out: r.out, in: r.in, slot, reason: starter && isInjured(starter, date) ? "injured" : "suspended" });
  }
  replaced.sort((a, b) => a.slot - b.slot);

  return {
    formation: preset.formation,
    ...(preset.customFormation ? { customFormation: preset.customFormation } : {}),
    lineup: swapped.lineup,
    slotInstructions: sanitizeSlotInstructions(formation, preset.slotInstructions),
    replaced,
  };
}
