/**
 * Tactic shortcuts of the live match (tester reports, 11.0): the manager's three saved line-ups (A, B, C) as buttons
 * under the pitch. Using one changes formation, instructions, style and axes for this match; the players on the pitch
 * stay. One change every `COOLDOWN_MIN` game minutes, so the team is not reshuffled every attack; a new period (the
 * team talk at the break) frees it.
 */
import { LINEUP_PRESET_KEYS } from "@/Domain/tactics/lineupPresets";
import type { LineupPreset, LineupPresetKey, LineupPresets } from "@/types/tacticsTypes";

export const TACTIC_SHORTCUTS = {
  /** Game minutes between two shortcut changes in the same period. */
  COOLDOWN_MIN: 10,
} as const;

/** When the last shortcut was used: the displayed minute and the period it was in. */
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
  return LINEUP_PRESET_KEYS.map((key) => ({ key, preset: presets?.[key] ?? null }));
}

/** The 11 slot instructions a shortcut sets: the saved ones, every other slot cleared. */
export function shortcutInstructions(preset: Pick<LineupPreset, "slotInstructions">): (NonNullable<LineupPreset["slotInstructions"]>[number])[] {
  return Array.from({ length: 11 }, (_, i) => preset.slotInstructions?.[i] ?? null);
}
