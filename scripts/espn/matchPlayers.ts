import { playerKey } from "@/../scripts/espn/normalize";
import type { EspnPos } from "@/../scripts/espn/types";
import type { MainRole } from "@/../scripts/openfootball/roster";

export interface WorldPlayerRef { id: string; name: string; fullName?: string; age: number; role: MainRole; squadId: string }
export interface AthleteRef {
  espnId: string; displayName: string; fullName: string; age: number | null; role: MainRole | null;
  /** squadId the athlete's ESPN club matched to (tie-break), or null for a new club. */
  teamSquadId: string | null;
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

/**
 * ESPN athlete → world player id. Athletes are processed in the given order (the caller sorts them);
 * each world player is claimed at most once. Candidate: same normalized name (display or full, against
 * name or fullName), ESPN age − world age in [MIN_AGE_GAP, MAX_AGE_GAP] (skipped when ESPN has no age),
 * and the same or an adjacent line (never GK ↔ outfield). Ranking: same line, age gap closest to
 * EXPECTED_AGE_GAP, already at the athlete's club, id. Overrides (espnId → playerId) come first.
 */
export function matchPlayers(athletes: AthleteRef[], world: WorldPlayerRef[], overrides: Record<string, string>): Map<string, string> {
  const byId = new Map(world.map((p) => [p.id, p]));
  const byKey = new Map<string, WorldPlayerRef[]>();
  for (const p of world) {
    for (const k of new Set([playerKey(p.name), p.fullName ? playerKey(p.fullName) : ""])) {
      if (!k) continue;
      byKey.set(k, [...(byKey.get(k) ?? []), p]);
    }
  }
  const claimed = new Set<string>();
  const out = new Map<string, string>();

  for (const a of athletes) {
    const o = overrides[a.espnId];
    if (o === undefined) continue;
    if (!byId.has(o)) throw new Error(`matchPlayers: override ${a.espnId} → unknown player ${o}`);
    claimed.add(o);
    out.set(a.espnId, o);
  }

  for (const a of athletes) {
    if (out.has(a.espnId)) continue;
    const pool = new Set<WorldPlayerRef>();
    for (const k of [playerKey(a.displayName), playerKey(a.fullName)]) for (const p of byKey.get(k) ?? []) pool.add(p);
    const ranked = [...pool]
      .filter((p) => !claimed.has(p.id))
      .map((p) => {
        const gap = a.age === null ? EXPECTED_AGE_GAP : a.age - p.age;
        const rd = a.role === null ? 0 : roleDistance(a.role, p.role);
        return { p, gap, rd };
      })
      .filter((c) => c.rd !== null && c.gap >= MIN_AGE_GAP && c.gap <= MAX_AGE_GAP)
      .sort((x, y) =>
        x.rd! - y.rd!
        || Math.abs(x.gap - EXPECTED_AGE_GAP) - Math.abs(y.gap - EXPECTED_AGE_GAP)
        || Number(x.p.squadId !== a.teamSquadId) - Number(y.p.squadId !== a.teamSquadId)
        || x.p.id.localeCompare(y.p.id));
    const best = ranked[0];
    if (best) { claimed.add(best.p.id); out.set(a.espnId, best.p.id); }
  }
  return out;
}
