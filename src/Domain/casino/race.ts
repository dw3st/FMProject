/** Car race of the games hall: 8 cars, Plackett-Luce finishing order from their strength. */
import { mulberry32, seedFrom } from "@/Domain/rng";

export const RACE = {
  CARS: 8,
  /** Odds = RTP ÷ chance, floored to STEP, never below MIN_ODDS. */
  RTP: 0.92,
  STEP: 0.05,
  MIN_ODDS: 1.05,
  /** Orders simulated for the top-3 chance. */
  TOP3_SIMS: 20_000,
  /** Strength = e^(SPREAD × z): the favourite wins about a third of the races. */
  SPREAD: 0.55,
  NAMES: ["Raio", "Trovão", "Cometa", "Fera", "Vulto", "Brasa", "Neblina", "Coruja", "Faísca", "Tufão", "Rojão", "Pantera", "Corisco", "Furacão", "Sombra", "Piloto"],
} as const;

export type RaceKind = "win" | "top3";

export interface RaceCar {
  /** Lane and colour, 1..8. */
  n: number;
  name: string;
  strength: number;
  winOdds: number;
  top3Odds: number;
}

export interface RaceCard {
  no: number;
  cars: RaceCar[];
}

const toOdds = (p: number) => Math.max(RACE.MIN_ODDS, Math.floor((RACE.RTP / p) / RACE.STEP + 1e-9) * RACE.STEP);
const round2 = (x: number) => Math.round(x * 100) / 100;

/** One finishing order (car indices, winner first): Plackett-Luce from the strengths. */
export function drawOrder(strengths: readonly number[], rng: () => number): number[] {
  const left = strengths.map((s, i) => ({ s, i }));
  const order: number[] = [];
  while (left.length > 0) {
    const total = left.reduce((a, c) => a + c.s, 0);
    let u = rng() * total;
    let k = 0;
    for (; k < left.length - 1; k++) { u -= left[k]!.s; if (u < 0) break; }
    order.push(left[k]!.i);
    left.splice(k, 1);
  }
  return order;
}

/** Chance of each car finishing in the top 3, by simulation with a fixed seed. */
export function top3Chances(strengths: readonly number[], seed: number): number[] {
  const rng = mulberry32(seed);
  const hits = strengths.map(() => 0);
  for (let i = 0; i < RACE.TOP3_SIMS; i++) for (const c of drawOrder(strengths, rng).slice(0, 3)) hits[c]!++;
  return hits.map((h) => h / RACE.TOP3_SIMS);
}

/** The race card `no` of a seat: names, strengths and odds from the seat's salt (public once drawn). */
export function raceCard(salt: string, no: number): RaceCard {
  const rng = mulberry32(seedFrom(`${salt}:race:${no}`));
  const names = [...RACE.NAMES];
  const strengths: number[] = [];
  const picked: string[] = [];
  for (let i = 0; i < RACE.CARS; i++) {
    const k = Math.floor(rng() * names.length);
    picked.push(names.splice(k, 1)[0]!);
    // Box-Muller normal.
    const z = Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
    strengths.push(Math.exp(RACE.SPREAD * z));
  }
  const total = strengths.reduce((a, b) => a + b, 0);
  const top3 = top3Chances(strengths, seedFrom(`${salt}:race:${no}:top3`));
  return {
    no,
    cars: strengths.map((s, i) => ({ n: i + 1, name: picked[i]!, strength: round2(s), winOdds: round2(toOdds(s / total)), top3Odds: round2(toOdds(top3[i]!)) })),
  };
}

/** What a bet returns as a multiplier of the stake (0 = lost). */
export function racePayout(card: RaceCard, order: readonly number[], car: number, kind: RaceKind): number {
  const pos = order.indexOf(car - 1);
  const c = card.cars[car - 1];
  if (!c || pos < 0) return 0;
  if (kind === "win") return pos === 0 ? c.winOdds : 0;
  return pos < 3 ? c.top3Odds : 0;
}

export function parseRaceBet(car: unknown, kind: unknown): { car: number; kind: RaceKind } | null {
  const n = Number(car);
  if (!Number.isInteger(n) || n < 1 || n > RACE.CARS) return null;
  if (kind !== "win" && kind !== "top3") return null;
  return { car: n, kind };
}

/** Expected return of a bet (for the RTP script). */
export function raceRtp(card: RaceCard): { win: number; top3: number } {
  const total = card.cars.reduce((a, c) => a + c.strength, 0);
  const top3 = top3Chances(card.cars.map((c) => c.strength), 1);
  return {
    win: card.cars.reduce((a, c) => a + (c.strength / total) * c.winOdds, 0) / card.cars.length,
    top3: card.cars.reduce((a, c, i) => a + top3[i]! * c.top3Odds, 0) / card.cars.length,
  };
}
