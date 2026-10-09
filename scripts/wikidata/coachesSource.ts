/**
 * Pure helpers for `scripts/fetchWikidataCoaches.ts`: club matching (our squads ↔ Wikidata football clubs of a
 * country) and the choice of the current head coach among a club's P286 statements. No network, no filesystem.
 */
import { clubKey, looseClubKey } from "@/../scripts/espn/normalize";

export interface OurClub { id: string; name: string; shortName?: string }
export interface WdClub { qid: string; names: string[] }

/** Keys of one name: the strict key and the loose key (empty keys dropped). */
function keysOf(names: readonly string[], loose: boolean): Set<string> {
  const out = new Set<string>();
  for (const n of names) {
    const plain = n.replace(/\./g, ""); // "F.C." → "FC" (a noise token), "St. Pauli" → "St Pauli"
    const k = loose ? looseClubKey(plain) : clubKey(plain);
    if (k) out.add(k);
  }
  return out;
}

/**
 * Matches our clubs to Wikidata clubs of the same country: exact `clubKey` first, then the loose key, each pass
 * accepting a pair only when it is unique on BOTH sides (the squad has one candidate, and that item is the
 * candidate of one squad). Squads already mapped (`fixed`) and their items are left out.
 */
export function matchClubsToWikidata(
  ours: readonly OurClub[],
  wd: readonly WdClub[],
  fixed: ReadonlySet<string> = new Set(),
  fixedQids: ReadonlySet<string> = new Set(),
): Map<string, string> {
  const out = new Map<string, string>();
  const takenQ = new Set(fixedQids);
  for (const loose of [false, true]) {
    const wdKeys = wd.filter((c) => !takenQ.has(c.qid)).map((c) => ({ qid: c.qid, keys: keysOf(c.names, loose) }));
    const cand = new Map<string, string[]>();
    for (const s of ours) {
      if (fixed.has(s.id) || out.has(s.id)) continue;
      const mine = keysOf([s.name, ...(s.shortName ? [s.shortName] : [])], loose);
      const hits = wdKeys.filter((c) => [...mine].some((k) => c.keys.has(k))).map((c) => c.qid);
      if (hits.length > 0) cand.set(s.id, [...new Set(hits)]);
    }
    const byQ = new Map<string, number>();
    for (const qs of cand.values()) for (const q of qs) byQ.set(q, (byQ.get(q) ?? 0) + 1);
    for (const [sid, qs] of cand) {
      if (qs.length !== 1) continue;
      const q = qs[0]!;
      if (byQ.get(q) !== 1) continue;
      out.set(sid, q);
      takenQ.add(q);
    }
  }
  return out;
}

export interface CoachStatement {
  coach: string;            // coach item QID
  rank: "preferred" | "normal" | "deprecated";
  start?: string;           // YYYY-MM-DD
  end?: string;
}

/** Another team currently coached by the coach (his open P6087, confirmed by the team's open P286). */
export interface CoachElsewhere { coach: string; team: string; start?: string }

/**
 * The club's current head coach: statements not deprecated and without an end date in the past (`today`),
 * the most recent start date first, preferred rank breaking ties. With no dated open statement, a lone undated
 * one counts (else a lone preferred one); the caller drops statements of deceased coaches first. Rejected when the coach is at another team from a later date, confirmed on both
 * sides (`elsewhere`: his open P6087 whose team also lists him as open P286) — the club statement was never closed.
 */
export function currentCoach(
  statements: readonly CoachStatement[],
  today: string,
  elsewhere: readonly CoachElsewhere[] = [],
  clubQid = "",
): CoachStatement | null {
  const open = statements.filter((s) => s.rank !== "deprecated" && (!s.end || s.end > today) && (!s.start || s.start <= today));
  if (open.length === 0) return null;
  const dated = open.filter((s) => s.start);
  let pick: CoachStatement | undefined;
  if (dated.length > 0) {
    const sorted = [...dated].sort((a, b) =>
      (b.start! < a.start! ? -1 : b.start! > a.start! ? 1 : 0)
      || (a.rank === "preferred" ? -1 : 0) - (b.rank === "preferred" ? -1 : 0));
    pick = sorted[0];
  } else if (open.length === 1) {
    pick = open[0];
  } else {
    const pref = open.filter((s) => s.rank === "preferred");
    if (pref.length === 1) pick = pref[0];
  }
  if (!pick) return null;
  const later = elsewhere.some((e) => e.coach === pick!.coach && e.team !== clubQid && e.start && (!pick!.start || e.start > pick!.start));
  return later ? null : pick;
}


/**
 * One coach, one club: when the same coach is the pick of several of our clubs, only the latest start keeps him
 * (a tie keeps none — no way to tell which is stale).
 */
export function dedupeCoaches<T extends { coach: string; start?: string }>(picks: ReadonlyMap<string, T>): Map<string, T> {
  const byCoach = new Map<string, string[]>();
  for (const [sid, p] of picks) byCoach.set(p.coach, [...(byCoach.get(p.coach) ?? []), sid]);
  const out = new Map(picks);
  for (const sids of byCoach.values()) {
    if (sids.length < 2) continue;
    const sorted = [...sids].sort((a, b) => ((picks.get(b)!.start ?? "") < (picks.get(a)!.start ?? "") ? -1 : (picks.get(b)!.start ?? "") > (picks.get(a)!.start ?? "") ? 1 : 0));
    const top = picks.get(sorted[0]!)!.start ?? "";
    const tie = top === "" || (picks.get(sorted[1]!)!.start ?? "") === top;
    for (const sid of tie ? sorted : sorted.slice(1)) out.delete(sid);
  }
  return out;
}
