import { playerKey } from "@/../scripts/espn/normalize";
import type { EspnPos } from "@/../scripts/espn/types";
import type { MainRole } from "@/../scripts/openfootball/roster";

export interface WorldPlayerRef {
  id: string;
  name: string;
  fullName?: string;
  age: number;
  role: MainRole;
  squadId: string;
  /** Country of the league the player's squad is in. */
  country: string;
}
export interface AthleteRef {
  espnId: string;
  displayName: string;
  fullName: string;
  age: number | null;
  role: MainRole | null;
  /** squadId the athlete's ESPN club matched to (tie-break), or null for a new club. */
  teamSquadId: string | null;
  /** Country of the ESPN league the athlete's club plays in. */
  teamCountry: string;
}

export const MIN_AGE_GAP = 0;
export const MAX_AGE_GAP = 3;
/** The world is two seasons behind the snapshot. */
export const EXPECTED_AGE_GAP = 2;

export function espnRole(p: EspnPos | null): MainRole | null {
  return p === "G" ? "GK" : p === "D" ? "Defender" : p === "M" ? "Midfielder" : p === "F" ? "Forward" : null;
}

const LINE: Record<MainRole, number> = { GK: 0, Defender: 1, Midfielder: 2, Forward: 3 };
function roleDistance(a: MainRole, b: MainRole): number | null {
  if (a === b) return 0;
  if (a === "GK" || b === "GK") return null;
  return Math.abs(LINE[a] - LINE[b]) === 1 ? 1 : null;
}

function tokenCount(key: string): number {
  return key ? key.split(" ").length : 0;
}

function nameKeys(a: AthleteRef): string[] {
  return [...new Set([playerKey(a.displayName), playerKey(a.fullName)])];
}

interface Candidate { p: WorldPlayerRef; gap: number; rd: number; sameCountry: boolean }

/** True when the top two ranked candidates are indistinguishable (ignoring id) — an ambiguous match. */
function isAmbiguous(ranked: Candidate[]): boolean {
  if (ranked.length < 2) return false;
  const [x, y] = ranked;
  return x.sameCountry === y.sameCountry && x.rd === y.rd && Math.abs(x.gap - EXPECTED_AGE_GAP) === Math.abs(y.gap - EXPECTED_AGE_GAP);
}

/**
 * ESPN athlete → world player id, resolved in two passes over the athletes (both in the given order —
 * the caller sorts them). Each world player is claimed at most once, across overrides and both passes.
 *
 * Pass A ("club"): candidates are world players sharing a normalized name key (display or full name,
 * against name or fullName) AND the athlete's own club (`p.squadId === a.teamSquadId`; skipped when
 * `teamSquadId` is null). Age window and role compatibility apply (null age / null role accepted, as a
 * neutral gap/roleDistance of 0). Ranked by roleDistance, then |gap − EXPECTED_AGE_GAP|; a tie between
 * the top two candidates (same club, same rank) is ambiguous and the athlete is left unmatched.
 *
 * Pass B ("global"): only athletes still unmatched after pass A. Requires a non-null age AND role, and
 * only considers name keys with ≥ 2 tokens (a one-token key such as "pedro" or "kepa" is only ever
 * matched at the athlete's own club, in pass A). A cross-country candidate (`p.country !== teamCountry`)
 * is only eligible when roleDistance is 0 (same line — never an adjacent one). Ranked by same-country
 * first, then roleDistance, then |gap − EXPECTED_AGE_GAP|; a tie between the top two is ambiguous and
 * the athlete is left unmatched.
 *
 * Overrides (espnId → playerId) are applied before both passes and must reference a real world player;
 * two overrides claiming the same player throw.
 */
export function matchPlayers(athletes: AthleteRef[], world: WorldPlayerRef[], overrides: Record<string, string>): Map<string, string> {
  const byId = new Map(world.map((p) => [p.id, p]));
  const byKey = new Map<string, WorldPlayerRef[]>();
  for (const p of world) {
    for (const k of new Set([playerKey(p.name), p.fullName ? playerKey(p.fullName) : ""])) {
      if (!k) continue;
      let arr = byKey.get(k);
      if (!arr) { arr = []; byKey.set(k, arr); }
      arr.push(p);
    }
  }

  const claimed = new Set<string>();
  const out = new Map<string, string>();
  const overrideTargets = new Set<string>();

  for (const a of athletes) {
    const o = overrides[a.espnId];
    if (o === undefined) continue;
    if (!byId.has(o)) throw new Error(`matchPlayers: override ${a.espnId} → unknown player ${o}`);
    if (overrideTargets.has(o)) throw new Error(`matchPlayers: player ${o} claimed twice by overrides`);
    overrideTargets.add(o);
    claimed.add(o);
    out.set(a.espnId, o);
  }

  // Pass A — club: same normalized name, same club.
  for (const a of athletes) {
    if (out.has(a.espnId) || a.teamSquadId === null) continue;
    const pool = new Set<WorldPlayerRef>();
    for (const k of nameKeys(a)) for (const p of byKey.get(k) ?? []) pool.add(p);
    const ranked: Candidate[] = [...pool]
      .filter((p) => !claimed.has(p.id) && p.squadId === a.teamSquadId)
      .map((p) => {
        const gap = a.age === null ? EXPECTED_AGE_GAP : a.age - p.age;
        const rd = a.role === null ? 0 : roleDistance(a.role, p.role);
        return { p, gap, rd, sameCountry: true } as Candidate;
      })
      .filter((c): c is Candidate => c.rd !== null && c.gap >= MIN_AGE_GAP && c.gap <= MAX_AGE_GAP)
      .sort((x, y) =>
        x.rd - y.rd
        || Math.abs(x.gap - EXPECTED_AGE_GAP) - Math.abs(y.gap - EXPECTED_AGE_GAP)
        || x.p.id.localeCompare(y.p.id));
    if (ranked.length === 0 || isAmbiguous(ranked)) continue;
    const best = ranked[0];
    claimed.add(best.p.id);
    out.set(a.espnId, best.p.id);
  }

  // Pass B — global: only athletes still unmatched, only multi-token keys, country-aware.
  for (const a of athletes) {
    if (out.has(a.espnId) || a.age === null || a.role === null) continue;
    const age = a.age;
    const role = a.role;
    const pool = new Set<WorldPlayerRef>();
    for (const k of nameKeys(a)) {
      if (tokenCount(k) < 2) continue;
      for (const p of byKey.get(k) ?? []) pool.add(p);
    }
    const ranked: Candidate[] = [...pool]
      .filter((p) => !claimed.has(p.id))
      .map((p) => {
        const gap = age - p.age;
        const rd = roleDistance(role, p.role);
        const sameCountry = p.country === a.teamCountry;
        return { p, gap, rd, sameCountry } as Candidate;
      })
      .filter((c): c is Candidate => c.rd !== null && c.gap >= MIN_AGE_GAP && c.gap <= MAX_AGE_GAP && (c.sameCountry || c.rd === 0))
      .sort((x, y) =>
        (x.sameCountry ? 0 : 1) - (y.sameCountry ? 0 : 1)
        || x.rd - y.rd
        || Math.abs(x.gap - EXPECTED_AGE_GAP) - Math.abs(y.gap - EXPECTED_AGE_GAP)
        || x.p.id.localeCompare(y.p.id));
    if (ranked.length === 0 || isAmbiguous(ranked)) continue;
    const best = ranked[0];
    claimed.add(best.p.id);
    out.set(a.espnId, best.p.id);
  }

  return out;
}
