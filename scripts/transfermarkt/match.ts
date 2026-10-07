import { clubKey, looseClubKey, playerKey } from "@/../scripts/espn/normalize";

export interface OurClub { squadId: string; name: string }
export interface OurPlayer { id: string; name: string; fullName?: string; age: number }
export interface TmNamed { id: string; name: string }
export interface TmAged { id: string; name: string; age: number | null }

/** Override value meaning "this player has no Transfermarkt counterpart": never matched by name. */
export const NO_MATCH = "none";

/** Unique pairs only: each side's candidate list must have exactly one entry pointing at the other. */
function uniquePairs<A extends string, B extends string>(cands: Map<A, B[]>): Map<A, B> {
  const claims = new Map<B, number>();
  for (const list of cands.values()) for (const b of new Set(list)) claims.set(b, (claims.get(b) ?? 0) + 1);
  const out = new Map<A, B>();
  for (const [a, list] of cands) {
    const set = [...new Set(list)];
    if (set.length === 1 && claims.get(set[0]!) === 1) out.set(a, set[0]!);
  }
  return out;
}

/** Club → Transfermarkt club id inside one country/league: override → exact key → loose key → prefix. */
export function matchClubs(ours: OurClub[], tm: TmNamed[], overrides: Record<string, string>): Map<string, string> {
  const out = new Map<string, string>();
  const taken = new Set<string>();
  for (const c of ours) {
    const o = overrides[c.squadId];
    if (o && tm.some((t) => t.id === o)) { out.set(c.squadId, o); taken.add(o); }
  }
  const passes: ((a: string, b: string) => boolean)[] = [
    (a, b) => clubKey(a) === clubKey(b),
    (a, b) => looseClubKey(a) === looseClubKey(b),
    (a, b) => { const x = clubKey(a), y = clubKey(b); return x.length > 2 && y.length > 2 && (x.startsWith(y) || y.startsWith(x)); },
  ];
  for (const same of passes) {
    const cands = new Map<string, string[]>();
    for (const c of ours) {
      if (out.has(c.squadId)) continue;
      const hits = tm.filter((t) => !taken.has(t.id) && same(c.name, t.name)).map((t) => t.id);
      if (hits.length) cands.set(c.squadId, hits);
    }
    for (const [s, t] of uniquePairs(cands)) { out.set(s, t); taken.add(t); }
  }
  return out;
}

/** `playerKey` joins tokens with single spaces. */
function tokens(s: string): string[] { return playerKey(s).split(" ").filter(Boolean); }

function nameMatches(p: OurPlayer, t: TmAged): boolean {
  const tk = tokens(t.name);
  for (const n of [p.name, p.fullName ?? ""]) {
    if (!n) continue;
    if (playerKey(n) === playerKey(t.name)) return true;
    const ours = tokens(n);
    // "D. Dalot" × "Diogo Dalot": same last token, initials agree.
    if (ours.length >= 2 && tk.length >= 2 && ours.at(-1) === tk.at(-1) && ours[0]![0] === tk[0]![0]) return true;
    // "Bruno Miguel Borges Fernandes" contains every token of "Bruno Fernandes".
    if (tk.length >= 2 && tk.every((x) => ours.includes(x))) return true;
  }
  return false;
}

/**
 * Player → Transfermarkt player id inside one club: override ("none" = no counterpart), else
 * name + age (≤ 1 year), unique both ways.
 */
export function matchPlayers(world: OurPlayer[], tm: TmAged[], overrides: Record<string, string>): Map<string, string> {
  const out = new Map<string, string>();
  const forced = new Set<string>();
  const skipped = new Set<string>();
  for (const p of world) {
    const o = overrides[p.id];
    if (o === NO_MATCH) skipped.add(p.id);
    else if (o && tm.some((t) => t.id === o)) { out.set(p.id, o); forced.add(o); }
  }
  const cands = new Map<string, string[]>();
  for (const p of world) {
    if (out.has(p.id) || skipped.has(p.id)) continue;
    const hits = tm
      .filter((t) => !forced.has(t.id) && (t.age == null || Math.abs(t.age - p.age) <= 1) && nameMatches(p, t))
      .map((t) => t.id);
    if (hits.length) cands.set(p.id, hits);
  }
  for (const [a, b] of uniquePairs(cands)) out.set(a, b);
  return out;
}
