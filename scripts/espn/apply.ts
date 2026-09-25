import { agePlayerStats } from "@/../scripts/espn/aging";
import { estimateStats, fillSquad, lineMedians, makePlayer, trimSquad } from "@/../scripts/espn/estimate";
import { planLineup, type LeagueRef } from "@/../scripts/espn/lineup";
import { matchClubs } from "@/../scripts/espn/matchClubs";
import { espnRole, matchPlayers, type AthleteRef } from "@/../scripts/espn/matchPlayers";
import type { EspnSnapshot, EspnTeam, LeagueMapEntry } from "@/../scripts/espn/types";
import { unitHash } from "@/../scripts/openfootball/ids";
import { coachName } from "@/../scripts/openfootball/derive";
import { buildPyramid, pyramidGroupOf, zonesFromPyramid, type BoundaryOverrides } from "@/../scripts/openfootball/pyramid";
import { MAX_SQUAD, type MainRole, type NamePool } from "@/../scripts/openfootball/roster";
import type { LeagueEntry, SquadFile, StandingRow } from "@/../scripts/world/types";
import type { LeagueScheduleConfig } from "@/Domain/season/leagueScheduleConfig";
import { getMainRole } from "@/GameInterface/positionHelpers";
import type { Pyramids } from "@/types/pyramidTypes";
import type { PlayerStatsRecord, RosterPlayer } from "@/types/playerTypes";

export interface World {
  leagues: LeagueEntry[];
  /** League slug → squads (file stem = squad id). */
  squads: Map<string, SquadFile[]>;
  schedules: LeagueScheduleConfig[];
  pyramids: Pyramids;
}

export interface ApplyOptions {
  leagueMap: LeagueMapEntry[];
  clubOverrides: Record<string, string>;
  playerOverrides: Record<string, string>;
  boundaries: BoundaryOverrides;
  /** attrWeights used by the age curve for this player. */
  roleWeights: (p: RosterPlayer) => Record<string, number>;
  /** Player overall on the 0..10 scale. */
  overall: (p: RosterPlayer) => number;
}

export interface EspnReport {
  appliedLeagues: string[];
  skippedLeagues: string[];
  clubsBy: Record<string, number>;
  newClubs: Array<{ id: string; name: string; league: string }>;
  movedClubs: Array<{ squadId: string; from: string; to: string }>;
  removedClubs: string[];
  playersByLeague: Array<{ league: string; matched: number; created: number }>;
  youthAdded: number;
  overallByAge: Array<{ band: string; before: number; after: number }>;
}

export interface ApplyResult {
  world: World;
  report: EspnReport;
  /** squadId → ESPN crest file name (data_process/espn/logos/). */
  espnLogoOf: Map<string, string>;
  /** squadId → native league folder the club came from (only clubs that lived in a native league). */
  nativeLeagueOf: Map<string, string>;
}

export const NEW_CLUB_SHIFT = -0.3;
export const MIN_MATCHED_FOR_CLUB_BASE = 5;
export const MIN_LINE_FOR_CLUB_BASE = 3;
export const NATIVE_LEAGUES = new Set(["premier_league", "bundesliga", "la_liga", "serie_a", "ligue_1", "brazil_serie_a", "brazil_serie_b", "brazil_serie_c"]);
const AGE_BANDS: Array<[string, number, number]> = [["≤21", 0, 21], ["22–25", 22, 25], ["26–29", 26, 29], ["30–33", 30, 33], ["34+", 34, 99]];

const byId = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true });
const clone = <T>(x: T): T => structuredClone(x);
const lineOf = (p: RosterPlayer): MainRole => getMainRole(p.positions[0] ?? "");
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length === 0 ? 0 : s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};
const hex = (c: string | null, fallback: string) => (c && /^[0-9a-f]{6}$/i.test(c) ? `#${c.toLowerCase()}` : fallback);

/** "2024-25" → "2026-27", "2025" → "2027". */
export function bumpSeason(season: string): string {
  const cross = /^(\d{4})-(\d{2})$/.exec(season);
  if (cross) { const y = Number(cross[1]) + 2; return `${y}-${String((y + 1) % 100).padStart(2, "0")}`; }
  if (/^\d{4}$/.test(season)) return String(Number(season) + 2);
  throw new Error(`bumpSeason: unexpected season label ${season}`);
}

function pyramidTier(pyr: Pyramids, slug: string): number {
  for (const p of Object.values(pyr)) for (const lv of p.levels) if (lv.groups.some((g) => g.leagueSlug === slug)) return lv.tier;
  return 1;
}

function namePools(players: RosterPlayer[]): Map<string, NamePool> {
  const pools = new Map<string, { first: Set<string>; last: Set<string> }>();
  for (const p of players) {
    const parts = p.name.trim().split(/\s+/);
    if (parts.length < 2 || !p.nationality) continue;
    const e = pools.get(p.nationality) ?? { first: new Set(), last: new Set() };
    e.first.add(parts[0]!); e.last.add(parts[parts.length - 1]!);
    pools.set(p.nationality, e);
  }
  return new Map([...pools].map(([k, v]) => [k, { first: [...v.first].sort(), last: [...v.last].sort() }]));
}

export function applyEspn(input: World, snap: EspnSnapshot, opts: ApplyOptions): ApplyResult {
  if (input.leagues.some((l) => /^202[6-9]/.test(l.season)))
    throw new Error("applyEspn: the world is already on 2026+ — run importOpenFootball first");
  const world: World = clone({ ...input, squads: new Map([...input.squads].map(([k, v]) => [k, v])) });

  // ── Index the input world ────────────────────────────────────────────────
  const leagueBySlug = new Map(world.leagues.map((l) => [l.slug, l]));
  const squadById = new Map<string, SquadFile>();
  const leagueOfSquad = new Map<string, string>();
  for (const [slug, ss] of world.squads) for (const s of ss) { squadById.set(s.id, s); leagueOfSquad.set(s.id, slug); }
  const nativeLeagueOf = new Map([...leagueOfSquad].filter(([, l]) => NATIVE_LEAGUES.has(l)));
  const playerById = new Map<string, RosterPlayer & { fullName?: string }>();
  for (const s of squadById.values()) for (const p of s.players) playerById.set(p.id, p);
  const overallBefore = [...playerById.values()].map((p) => ({ age: p.age, ovr: opts.overall(p) }));

  // ── Applied leagues ──────────────────────────────────────────────────────
  const snapBySlug = new Map(snap.leagues.map((l) => [l.slug, l]));
  const applied = opts.leagueMap.filter((m) => (snapBySlug.get(m.slug)?.teams.length ?? 0) > 0 && leagueBySlug.has(m.slug));
  const skipped = opts.leagueMap.filter((m) => !applied.includes(m)).map((m) => m.slug);
  const teamsOf = (slug: string) => [...snapBySlug.get(slug)!.teams].sort((a, b) => byId(a.id, b.id));
  const teamLeague = new Map<string, string>();
  for (const m of applied) for (const t of teamsOf(m.slug)) {
    if (teamLeague.has(t.id)) throw new Error(`applyEspn: ESPN team ${t.id} in two leagues`);
    teamLeague.set(t.id, m.slug);
  }

  // ── Clubs ────────────────────────────────────────────────────────────────
  const clubMatch = matchClubs(
    applied.flatMap((m) => teamsOf(m.slug).map((t) => ({ espnId: t.id, name: t.name, shortName: t.shortName, country: leagueBySlug.get(m.slug)!.country }))),
    [...squadById.values()].map((s) => ({ id: s.id, name: s.name, country: leagueBySlug.get(leagueOfSquad.get(s.id)!)!.country })),
    opts.clubOverrides,
  );
  const squadIdOfTeam = (t: EspnTeam) => clubMatch.get(t.id)!.squadId ?? `es_${t.id}`;
  const clubsBy: Record<string, number> = {};
  for (const m of clubMatch.values()) clubsBy[m.via] = (clubsBy[m.via] ?? 0) + 1;

  // ── Players ──────────────────────────────────────────────────────────────
  const athletes: AthleteRef[] = [];
  for (const m of applied) for (const t of teamsOf(m.slug)) for (const a of [...t.athletes].sort((x, y) => byId(x.id, y.id)))
    athletes.push({ espnId: a.id, displayName: a.displayName, fullName: a.fullName, age: a.age, role: espnRole(a.position), teamSquadId: clubMatch.get(t.id)!.squadId, teamCountry: leagueBySlug.get(m.slug)!.country });
  const playerMatch = matchPlayers(
    athletes,
    [...playerById.values()].map((p) => ({ id: p.id, name: p.name, fullName: p.fullName, age: p.age, role: lineOf(p), squadId: p.squadId, country: leagueBySlug.get(leagueOfSquad.get(p.squadId)!)!.country })),
    opts.playerOverrides,
  );
  const claimedPlayers = new Set(playerMatch.values());

  // ── Membership ───────────────────────────────────────────────────────────
  const leagueRefs: LeagueRef[] = world.leagues.map((l) => ({
    slug: l.slug, country: l.country, tier: pyramidTier(world.pyramids, l.slug),
    members: (world.squads.get(l.slug) ?? []).map((s) => s.id),
  }));
  const lineup = planLineup(leagueRefs, new Map(applied.map((m) => [m.slug, teamsOf(m.slug).map(squadIdOfTeam)])));

  // ── Rebuild applied clubs ────────────────────────────────────────────────
  const built = new Map<string, SquadFile>();
  const espnLogoOf = new Map<string, string>();
  const newClubIds = new Set<string>();
  const matchedIn = new Map<string, RosterPlayer[]>(); // squadId → matched players (after aging)
  const playersByLeague: EspnReport["playersByLeague"] = [];
  const pending: Array<{ squadId: string; league: string; a: EspnTeam["athletes"][number] }> = [];

  for (const m of applied) {
    let matched = 0;
    let created = 0;
    for (const t of teamsOf(m.slug)) {
      const sid = squadIdOfTeam(t);
      const existing = squadById.get(sid);
      const base: SquadFile = existing ? clone(existing) : {
        id: sid, slug: sid, name: t.name, colors: [hex(t.color, "#555555"), hex(t.altColor, "#ffffff")],
        country: leagueBySlug.get(m.slug)!.country, source: "espn", players: [],
      };
      if (!existing) newClubIds.add(sid);
      if (t.coach) base.coach = { ...(base.coach ?? { id: Math.floor(unitHash(sid) * 1e9) }), name: t.coach };
      if (t.logoFile) espnLogoOf.set(sid, t.logoFile);
      base.players = [];
      const aged: RosterPlayer[] = [];
      for (const a of [...t.athletes].sort((x, y) => byId(x.id, y.id))) {
        const pid = playerMatch.get(a.id);
        if (!pid) { pending.push({ squadId: sid, league: m.slug, a }); created++; continue; }
        const src = playerById.get(pid)!;
        const p = clone(src);
        const newAge = a.age ?? src.age;
        p.stats = agePlayerStats(p.id, src.stats, src.age, newAge, opts.roleWeights(src));
        p.age = newAge;
        p.squadId = sid;
        if (a.citizenship) p.nationality = a.citizenship;
        const er = espnRole(a.position);
        if (er && er !== lineOf(src)) p.positions = [er];
        delete p.overallAvg;
        base.players.push(p);
        aged.push(p);
        matched++;
      }
      matchedIn.set(sid, aged);
      built.set(sid, base);
    }
    playersByLeague.push({ league: m.slug, matched, created });
  }

  // ── Non-covered clubs: keep their data, minus the players claimed by covered clubs ──
  const finalMembers = lineup.members;
  const removed = new Set(lineup.removed);
  for (const ids of finalMembers.values()) {
    for (const id of ids) {
      if (built.has(id)) continue;
      const s = clone(squadById.get(id)!);
      s.players = s.players.filter((p) => !claimedPlayers.has(p.id));
      built.set(id, s);
    }
  }

  // ── Bases for estimated players ──────────────────────────────────────────
  const leagueOfFinal = new Map<string, string>();
  for (const [slug, ids] of finalMembers) for (const id of ids) leagueOfFinal.set(id, slug);
  const allMatched = [...matchedIn.values()].flat();
  const worldBase = lineMedians(allMatched.length ? allMatched : [...playerById.values()]);
  const leagueBase = new Map<string, ReturnType<typeof lineMedians>>();
  for (const [slug, ids] of finalMembers) leagueBase.set(slug, lineMedians(ids.flatMap((id) => matchedIn.get(id) ?? built.get(id)!.players)));
  const fallbackStats = (line: MainRole): PlayerStatsRecord => worldBase[line] ?? worldBase.Midfielder!;
  const baseFor = (sid: string, line: MainRole): { stats: PlayerStatsRecord; shift: number } => {
    const league = leagueOfFinal.get(sid)!;
    const own = matchedIn.get(sid) ?? built.get(sid)!.players;
    const useClub = !newClubIds.has(sid) || own.length >= MIN_MATCHED_FOR_CLUB_BASE;
    const ownLine = own.filter((p) => lineOf(p) === line);
    if (useClub && ownLine.length >= MIN_LINE_FOR_CLUB_BASE) return { stats: lineMedians(ownLine)[line]!, shift: 0 };
    const lb = leagueBase.get(league)?.[line] ?? fallbackStats(line);
    return { stats: lb, shift: newClubIds.has(sid) && !useClub ? NEW_CLUB_SHIFT : 0 };
  };

  for (const { squadId, a } of pending) {
    const line = espnRole(a.position) ?? "Midfielder";
    const { stats: b, shift } = baseFor(squadId, line);
    const id = `es_${a.id}`;
    const age = a.age ?? 25;
    const stats = estimateStats(id, age, b, shift);
    const draft = makePlayer({ id, name: a.displayName, fullName: a.fullName, age, role: line, squadId, nationality: a.citizenship, stats }, 0);
    built.get(squadId)!.players.push(makePlayer({ id, name: a.displayName, fullName: a.fullName, age, role: line, squadId, nationality: a.citizenship, stats }, opts.overall(draft)));
  }

  // ── New club metadata ────────────────────────────────────────────────────
  for (const sid of newClubIds) {
    const s = built.get(sid)!;
    const peers = (finalMembers.get(leagueOfFinal.get(sid)!) ?? []).filter((id) => !newClubIds.has(id)).map((id) => built.get(id)!);
    const med = (f: (x: SquadFile) => number | undefined) => Math.round(median(peers.map(f).filter((v): v is number => typeof v === "number")));
    const broadcasting = med((x) => x.finances?.broadcasting);
    const commercial = med((x) => x.finances?.commercial);
    s.finances = { broadcasting, commercial, total: broadcasting + commercial, budget: med((x) => x.finances?.budget), followers: med((x) => x.finances?.followers) };
    const team = [...teamLeague.keys()].find((tid) => `es_${tid}` === sid)!;
    const t = teamsOf(teamLeague.get(team)!).find((x) => x.id === team)!;
    s.venue = { name: `${s.name} Stadium`, city: t.location || null, capacity: med((x) => x.venue?.capacity) || 10000, surface: "grass" };
    if (!s.coach) s.coach = { id: Math.floor(unitHash(sid) * 1e9), name: coachName(sid, { first: [], last: [] }) };
  }

  // ── Squad sizes ──────────────────────────────────────────────────────────
  const pools = namePools([...playerById.values()]);
  const EMPTY: NamePool = { first: [], last: [] };
  let youthAdded = 0;
  for (const [id, s] of built) {
    if (removed.has(id)) continue;
    const country = s.country ?? leagueBySlug.get(leagueOfFinal.get(id)!)!.country;
    const trimmed = trimSquad(s.players, MAX_SQUAD, opts.overall);
    const filled = fillSquad(id, trimmed, pools.get(country) ?? EMPTY, country, (line) => baseFor(id, line).stats, opts.overall);
    youthAdded += filled.filter((p) => p.id.startsWith(`es_youth_${id}_`)).length;
    s.players = filled as SquadFile["players"];
  }

  // ── Assemble leagues ─────────────────────────────────────────────────────
  const oldRow = new Map<string, StandingRow>();
  for (const l of world.leagues) for (const r of l.standings) oldRow.set(r.squadId, r);
  const squadsOut = new Map<string, SquadFile[]>();
  for (const l of world.leagues) {
    const ids = finalMembers.get(l.slug) ?? [];
    squadsOut.set(l.slug, ids.map((id) => built.get(id)!));
    l.standings = ids.map((id) => {
      const s = built.get(id)!;
      const prev = oldRow.get(id);
      const row: StandingRow = { squadId: id, slug: s.slug, name: s.name, colors: s.colors, country: s.country ?? l.country };
      if (prev?.logo) row.logo = prev.logo;
      return row;
    });
    l.season = bumpSeason(l.season);
  }

  // ── Pyramids, zones, schedules ───────────────────────────────────────────
  const pyramids = buildPyramid(
    world.leagues.map((l) => ({ slug: l.slug, country: l.country, clubs: l.standings.length, tier: pyramidTier(world.pyramids, l.slug) })),
    { boundaries: opts.boundaries },
  );
  for (const l of world.leagues) {
    const g = pyramidGroupOf(pyramids, l.slug);
    if (g) l.zones = zonesFromPyramid(g, l.zones ?? []);
  }
  const sizeOf = new Map(world.leagues.map((l) => [l.slug, l.standings.length]));
  for (const sc of world.schedules) {
    const clubs = sizeOf.get(sc.slug);
    if (clubs === undefined) continue;
    const rounds = 2 * (clubs - 1 + (clubs % 2));
    sc.matchDays = rounds > 40 ? [3, 6, 0] : sc.matchDays.length === 3 ? [6, 0] : sc.matchDays;
  }

  // ── Report ───────────────────────────────────────────────────────────────
  const after = [...built.entries()].filter(([id]) => !removed.has(id)).flatMap(([, s]) => s.players).map((p) => ({ age: p.age, ovr: opts.overall(p) }));
  const band = (xs: Array<{ age: number; ovr: number }>, lo: number, hi: number) => {
    const b = xs.filter((x) => x.age >= lo && x.age <= hi);
    return b.length ? b.reduce((s, x) => s + x.ovr, 0) / b.length : 0;
  };
  const report: EspnReport = {
    appliedLeagues: applied.map((m) => m.slug),
    skippedLeagues: skipped,
    clubsBy,
    newClubs: [...newClubIds].sort(byId).map((id) => ({ id, name: built.get(id)!.name, league: leagueOfFinal.get(id)! })),
    movedClubs: lineup.moves,
    removedClubs: lineup.removed,
    playersByLeague,
    youthAdded,
    overallByAge: AGE_BANDS.map(([label, lo, hi]) => ({ band: label, before: band(overallBefore, lo, hi), after: band(after, lo, hi) })),
  };

  return { world: { ...world, squads: squadsOut, pyramids }, report, espnLogoOf, nativeLeagueOf };
}
