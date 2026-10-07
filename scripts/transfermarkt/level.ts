import type { MainRole } from "@/Domain/roles";

export interface ValuedPlayer { id: string; league: string; age: number; line: MainRole; value: number }
export interface Effects { age: Map<number, number>; line: Record<MainRole, number> }

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};
const MIN_AGE = 16, MAX_AGE = 40;
const clampAge = (a: number) => Math.max(MIN_AGE, Math.min(MAX_AGE, Math.round(a)));

/**
 * log(value) effects, estimated inside each league (so league strength never leaks in) and
 * aggregated by median: age (1-year bands, relative to 27) and main line (relative to Midfielder).
 */
export function fitEffects(players: ValuedPlayer[]): Effects {
  const byLeague = new Map<string, ValuedPlayer[]>();
  for (const p of players) if (p.value > 0) byLeague.set(p.league, [...(byLeague.get(p.league) ?? []), p]);

  const ageDiffs = new Map<number, number[]>();
  const lineDiffs: Record<MainRole, number[]> = { GK: [], Defender: [], Midfielder: [], Forward: [] };
  for (const list of byLeague.values()) {
    const ref = list.filter((p) => clampAge(p.age) === 27).map((p) => Math.log(p.value));
    if (ref.length) {
      const r = median(ref);
      const bands = new Map<number, number[]>();
      for (const p of list) bands.set(clampAge(p.age), [...(bands.get(clampAge(p.age)) ?? []), Math.log(p.value)]);
      for (const [a, xs] of bands) ageDiffs.set(a, [...(ageDiffs.get(a) ?? []), median(xs) - r]);
    }
    const mid = list.filter((p) => p.line === "Midfielder").map((p) => Math.log(p.value));
    if (mid.length) {
      const r = median(mid);
      for (const line of Object.keys(lineDiffs) as MainRole[]) {
        const xs = list.filter((p) => p.line === line).map((p) => Math.log(p.value));
        if (xs.length) lineDiffs[line].push(median(xs) - r);
      }
    }
  }
  const age = new Map<number, number>();
  for (const [a, ds] of ageDiffs) age.set(a, a === 27 ? 0 : median(ds));
  const line = { GK: 0, Defender: 0, Midfielder: 0, Forward: 0 } as Record<MainRole, number>;
  for (const l of Object.keys(lineDiffs) as MainRole[]) line[l] = l === "Midfielder" || !lineDiffs[l].length ? 0 : median(lineDiffs[l]);
  return { age, line };
}

/** Nearest band with an estimate (ages at the edges borrow the closest band). */
function ageEffect(fx: Effects, age: number): number {
  const a = clampAge(age);
  for (let d = 0; d <= MAX_AGE - MIN_AGE; d++) {
    if (fx.age.has(a - d)) return fx.age.get(a - d)!;
    if (fx.age.has(a + d)) return fx.age.get(a + d)!;
  }
  return 0;
}

export function levelOf(p: ValuedPlayer, fx: Effects): number {
  return Math.log(p.value) - ageEffect(fx, p.age) - fx.line[p.line];
}

// ── Conditional effects (the market premium for age/line at a given level) ──────────────────────────

export interface RatedPlayer extends ValuedPlayer { overall: number }

/** Age bands of the conditional fit: ≤ 18 together, 19…34 one per year, ≥ 35 together. */
export const COND_AGE_MIN = 18, COND_AGE_MAX = 35;
/** Effects are clamped to ± this (log units, e^1.2 ≈ 3.3×): thin bands must not invent huge premiums. */
export const COND_EFFECT_CAP = 1.2;
const band = (age: number) => Math.max(COND_AGE_MIN, Math.min(COND_AGE_MAX, Math.round(age)));
const LINES: MainRole[] = ["GK", "Defender", "Forward"]; // Midfielder is the reference

/** Solves A x = b (A symmetric positive semi-definite, small) by Gaussian elimination with partial pivoting. */
function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]!]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[p]![c]!)) p = r;
    [M[c], M[p]] = [M[p]!, M[c]!];
    const piv = M[c]![c]!;
    if (Math.abs(piv) < 1e-12) { M[c]![n] = 0; continue; } // empty column → coefficient 0
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r]![c]! / piv;
      if (f) for (let k = c; k <= n; k++) M[r]![k]! -= f * M[c]![k]!;
    }
  }
  return M.map((row, i) => (Math.abs(row[i]!) < 1e-12 ? 0 : row[n]! / row[i]!));
}

/**
 * Least squares, one fit for the whole world with a fixed effect per league:
 *   log(value) = a_league + b·overall + age[band] + line[line]
 * (references: age 27 and Midfielder). Today's overall stands in for the level, so a weaker age band
 * whose value is proportional to its level gets no effect, and only the market premium (youth potential,
 * veteran discount) is removed. The league effect is absorbed by demeaning every column inside its league.
 */
export function fitConditionalEffects(players: RatedPlayer[]): Effects & { slope: number } {
  const valued = players.filter((p) => p.value > 0);
  const ages: number[] = [];
  for (let a = COND_AGE_MIN; a <= COND_AGE_MAX; a++) if (a !== 27) ages.push(a);
  const k = 1 + ages.length + LINES.length;
  const row = (p: RatedPlayer): number[] => [
    p.overall,
    ...ages.map((a) => (band(p.age) === a ? 1 : 0)),
    ...LINES.map((l) => (p.line === l ? 1 : 0)),
  ];
  const byLeague = new Map<string, RatedPlayer[]>();
  for (const p of valued) byLeague.set(p.league, [...(byLeague.get(p.league) ?? []), p]);
  const A = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const b = new Array<number>(k).fill(0);
  for (const list of byLeague.values()) {
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
  const cap = (x: number) => Math.max(-COND_EFFECT_CAP, Math.min(COND_EFFECT_CAP, x));
  const age = new Map<number, number>([[27, 0]]);
  ages.forEach((a, i) => age.set(a, cap(coef[1 + i]!)));
  for (let a = MIN_AGE; a < COND_AGE_MIN; a++) age.set(a, age.get(COND_AGE_MIN)!);
  for (let a = COND_AGE_MAX + 1; a <= MAX_AGE; a++) age.set(a, age.get(COND_AGE_MAX)!);
  const line = { GK: 0, Defender: 0, Midfielder: 0, Forward: 0 } as Record<MainRole, number>;
  LINES.forEach((l, i) => (line[l] = cap(coef[1 + ages.length + i]!)));
  return { age, line, slope: coef[0]! };
}
