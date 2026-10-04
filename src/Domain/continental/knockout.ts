import type { Fixture } from "@/types/calendarTypes";
import { fixtureWinner } from "@/Domain/cups/cupProgress";
import { shuffle } from "@/Domain/rng";

/** One knockout pairing. `second` hosts the second leg (or is the neutral-final away side). */
export interface KnockoutTie {
  first: string;
  second: string;
}

/**
 * Round-of-16 draw: each of the 8 group winners (`second`, hosts the second leg) is paired with a
 * runner-up (`first`) from another group. Never the same group (hard constraint — always
 * satisfiable, since only the runner-up from the winner's own group is forbidden). Same country is
 * avoided when possible; when the country layout makes some clashes unavoidable, the pairing with
 * the fewest total clashes is chosen (exact branch-and-bound search over the 8 pairings — small
 * enough, at most 8! = 40320, to search exhaustively with pruning).
 *
 * Deterministic for a given `rng`: both the processing order and the candidate order are shuffled
 * from it, so two calls with the same seeded rng return the same ties.
 */
export function drawRoundOf16(
  winners: string[],
  runnersUp: string[],
  groupOf: Record<string, string>,
  countryOf: Record<string, string>,
  rng: () => number,
): KnockoutTie[] {
  if (winners.length !== 8 || runnersUp.length !== 8) {
    throw new Error(
      `drawRoundOf16: need 8 winners and 8 runners-up, got ${winners.length}/${runnersUp.length}`,
    );
  }

  const seconds = shuffle(winners, rng);
  const candidates = shuffle(runnersUp, rng);

  const used = new Array<boolean>(candidates.length).fill(false);
  const assignment = new Array<string>(seconds.length);
  let best: string[] | null = null;
  let bestClashes = Infinity;

  function search(i: number, clashes: number): void {
    if (clashes >= bestClashes) return;
    if (i === seconds.length) {
      best = [...assignment];
      bestClashes = clashes;
      return;
    }
    const second = seconds[i]!;
    for (let j = 0; j < candidates.length; j++) {
      if (used[j]) continue;
      const first = candidates[j]!;
      if (groupOf[first] === groupOf[second]) continue; // never same group — hard constraint
      const clash = countryOf[first] === countryOf[second] ? 1 : 0;
      if (clashes + clash >= bestClashes) continue;
      used[j] = true;
      assignment[i] = first;
      search(i + 1, clashes + clash);
      used[j] = false;
    }
  }

  search(0, 0);
  if (!best) {
    throw new Error("drawRoundOf16: no valid pairing without a same-group clash");
  }
  const resolved: string[] = best;
  return seconds.map((second, i) => ({ first: resolved[i]!, second }));
}

/** Random pairing of an even list of ids (used for quarter-final / semi-final draws). */
export function drawFree(ids: string[], rng: () => number): KnockoutTie[] {
  if (ids.length === 0 || ids.length % 2 !== 0) {
    throw new Error(`drawFree: need a non-empty, even number of ids, got ${ids.length}`);
  }
  const shuffled = shuffle(ids, rng);
  const ties: KnockoutTie[] = [];
  for (let i = 0; i < shuffled.length; i += 2) {
    ties.push({ first: shuffled[i]!, second: shuffled[i + 1]! });
  }
  return ties;
}

/**
 * Fixtures for one knockout stage. Two-legged (`rounds`/`dates` length 2): leg 1 home = `first` on
 * `dates[0]`/`rounds[0]`, leg 2 home = `second` on `dates[1]`/`rounds[1]`, sharing a `tieId`, leg 2
 * carrying `knockout: true` (leg 1 does not — it can't yet be decided on penalties). Single-round
 * (`rounds`/`dates` length 1, the final): one fixture per tie, `home: first`, `away: second`,
 * `knockout: true` and `neutral: true`, no `tieId`/`leg`.
 *
 * Ids follow the `${slug}_${year}_r${round}_${n}` convention of `generateContinental.ts`, `n`
 * 1-based within the round starting at `startIndex`.
 */
export function twoLegFixtures(
  slug: string,
  year: number,
  stage: string,
  ties: KnockoutTie[],
  rounds: number[],
  dates: string[],
  startIndex = 1,
): Fixture[] {
  if (rounds.length !== dates.length) {
    throw new Error(
      `twoLegFixtures: rounds (${rounds.length}) and dates (${dates.length}) must match`,
    );
  }

  if (rounds.length === 1) {
    const round = rounds[0]!;
    const date = dates[0]!;
    return ties.map((tie, i) => ({
      id: `${slug}_${year}_r${round}_${startIndex + i}`,
      date,
      competition: slug,
      round,
      home: tie.first,
      away: tie.second,
      played: false,
      result: null,
      knockout: true,
      neutral: true,
    }));
  }

  if (rounds.length !== 2) {
    throw new Error(
      `twoLegFixtures: expected 1 round (final) or 2 rounds (two-legged tie), got ${rounds.length}`,
    );
  }

  const [round1, round2] = rounds as [number, number];
  const [date1, date2] = dates as [string, string];
  const fixtures: Fixture[] = [];
  ties.forEach((tie, i) => {
    const n = startIndex + i;
    const tieId = `${slug}_${year}_${stage}_${n}`;
    fixtures.push(
      {
        id: `${slug}_${year}_r${round1}_${n}`,
        date: date1,
        competition: slug,
        round: round1,
        home: tie.first,
        away: tie.second,
        played: false,
        result: null,
        tieId,
        leg: 1,
      },
      {
        id: `${slug}_${year}_r${round2}_${n}`,
        date: date2,
        competition: slug,
        round: round2,
        home: tie.second,
        away: tie.first,
        played: false,
        result: null,
        tieId,
        leg: 2,
        knockout: true,
      },
    );
  });
  return fixtures;
}

function goalsScoredBy(team: string, leg: Fixture): number {
  if (!leg.result) return 0;
  if (leg.home === team) return leg.result.home;
  if (leg.away === team) return leg.result.away;
  throw new Error(`goalsScoredBy: "${team}" did not play in fixture ${leg.id}`);
}

/**
 * `leg2` with `aggregate` set to the first-leg goals from `leg2`'s own home/away point of view.
 * `leg1` must be played (the caller only calls this once the first-leg round is complete).
 */
export function withAggregate(leg2: Fixture, leg1: Fixture): Fixture {
  if (!leg1.played || !leg1.result) {
    throw new Error(`withAggregate: leg1 (${leg1.id}) is not played`);
  }
  return {
    ...leg2,
    aggregate: {
      home: goalsScoredBy(leg2.home, leg1),
      away: goalsScoredBy(leg2.away, leg1),
    },
  };
}

/**
 * Winner of a two-legged tie: null while either leg is unplayed. Otherwise the aggregate (each
 * leg's `result`, which already includes any extra-time goals — away goals never count); level on
 * aggregate falls to `leg2.decider.penalties` (the second leg is always the one played to a
 * decision); null if level on aggregate with no penalties recorded.
 */
export function tieWinner(leg1: Fixture, leg2: Fixture): string | null {
  if (!leg1.played || !leg1.result || !leg2.played || !leg2.result) return null;

  const teamA = leg2.home;
  const teamB = leg2.away;
  const aggA = goalsScoredBy(teamA, leg1) + goalsScoredBy(teamA, leg2);
  const aggB = goalsScoredBy(teamB, leg1) + goalsScoredBy(teamB, leg2);
  if (aggA !== aggB) return aggA > aggB ? teamA : teamB;

  const p = leg2.decider?.penalties;
  if (p && p.home !== p.away) return p.home > p.away ? leg2.home : leg2.away;
  return null;
}

/** Winner of the single-leg final: score, then penalties; null if unplayed/undecided. */
export { fixtureWinner as finalWinner };
