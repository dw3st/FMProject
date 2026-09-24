import type { Zone } from "@/../scripts/openfootball/leagues";
import type { CountryPyramid, PyramidGroup, PyramidLevel, Pyramids } from "@/types/pyramidTypes";

/** One league as seen by the pyramid builder: final leagueData slug, country name, club count and level. */
export interface PyramidLeague { slug: string; country: string; clubs: number; tier: number }

const byStr = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
/** Clubs a league trades with an adjacent level before any cross-level cap. */
const base = (clubs: number) => (clubs >= 16 ? 3 : 2);
/** No group may promote or relegate more than half of its clubs. */
const half = (clubs: number) => Math.floor(clubs / 2);

/**
 * Deals `total` one by one over the groups in slug order (round robin), skipping groups at their cap.
 * Result is as even as possible with leftovers going to the first groups. Returns the shares and the
 * amount actually dealt (less than `total` when every group hit its cap).
 */
function deal(total: number, caps: number[]): { shares: number[]; dealt: number } {
  const shares = caps.map(() => 0);
  let dealt = 0;
  while (dealt < total) {
    let progressed = false;
    for (let i = 0; i < caps.length && dealt < total; i++) {
      if (shares[i]! < caps[i]!) { shares[i]!++; dealt++; progressed = true; }
    }
    if (!progressed) break;
  }
  return { shares, dealt };
}

/**
 * Builds the promotion/relegation pyramid of every country with more than one level.
 * Between level N and N+1 (K groups in N+1): K = 1 → n = min(base(N), base(N+1)) clubs each way;
 * K ≥ 2 → each group of N+1 promotes 1 and N relegates K in total. Relegations are split over the
 * groups of N as evenly as possible (leftovers to the first slugs). Counts above half of a group's
 * clubs are reduced (with a console.warn); the two sides of a boundary always sum to the same number.
 */
export function buildPyramid(leagues: PyramidLeague[]): Pyramids {
  const byCountry = new Map<string, PyramidLeague[]>();
  for (const l of leagues) byCountry.set(l.country, [...(byCountry.get(l.country) ?? []), l]);

  const out: Pyramids = {};
  for (const country of [...byCountry.keys()].sort(byStr)) {
    const ls = byCountry.get(country)!;
    const tiers = [...new Set(ls.map((l) => l.tier))].sort((a, b) => a - b);
    if (tiers.length < 2) continue;
    const levels = tiers.map((tier) => ls.filter((l) => l.tier === tier).sort((a, b) => byStr(a.slug, b.slug)));
    const groups: PyramidGroup[][] = levels.map((lv) => lv.map((l) => ({ leagueSlug: l.slug, promote: 0, relegate: 0 })));

    for (let n = 0; n + 1 < levels.length; n++) {
      const upper = levels[n]!;
      const lower = levels[n + 1]!;
      const upperCaps = upper.map((l) => half(l.clubs));
      const upperCapSum = upperCaps.reduce((s, c) => s + c, 0);
      let wanted: number;
      let lowerShares: number[];
      if (lower.length === 1) {
        wanted = Math.min(Math.min(...upper.map((l) => base(l.clubs))), base(lower[0]!.clubs));
        const moved = Math.min(wanted, half(lower[0]!.clubs), upperCapSum);
        lowerShares = [moved];
      } else {
        wanted = lower.length;
        lowerShares = deal(Math.min(wanted, upperCapSum), lower.map((l) => Math.min(1, half(l.clubs)))).shares;
      }
      const total = lowerShares.reduce((s, x) => s + x, 0);
      const upperShares = deal(total, upperCaps).shares;
      if (total < wanted) {
        console.warn(`[pyramid] ${country}: tier ${tiers[n]}→${tiers[n + 1]} capped at ${total} (wanted ${wanted}) — no group may move more than half its clubs`);
      }
      groups[n]!.forEach((g, i) => { g.relegate = upperShares[i]!; });
      groups[n + 1]!.forEach((g, i) => { g.promote = lowerShares[i]!; });
    }

    const pyramidLevels: PyramidLevel[] = tiers.map((tier, i) => ({ tier, groups: groups[i]! }));
    out[country] = { country, levels: pyramidLevels };
  }
  return out;
}

/** Group of `leagueSlug` in a set of pyramids, or null when its country has no pyramid. */
export function pyramidGroupOf(pyramids: Pyramids, leagueSlug: string): PyramidGroup | null {
  for (const p of Object.values(pyramids as Record<string, CountryPyramid>))
    for (const lv of p.levels) for (const g of lv.groups) if (g.leagueSlug === leagueSlug) return g;
  return null;
}

/**
 * Display zones of a league from its pyramid group: `prom` (1..promote) first, then any existing
 * non-prom/rel zones (continental ucl/uel/uecl/lib/sud) unchanged, then `rel` (fromEnd: relegate).
 */
export function zonesFromPyramid(group: PyramidGroup, existing: Zone[] = []): Zone[] {
  const zones: Zone[] = [];
  if (group.promote > 0) zones.push({ id: "prom", label: "Promotion", color: "green", from: 1, to: group.promote });
  zones.push(...existing.filter((z) => z.id !== "prom" && z.id !== "rel"));
  if (group.relegate > 0) zones.push({ id: "rel", label: "Relegation", color: "red", fromEnd: group.relegate });
  return zones;
}
