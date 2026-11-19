import { addDays } from "@/Domain/dates";
import { overallAvg } from "@/Domain/playerRating";
import { isMentalKey } from "@/Domain/mental/mental";
import { SHOW_MENTAL } from "@/Domain/mental/mentalConfig";
import type { StatLevelChange } from "@/types/dayLogTypes";
import type { DevHistoryPoint, DevLogEntry, RosterPlayer, Squad } from "@/types/playerTypes";

/**
 * Development history of the human club's players (`.claude/rules/game/development.md` → "Tela de desenvolvimento"):
 * an OVR snapshot every Monday and the last attribute changes with their source. AI clubs never get it.
 */
export const DEV_HISTORY = { WEEKS: 26, LOG: 30, TREND_DAYS: 28 } as const;

/** One player's attribute changes of the day and where they came from. */
export interface DayDevChanges {
  playerId: string;
  changes: readonly StatLevelChange[];
  source: "match" | "training";
}

/**
 * Appends the day's changes to `devLog`. A drop is always the age decline (training only adds DP and a match only
 * removes it through the age decay), so a negative delta is logged as "age" whatever the source.
 */
export function recordDevChanges(squad: Squad, date: string, day: readonly DayDevChanges[]): Squad {
  if (day.length === 0) return squad;
  const byPlayer = new Map<string, DevLogEntry[]>();
  for (const d of day) {
    const list = byPlayer.get(d.playerId) ?? [];
    for (const c of d.changes) {
      if (c.delta === 0) continue;
      // Mental changes stay out of the log until the screens show them (`SHOW_MENTAL`, `mental.md`).
      if (!SHOW_MENTAL && isMentalKey(c.stat)) continue;
      list.push({ date, stat: c.stat, delta: c.delta, source: c.delta < 0 ? "age" : d.source });
    }
    byPlayer.set(d.playerId, list);
  }
  let changed = false;
  const players = squad.players.map((p) => {
    const add = byPlayer.get(String(p.id));
    if (!add || add.length === 0) return p;
    changed = true;
    return { ...p, devLog: [...(p.devLog ?? []), ...add].slice(-DEV_HISTORY.LOG) };
  });
  return changed ? { ...squad, players } : squad;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/** Monday snapshot of every player's OVR (once per date, the last `WEEKS` kept). */
export function snapshotDevHistory(squad: Squad, date: string): Squad {
  return {
    ...squad,
    players: squad.players.map((p) => {
      const h = p.devHistory ?? [];
      if (h.at(-1)?.date === date) return p;
      return { ...p, devHistory: [...h, { date, ovr: round2(overallAvg(p)) }].slice(-DEV_HISTORY.WEEKS) };
    }),
  };
}

/**
 * OVR change over the last `days` (default 4 weeks): now against the oldest snapshot inside the window. Null with
 * no snapshot in it (a new player, or the history just started).
 */
export function ovrChange(
  history: readonly DevHistoryPoint[] | undefined,
  player: RosterPlayer,
  today: string,
  days: number = DEV_HISTORY.TREND_DAYS,
): number | null {
  const from = addDays(today, -days);
  const base = (history ?? []).find((h) => h.date >= from && h.date <= today);
  if (!base) return null;
  return round2(overallAvg(player) - base.ovr);
}
