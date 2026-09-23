import type { SeedPlayer } from "@/../scripts/openfootball/types";
import { unitHash } from "@/../scripts/openfootball/ids";

export type MainRole = "GK" | "Defender" | "Midfielder" | "Forward";
export const MAX_SQUAD = 30;
export const MIN_SQUAD = 18;
export const MIN_BY_ROLE: Record<MainRole, number> = { GK: 3, Defender: 7, Midfielder: 7, Forward: 4 };
const SEED_POS: Record<MainRole, SeedPlayer["position"]> = { GK: "GK", Defender: "DEF", Midfielder: "MID", Forward: "ATT" };

export function mainRole(pos: SeedPlayer["position"]): MainRole {
  return pos === "GK" ? "GK" : pos === "DEF" ? "Defender" : pos === "MID" ? "Midfielder" : "Forward";
}

export interface NamePool { first: string[]; last: string[] }

const byOverallDesc = (a: SeedPlayer, b: SeedPlayer) => b.overall - a.overall || a.id.localeCompare(b.id);

function percentile(xs: number[], q: number): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? 50;
}

export function trimAndFill(players: SeedPlayer[], clubSeedId: string, pool: NamePool): SeedPlayer[] {
  const chosen = new Set<SeedPlayer>();
  for (const role of Object.keys(MIN_BY_ROLE) as MainRole[]) {
    players.filter((x) => mainRole(x.position) === role).sort(byOverallDesc)
      .slice(0, MIN_BY_ROLE[role]).forEach((x) => chosen.add(x));
  }
  for (const x of [...players].sort(byOverallDesc)) {
    if (chosen.size >= MAX_SQUAD) break;
    chosen.add(x);
  }
  const out = [...chosen].sort(byOverallDesc);

  const youthOverall = Math.max(30, percentile(players.map((x) => x.overall), 0.25) - 3);
  let n = 0;
  while (out.length < MIN_SQUAD) {
    const short = (Object.keys(MIN_BY_ROLE) as MainRole[]).find(
      (r) => out.filter((x) => mainRole(x.position) === r).length < MIN_BY_ROLE[r],
    );
    const role: MainRole = short ?? (["Defender", "Midfielder", "Forward", "Midfielder"] as MainRole[])[n % 4]!;
    const key = `${clubSeedId}-youth-${n}`;
    const first = pool.first[Math.floor(unitHash(`${key}:f`) * pool.first.length)] ?? "Juan";
    const last = pool.last[Math.floor(unitHash(`${key}:l`) * pool.last.length)] ?? "Silva";
    out.push({
      id: key, name: `${first} ${last}`, position: SEED_POS[role], overall: youthOverall,
      potential: youthOverall, age: 17 + Math.floor(unitHash(`${key}:a`) * 3),
      country: players[0]?.country ?? "", foot: "R", value: 0, clubId: clubSeedId,
    });
    n++;
  }
  return out;
}

/** First/last-name pools per seed country code, from real seed names (≥ 2 tokens). */
export function buildNamePools(players: SeedPlayer[]): Map<string, NamePool> {
  const pools = new Map<string, { first: Set<string>; last: Set<string> }>();
  for (const x of players) {
    const parts = x.name.trim().split(/\s+/);
    if (parts.length < 2) continue;
    const e = pools.get(x.country) ?? { first: new Set(), last: new Set() };
    e.first.add(parts[0]!);
    e.last.add(parts[parts.length - 1]!);
    pools.set(x.country, e);
  }
  return new Map([...pools].map(([k, v]) => [k, { first: [...v.first].sort(), last: [...v.last].sort() }]));
}
