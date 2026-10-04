import { shuffle } from "@/Domain/rng";

export interface CupEntrant { id: string; tier: number }
export interface CupTie { home: string; away: string; neutral?: true }

/**
 * Random pairing (Fisher–Yates with the given rng). The club of the LOWER level (higher tier
 * number) hosts; same level → coin flip. `neutral` marks every tie as neutral (the final).
 */
export function drawTies(entrants: CupEntrant[], rng: () => number, neutral: boolean): CupTie[] {
  if (entrants.length % 2 !== 0) throw new Error(`drawTies: odd number of entrants (${entrants.length})`);
  const pool = shuffle([...entrants].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true })), rng);
  const ties: CupTie[] = [];
  for (let i = 0; i < pool.length; i += 2) {
    const a = pool[i]!, b = pool[i + 1]!;
    const aHosts = a.tier > b.tier || (a.tier === b.tier && rng() < 0.5);
    const [home, away] = aHosts ? [a, b] : [b, a];
    ties.push(neutral ? { home: home.id, away: away.id, neutral: true } : { home: home.id, away: away.id });
  }
  return ties;
}
