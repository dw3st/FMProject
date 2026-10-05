/**
 * Maps world players (our ids) to ESPN athlete ids, for the face pilot. Offline, pure.
 *
 * The importer (`importEspn`) does not keep the athlete id of a matched native player, but a club
 * covered by ESPN has its squad *replaced* by the ESPN roster, so every player of such a club has an
 * athlete in that club's ESPN team. Per club:
 *   1. pick the ESPN team of the same league with the most players in common (es_<id> ids, names);
 *   2. inside that team: `es_<id>` → id; `playerOverrides.json` → id; otherwise a name match
 *      (normalized key, or initial + surname, or every athlete token inside our fullName) that is
 *      unique on both sides. Anything ambiguous is left out.
 */
import { playerKey } from "@/../scripts/espn/normalize";
import type { EspnSnapshot, EspnTeam } from "@/../scripts/espn/types";

export interface MapPlayer { id: string; name: string; fullName?: string }
export interface MapClub { id: string; league: string; players: MapPlayer[] }

const toks = (s: string | undefined) => (s ? playerKey(s).split(" ").filter((t) => t.length > 0) : []);

/** Name keys of one of our players (full key, initial+surname). */
function playerKeys(p: MapPlayer): Set<string> {
  const keys = new Set<string>();
  for (const n of [p.name, p.fullName]) {
    const t = toks(n);
    if (t.length === 0) continue;
    keys.add(t.join(" "));
    if (t.length >= 2) keys.add(`${t[0]![0]} ${t[t.length - 1]}`);
  }
  return keys;
}

function athleteKeys(name: string, full: string): Set<string> {
  const keys = new Set<string>();
  for (const n of [name, full]) {
    const t = toks(n);
    if (t.length === 0) continue;
    keys.add(t.join(" "));
    if (t.length >= 2) keys.add(`${t[0]![0]} ${t[t.length - 1]}`);
  }
  return keys;
}

function linkScore(p: MapPlayer, a: { id: string; displayName: string; fullName: string }): number {
  if (p.id === `es_${a.id}`) return 3;
  const pk = playerKeys(p);
  const ak = athleteKeys(a.displayName, a.fullName);
  for (const k of ak) if (k.includes(" ") && k.length > 3 && pk.has(k) && k.split(" ")[0]!.length > 1) return 2;
  for (const k of ak) if (pk.has(k)) return 1;
  // Every token (2+) of the athlete name inside our fullName ("Mohamed Salah" ⊂ "Mohamed Salah Hamed …").
  const at = toks(a.displayName);
  const ft = new Set(toks(p.fullName));
  if (at.length >= 2 && at.every((t) => ft.has(t))) return 1;
  return 0;
}

export function mapAthletes(
  clubs: MapClub[],
  snap: EspnSnapshot,
  overrides: Record<string, string>,
): { map: Map<string, string>; clubTeam: Map<string, string> } {
  const playerByOverride = new Map(Object.entries(overrides).map(([aid, pid]) => [pid, aid]));
  const map = new Map<string, string>();
  const clubTeam = new Map<string, string>();
  for (const club of clubs) {
    const league = snap.leagues.find((l) => l.slug === club.league);
    if (!league) continue;
    let best: { team: EspnTeam; score: number } | null = null;
    for (const team of league.teams) {
      let score = 0;
      for (const p of club.players) if (team.athletes.some((a) => linkScore(p, a) > 0)) score++;
      if (!best || score > best.score) best = { team, score };
    }
    if (!best || best.score < 3) continue;
    clubTeam.set(club.id, best.team.id);
    const team = best.team;
    // Candidate lists, then accept only pairs unique on both sides (by best link score).
    const cands = new Map<string, { aid: string; s: number }[]>();
    for (const p of club.players) {
      const direct = p.id.startsWith("es_") ? p.id.slice(3) : playerByOverride.get(p.id);
      if (direct) { map.set(p.id, direct); continue; }
      const list = team.athletes.map((a) => ({ aid: a.id, s: linkScore(p, a) })).filter((c) => c.s > 0);
      if (list.length > 0) cands.set(p.id, list);
    }
    const taken = new Set(map.values());
    const claimers = new Map<string, number>();
    for (const list of cands.values()) {
      const top = Math.max(...list.map((c) => c.s));
      for (const c of list) if (c.s === top) claimers.set(c.aid, (claimers.get(c.aid) ?? 0) + 1);
    }
    for (const [pid, list] of cands) {
      const top = Math.max(...list.map((c) => c.s));
      const best2 = list.filter((c) => c.s === top);
      if (best2.length !== 1) continue;
      const aid = best2[0]!.aid;
      if (taken.has(aid) || claimers.get(aid) !== 1) continue;
      map.set(pid, aid);
      taken.add(aid);
    }
  }
  return { map, clubTeam };
}
