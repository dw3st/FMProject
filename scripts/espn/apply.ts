import { agePlayerStats } from "@/../scripts/espn/aging";
import { estimateStats, fillSquad, lineMedians, makePlayer, trimSquad } from "@/../scripts/espn/estimate";
import { planLineup, type LeagueRef } from "@/../scripts/espn/lineup";
import { matchClubs } from "@/../scripts/espn/matchClubs";
import { espnRole, matchPlayers, type AthleteRef } from "@/../scripts/espn/matchPlayers";
import type { EspnAthlete, EspnSnapshot, EspnTeam, LeagueMapEntry } from "@/../scripts/espn/types";
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
  /** Same as `overallByAge`, restricted to players matched to an ESPN athlete (not created/youth). */
  overallByAgeMatched: Array<{ band: string; before: number; after: number }>;
  /** An ESPN athlete id listed at two (or more) teams — kept at `keptTeam`, dropped everywhere else. */
  duplicateAthletes: Array<{ athleteId: string; keptTeam: string; droppedTeam: string }>;
  /**
   * A brand-new `es_` club where most of its matched players actually came from ONE world club that
   * this run displaced (moved to a lower league) or removed — the signature of a club match that
   * should have resolved but didn't (add a `clubOverrides` entry for it).
   */
  suspectNewClubs: Array<{ newId: string; espnName: string; league: string; fromSquadId: string; fromName: string; share: number }>;
  /** Every club match resolved via the loose or prefix pass (worth a human glance, not necessarily wrong). */
  fuzzyClubs: Array<{ espnId: string; espnName: string; squadId: string; worldName: string; league: string; via: "loose" | "prefix" }>;
  /** Median (a.age − src.age) over matched athletes with a non-null ESPN age; used to age a null-age match. */
  typicalGap: number;
  /** age gap → number of matched athletes with that gap. */
  ageGapHistogram: Record<number, number>;
  playersRemoved: {
    /** Original players of a covered club that no ESPN athlete on that club's roster matched to. */
    unmatchedInCoveredClubs: number;
    /** Original headcount of clubs that left the world entirely this run. */
    inRemovedClubs: number;
    /** Players dropped by `trimSquad` when a squad exceeded MAX_SQUAD. */
    trimmed: number;
  };
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
/** A new-club roster needs at least this share of matched players from one displaced/removed club to be flagged as a suspected missed club match. */
export const SUSPECT_CLUB_SHARE = 0.5;
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
/** A team name that looks like a reserve/B side ("Real Sociedad II", "Barcelona B", "PSG 2"). */
const isReserveTeam = (name: string) => /\b(?:II|B|2)$/.test(name) || name.endsWith(" II");

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
    applied.flatMap((m) => teamsOf(m.slug).map((t) => ({ espnId: t.id, name: t.name, shortName: t.shortName, country: leagueBySlug.get(m.slug)!.country, league: m.slug }))),
    [...squadById.values()].map((s) => ({ id: s.id, name: s.name, country: leagueBySlug.get(leagueOfSquad.get(s.id)!)!.country, league: leagueOfSquad.get(s.id)! })),
    opts.clubOverrides,
  );
  const squadIdOfTeam = (t: EspnTeam) => clubMatch.get(t.id)!.squadId ?? `es_${t.id}`;
  const clubsBy: Record<string, number> = {};
  for (const m of clubMatch.values()) clubsBy[m.via] = (clubsBy[m.via] ?? 0) + 1;

  const espnTeamById = new Map<string, EspnTeam>();
  for (const m of applied) for (const t of teamsOf(m.slug)) espnTeamById.set(t.id, t);
  const fuzzyClubs: EspnReport["fuzzyClubs"] = [];
  for (const [espnId, cm] of clubMatch) {
    if ((cm.via === "loose" || cm.via === "prefix") && cm.squadId) {
      fuzzyClubs.push({
        espnId, espnName: espnTeamById.get(espnId)!.name, squadId: cm.squadId,
        worldName: squadById.get(cm.squadId)!.name, league: leagueOfSquad.get(cm.squadId)!, via: cm.via,
      });
    }
  }
  fuzzyClubs.sort((a, b) => byId(a.espnId, b.espnId));

  // ── Players ──────────────────────────────────────────────────────────────
  // Dedupe ESPN athletes listed at more than one team (loans, reserve-side double-listing): keep the
  // non-reserve team, then the higher tier, then the lower team id; drop the rest entirely.
  interface AthleteEntry { a: EspnAthlete; team: EspnTeam; leagueSlug: string }
  const allAthleteEntries: AthleteEntry[] = [];
  for (const m of applied) for (const t of teamsOf(m.slug)) for (const a of [...t.athletes].sort((x, y) => byId(x.id, y.id)))
    allAthleteEntries.push({ a, team: t, leagueSlug: m.slug });
  const entriesByAthleteId = new Map<string, AthleteEntry[]>();
  for (const e of allAthleteEntries) {
    const arr = entriesByAthleteId.get(e.a.id);
    if (arr) arr.push(e); else entriesByAthleteId.set(e.a.id, [e]);
  }
  const winnerTeamOf = new Map<string, string>(); // athleteId → winning ESPN team id
  const duplicateAthletes: EspnReport["duplicateAthletes"] = [];
  for (const [athleteId, entries] of entriesByAthleteId) {
    if (entries.length === 1) { winnerTeamOf.set(athleteId, entries[0]!.team.id); continue; }
    const ranked = [...entries].sort((x, y) => {
      const rx = isReserveTeam(x.team.name) ? 1 : 0;
      const ry = isReserveTeam(y.team.name) ? 1 : 0;
      if (rx !== ry) return rx - ry;
      const tx = pyramidTier(world.pyramids, x.leagueSlug);
      const ty = pyramidTier(world.pyramids, y.leagueSlug);
      if (tx !== ty) return tx - ty;
      return byId(x.team.id, y.team.id);
    });
    const winner = ranked[0]!;
    winnerTeamOf.set(athleteId, winner.team.id);
    for (const loser of ranked.slice(1)) duplicateAthletes.push({ athleteId, keptTeam: winner.team.name, droppedTeam: loser.team.name });
  }
  duplicateAthletes.sort((x, y) => byId(x.athleteId, y.athleteId));

  const athletes: AthleteRef[] = [...entriesByAthleteId.entries()].map(([athleteId, entries]) => {
    const e = entries.find((x) => x.team.id === winnerTeamOf.get(athleteId))!;
    return {
      espnId: e.a.id, displayName: e.a.displayName, fullName: e.a.fullName, age: e.a.age, role: espnRole(e.a.position),
      teamSquadId: clubMatch.get(e.team.id)!.squadId, teamCountry: leagueBySlug.get(e.leagueSlug)!.country,
    };
  });
  const playerMatch = matchPlayers(
    athletes,
    [...playerById.values()].map((p) => ({ id: p.id, name: p.name, fullName: p.fullName, age: p.age, role: lineOf(p), squadId: p.squadId, country: leagueBySlug.get(leagueOfSquad.get(p.squadId)!)!.country })),
    opts.playerOverrides,
  );
  const claimedPlayers = new Set(playerMatch.values());

  // Typical ESPN−world age gap, from matched athletes with a known ESPN age. Used to age a matched
  // athlete whose ESPN age is null, and to advance every player left in a non-covered club.
  const gaps: number[] = [];
  const ageGapHistogram: Record<number, number> = {};
  for (const a of athletes) {
    if (a.age === null) continue;
    const pid = playerMatch.get(a.espnId);
    if (!pid) continue;
    const gap = a.age - playerById.get(pid)!.age;
    gaps.push(gap);
    ageGapHistogram[gap] = (ageGapHistogram[gap] ?? 0) + 1;
  }
  const typicalGap = gaps.length ? Math.round(median(gaps)) : 0;

  // ── Membership ───────────────────────────────────────────────────────────
  const leagueRefs: LeagueRef[] = world.leagues.map((l) => ({
    slug: l.slug, country: l.country, tier: pyramidTier(world.pyramids, l.slug),
    members: (world.squads.get(l.slug) ?? []).map((s) => s.id),
  }));
  const lineup = planLineup(leagueRefs, new Map(applied.map((m) => [m.slug, teamsOf(m.slug).map(squadIdOfTeam)])));
  const finalMembers = lineup.members;
  const removed = new Set(lineup.removed);
  const leagueOfFinal = new Map<string, string>();
  for (const [slug, ids] of finalMembers) for (const id of ids) leagueOfFinal.set(id, slug);
  /** Squads that moved to a strictly higher (deeper) pyramid tier this run — a demotion. */
  const movedDown = new Set<string>();
  for (const mv of lineup.moves) {
    if (pyramidTier(world.pyramids, mv.to) > pyramidTier(world.pyramids, mv.from)) movedDown.add(mv.squadId);
  }
  let inRemovedClubs = 0;
  for (const id of removed) inRemovedClubs += squadById.get(id)?.players.length ?? 0;

  // ── Rebuild applied clubs ────────────────────────────────────────────────
  const built = new Map<string, SquadFile>();
  const espnLogoOf = new Map<string, string>();
  const newClubIds = new Set<string>();
  const coveredOriginalSquadIds = new Set<string>();
  const matchedIn = new Map<string, RosterPlayer[]>(); // squadId → matched players (after aging)
  const originCounts = new Map<string, Map<string, number>>(); // squadId → origin squadId → matched count
  const playersByLeague: EspnReport["playersByLeague"] = [];
  const pending: Array<{ squadId: string; league: string; a: EspnAthlete }> = [];

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
      if (!existing) newClubIds.add(sid); else coveredOriginalSquadIds.add(sid);
      if (t.coach) base.coach = { ...(base.coach ?? { id: Math.floor(unitHash(sid) * 1e9) }), name: t.coach };
      if (t.logoFile) espnLogoOf.set(sid, t.logoFile);
      base.players = [];
      const aged: RosterPlayer[] = [];
      for (const a of [...t.athletes].sort((x, y) => byId(x.id, y.id))) {
        if (winnerTeamOf.get(a.id) !== t.id) continue; // dropped duplicate — belongs to another team
        const pid = playerMatch.get(a.id);
        if (!pid) { pending.push({ squadId: sid, league: m.slug, a }); created++; continue; }
        const src = playerById.get(pid)!;
        const p = clone(src);
        const newAge = a.age ?? (src.age + typicalGap);
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
        const om = originCounts.get(sid) ?? new Map<string, number>();
        om.set(src.squadId, (om.get(src.squadId) ?? 0) + 1);
        originCounts.set(sid, om);
      }
      matchedIn.set(sid, aged);
      built.set(sid, base);
    }
    playersByLeague.push({ league: m.slug, matched, created });
  }

  // A new club whose matched roster is mostly one displaced/removed world club is a likely missed
  // club match — surfaced for a human to turn into a clubOverrides entry.
  const suspectNewClubs: EspnReport["suspectNewClubs"] = [];
  for (const sid of newClubIds) {
    const om = originCounts.get(sid);
    if (!om) continue;
    const total = [...om.values()].reduce((a, b) => a + b, 0);
    if (total === 0) continue;
    let topOrigin = "";
    let topCount = 0;
    for (const [origin, count] of om) if (count > topCount) { topCount = count; topOrigin = origin; }
    const share = topCount / total;
    if (share >= SUSPECT_CLUB_SHARE && (movedDown.has(topOrigin) || removed.has(topOrigin))) {
      suspectNewClubs.push({
        newId: sid, espnName: built.get(sid)!.name, league: leagueOfFinal.get(sid)!,
        fromSquadId: topOrigin, fromName: squadById.get(topOrigin)?.name ?? topOrigin, share,
      });
    }
  }
  suspectNewClubs.sort((a, b) => byId(a.newId, b.newId));

  let unmatchedInCoveredClubs = 0;
  for (const sid of coveredOriginalSquadIds) {
    const orig = squadById.get(sid);
    if (!orig) continue;
    for (const p of orig.players) if (!claimedPlayers.has(p.id)) unmatchedInCoveredClubs++;
  }

  // ── Non-covered clubs: keep their data minus the players claimed by covered clubs, and age the rest
  // by the same typicalGap so the whole world advances in time consistently ──
  for (const ids of finalMembers.values()) {
    for (const id of ids) {
      if (built.has(id)) continue;
      const s = clone(squadById.get(id)!);
      s.players = s.players
        .filter((p) => !claimedPlayers.has(p.id))
        .map((p) => {
          const newAge = p.age + typicalGap;
          return { ...p, age: newAge, stats: agePlayerStats(p.id, p.stats, p.age, newAge, opts.roleWeights(p)) };
        });
      built.set(id, s);
    }
  }

  // ── Bases for estimated players ──────────────────────────────────────────
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

  // ── New club metadata: finances/capacity fall back league → country → world, never 0 ─────────
  for (const sid of newClubIds) {
    const s = built.get(sid)!;
    const league = leagueOfFinal.get(sid)!;
    const country = s.country ?? leagueBySlug.get(league)!.country;
    const nonNewBuilt = [...built.values()].filter((x) => !newClubIds.has(x.id));
    const countryOf = (x: SquadFile) => x.country ?? leagueBySlug.get(leagueOfFinal.get(x.id)!)?.country;
    const leaguePeers = (finalMembers.get(league) ?? []).filter((id) => !newClubIds.has(id)).map((id) => built.get(id)!);
    const countryPeers = nonNewBuilt.filter((x) => countryOf(x) === country);
    const medOf = (peers: SquadFile[], f: (x: SquadFile) => number | undefined): number | undefined => {
      const vals = peers.map(f).filter((v): v is number => typeof v === "number");
      return vals.length ? Math.round(median(vals)) : undefined;
    };
    const med = (f: (x: SquadFile) => number | undefined) => medOf(leaguePeers, f) ?? medOf(countryPeers, f) ?? medOf(nonNewBuilt, f) ?? 0;
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
  let trimmed = 0;
  for (const [id, s] of built) {
    const country = s.country ?? leagueBySlug.get(leagueOfFinal.get(id)!)!.country;
    const before = s.players.length;
    const trimmedPlayers = trimSquad(s.players, MAX_SQUAD, opts.overall);
    trimmed += before - trimmedPlayers.length;
    const filled = fillSquad(id, trimmedPlayers, pools.get(country) ?? EMPTY, country, (line) => baseFor(id, line).stats, opts.overall);
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

  // Final safety net: no player id may appear in two output squads.
  {
    const seenIds = new Map<string, string>();
    const dupMessages: string[] = [];
    for (const squads of squadsOut.values()) for (const sq of squads) for (const p of sq.players) {
      const prevSquad = seenIds.get(p.id);
      if (prevSquad) dupMessages.push(`${p.id} in both ${prevSquad} and ${sq.id}`);
      else seenIds.set(p.id, sq.id);
    }
    if (dupMessages.length > 0) throw new Error(`applyEspn: duplicate player ids across output squads — ${dupMessages.slice(0, 5).join("; ")}`);
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
  const overallBeforeMatched = [...claimedPlayers].map((id) => playerById.get(id)!).map((p) => ({ age: p.age, ovr: opts.overall(p) }));
  const overallAfterMatched = [...matchedIn.values()].flat().map((p) => ({ age: p.age, ovr: opts.overall(p) }));
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
    overallByAgeMatched: AGE_BANDS.map(([label, lo, hi]) => ({ band: label, before: band(overallBeforeMatched, lo, hi), after: band(overallAfterMatched, lo, hi) })),
    duplicateAthletes,
    suspectNewClubs,
    fuzzyClubs,
    typicalGap,
    ageGapHistogram,
    playersRemoved: { unmatchedInCoveredClubs, inRemovedClubs, trimmed },
  };

  return { world: { ...world, squads: squadsOut, pyramids }, report, espnLogoOf, nativeLeagueOf };
}
