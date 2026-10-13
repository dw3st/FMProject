/**
 * Youth-game call-ups of the human club with a duration per player
 * (`.claude/rules/game/youth-competitions.md` → "Convocação"). Pure: the route validates and builds
 * them, the day advance counts them down after each youth game of the age the club had.
 */
import { YOUTH_COMP } from "@/Domain/youthComps/youthCompConfig";
import type { Squad } from "@/types/playerTypes";
import type { YouthCompAge } from "@/types/youthCompTypes";

export type CallUpDuration = "next" | "games3" | "games5" | "indefinite" | "rhythm";

export const CALL_UP_DURATIONS: readonly CallUpDuration[] = ["next", "games3", "games5", "indefinite", "rhythm"];

export interface YouthCallUp {
  id: string;
  duration: CallUpDuration;
  /** Games left (`next`, `games3`, `games5`). */
  left?: number;
  /** Consecutive youth games with a good rating (`rhythm`). */
  streak?: number;
}

export type YouthCallUps = Partial<Record<YouthCompAge, YouthCallUp[]>>;

export const CALL_UP_RULES = {
  GAMES: { next: 1, games3: 3, games5: 5 } as Partial<Record<CallUpDuration, number>>,
  /** "Até ganhar ritmo": this many youth games in a row he played … */
  RHYTHM_GAMES: 3,
  /** … each with at least this rating. */
  RHYTHM_RATING: 6.5,
} as const;

export function isCallUpDuration(v: unknown): v is CallUpDuration {
  return typeof v === "string" && (CALL_UP_DURATIONS as readonly string[]).includes(v);
}

/** A fresh call-up of `id` with `duration` (counters at the start). */
export function newCallUp(id: string, duration: CallUpDuration): YouthCallUp {
  const games = CALL_UP_RULES.GAMES[duration];
  if (games !== undefined) return { id, duration, left: games };
  if (duration === "rhythm") return { id, duration, streak: 0 };
  return { id, duration };
}

/**
 * The saved list after the manager sends `wanted` (ids and durations): a player kept with the same
 * duration keeps his progress, a new player or a changed duration starts over.
 */
export function mergeCallUps(
  current: readonly YouthCallUp[] | undefined,
  wanted: readonly { id: string; duration: CallUpDuration }[],
): YouthCallUp[] {
  const before = new Map((current ?? []).map((c) => [c.id, c]));
  return wanted.map((w) => {
    const old = before.get(w.id);
    return old && old.duration === w.duration ? old : newCallUp(w.id, w.duration);
  });
}

/**
 * Counts one youth game of the age down (the club played it, or it was cancelled):
 * - `played` maps the players who played it to their rating (`null` = cancelled, nobody played);
 * - `next` is used up by the game, played or not (the old one-game call-up);
 * - `games3` / `games5` count only the games he played (unavailable, kept for the first team or a
 *   cancelled game do not count);
 * - `rhythm` follows his rating streak (a game he did not play leaves the streak as it was; a played
 *   game below the rating resets it) and ends at `RHYTHM_GAMES` in a row;
 * - `indefinite` stays until the manager removes him.
 * Players no longer `eligible` (left the club, too old for the age) leave the list.
 */
export function advanceCallUps(
  list: readonly YouthCallUp[],
  played: ReadonlyMap<string, number> | null,
  eligible: ReadonlySet<string>,
): YouthCallUp[] {
  const out: YouthCallUp[] = [];
  for (const c of list) {
    if (!eligible.has(c.id)) continue;
    const rating = played?.get(c.id);
    if (c.duration === "next") continue;
    if (c.duration === "indefinite") {
      out.push(c);
    } else if (c.duration === "rhythm") {
      if (rating === undefined) {
        out.push(c);
        continue;
      }
      const streak = rating >= CALL_UP_RULES.RHYTHM_RATING ? (c.streak ?? 0) + 1 : 0;
      if (streak < CALL_UP_RULES.RHYTHM_GAMES) out.push({ ...c, streak });
    } else {
      const left = (c.left ?? CALL_UP_RULES.GAMES[c.duration] ?? 1) - (rating === undefined ? 0 : 1);
      if (left > 0) out.push({ ...c, left });
    }
  }
  return out;
}

/** Keeps only the eligible players (route reads, a sold player). */
export function pruneCallUps(list: readonly YouthCallUp[], eligible: ReadonlySet<string>): YouthCallUp[] {
  return list.filter((c) => eligible.has(c.id));
}

/** Ids in call-up order (the youth line-up reads ids). */
export function callUpIds(list: readonly YouthCallUp[] | undefined): string[] {
  return (list ?? []).map((c) => c.id);
}

/** Who may be called up for an age: squad + academy, ≤ 19 for the under-19. */
export function callUpAgeOk(age: YouthCompAge, playerAge: number): boolean {
  return age === "u21" || playerAge <= YOUTH_COMP.MAX_AGE.u19;
}

/** Ids of the club's players who may be called up for an age. */
export function callUpEligibleIds(squad: Squad, age: YouthCompAge): Set<string> {
  return new Set([...squad.players, ...(squad.youth ?? [])].filter((p) => callUpAgeOk(age, p.age)).map((p) => p.id));
}
