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
 * over every still-unmatched team; a hit must be unique among the unclaimed clubs of the country),
 * then "new". Throws when an override names an unknown squad or two teams hit the same squad in a pass.
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
      const cands = world.filter((c) => c.country === t.country && !claimed.has(c.id)
        && (pass.same(t.name, c.name) || pass.same(t.shortName, c.name)));
      if (cands.length === 1) hits.set(t.espnId, cands[0]!.id);
    }
    const bySquad = new Map<string, string>();
    for (const [espnId, squadId] of hits) {
      const prev = bySquad.get(squadId);
      if (prev) throw new Error(`matchClubs: ESPN ${prev} and ${espnId} both match ${squadId} (${pass.via}) — add an override`);
      bySquad.set(squadId, espnId);
    }
    for (const [espnId, squadId] of hits) {
      claimed.add(squadId);
      out.set(espnId, { squadId, via: pass.via });
    }
  }

  for (const t of sorted) if (!out.has(t.espnId)) out.set(t.espnId, { squadId: null, via: "new" });
  return out;
}
