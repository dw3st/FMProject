import { roundAttr } from "@/Domain/attributes";
import type { PlayerDevelopmentChange, TrainingEffect } from "@/types/dayLogTypes";

export interface AttributeChange {
  stat: string;
  /** Attribute before the day (0..10, one decimal). */
  from: number;
  /** Attribute after the day (0..10, one decimal). */
  to: number;
}

export interface PlayerAttributeChanges {
  playerId: string;
  playerName: string;
  changes: AttributeChange[];
}

/**
 * Day's development changes grouped by player and attribute: one row per attribute, from its value
 * before the first change of the day to its value after the last one. Rows that end where they
 * started are dropped, and so are players left with none. Players are listed by how much they
 * moved (sum of the display steps), then by name.
 */
export function groupDevelopmentChanges(list: PlayerDevelopmentChange[]): PlayerAttributeChanges[] {
  const byPlayer = new Map<string, { playerName: string; stats: Map<string, AttributeChange> }>();
  for (const dc of list) {
    let entry = byPlayer.get(dc.playerId);
    if (!entry) {
      entry = { playerName: dc.playerName, stats: new Map() };
      byPlayer.set(dc.playerId, entry);
    }
    for (const ch of dc.changes) {
      const existing = entry.stats.get(ch.stat);
      if (existing) existing.to = ch.newValue;
      else entry.stats.set(ch.stat, { stat: ch.stat, from: roundAttr(ch.newValue - ch.delta), to: ch.newValue });
    }
  }
  const out: PlayerAttributeChanges[] = [];
  for (const [playerId, { playerName, stats }] of byPlayer) {
    const changes = [...stats.values()].filter((c) => roundAttr(c.from) !== roundAttr(c.to));
    if (changes.length > 0) out.push({ playerId, playerName, changes });
  }
  const moved = (p: PlayerAttributeChanges) =>
    p.changes.reduce((sum, c) => sum + Math.abs(Math.round((c.to - c.from) * 10)), 0);
  return out.sort((a, b) => moved(b) - moved(a) || a.playerName.localeCompare(b.playerName));
}

/** Training effects as development changes (players without level changes are skipped). */
export function trainingDevelopmentChanges(effects: TrainingEffect[]): PlayerDevelopmentChange[] {
  return effects
    .filter((e) => (e.levelChanges?.length ?? 0) > 0)
    .map((e) => ({ playerId: e.playerId, playerName: e.name, changes: e.levelChanges ?? [] }));
}

/** Players to show before collapsing the rest behind "+N". */
export const DEV_CHANGES_VISIBLE = 8;
