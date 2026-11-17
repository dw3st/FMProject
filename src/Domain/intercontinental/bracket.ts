import type { Fixture, IccConfed, IccEntrant, IccMatch } from "@/types/calendarTypes";
import { ICC_BRACKET, ICC_SLUG, type IccSide } from "@/Domain/intercontinental/iccConfig";

/** The five matches of an edition, nothing decided yet (`round` = the match number). */
export function initialMatches(dates: string[]): IccMatch[] {
  return [...ICC_BRACKET]
    .sort((a, b) => a.n - b.n)
    .map((s) => ({ n: s.n, name: s.name, round: s.n, date: dates[s.dateIndex] ?? dates[dates.length - 1]!, done: false, winner: null }));
}

/** The single fixture of a match whose two sides are clubs (neutral venue, knockout). */
export function iccFixture(year: number, m: IccMatch): Fixture {
  return {
    id: `icc_${year}_${m.n}`, date: m.date, competition: ICC_SLUG, round: m.round,
    home: m.home!, away: m.away!, played: false, result: null, knockout: true, neutral: true,
  };
}

export interface IccDecision {
  n: number;
  winner: string | null;
  loser: string | null;
  /** Settled without a game. */
  bye: boolean;
}

export interface IccStep {
  matches: IccMatch[];
  /** Matches whose two clubs just became known: write their fixture. */
  created: IccMatch[];
  /** Matches settled in this step (played today or decided by a bye). */
  decided: IccDecision[];
  championId: string | null;
}

/**
 * Moves the bracket on: `winners` holds the winner of every match played so far (by match number). Sides are filled
 * as soon as they are known; a match with an empty side is settled at once (bye), and the byes cascade.
 */
export function stepBracket(
  matches: IccMatch[],
  entrants: Record<IccConfed, IccEntrant>,
  winners: Partial<Record<number, string>>,
): IccStep {
  const byN = new Map<number, IccMatch>(matches.map((m) => [m.n, { ...m }]));
  const created: IccMatch[] = [];
  const decided: IccDecision[] = [];
  const side = (s: IccSide): string | null | undefined => {
    if ("confed" in s) return entrants[s.confed]?.clubId ?? null;
    const m = byN.get(s.winnerOf);
    return m?.done ? m.winner : undefined;
  };
  let changed = true;
  while (changed) {
    changed = false;
    for (const slot of ICC_BRACKET) {
      const m = byN.get(slot.n);
      if (!m || m.done) continue;
      if (m.home === undefined || m.away === undefined) {
        const h = side(slot.home);
        const a = side(slot.away);
        if (h === undefined || a === undefined) continue;
        m.home = h;
        m.away = a;
        changed = true;
        if (h === null || a === null) {
          m.done = true;
          m.bye = true;
          m.winner = h ?? a;
          decided.push({ n: m.n, winner: m.winner, loser: null, bye: true });
        } else {
          created.push(m);
        }
        continue;
      }
      const w = winners[m.n];
      if (w && (w === m.home || w === m.away)) {
        m.done = true;
        m.winner = w;
        decided.push({ n: m.n, winner: w, loser: w === m.home ? m.away ?? null : m.home ?? null, bye: false });
        changed = true;
      }
    }
  }
  const out = matches.map((m) => byN.get(m.n)!);
  const final = out.find((m) => m.n === 5);
  return { matches: out, created, decided, championId: final?.done ? final.winner : null };
}
