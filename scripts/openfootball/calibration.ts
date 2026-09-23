import { normName } from "@/../scripts/openfootball/ids";

export interface LineFit { a: number; b: number; sd: number; n: number }

export function fitLine(points: Array<[number, number]>): LineFit {
  const n = points.length;
  const mx = points.reduce((s, [x]) => s + x, 0) / n;
  const my = points.reduce((s, [, y]) => s + y, 0) / n;
  const sxx = points.reduce((s, [x]) => s + (x - mx) ** 2, 0);
  const sxy = points.reduce((s, [x, y]) => s + (x - mx) * (y - my), 0);
  const b = sxx === 0 ? 0 : sxy / sxx;
  const a = my - b * mx;
  const sd = Math.sqrt(points.reduce((s, [x, y]) => s + (y - (a + b * x)) ** 2, 0) / Math.max(1, n));
  return { a, b, sd, n };
}

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

export function matchPlayers(
  tl: Array<{ id: string; name: string; fullName?: string }>,
  seed: Array<{ id: string; name: string }>,
): Map<string, string> {
  const byFull = new Map(seed.map((s) => [normName(s.name), s.id]));
  const lastCount = new Map<string, number>();
  const byLast = new Map<string, string>();
  for (const s of seed) {
    const l = lastToken(normName(s.name));
    lastCount.set(l, (lastCount.get(l) ?? 0) + 1);
    byLast.set(l, s.id);
  }
  const out = new Map<string, string>();
  for (const t of tl) {
    const full = normName(t.fullName ?? t.name);
    const fullHit = byFull.get(full) ?? byFull.get(normName(t.name));
    if (fullHit) { out.set(t.id, fullHit); continue; }
    const l = lastToken(normName(t.name));
    if (lastCount.get(l) === 1) out.set(t.id, byLast.get(l)!);
  }
  return out;
}
