import type { SeedPlayer } from "@/../scripts/openfootball/types";
import { unitHash } from "@/../scripts/openfootball/ids";

export type MainRole = "GK" | "Defender" | "Midfielder" | "Forward";
export const MAX_SQUAD = 30;
export const MIN_SQUAD = 18;
/** Seed players older than this are dropped (seed has data-entry artifacts up to 85). */
export const MAX_AGE = 45;
export const MIN_BY_ROLE: Record<MainRole, number> = { GK: 3, Defender: 7, Midfielder: 7, Forward: 4 };
const ROLES = Object.keys(MIN_BY_ROLE) as MainRole[];
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

/**
 * Builds a squad that always satisfies MIN_BY_ROLE and has between
 * max(sum(MIN_BY_ROLE), MIN_SQUAD) and MAX_SQUAD players:
 *   1. drop players older than MAX_AGE;
 *   2. best players per role up to the role minimum;
 *   3. youth for every remaining role deficit (regardless of squad size);
 *   4. fill with the best remaining real players up to MAX_SQUAD;
 *   5. pad with youth up to MIN_SQUAD if still short.
 * Youth get `clubCountry` as their country. Output: real players by overall desc, then youth.
 */
export function trimAndFill(players: SeedPlayer[], clubSeedId: string, pool: NamePool, clubCountry: string): SeedPlayer[] {
  const eligible = players.filter((x) => x.age <= MAX_AGE);
  const chosen = new Set<SeedPlayer>();
  for (const role of ROLES) {
    eligible.filter((x) => mainRole(x.position) === role).sort(byOverallDesc)
      .slice(0, MIN_BY_ROLE[role]).forEach((x) => chosen.add(x));
  }

  const youthOverall = Math.max(30, percentile(eligible.map((x) => x.overall), 0.25) - 3);
  const youth: SeedPlayer[] = [];
  const makeYouth = (role: MainRole) => {
    const key = `${clubSeedId}-youth-${youth.length}`;
    const first = pool.first[Math.floor(unitHash(`${key}:f`) * pool.first.length)] ?? "Juan";
    const last = pool.last[Math.floor(unitHash(`${key}:l`) * pool.last.length)] ?? "Silva";
    youth.push({
      id: key, name: `${first} ${last}`, position: SEED_POS[role], overall: youthOverall,
      potential: youthOverall, age: 17 + Math.floor(unitHash(`${key}:a`) * 3),
      country: clubCountry, foot: "R", value: 0, clubId: clubSeedId,
    });
  };

  for (const role of ROLES) {
    const have = [...chosen].filter((x) => mainRole(x.position) === role).length;
    for (let i = have; i < MIN_BY_ROLE[role]; i++) makeYouth(role);
  }

  for (const x of [...eligible].sort(byOverallDesc)) {
    if (chosen.size + youth.length >= MAX_SQUAD) break;
    chosen.add(x);
  }

  const PAD_ROLES: MainRole[] = ["Defender", "Midfielder", "Forward", "Midfielder"];
  for (let n = 0; chosen.size + youth.length < MIN_SQUAD; n++) makeYouth(PAD_ROLES[n % PAD_ROLES.length]!);

  return [...[...chosen].sort(byOverallDesc), ...youth];
}

/** A clean name token: starts with a letter, then letters, apostrophes or hyphens (after NFC). */
const NAME_TOKEN = /^\p{L}[\p{L}'’-]*$/u;

/** First/last-name pools per seed country code, from real seed names (≥ 2 clean tokens). */
export function buildNamePools(players: SeedPlayer[]): Map<string, NamePool> {
  const pools = new Map<string, { first: Set<string>; last: Set<string> }>();
  for (const x of players) {
    const parts = x.name.normalize("NFC").trim().split(/\s+/).filter((t) => NAME_TOKEN.test(t));
    if (parts.length < 2) continue;
    const e = pools.get(x.country) ?? { first: new Set(), last: new Set() };
    e.first.add(parts[0]!);
    e.last.add(parts[parts.length - 1]!);
    pools.set(x.country, e);
  }
  return new Map([...pools].map(([k, v]) => [k, { first: [...v.first].sort(), last: [...v.last].sort() }]));
}
