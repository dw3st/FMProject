import { unitHash } from "@/../scripts/openfootball/ids";
import { STAT_KEYS, playerProfile } from "@/../scripts/openfootball/derive";
import { MAX_SQUAD, MIN_BY_ROLE, MIN_SQUAD, type MainRole, type NamePool } from "@/../scripts/openfootball/roster";
import { getMainRole } from "@/GameInterface/positionHelpers";
import type { PlayerStatsRecord, RosterPlayer } from "@/types/playerTypes";

export const LINES: MainRole[] = ["GK", "Defender", "Midfielder", "Forward"];
/** Attributes that get ±1 of deterministic noise on an estimated player. */
export const NOISE_ATTRS = 4;

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/** Per-attribute median of each line present in `players`. */
export function lineMedians(players: RosterPlayer[]): Partial<Record<MainRole, PlayerStatsRecord>> {
  const out: Partial<Record<MainRole, PlayerStatsRecord>> = {};
  for (const line of LINES) {
    const ps = players.filter((p) => getMainRole(p.positions[0] ?? "") === line);
    if (ps.length === 0) continue;
    const s = {} as PlayerStatsRecord;
    for (const k of STAT_KEYS) s[k] = median(ps.map((p) => p.stats[k]));
    out[line] = s;
  }
  return out;
}

export function ageAdjust(age: number): number {
  return age <= 20 ? -1 : age <= 23 ? -0.5 : age <= 31 ? 0 : -0.3;
}

/**
 * base + ageAdjust(age) + shift on every attribute, ±1 on NOISE_ATTRS hash-picked attributes,
 * clamped to 0..10. Uses unbiased hash-based stochastic rounding (`floor(v + hash)`) instead of
 * `Math.round`, because with integer bases a plain round makes fractional adjustments
 * (ageAdjust's -0.5/-0.3, and any fractional `shift`) vanish on every attribute that isn't hit by
 * noise, and rounds x.5 medians up. `floor(v + u)` with `u` uniform in [0, 1) is unbiased in
 * expectation (E[floor(v+u)] = v) and leaves already-integer `v` untouched, since u < 1.
 */
export function estimateStats(id: string, age: number, base: PlayerStatsRecord, shift: number): PlayerStatsRecord {
  const noisy = [...STAT_KEYS].sort((a, b) => unitHash(`${id}:pick:${a}`) - unitHash(`${id}:pick:${b}`)).slice(0, NOISE_ATTRS);
  const out = {} as PlayerStatsRecord;
  for (const k of STAT_KEYS) {
    const noise = noisy.includes(k) ? (unitHash(`${id}:sign:${k}`) < 0.5 ? -1 : 1) : 0;
    const v = base[k] + ageAdjust(age) + shift + noise;
    out[k] = Math.max(0, Math.min(10, Math.floor(v + unitHash(`${id}:round:${k}`))));
  }
  return out;
}

/** Thresholds on the world's actual overall (0..10) scale — median ≈ 3.24, p95 ≈ 4.84. */
const adjectiveFor = (overall: number) => (overall >= 5.3 ? "Elite" : overall >= 3.5 ? "Solid" : overall >= 2.4 ? "Capable" : "Developing");

export interface NewPlayerInput {
  id: string; name: string; fullName?: string; age: number; role: MainRole; squadId: string;
  nationality: string | null; stats: PlayerStatsRecord;
}

/** RosterPlayer for an estimated player; `overall` (0..10) only picks the profile adjective. */
export function makePlayer(a: NewPlayerInput, overall: number): RosterPlayer & { fullName?: string } {
  const p: RosterPlayer & { fullName?: string } = {
    id: a.id, name: a.name, age: a.age, squadId: a.squadId,
    preferredFoot: unitHash(`${a.id}:foot`) < 0.75 ? "right" : "left",
    positions: [a.role], stats: a.stats,
    profile: playerProfile(a.role, a.stats, adjectiveFor(overall)),
  };
  if (a.fullName && a.fullName !== a.name) p.fullName = a.fullName;
  if (a.nationality) p.nationality = a.nationality;
  return p;
}

const lineOf = (p: RosterPlayer) => getMainRole(p.positions[0] ?? "");

/** Keeps each line's minimum (best by `overall`), then the best remaining players, up to `max`. */
export function trimSquad<P extends RosterPlayer>(players: P[], max: number, overall: (p: P) => number): P[] {
  if (players.length <= max) return [...players];
  const rank = (a: P, b: P) => overall(b) - overall(a) || a.id.localeCompare(b.id);
  const chosen = new Set<P>();
  for (const line of LINES) players.filter((p) => lineOf(p) === line).sort(rank).slice(0, MIN_BY_ROLE[line]).forEach((p) => chosen.add(p));
  for (const p of [...players].sort(rank)) { if (chosen.size >= max) break; chosen.add(p); }
  return players.filter((p) => chosen.has(p));
}

/**
 * Adds youth (17–19, id `es_youth_<squadId>_<n>`) until every line reaches MIN_BY_ROLE and the squad
 * reaches MIN_SQUAD. `baseFor(line)` gives the stats base of a youth of that line. Then trims to MAX_SQUAD.
 */
export function fillSquad<P extends RosterPlayer>(
  squadId: string, players: P[], pool: NamePool, country: string,
  baseFor: (line: MainRole) => PlayerStatsRecord, overall: (p: RosterPlayer) => number,
): RosterPlayer[] {
  const out: RosterPlayer[] = [...players];
  let n = 0;
  const addYouth = (line: MainRole) => {
    const id = `es_youth_${squadId}_${n++}`;
    const first = pool.first[Math.floor(unitHash(`${id}:f`) * pool.first.length)] ?? "Juan";
    const last = pool.last[Math.floor(unitHash(`${id}:l`) * pool.last.length)] ?? "Silva";
    const age = 17 + Math.floor(unitHash(`${id}:a`) * 3);
    const stats = estimateStats(id, age, baseFor(line), 0);
    const p = makePlayer({ id, name: `${first} ${last}`, age, role: line, squadId, nationality: country, stats }, 0);
    p.profile = playerProfile(line, stats, adjectiveFor(overall(p)));
    out.push(p);
  };
  for (const line of LINES) {
    const have = out.filter((p) => lineOf(p) === line).length;
    for (let i = have; i < MIN_BY_ROLE[line]; i++) addYouth(line);
  }
  const PAD: MainRole[] = ["Defender", "Midfielder", "Forward", "Midfielder"];
  for (let i = 0; out.length < MIN_SQUAD; i++) addYouth(PAD[i % PAD.length]!);
  return trimSquad(out, MAX_SQUAD, overall);
}
