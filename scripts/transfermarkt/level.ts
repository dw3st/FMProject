/**
 * Market "level" of a player: log(value) minus the market premium of his age.
 *
 * The age premium is estimated against an independent measure of skill — the open-football seed
 * overall — so it only captures what the market pays for age at equal skill (youth potential, veteran
 * discount), not the fact that most youths and veterans are weaker:
 *
 *   log(value) = a_league + b·seedOverall + age[band] + line[line]   (least squares, one fit, league fixed effect)
 *
 * Bands: ≤ 18 together, 19…34 one per year, ≥ 35 together; 27 is the reference (0). Fitted only on
 * players that have both a seed overall and a value; applied to every matched player.
 *
 * Caps (documented safety net): the premium removed from a young player (< 27) is at most ±0.5 in log
 * units (×1.65), and from a veteran (> 27) at most ±0.7 (×2): thin or noisy bands never move a player
 * past that. The line premium (Midfielder = 0) is capped at ±0.8: at equal seed skill the line never
 * decides, and the league keeps one multiset of overalls for every line (reorder.ts).
 */
import type { MainRole } from "@/Domain/roles";

export interface SeedRated { league: string; age: number; line: MainRole; value: number; seedOverall: number }
export interface Effects { age: Map<number, number>; line: Record<MainRole, number> }
export interface SeedFit extends Effects { slope: number; raw: Map<number, number>; rawLine: Record<MainRole, number>; n: number }

export const AGE_BAND_MIN = 18, AGE_BAND_MAX = 35, AGE_REF = 27;
export const YOUTH_CAP = 0.5, VETERAN_CAP = 0.7, LINE_CAP = 0.8;
const LINES: MainRole[] = ["GK", "Defender", "Forward"]; // Midfielder is the reference
const MIN_AGE = 16, MAX_AGE = 40;
const band = (age: number) => Math.max(AGE_BAND_MIN, Math.min(AGE_BAND_MAX, Math.round(age)));

/** Solves A x = b (small, symmetric) by Gauss-Jordan with partial pivoting; empty columns give 0. */
function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]!]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[p]![c]!)) p = r;
    [M[c], M[p]] = [M[p]!, M[c]!];
    const piv = M[c]![c]!;
    if (Math.abs(piv) < 1e-12) continue;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r]![c]! / piv;
      if (f) for (let k = c; k <= n; k++) M[r]![k]! -= f * M[c]![k]!;
    }
  }
  return M.map((row, i) => (Math.abs(row[i]!) < 1e-12 ? 0 : row[n]! / row[i]!));
}

const capFor = (age: number, x: number) => {
  const cap = age < AGE_REF ? YOUTH_CAP : VETERAN_CAP;
  return Math.max(-cap, Math.min(cap, x));
};

export function fitSeedAgeEffects(players: SeedRated[]): SeedFit {
  const used = players.filter((p) => p.value > 0 && Number.isFinite(p.seedOverall));
  const ages: number[] = [];
  for (let a = AGE_BAND_MIN; a <= AGE_BAND_MAX; a++) if (a !== AGE_REF) ages.push(a);
  const k = 1 + ages.length + LINES.length;
  const row = (p: SeedRated) => [
    p.seedOverall,
    ...ages.map((a) => (band(p.age) === a ? 1 : 0)),
    ...LINES.map((l) => (p.line === l ? 1 : 0)),
  ];
  const byLeague = new Map<string, SeedRated[]>();
  for (const p of used) byLeague.set(p.league, [...(byLeague.get(p.league) ?? []), p]);
  const A = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const b = new Array<number>(k).fill(0);
  for (const list of byLeague.values()) {
    // Demeaning inside the league absorbs its fixed effect.
    const xs = list.map(row), ys = list.map((p) => Math.log(p.value));
    const mx = new Array<number>(k).fill(0);
    let my = 0;
    xs.forEach((x, i) => { x.forEach((v, j) => (mx[j]! += v / xs.length)); my += ys[i]! / xs.length; });
    xs.forEach((x, i) => {
      const d = x.map((v, j) => v - mx[j]!), dy = ys[i]! - my;
      for (let r = 0; r < k; r++) { b[r]! += d[r]! * dy; for (let c = 0; c < k; c++) A[r]![c]! += d[r]! * d[c]!; }
    });
  }
  const coef = solve(A, b);
  const raw = new Map<number, number>([[AGE_REF, 0]]);
  ages.forEach((a, i) => raw.set(a, coef[1 + i]!));
  const age = new Map<number, number>();
  for (let a = MIN_AGE; a <= MAX_AGE; a++) age.set(a, capFor(a, raw.get(band(a))!));
  const rawLine = { GK: 0, Defender: 0, Midfielder: 0, Forward: 0 } as Record<MainRole, number>;
  LINES.forEach((l, i) => (rawLine[l] = coef[1 + ages.length + i]!));
  const line = Object.fromEntries(
    Object.entries(rawLine).map(([l, v]) => [l, Math.max(-LINE_CAP, Math.min(LINE_CAP, v))]),
  ) as Record<MainRole, number>;
  return { age, raw, line, rawLine, slope: coef[0]!, n: used.length };
}

export function levelOf(p: { age: number; line: MainRole; value: number }, fx: Effects): number {
  const a = Math.max(MIN_AGE, Math.min(MAX_AGE, Math.round(p.age)));
  return Math.log(p.value) - (fx.age.get(a) ?? 0) - fx.line[p.line];
}
