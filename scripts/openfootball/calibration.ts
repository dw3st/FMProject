import { normName } from "@/../scripts/openfootball/ids";
import { mainRole, type MainRole } from "@/../scripts/openfootball/roster";
import { STAT_KEYS, type PlayerCoeffs, type StatKey } from "@/../scripts/openfootball/derive";
import type { SeedPlayer } from "@/../scripts/openfootball/types";

export interface LineFit { a: number; b: number; sd: number; n: number }

/** OLS y = a + b·x. Residual sd uses n − 2 degrees of freedom (floored at 1). Throws on no points. */
export function fitLine(points: Array<[number, number]>): LineFit {
  const n = points.length;
  if (n === 0) throw new Error("fitLine: no points");
  const mx = points.reduce((s, [x]) => s + x, 0) / n;
  const my = points.reduce((s, [, y]) => s + y, 0) / n;
  const sxx = points.reduce((s, [x]) => s + (x - mx) ** 2, 0);
  const sxy = points.reduce((s, [x, y]) => s + (x - mx) * (y - my), 0);
  const b = sxx === 0 ? 0 : sxy / sxx;
  const a = my - b * mx;
  const sd = Math.sqrt(points.reduce((s, [x, y]) => s + (y - (a + b * x)) ** 2, 0) / Math.max(1, n - 2));
  return { a, b, sd, n };
}

/** Fits ln(y) on x, ignoring y ≤ 0. Throws `fitLine: no points` when no y is positive. */
export function fitLogLine(points: Array<[number, number]>): LineFit {
  return fitLine(points.filter(([, y]) => y > 0).map(([x, y]) => [x, Math.log(y)]));
}

export function matchClubs(
  tl: Array<{ id: string; name: string }>,
  seed: Array<{ id: string; name: string }>,
): Map<string, string> {
  const out = new Map<string, string>();
  for (const t of tl) {
    const tn = normName(t.name);
    const hit = seed.find((s) => normName(s.name) === tn)
      ?? seed.find((s) => { const sn = normName(s.name); return sn.includes(tn) || tn.includes(sn); });
    if (hit) out.set(t.id, hit.id);
  }
  return out;
}

const lastToken = (s: string) => s.split(" ").at(-1) ?? s;
const countBy = (keys: string[]) => {
  const m = new Map<string, number>();
  for (const k of keys) m.set(k, (m.get(k) ?? 0) + 1);
  return m;
};

/**
 * Matches TL players to seed players of one club pair. One-to-one: each seed player is used at most once.
 * TL players are processed in id order; all full-name matches first, then unique-surname matches.
 * Full-name keys shared by several seed players (homonyms) are skipped; so are surnames that are not
 * unique in the seed club. When both sides carry `age`, a match needs |tl.age − seed.age| ≤ 1.
 */
export function matchPlayers(
  tl: Array<{ id: string; name: string; fullName?: string; age?: number }>,
  seed: Array<{ id: string; name: string; age?: number }>,
): Map<string, string> {
  const seedFull = seed.map((s) => normName(s.name));
  const fullCount = countBy(seedFull);
  const lastCount = countBy(seedFull.map(lastToken));
  const byFull = new Map<string, number>();
  const byLast = new Map<string, number>();
  seedFull.forEach((k, i) => { byFull.set(k, i); byLast.set(lastToken(k), i); });

  const used = new Set<number>();
  const out = new Map<string, string>();
  const order = [...tl].sort((a, b) => a.id.localeCompare(b.id));
  const ageOk = (t: { age?: number }, s: { age?: number }) =>
    t.age == null || s.age == null || Math.abs(t.age - s.age) <= 1;
  const tryTake = (t: (typeof tl)[number], idx: number | undefined) => {
    if (idx === undefined || used.has(idx) || !ageOk(t, seed[idx]!)) return false;
    used.add(idx);
    out.set(t.id, seed[idx]!.id);
    return true;
  };

  for (const t of order) {
    for (const key of new Set([normName(t.fullName ?? t.name), normName(t.name)])) {
      if (fullCount.get(key) === 1 && tryTake(t, byFull.get(key))) break;
    }
  }
  for (const t of order) {
    if (out.has(t.id)) continue;
    const l = lastToken(normName(t.name));
    if (lastCount.get(l) === 1) tryTake(t, byLast.get(l));
  }
  return out;
}

export interface PlaneFit { a: number; b: number; c: number; sd: number; n: number }

/**
 * OLS y = a + b·x1 + c·x2 (solved on centered data). Residual sd uses n − 3 degrees of freedom
 * (floored at 1). Throws on fewer than 3 points or a singular design (x1 or x2 constant, or collinear).
 */
export function fitPlane(points: Array<[x1: number, x2: number, y: number]>): PlaneFit {
  const n = points.length;
  if (n < 3) throw new Error(`fitPlane: need at least 3 points (got ${n})`);
  const m1 = points.reduce((s, [x]) => s + x, 0) / n;
  const m2 = points.reduce((s, [, x]) => s + x, 0) / n;
  const my = points.reduce((s, [, , y]) => s + y, 0) / n;
  let s11 = 0, s22 = 0, s12 = 0, s1y = 0, s2y = 0;
  for (const [x1, x2, y] of points) {
    const d1 = x1 - m1, d2 = x2 - m2, dy = y - my;
    s11 += d1 * d1; s22 += d2 * d2; s12 += d1 * d2; s1y += d1 * dy; s2y += d2 * dy;
  }
  const det = s11 * s22 - s12 * s12;
  if (!(s11 > 0) || !(s22 > 0) || !(det > 1e-9 * s11 * s22)) throw new Error("fitPlane: singular matrix");
  const b = (s1y * s22 - s2y * s12) / det;
  const c = (s2y * s11 - s1y * s12) / det;
  const a = my - b * m1 - c * m2;
  const sd = Math.sqrt(points.reduce((s, [x1, x2, y]) => s + (y - (a + b * x1 + c * x2)) ** 2, 0) / Math.max(1, n - 3));
  return { a, b, c, sd, n };
}

/** Points are [seed overall, league reputation / 1000, TL stat]. */
export type StatPoints = Record<StatKey, Array<[number, number, number]>>;
export interface CollectedStatPoints { byRole: Record<MainRole, StatPoints>; pooled: StatPoints }

const emptyPoints = (): StatPoints =>
  Object.fromEntries(STAT_KEYS.map((k) => [k, [] as Array<[number, number, number]>])) as StatPoints;

/**
 * Groups (seed.overall, leagueRep, tl.stats[k]) points by the SEED main role (that is what `derivePlayer`
 * keys on). `leagueRep` is the seed league reputation / 1000: seed OVR is normalized within each league,
 * so league quality must enter as its own covariate. The pooled set only takes outfield roles: GK stat
 * profiles would drag outfield fallbacks toward keeper values. Non-finite stat values are skipped.
 */
export function collectStatPoints(
  pairs: Array<{ tl: { stats: Partial<Record<string, number>> }; seed: Pick<SeedPlayer, "position" | "overall">; leagueRep: number }>,
): CollectedStatPoints {
  const byRole: Record<MainRole, StatPoints> = { GK: emptyPoints(), Defender: emptyPoints(), Midfielder: emptyPoints(), Forward: emptyPoints() };
  const pooled = emptyPoints();
  for (const { tl, seed, leagueRep } of pairs) {
    const role = mainRole(seed.position);
    for (const k of STAT_KEYS) {
      const y = tl.stats[k];
      if (typeof y !== "number" || !Number.isFinite(y)) continue;
      byRole[role][k].push([seed.overall, leagueRep, y]);
      if (role !== "GK") pooled[k].push([seed.overall, leagueRep, y]);
    }
  }
  return { byRole, pooled };
}

/**
 * Fits a plane for every role/stat set with ≥ 3 points; smaller sets are omitted (derivePlayer falls
 * back to pooled). `repMin` / `repMax` are the league reputations seen in calibration.
 */
export function fitPlayerCoeffs(points: CollectedStatPoints): PlayerCoeffs {
  const fitAll = (sp: StatPoints) =>
    Object.fromEntries(STAT_KEYS.filter((k) => sp[k].length >= 3).map((k) => [k, fitPlane(sp[k])])) as Record<string, PlaneFit>;
  const reps = [...Object.values(points.byRole), points.pooled].flatMap((sp) => STAT_KEYS.flatMap((k) => sp[k].map(([, r]) => r)));
  if (reps.length === 0) throw new Error("fitPlayerCoeffs: no points");
  return {
    byRole: { GK: fitAll(points.byRole.GK), Defender: fitAll(points.byRole.Defender), Midfielder: fitAll(points.byRole.Midfielder), Forward: fitAll(points.byRole.Forward) },
    pooled: fitAll(points.pooled),
    repMin: Math.min(...reps),
    repMax: Math.max(...reps),
  };
}
