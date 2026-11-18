/**
 * Tactic shortcuts of the live match (tester reports, 11.0): the manager's three saved line-ups (A, B, C) as buttons
 * under the pitch. Using one changes formation, instructions, style and axes for this match; the players on the pitch
 * stay. One change every `COOLDOWN_MIN` game minutes, so the team is not reshuffled every attack; a new period (the
 * team talk at the break) frees it.
 */
import { MATCH_PRESET_KEYS } from "@/Domain/tactics/lineupPresets";
import type { LineupPreset, LineupPresetKey, LineupPresets } from "@/types/tacticsTypes";

export const TACTIC_SHORTCUTS = {
  /** Game minutes between two shortcut changes in the same period. */
  COOLDOWN_MIN: 10,
} as const;

/** When the last shortcut was used: the displayed minute and the period it was in. */
/**
 * The saved line-up the match starts with (report 40ba129f): the first of A, B, C whose formation and eleven are the
 * ones of the day (order of the ids does not matter), or null.
 */
export function presetInUse(presets: LineupPresets | undefined, formation: string, lineup: readonly string[]): LineupPresetKey | null {
  const today = [...lineup].filter(Boolean).sort().join(",");
  if (!today) return null;
  for (const { key, preset } of tacticShortcutSlots(presets)) {
    if (preset && preset.formation === formation && [...preset.lineup].filter(Boolean).sort().join(",") === today) return key;
  }
  return null;
}

export interface ShortcutUse {
  minute: number;
  phase: string;
}

/** The minute the shortcuts are free again; null = free now. */
export function shortcutReadyMinute(last: ShortcutUse | null, minute: number, phase: string): number | null {
  if (!last || last.phase !== phase) return null;
  const ready = last.minute + TACTIC_SHORTCUTS.COOLDOWN_MIN;
  return minute >= ready ? null : ready;
}

export function shortcutLocked(last: ShortcutUse | null, minute: number, phase: string): boolean {
  return shortcutReadyMinute(last, minute, phase) !== null;
}

/** The three slots in order, each with its saved line-up or null (empty slot). */
export function tacticShortcutSlots(presets: LineupPresets | undefined): { key: LineupPresetKey; preset: LineupPreset | null }[] {
  return MATCH_PRESET_KEYS.map((key) => ({ key, preset: presets?.[key] ?? null }));
}

/** The 11 slot instructions a shortcut sets: the saved ones, every other slot cleared. */
export function shortcutInstructions(preset: Pick<LineupPreset, "slotInstructions">): (NonNullable<LineupPreset["slotInstructions"]>[number])[] {
  return Array.from({ length: 11 }, (_, i) => preset.slotInstructions?.[i] ?? null);
}

/** A starter as the slot plan sees him. */
export interface SlotPlayer {
  id: number;
  rosterId: string;
  slotIndex: number;
  role: string;
}

export type SlotMove = { kind: "swap"; aId: number; bId: number } | { kind: "move"; id: number; slot: number };

/**
 * The moves that put each starter in the slot the saved line-up gives him (report 2026-11-16: two line-ups of the
 * same formation with the full-backs swapped changed nothing on the pitch). Only players on the pitch move, never a
 * keeper, never a substitution; a slot whose saved player is not on the pitch keeps whoever holds it.
 */
export function savedSlotMoves(players: readonly SlotPlayer[], lineup: readonly string[], slots: number): SlotMove[] {
  const at = new Map<number, SlotPlayer>();
  const pitch = players.filter((p) => p.slotIndex >= 0).map((p) => ({ ...p }));
  for (const p of pitch) at.set(p.slotIndex, p);
  const moves: SlotMove[] = [];
  for (let slot = 0; slot < Math.min(slots, lineup.length); slot++) {
    const want = pitch.find((p) => p.rosterId === lineup[slot]);
    if (!want || want.slotIndex === slot || want.role === "GK") continue;
    const holder = at.get(slot);
    if (holder?.role === "GK") continue;
    const from = want.slotIndex;
    if (holder) {
      moves.push({ kind: "swap", aId: want.id, bId: holder.id });
      holder.slotIndex = from;
      at.set(from, holder);
    } else {
      moves.push({ kind: "move", id: want.id, slot });
      at.delete(from);
    }
    want.slotIndex = slot;
    at.set(slot, want);
  }
  return moves;
}
