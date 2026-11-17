import type { Fixture } from "@/types/calendarTypes";
import type { DrawClub } from "@/Domain/continental/groupDraw";
import type { KnockoutTie } from "@/Domain/continental/knockout";
import { shuffle } from "@/Domain/rng";

/**
 * League phase of the Champions League / Europa League (the real format since 2024; spec
 * `docs/superpowers/specs/2026-11-17-champions-league-phase-and-intercontinental-design.md`): 36 clubs in 4 pots of
 * 9, each club meets 2 clubs of every pot (one at home, one away), 8 matches in 8 rounds, one table. 1st–8th go to the
 * round of 16, 9th–24th to a two-legged play-off, 25th–36th are out. The knockout is a fixed bracket by position.
 */
export const LEAGUE_PHASE = {
  CLUBS: 36,
  POTS: 4,
  POT_SIZE: 9,
  ROUNDS: 8,
  /** Never more opponents than this from one foreign country. */
  MAX_PER_COUNTRY: 2,
  DIRECT: 8,
  PLAYOFF_LAST: 24,
  /** Draw attempts with every rule before the country cap is dropped, and then the same-country rule. */
  STRICT_ATTEMPTS: 300,
  RELAXED_ATTEMPTS: 200,
  PERMUTATION_NODES: 20_000,
  SCHEDULE_ATTEMPTS: 400,
  /** Schedules tried (each in its best round order) before keeping the one with the fewest runs of 3. */
  SCHEDULE_KEEP: 12,
  MATCHING_NODES: 20_000,
} as const;

export interface LeagueMatch {
  home: string;
  away: string;
}

export interface LeaguePhaseDraw {
  /** Pot order, pot 1 (strongest) first. */
  pots: string[][];
  /** 144 matches; every club 4 at home, 4 away, 2 opponents per pot. */
  matches: LeagueMatch[];
}

type Rules = { sameCountry: boolean; maxPerCountry: number };

/** Clubs into 4 pots of 9 by level (desc, then id), then the opponents (`drawOpponents`). Deterministic per `rng`. */
export function drawLeaguePhase(clubs: readonly DrawClub[], rng: () => number): LeaguePhaseDraw {
  const L = LEAGUE_PHASE;
  if (clubs.length !== L.CLUBS) throw new Error(`drawLeaguePhase: need ${L.CLUBS} clubs, got ${clubs.length}`);
  const sorted = [...clubs].sort((a, b) => b.level - a.level || a.id.localeCompare(b.id, undefined, { numeric: true }));
  const pots = Array.from({ length: L.POTS }, (_, i) => sorted.slice(i * L.POT_SIZE, (i + 1) * L.POT_SIZE).map((c) => c.id));
  const country = new Map(clubs.map((c) => [c.id, c.country]));
  const tries: [Rules, number][] = [
    [{ sameCountry: false, maxPerCountry: L.MAX_PER_COUNTRY }, L.STRICT_ATTEMPTS],
    [{ sameCountry: false, maxPerCountry: L.ROUNDS }, L.RELAXED_ATTEMPTS],
    [{ sameCountry: true, maxPerCountry: L.ROUNDS }, L.RELAXED_ATTEMPTS],
  ];
  for (const [rules, attempts] of tries) {
    for (let a = 0; a < attempts; a++) {
      const matches = tryDraw(pots, country, rules, rng);
      if (matches) return { pots, matches };
    }
  }
  throw new Error("drawLeaguePhase: no draw found");
}

/** One attempt: every pot's inner cycle and both directions between every pair of pots, in a random order. */
function tryDraw(pots: string[][], country: Map<string, string>, rules: Rules, rng: () => number): LeagueMatch[] | null {
  const opp = new Map<string, Set<string>>();
  const perCountry = new Map<string, Map<string, number>>();
  for (const p of pots) for (const id of p) { opp.set(id, new Set()); perCountry.set(id, new Map()); }
  const ok = (a: string, b: string) => {
    if (a === b || opp.get(a)!.has(b)) return false;
    const ca = country.get(a)!;
    const cb = country.get(b)!;
    if (!rules.sameCountry && ca === cb) return false;
    if (ca !== cb && ((perCountry.get(a)!.get(cb) ?? 0) >= rules.maxPerCountry || (perCountry.get(b)!.get(ca) ?? 0) >= rules.maxPerCountry)) return false;
    return true;
  };
  const link = (a: string, b: string, on: boolean) => {
    const d = on ? 1 : -1;
    if (on) { opp.get(a)!.add(b); opp.get(b)!.add(a); } else { opp.get(a)!.delete(b); opp.get(b)!.delete(a); }
    const ca = country.get(a)!;
    const cb = country.get(b)!;
    perCountry.get(a)!.set(cb, (perCountry.get(a)!.get(cb) ?? 0) + d);
    perCountry.get(b)!.set(ca, (perCountry.get(b)!.get(ca) ?? 0) + d);
  };
  const jobs: [number, number][] = [];
  for (let i = 0; i < pots.length; i++) for (let j = 0; j < pots.length; j++) jobs.push([i, j]);
  const matches: LeagueMatch[] = [];
  for (const [i, j] of shuffle(jobs, rng)) {
    // (i, j): every club of pot i hosts one club of pot j. i === j: a permutation of the pot (cycles of 3+).
    const hosts = shuffle(pots[i]!, rng);
    const guests = pots[j]!;
    const used = new Set<string>();
    const pick: string[] = [];
    let nodes = 0;
    const search = (k: number): boolean => {
      if (k === hosts.length) return true;
      if (++nodes > LEAGUE_PHASE.PERMUTATION_NODES) return false;
      const h = hosts[k]!;
      // With the same-country rule dropped (a pot too full of one country), compatriots only as the last option.
      const order = shuffle(guests, rng);
      if (rules.sameCountry) order.sort((x, y) => Number(country.get(x) === country.get(h)) - Number(country.get(y) === country.get(h)));
      for (const g of order) {
        if (used.has(g) || !ok(h, g)) continue;
        used.add(g); pick.push(g); link(h, g, true);
        if (search(k + 1)) return true;
        used.delete(g); pick.pop(); link(h, g, false);
      }
      return false;
    };
    if (!search(0)) return null;
    hosts.forEach((h, k) => matches.push({ home: h, away: pick[k]! }));
  }
  return matches;
}

/** The 144 matches split into 8 rounds, every club once per round; the round order keeps runs of 3 home or away rare. */
export function scheduleLeaguePhase(matches: readonly LeagueMatch[], rng: () => number): LeagueMatch[][] {
  const L = LEAGUE_PHASE;
  let best: LeagueMatch[][] | null = null;
  let bestRuns = Infinity;
  let found = 0;
  for (let attempt = 0; attempt < L.SCHEDULE_ATTEMPTS && found < L.SCHEDULE_KEEP && bestRuns > 0; attempt++) {
    const rounds = tryRounds(matches, rng);
    if (!rounds) continue;
    found++;
    const ordered = bestOrder(rounds);
    const runs = venueRuns(ordered);
    if (runs < bestRuns) { best = ordered; bestRuns = runs; }
  }
  if (!best) throw new Error("scheduleLeaguePhase: no 8-round schedule found");
  return best;
}

/** Peels off one perfect matching per round (randomised backtracking, fewest options first). */
function tryRounds(matches: readonly LeagueMatch[], rng: () => number): LeagueMatch[][] | null {
  let left = shuffle(matches, rng);
  const rounds: LeagueMatch[][] = [];
  for (let r = 0; r < LEAGUE_PHASE.ROUNDS; r++) {
    const round = perfectMatching(left, rng);
    if (!round) return null;
    const taken = new Set(round);
    rounds.push(round);
    left = left.filter((m) => !taken.has(m));
  }
  return rounds;
}

function perfectMatching(edges: readonly LeagueMatch[], rng: () => number): LeagueMatch[] | null {
  const byClub = new Map<string, LeagueMatch[]>();
  for (const e of edges) {
    (byClub.get(e.home) ?? byClub.set(e.home, []).get(e.home)!).push(e);
    (byClub.get(e.away) ?? byClub.set(e.away, []).get(e.away)!).push(e);
  }
  const clubs = [...byClub.keys()];
  const busy = new Set<string>();
  const out: LeagueMatch[] = [];
  let nodes = 0;
  const search = (): boolean => {
    if (busy.size === clubs.length) return true;
    if (++nodes > LEAGUE_PHASE.MATCHING_NODES) return false;
    let best: string | null = null;
    let bestOpts: LeagueMatch[] = [];
    for (const c of clubs) {
      if (busy.has(c)) continue;
      const opts = byClub.get(c)!.filter((e) => !busy.has(e.home === c ? e.away : e.home));
      if (best === null || opts.length < bestOpts.length) { best = c; bestOpts = opts; }
      if (opts.length === 0) return false;
    }
    for (const e of shuffle(bestOpts, rng)) {
      busy.add(e.home); busy.add(e.away); out.push(e);
      if (search()) return true;
      busy.delete(e.home); busy.delete(e.away); out.pop();
    }
    return false;
  };
  return search() ? [...out] : null;
}

/** Runs of 3 (or more) home or away matches in a row, summed over the clubs. */
export function venueRuns(rounds: readonly (readonly LeagueMatch[])[]): number {
  const seq = new Map<string, string>();
  for (const round of rounds) for (const m of round) {
    seq.set(m.home, (seq.get(m.home) ?? "") + "H");
    seq.set(m.away, (seq.get(m.away) ?? "") + "A");
  }
  let runs = 0;
  for (const s of seq.values()) runs += (s.match(/HHH+|AAA+/g) ?? []).length;
  return runs;
}

/** The round order (of the 8! orders) with the fewest runs of 3; a depth-first search pruned on the best count so far. */
function bestOrder(rounds: LeagueMatch[][]): LeagueMatch[][] {
  const n = rounds.length;
  const ids = [...new Set(rounds[0]!.flatMap((m) => [m.home, m.away]))];
  const idx = new Map(ids.map((id, k) => [id, k]));
  // home[r][c]: 1 when club c is at home in round r.
  const home = rounds.map((round) => {
    const v = new Uint8Array(ids.length);
    for (const m of round) v[idx.get(m.home)!] = 1;
    return v;
  });
  const order: number[] = [];
  const used = new Array<boolean>(n).fill(false);
  let best: number[] = [...Array(n).keys()];
  let bestRuns = Infinity;
  const search = (runs: number): boolean => {
    if (runs >= bestRuns) return false;
    if (order.length === n) { bestRuns = runs; best = order.slice(); return runs === 0; }
    for (let r = 0; r < n; r++) {
      if (used[r]) continue;
      let add = 0;
      const k = order.length;
      if (k >= 2) {
        const a = home[order[k - 2]!]!;
        const b = home[order[k - 1]!]!;
        const c = home[r]!;
        // A new run of 3 starts here only when the club wasn't already in one (k − 3 differs or doesn't exist).
        const z = k >= 3 ? home[order[k - 3]!]! : null;
        for (let x = 0; x < ids.length; x++) if (a[x] === b[x] && b[x] === c[x] && (!z || z[x] !== a[x])) add++;
      }
      used[r] = true; order.push(r);
      const done = search(runs + add);
      used[r] = false; order.pop();
      if (done) return true;
    }
    return false;
  };
  search(0);
  return best.map((i) => rounds[i]!);
}

export interface LeagueRow {
  squadId: string;
  mp: number;
  w: number;
  d: number;
  l: number;
  gf: number;
  ga: number;
  gd: number;
  pts: number;
  awayGf: number;
  awayW: number;
}

/** The single table: points, goal difference, goals, away goals, wins, away wins, id. */
export function leaguePhaseTable(clubs: readonly string[], fixtures: readonly Fixture[]): LeagueRow[] {
  const rows = new Map<string, LeagueRow>(clubs.map((id) => [id, { squadId: id, mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, awayGf: 0, awayW: 0 }]));
  for (const f of fixtures) {
    if (!f.played || !f.result) continue;
    const h = rows.get(f.home);
    const a = rows.get(f.away);
    if (!h || !a) continue;
    const { home: hg, away: ag } = f.result;
    h.mp++; a.mp++;
    h.gf += hg; h.ga += ag; a.gf += ag; a.ga += hg; a.awayGf += ag;
    if (hg > ag) { h.w++; a.l++; h.pts += 3; } else if (hg < ag) { a.w++; a.awayW++; h.l++; a.pts += 3; } else { h.d++; a.d++; h.pts++; a.pts++; }
  }
  for (const r of rows.values()) r.gd = r.gf - r.ga;
  return [...rows.values()].sort((x, y) =>
    y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || y.awayGf - x.awayGf || y.w - x.w || y.awayW - x.awayW
    || x.squadId.localeCompare(y.squadId, undefined, { numeric: true }));
}

/** Play-off ties from the final order (index 0 = 1st): 9th v 24th, 10th v 23rd … 16th v 17th; the better placed hosts the second leg. */
export function playoffTies(order: readonly string[]): KnockoutTie[] {
  const ties: KnockoutTie[] = [];
  for (let s = 9; s <= 16; s++) ties.push({ first: order[33 - s - 1]!, second: order[s - 1]! });
  return ties;
}

/** Bracket order of the round-of-16 ties by the seeded club's position: 1 v 8 and 4 v 5 meet, then 2 v 7 and 3 v 6. */
export const BRACKET_ORDER = [1, 8, 4, 5, 2, 7, 3, 6] as const;

/**
 * Round of 16: the k-th placed club (1..8) against the winner of the play-off tie of the (17 − k)-th placed club, in
 * `BRACKET_ORDER`. `seeds` is the final league position of every club.
 */
export function roundOf16Ties(seeds: Readonly<Record<string, number>>, playoffWinners: readonly string[]): KnockoutTie[] {
  const top = Object.entries(seeds).filter(([, pos]) => pos <= LEAGUE_PHASE.DIRECT);
  const byPos = new Map(top.map(([id, pos]) => [pos, id]));
  const winnerOf = new Map<number, string>();
  for (const w of playoffWinners) {
    const pos = seeds[w]!;
    winnerOf.set(pos <= 16 ? pos : 33 - pos, w);
  }
  return BRACKET_ORDER.map((k) => ({ first: winnerOf.get(17 - k)!, second: byPos.get(k)! }));
}

/**
 * Next round of the fixed bracket: the winners of consecutive ties in bracket order meet; the better placed in the
 * league phase hosts the second leg (or is the second side of the neutral final). `winners` must be in tie order.
 */
export function bracketTies(seeds: Readonly<Record<string, number>>, winners: readonly string[]): KnockoutTie[] {
  const ties: KnockoutTie[] = [];
  for (let i = 0; i + 1 < winners.length; i += 2) {
    const a = winners[i]!;
    const b = winners[i + 1]!;
    ties.push((seeds[a] ?? 99) <= (seeds[b] ?? 99) ? { first: b, second: a } : { first: a, second: b });
  }
  return ties;
}
