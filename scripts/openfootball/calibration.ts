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

export type StatPoints = Record<StatKey, Array<[number, number]>>;
export interface CollectedStatPoints { byRole: Record<MainRole, StatPoints>; pooled: StatPoints }

const emptyPoints = (): StatPoints =>
  Object.fromEntries(STAT_KEYS.map((k) => [k, [] as Array<[number, number]>])) as StatPoints;

/**
 * Groups (seed.overall, tl.stats[k]) points by the SEED main role (that is what `derivePlayer` keys on).
 * The pooled set only takes outfield roles: GK stat profiles would drag outfield fallbacks toward
 * keeper values. Non-finite stat values are skipped.
 */
export function collectStatPoints(
  pairs: Array<{ tl: { stats: Partial<Record<string, number>> }; seed: Pick<SeedPlayer, "position" | "overall"> }>,
): CollectedStatPoints {
  const byRole: Record<MainRole, StatPoints> = { GK: emptyPoints(), Defender: emptyPoints(), Midfielder: emptyPoints(), Forward: emptyPoints() };
  const pooled = emptyPoints();
  for (const { tl, seed } of pairs) {
    const role = mainRole(seed.position);
    for (const k of STAT_KEYS) {
      const y = tl.stats[k];
      if (typeof y !== "number" || !Number.isFinite(y)) continue;
      byRole[role][k].push([seed.overall, y]);
      if (role !== "GK") pooled[k].push([seed.overall, y]);
    }
  }
  return { byRole, pooled };
}

/** Fits every non-empty role/stat set; empty role sets are omitted (derivePlayer falls back to pooled). */
export function fitPlayerCoeffs(points: CollectedStatPoints): PlayerCoeffs {
  const fitAll = (sp: StatPoints) =>
    Object.fromEntries(STAT_KEYS.filter((k) => sp[k].length > 0).map((k) => [k, fitLine(sp[k])])) as Record<string, LineFit>;
  return {
    byRole: { GK: fitAll(points.byRole.GK), Defender: fitAll(points.byRole.Defender), Midfielder: fitAll(points.byRole.Midfielder), Forward: fitAll(points.byRole.Forward) },
    pooled: fitAll(points.pooled),
  };
}
