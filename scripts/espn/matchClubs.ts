import { clubKey, looseClubKey } from "@/../scripts/espn/normalize";

export interface WorldClubRef { id: string; name: string; country: string }
export interface EspnClubRef { espnId: string; name: string; shortName: string; country: string }
export interface ClubMatch { squadId: string | null; via: "override" | "exact" | "loose" | "prefix" | "new" }

type Pass = { via: "exact" | "loose" | "prefix"; same: (espn: string, ours: string) => boolean };

const isPrefix = (a: string[], b: string[]) => a.length > 0 && a.length <= b.length && a.every((t, i) => b[i] === t);
const PASSES: Pass[] = [
  { via: "exact", same: (e, o) => clubKey(e) !== "" && clubKey(e) === clubKey(o) },
  { via: "loose", same: (e, o) => looseClubKey(e) !== "" && looseClubKey(e) === looseClubKey(o) },
  {
    via: "prefix",
    same: (e, o) => {
      const a = clubKey(e).split(" ").filter(Boolean);
      const b = clubKey(o).split(" ").filter(Boolean);
      return isPrefix(a, b) || isPrefix(b, a);
    },
  },
];

/**
 * ESPN club → squadId, per country. Order: override, then exact / loose / prefix passes (each pass
 * over every still-unmatched team), then "new".
 *
 * The exact pass requires the candidate to be unique among the still-unclaimed clubs of the country.
 *
 * The loose and prefix passes require the candidate to be unique among ALL clubs of the country that
 * satisfy `pass.same` — claimed or not — and only then checks it is still unclaimed. Otherwise, once
 * a club is claimed by an earlier pass, an unrelated ESPN team can loose/prefix-match its unclaimed
 * sibling (e.g. once "Bristol City" is claimed by the exact pass, ESPN "Bristol Wanderers" would be
 * the only remaining candidate for "Bristol Rovers" even though the loose key "bristol" is genuinely
 * ambiguous between the two clubs). These two passes also drop a hit when another still-unmatched
 * ESPN team of the same country matches the same candidate — those keys are approximate enough that
 * two different ESPN clubs collapsing onto one candidate means neither should be resolved here.
 *
 * Throws when an override names an unknown squad, or when two or more teams hit the same squad on
 * the exact pass (a genuine name clash worth surfacing rather than silently deferring to "new").
 * Only the exact pass can still collide here: the ESPN-side uniqueness check above already stops the
 * loose/prefix passes from ever assigning two teams to the same squad.
 */
export function matchClubs(teams: EspnClubRef[], world: WorldClubRef[], overrides: Record<string, string>): Map<string, ClubMatch> {
  const byId = new Map(world.map((c) => [c.id, c]));
  const claimed = new Set<string>();
  const out = new Map<string, ClubMatch>();
  const sorted = [...teams].sort((a, b) => a.espnId.localeCompare(b.espnId, "en", { numeric: true }));

  for (const t of sorted) {
    const o = overrides[t.espnId];
    if (o === undefined) continue;
    if (!byId.has(o)) throw new Error(`matchClubs: override ${t.espnId} → unknown squad ${o}`);
    if (claimed.has(o)) throw new Error(`matchClubs: override ${t.espnId} → ${o} already claimed`);
    claimed.add(o);
    out.set(t.espnId, { squadId: o, via: "override" });
  }

  for (const pass of PASSES) {
    const hits = new Map<string, string>(); // espnId → squadId
    for (const t of sorted) {
      if (out.has(t.espnId)) continue;
      const isSame = (c: WorldClubRef) => c.country === t.country && (pass.same(t.name, c.name) || pass.same(t.shortName, c.name));

      let cand: WorldClubRef | undefined;
      if (pass.via === "exact") {
        const cands = world.filter((c) => isSame(c) && !claimed.has(c.id));
        cand = cands.length === 1 ? cands[0] : undefined;
      } else {
        // Uniqueness is checked across every club of the country, claimed or not, so a sibling
        // that is only "the last one left" because its twin was already claimed never matches.
        const cands = world.filter(isSame);
        cand = cands.length === 1 && !claimed.has(cands[0]!.id) ? cands[0] : undefined;
      }
      if (!cand) continue;

      // Loose/prefix keys are approximate and often collapse two different ESPN clubs onto the
      // same key (e.g. "Manchester United" and "Manchester City" both → loose "manchester"). When
      // another still-unmatched ESPN team of the same country also matches this candidate, neither
      // is safe to resolve here — skip both rather than pick one, or collide and throw.
      if (pass.via !== "exact") {
        const sharedByOther = sorted.some((u) => u.espnId !== t.espnId && u.country === t.country && !out.has(u.espnId)
          && (pass.same(u.name, cand!.name) || pass.same(u.shortName, cand!.name)));
        if (sharedByOther) continue;
      }
      hits.set(t.espnId, cand.id);
    }

    const bySquad = new Map<string, string[]>();
    for (const [espnId, squadId] of hits) {
      const ids = bySquad.get(squadId);
      if (ids) ids.push(espnId);
      else bySquad.set(squadId, [espnId]);
    }
    const collisions: string[] = [];
    for (const [squadId, espnIds] of bySquad) {
      for (let i = 0; i < espnIds.length; i++) {
        for (let j = i + 1; j < espnIds.length; j++) {
          collisions.push(`ESPN ${espnIds[i]} and ${espnIds[j]} both match ${squadId} (${pass.via})`);
        }
      }
    }
    if (collisions.length > 0) throw new Error(`matchClubs: ${collisions.join("; ")} — add an override`);

    for (const [espnId, squadId] of hits) {
      claimed.add(squadId);
      out.set(espnId, { squadId, via: pass.via });
    }
  }

  for (const t of sorted) if (!out.has(t.espnId)) out.set(t.espnId, { squadId: null, via: "new" });
  return out;
}
