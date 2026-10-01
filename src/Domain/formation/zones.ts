/**
 * Free-formation zone grid (Block C2). The own half of the pitch is split into
 * ZONE_ROWS depth rows x ZONE_COLS width bands; each zone maps to one detailed
 * role by a fixed table. A custom formation is a set of 11 distinct zones.
 *
 * Pure: no I/O. Coordinates are the same as the ready-made formation JSONs
 * (Team A frame, x = depth 0..115, y = 0..74 from the left/top touchline).
 */
import type { Formation, FormationSlotDef, PlayerRole } from "@/GameEngine/types";
import type { CustomFormation, CustomFormationSlot } from "@/types/tacticsTypes";

export const ZONE_COLS = 5;
export const ZONE_ROWS = 6;
export const CUSTOM_FORMATION_ID = "custom";

/** Attacking-shape x per depth row (row 0 = goalkeeper). */
const ROW_X = [10, 36, 54, 72, 86, 98] as const;
/** Defending-shape x per depth row. */
const ROW_DEFENDING_X = [5, 13, 26, 38, 44, 55] as const;
/** y per width band (0 = left touchline). */
const COL_Y = [8, 22, 37, 52, 66] as const;

/** Role table [row][col]; null = no zone there. */
const ROLE_TABLE: readonly (readonly (string | null)[])[] = [
  [null, null, "GK", null, null],
  ["LB", "CB", "CB", "CB", "RB"],
  ["LWB", "CDM", "CDM", "CDM", "RWB"],
  ["LM", "CM", "CM", "CM", "RM"],
  ["LW", "CAM", "CAM", "CAM", "RW"],
  ["LW", "ST", "ST", "ST", "RW"],
];

const DEFENDER_ROLES = new Set(["CB", "LB", "RB", "LWB", "RWB"]);
const ATTACKER_ROLES = new Set(["LW", "RW", "ST"]);

export interface Zone {
  row: number;
  col: number;
}

export function zoneRole(row: number, col: number): string | null {
  return ROLE_TABLE[row]?.[col] ?? null;
}

export function zoneCenter(row: number, col: number): { x: number; y: number } {
  return { x: ROW_X[row]!, y: COL_Y[col]! };
}

/** Slot (role + centre) for a zone, or null if the zone does not exist. */
export function slotForZone(row: number, col: number): CustomFormationSlot | null {
  const role = zoneRole(row, col);
  if (!role) return null;
  return { ...zoneCenter(row, col), role };
}

function nearestZone(x: number, y: number, skip?: ReadonlySet<string>): Zone | null {
  let best: Zone | null = null;
  let bestD = Infinity;
  for (let row = 0; row < ZONE_ROWS; row++) {
    for (let col = 0; col < ZONE_COLS; col++) {
      if (!zoneRole(row, col) || skip?.has(`${row}:${col}`)) continue;
      const c = zoneCenter(row, col);
      // y spans less than x, so weight it up to keep both axes comparable.
      const d = (c.x - x) ** 2 + ((c.y - y) * 1.5) ** 2;
      if (d < bestD) {
        bestD = d;
        best = { row, col };
      }
    }
  }
  return best;
}

/** Nearest valid zone to a point (yards). */
export function zoneAt(x: number, y: number): Zone | null {
  return nearestZone(x, y);
}

export type CustomFormationIssue =
  | "count"
  | "goalkeeper"
  | "outfield"
  | "defenders"
  | "attackers"
  | "duplicate"
  | "zone";

export type CustomFormationValidation = { ok: true } | { ok: false; reason: CustomFormationIssue };

/** Exactly 1 GK, 10 outfield, >= 3 defenders, >= 1 attacker, one slot per zone, every slot on a valid zone. */
export function validateCustomFormation(slots: readonly CustomFormationSlot[]): CustomFormationValidation {
  if (slots.length !== 11) return { ok: false, reason: "count" };
  const seen = new Set<string>();
  for (const s of slots) {
    const z = zoneAt(s.x, s.y);
    const c = z ? slotForZone(z.row, z.col) : null;
    if (!z || !c || c.x !== s.x || c.y !== s.y || c.role !== s.role) return { ok: false, reason: "zone" };
    const key = `${z.row}:${z.col}`;
    if (seen.has(key)) return { ok: false, reason: "duplicate" };
    seen.add(key);
  }
  if (slots.filter((s) => s.role === "GK").length !== 1) return { ok: false, reason: "goalkeeper" };
  if (slots.filter((s) => s.role !== "GK").length !== 10) return { ok: false, reason: "outfield" };
  if (slots.filter((s) => DEFENDER_ROLES.has(s.role)).length < 3) return { ok: false, reason: "defenders" };
  if (!slots.some((s) => ATTACKER_ROLES.has(s.role))) return { ok: false, reason: "attackers" };
  return { ok: true };
}

/** Deterministic slot order: goalkeeper first, then depth, then left to right. */
export function sortCustomSlots<T extends { x: number; y: number }>(slots: readonly T[]): T[] {
  return [...slots].sort((a, b) => a.x - b.x || a.y - b.y);
}

/** Converts a custom formation into the engine's `Formation` (slot order preserved). */
export function customToFormation(custom: CustomFormation): Formation {
  const attacking: FormationSlotDef[] = custom.slots.map((s) => ({
    role: s.role as PlayerRole,
    x: s.x,
    y: s.y,
  }));
  const defending: FormationSlotDef[] = custom.slots.map((s) => {
    const z = zoneAt(s.x, s.y);
    return { role: s.role as PlayerRole, x: ROW_DEFENDING_X[z?.row ?? 0]!, y: s.y };
  });
  return { id: CUSTOM_FORMATION_ID, attacking, defending };
}

/** Seed a custom formation from a ready-made one (each slot snapped to the nearest free zone). */
export function customFromFormation(f: {
  attacking: readonly { role: string; x: number; y: number }[];
}): CustomFormation {
  const used = new Set<string>();
  const slots: CustomFormationSlot[] = [];
  for (const s of f.attacking) {
    const z = nearestZone(s.x, s.y, used)!;
    used.add(`${z.row}:${z.col}`);
    slots.push(slotForZone(z.row, z.col)!);
  }
  return { slots: sortCustomSlots(slots) };
}

/** "D-M-F" shape (goalkeeper excluded). */
export function customShape(slots: readonly CustomFormationSlot[]): string {
  const d = slots.filter((s) => DEFENDER_ROLES.has(s.role)).length;
  const f = slots.filter((s) => ATTACKER_ROLES.has(s.role)).length;
  const m = slots.filter((s) => s.role !== "GK").length - d - f;
  return `${d}-${m}-${f}`;
}
