import type { RosterPlayer } from "@/types/playerTypes";
import type {
  CustomFormation,
  LineupPreset,
  LineupPresetKey,
  LineupPresets,
  SlotInstruction,
  TacticalAxes,
  TacticalStyle,
} from "@/types/tacticsTypes";
import { getFormationSlots } from "@/types/formationSlots";
import type { FormationShape } from "@/types/formationSlots";
import { CUSTOM_FORMATION_ID, parseAxesOverride, parseCustomFormation } from "@/Domain/formation/zones";
import { FORMATION_IDS, formationForTactics } from "@/Domain/matchFormations";
import { parseSlotInstructions, sanitizeSlotInstructions } from "@/Domain/tactics/slotInstructions";
import { fitnessAdjustedValue, replaceUnavailableStarters } from "@/Domain/lineupHelpers";
import { isInjured } from "@/Domain/injury/injury";
import { isUnavailable } from "@/Domain/discipline/discipline";
import { getMainRole } from "@/Domain/roles";
import { isRealIsoDate } from "@/Domain/dates";

/** The saved-lineup slots of the formation screen (#84). */
export const LINEUP_PRESET_KEYS: readonly LineupPresetKey[] = ["A", "B", "C", "D", "E", "F"];
/** The slots offered during a match (the shortcuts under the pitch, "Minhas formações"). */
export const MATCH_PRESET_KEYS: readonly LineupPresetKey[] = ["A", "B", "C"];

export function isMatchPreset(key: LineupPresetKey): boolean {
  return MATCH_PRESET_KEYS.includes(key);
}

/** The first empty slot, or null with all six taken. */
export function firstFreeSlot(presets: LineupPresets): LineupPresetKey | null {
  return LINEUP_PRESET_KEYS.find((k) => !presets[k]) ?? null;
}

/** A copy of a saved line-up in another slot (same name, XI and instructions); nothing changes without the source. */
export function copyPreset(presets: LineupPresets, from: LineupPresetKey, to: LineupPresetKey): LineupPresets {
  const source = presets[from];
  if (!source || from === to) return presets;
  return { ...presets, [to]: structuredClone(source) };
}

const EXPORT_PREFIX = "FMT1:";
/** Longest code accepted on import (a free formation with every instruction is ~1.5 KB). */
export const PRESET_CODE_MAX = 6000;

/**
 * A saved line-up as a code to paste in another save: formation, style, axes, instructions and name. The XI stays
 * out: the players of another save are other people.
 */
export function exportPreset(preset: LineupPreset): string {
  const { lineup: _lineup, savedOn: _savedOn, fromClub: _fromClub, ...rest } = preset;
  const bytes = new TextEncoder().encode(JSON.stringify(rest));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return EXPORT_PREFIX + btoa(bin);
}

/** The line-up of a pasted code, saved today without an XI; null for anything that is not a valid code. */
export function importPreset(code: string, savedOn: string): LineupPreset | null {
  const text = code.trim();
  if (!text.startsWith(EXPORT_PREFIX) || text.length > PRESET_CODE_MAX) return null;
  try {
    const bin = atob(text.slice(EXPORT_PREFIX.length));
    const raw = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))) as unknown;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const parsed = parseLineupPresets({ A: { ...(raw as Record<string, unknown>), lineup: [], savedOn } });
    return parsed.ok ? parsed.value.A ?? null : null;
  } catch {
    return null;
  }
}

const TACTICAL_STYLES: readonly TacticalStyle[] = ["counter_attack", "high_press", "possession", "balanced", "direct_play"];
const MAX_CLUB_NAME = 80;
/** Longest name a saved line-up takes. */
export const PRESET_NAME_MAX = 20;

/** A typed name made safe to store: control characters out, spaces collapsed, cut to the limit; "" = no name. */
export function cleanPresetName(raw: string): string {
  // eslint-disable-next-line no-control-regex
  return raw.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, " ").replace(/\s+/g, " ").trim().slice(0, PRESET_NAME_MAX).trim();
}

/** What a slot is called on screen: the manager's name for it, else its letter. */
export function presetDisplayName(key: LineupPresetKey, preset: Pick<LineupPreset, "name"> | undefined): string {
  return preset?.name || key;
}

/** The presets with one slot renamed ("" clears the name); an empty slot is left alone. */
export function renamePreset(presets: LineupPresets, key: LineupPresetKey, rawName: string): LineupPresets {
  const preset = presets[key];
  if (!preset) return presets;
  const name = cleanPresetName(rawName);
  const { name: _old, ...rest } = preset;
  return { ...presets, [key]: name ? { name, ...rest } : rest };
}

/**
 * The manager's saved tactics follow him to a new club (tester report): formation, instructions, style and axes stay,
 * the XI goes (those players stayed behind; using the preset fills it from the new squad).
 */
export function presetsForNewClub(presets: LineupPresets | undefined, fromClub: string): LineupPresets | undefined {
  const entries = Object.entries(presets ?? {}) as [LineupPresetKey, LineupPreset][];
  if (entries.length === 0) return undefined;
  const out: LineupPresets = {};
  for (const [key, preset] of entries) out[key] = { ...preset, lineup: [], fromClub: (preset.fromClub ?? fromClub).slice(0, MAX_CLUB_NAME) };
  return out;
}

/** What the formation screen holds when the manager saves a preset. */
export interface LineupPresetSource {
  formation: string;
  customFormation?: CustomFormation | null;
  lineup: string[];
  slotInstructions?: (SlotInstruction | null)[];
  tacticalStyle?: TacticalStyle;
  axesOverride?: Partial<TacticalAxes>;
  /** The name the slot already had: saving over it keeps the name. */
  name?: string;
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
  const name = source.name ? cleanPresetName(source.name) : "";
  return {
    ...(name ? { name } : {}),
    formation: source.formation,
    ...(custom ? { customFormation: custom } : {}),
    lineup,
    ...(slotInstructions.length > 0 ? { slotInstructions } : {}),
    savedOn,
    ...(source.tacticalStyle ? { tacticalStyle: source.tacticalStyle } : {}),
    ...(source.axesOverride && Object.keys(source.axesOverride).length > 0 ? { axesOverride: source.axesOverride } : {}),
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
    if (!["formation", "customFormation", "lineup", "slotInstructions", "savedOn", "tacticalStyle", "axesOverride", "fromClub", "name"].includes(key)) {
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
  if (typeof savedOn !== "string" || !isRealIsoDate(savedOn)) return { ok: false, error: "invalid preset date" };
  if (src.tacticalStyle !== undefined && !TACTICAL_STYLES.includes(src.tacticalStyle as TacticalStyle)) {
    return { ok: false, error: "invalid preset style" };
  }
  const axesOverride = src.axesOverride === undefined ? {} : parseAxesOverride(src.axesOverride);
  if (!axesOverride) return { ok: false, error: "invalid preset axes" };
  if (src.fromClub !== undefined && (typeof src.fromClub !== "string" || src.fromClub.length > MAX_CLUB_NAME)) {
    return { ok: false, error: "invalid preset club" };
  }
  if (src.name !== undefined && (typeof src.name !== "string" || src.name.length > PRESET_NAME_MAX || cleanPresetName(src.name) !== src.name || src.name === "")) {
    return { ok: false, error: "invalid preset name" };
  }
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
      ...(src.name !== undefined ? { name: src.name as string } : {}),
      formation,
      ...(customFormation ? { customFormation } : {}),
      lineup: [...(lineup as string[])],
      ...(slotInstructions.length > 0 ? { slotInstructions } : {}),
      savedOn,
      ...(src.tacticalStyle !== undefined ? { tacticalStyle: src.tacticalStyle as TacticalStyle } : {}),
      ...(Object.keys(axesOverride).length > 0 ? { axesOverride } : {}),
      ...(src.fromClub !== undefined ? { fromClub: src.fromClub as string } : {}),
    },
  };
}

/** One starter of a preset swapped on use. */
export interface PresetReplacement {
  /** Saved player id (may no longer be in the squad when `reason === "left"`). */
  out: string;
  /** Replacement id; "" when nobody was available (the saved player stays, or the slot is empty). */
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
  tacticalStyle?: TacticalStyle;
  axesOverride?: Partial<TacticalAxes>;
  replaced: PresetReplacement[];
}

/**
 * Applies a preset to today's squad: a saved player who left the squad (sold, loaned out, released)
 * or an empty slot is filled by the best available player of the slot's line (any available player
 * as a fallback), ranked by `fitnessAdjustedValue`; an injured or suspended one goes through
 * `replaceUnavailableStarters` (the same rule the saved lineup follows on match day). A starter
 * nobody can replace is reported with `in: ""`.
 */
export function applyLineupPreset(preset: LineupPreset, players: RosterPlayer[], date: string): AppliedLineupPreset {
  const formation = formationForTactics(preset);
  const slots = getFormationSlots(formation as unknown as FormationShape);
  const byId = new Map(players.map((p) => [p.id, p]));
  const lineup = slots.map((_, i) => preset.lineup[i] ?? "");
  const replaced: PresetReplacement[] = [];

  // 1. Players who left the squad (or empty slots of the preset).
  const used = new Set(lineup.filter((id) => id && byId.has(id)));
  for (let i = 0; i < slots.length; i++) {
    const id = lineup[i]!;
    if (id && byId.has(id)) continue;
    const role = slots[i]!.role;
    const available = players.filter((p) => !used.has(p.id) && !isUnavailable(p, date));
    const sameLine = available.filter((p) => p.positions.includes(role) || getMainRole(p.positions[0] ?? "CM") === getMainRole(role));
    const pool = sameLine.length > 0 ? sameLine : available;
    const pick = [...pool].sort((a, b) => fitnessAdjustedValue(b, role) - fitnessAdjustedValue(a, role))[0];
    lineup[i] = pick?.id ?? "";
    if (pick) used.add(pick.id);
    if (id) replaced.push({ out: id, in: pick?.id ?? "", slot: i, reason: "left" });
  }

  // 2. Injured or suspended starters.
  const swapped = replaceUnavailableStarters(slots, lineup, players, date);
  for (const r of swapped.replaced) {
    // Presets never pass a registered set: only injured or suspended swaps come back here.
    replaced.push({ out: r.out, in: r.in, slot: lineup.indexOf(r.out), reason: r.reason === "injured" ? "injured" : "suspended" });
  }
  // 3. Unavailable starters nobody could replace (squad too thin): they stay, flagged.
  swapped.lineup.forEach((id, slot) => {
    const p = id ? byId.get(id) : undefined;
    if (p && isUnavailable(p, date)) {
      replaced.push({ out: id, in: "", slot, reason: isInjured(p, date) ? "injured" : "suspended" });
    }
  });
  replaced.sort((a, b) => a.slot - b.slot);

  return {
    formation: preset.formation,
    ...(preset.customFormation ? { customFormation: preset.customFormation } : {}),
    lineup: swapped.lineup,
    slotInstructions: sanitizeSlotInstructions(formation, preset.slotInstructions),
    ...(preset.tacticalStyle ? { tacticalStyle: preset.tacticalStyle } : {}),
    ...(preset.axesOverride ? { axesOverride: preset.axesOverride } : {}),
    replaced,
  };
}
