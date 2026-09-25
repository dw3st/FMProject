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
/** The world is one season behind the snapshot. */
export const EXPECTED_AGE_GAP = 1;

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

function tokensOf(s: string): string[] {
  return playerKey(s).split(" ").filter((t) => t.length > 0);
}

/** Normalized name ∪ normalized fullName tokens, deduplicated. */
function worldTokenSet(p: WorldPlayerRef): Set<string> {
  const set = new Set(tokensOf(p.name));
  if (p.fullName) for (const t of tokensOf(p.fullName)) set.add(t);
  return set;
}

interface Candidate { p: WorldPlayerRef; gap: number; rd: number; sameCountry: boolean }

/** True when the top two ranked candidates are indistinguishable (ignoring id) — an ambiguous match. */
function isAmbiguous(ranked: Candidate[]): boolean {
  if (ranked.length < 2) return false;
  const x = ranked[0]!;
  const y = ranked[1]!;
  return x.sameCountry === y.sameCountry && x.rd === y.rd && Math.abs(x.gap - EXPECTED_AGE_GAP) === Math.abs(y.gap - EXPECTED_AGE_GAP);
}

/**
 * ESPN athlete → world player id, resolved in three passes over the athletes (all in the given order —
 * the caller sorts them). Each world player is claimed at most once, across overrides and all passes.
 *
 * Pass A ("club"): candidates are world players sharing a normalized name key (display or full name,
 * against name or fullName) AND the athlete's own club (`p.squadId === a.teamSquadId`; skipped when
 * `teamSquadId` is null). Age window and role compatibility apply (null age / null role accepted, as a
 * neutral gap/roleDistance of 0). Ranked by roleDistance, then |gap − EXPECTED_AGE_GAP|; a tie between
 * the top two candidates (same club, same rank) is ambiguous and the athlete is left unmatched. An
 * athlete who had at least one viable candidate at their own club (matched or ambiguous) is never
 * considered in pass A2 or pass B, even unmatched — an ambiguous club-mate is not a license to reach
 * elsewhere or to fall back to a looser same-club match.
 *
 * Pass A2 ("club, surname"): only athletes still unmatched with no viable pass-A candidate, a non-null
 * age, and a non-null role. Fixes the common case where a native world player is stored abbreviated
 * ("T. Hübers" / fullName "Timo Bernd Hübers") against ESPN's spelled-out name ("Timo Hübers") — the
 * normalized name keys never collide, but the surname and first name do once fullName is considered.
 * The athlete's surname is the last token of their display name (falling back to their full name when
 * the display name is a single token); the first name is the first token. The surname must be at least
 * 3 characters. A candidate qualifies when it is at the athlete's own club, within the age window, role
 * compatible, and its token set (normalized name ∪ normalized fullName) contains the surname AND either
 * contains the first name outright or contains a single-letter token equal to the first name's initial
 * (an abbreviated "T." from "T. Hübers" reads as Timo's initial). No ranking is applied — pass A2 only
 * matches when exactly one candidate qualifies; two or more leaves the athlete unmatched.
 *
 * Pass B ("global"): only athletes still unmatched after pass A/A2 AND with no viable club candidate.
 * Requires a non-null age AND role, and only considers name keys with ≥ 2 tokens (a one-token key
 * such as "pedro" or "kepa" is only ever
 * matched at the athlete's own club, in pass A/A2). A cross-country candidate (`p.country !== teamCountry`)
 * is only eligible when roleDistance is 0 (same line — never an adjacent one). Ranked by same-country
 * first, then roleDistance, then |gap − EXPECTED_AGE_GAP|; a tie between the top two is ambiguous and
 * the athlete is left unmatched.
 *
 * Overrides (espnId → playerId) are applied before all passes and must reference a real world player;
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
  /** Athletes with at least one viable pass-A candidate — barred from pass B even if left unmatched. */
  const hadClubCandidate = new Set<string>();

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
    if (ranked.length === 0) continue;
    hadClubCandidate.add(a.espnId);
    if (isAmbiguous(ranked)) continue;
    const best = ranked[0]!;
    claimed.add(best.p.id);
    out.set(a.espnId, best.p.id);
  }

  // Pass A2 — club, surname: for athletes with no viable pass-A candidate, match via surname + first
  // name (outright or initial) at the same club. No ranking — only an unambiguous single candidate matches.
  for (const a of athletes) {
    if (out.has(a.espnId) || a.teamSquadId === null || a.age === null || a.role === null || hadClubCandidate.has(a.espnId)) continue;
    const age = a.age;
    const role = a.role;

    const dispTokens = tokensOf(a.displayName);
    const tokens = dispTokens.length > 1 ? dispTokens : tokensOf(a.fullName);
    if (tokens.length < 2) continue;
    const first = tokens[0]!;
    const surname = tokens[tokens.length - 1]!;
    if (surname.length < 3) continue;

    const candidates = world.filter((p) => {
      if (claimed.has(p.id) || p.squadId !== a.teamSquadId) return false;
      const gap = age - p.age;
      if (gap < MIN_AGE_GAP || gap > MAX_AGE_GAP) return false;
      if (roleDistance(role, p.role) === null) return false;
      const pTokens = worldTokenSet(p);
      if (!pTokens.has(surname)) return false;
      if (pTokens.has(first)) return true;
      for (const t of pTokens) if (t.length === 1 && t === first[0]) return true;
      return false;
    });
    if (candidates.length !== 1) continue;
    const best = candidates[0]!;
    claimed.add(best.id);
    out.set(a.espnId, best.id);
  }

  // Pass B — global: only athletes still unmatched with no club candidate, only multi-token keys, country-aware.
  for (const a of athletes) {
    if (out.has(a.espnId) || a.age === null || a.role === null || hadClubCandidate.has(a.espnId)) continue;
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
    const best = ranked[0]!;
    claimed.add(best.p.id);
    out.set(a.espnId, best.p.id);
  }

  return out;
}
