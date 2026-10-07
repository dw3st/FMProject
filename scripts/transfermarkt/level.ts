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
