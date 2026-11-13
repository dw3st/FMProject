/**
 * The human manager at a national team — save I/O (`.claude/rules/game/national-teams.md` → "Técnico do jogador",
 * Etapa 41b). Pure rules in `src/Domain/national/nationalCoach.ts`; the day itself in `nationalWorld.ts`.
 */
import type { SeatMeta, SaveService } from "@/backend/SaveService";
import { addDays } from "@/Domain/dates";
import { seatManagerId } from "@/Domain/seats/seats";
import { mulberry32, seedFrom } from "@/Domain/rng";
import { vacancyHireOn } from "@/Domain/managers/aiManagers";
import { overallAvg } from "@/Domain/playerRating";
import { preferredRole } from "@/Domain/positions/positionAptitude";
import { isInjured } from "@/Domain/injury/injury";
import { FORMATION_IDS, formationForSimId, formationForTactics } from "@/Domain/matchFormations";
import { CUSTOM_FORMATION_ID } from "@/Domain/formation/zones";
import { mergeTacticsBody } from "@/Domain/tactics/tacticsBody";
import { slotsFor } from "@/Domain/advanceDay/matchSimulationLineups";
import { emitInboxMessage } from "@/Domain/inbox/inboxEvents";
import { buildNationalCoachMessage } from "@/Domain/inbox/nationalCoachMessage";
import { fifaWindows, tournamentDates } from "@/Domain/national/fifaCalendar";
import { rankTeams } from "@/Domain/national/elo";
import {
  checkCallUp, nationalObjective, nextCallUpDate, takeNationalJob, type NationalObjective,
} from "@/Domain/national/nationalCoach";
import {
  NATIONAL_SQUAD, asNationalPlayer, callableCandidates, coachLineup, nationalLineup, pickCallUp,
} from "@/Domain/national/nationalSquad";
import { callUpSquad, leaveNationalTeam, nationPool, nationalPseudoSquad } from "@/backend/nationalWorld";
import { STYLE_TO_AXES, type TacticsSave } from "@/types/tacticsTypes";
import type { Fixture } from "@/types/calendarTypes";
import type { Formation } from "@/GameEngine/types";
import type { NationalCoachOffer, NationalCompetition, NationalHumanCoach, NationalState, NationalTactics } from "@/types/nationalTypes";
import type { RosterPlayer, Squad } from "@/types/playerTypes";

type Fail = { ok: false; status: number; error: string; reason?: string };

const DEFAULT_TACTICS: NationalTactics = { formation: NATIONAL_SQUAD.FORMATION, tactical_style: "balanced", lineup: [] };

/** Answers a national-team job offer. Accept: he takes the team (keeps his club); decline: the offer goes. */
export async function answerNationalOffer(
  service: SaveService, saveId: string, seatId: string, offerId: string, accept: boolean, date: string,
): Promise<{ ok: true; teamId: string } | Fail> {
  const state = await service.getNationalState(saveId);
  const offer = state?.offers?.[seatId]?.find((o) => o.id === offerId);
  if (!state || !offer || offer.expires < date) return { ok: false, status: 409, error: "offerClosed" };
  const mine = (state.offers?.[seatId] ?? []).filter((o) => o.id !== offerId);
  const team = state.teams[offer.teamId];
  if (!accept) {
    // The AI hire goes back to its own date (never before tomorrow), unless another seat still holds an offer.
    const v = state.vacancies[offer.teamId];
    const othersHold = Object.entries(state.offers ?? {}).some(([sid, l]) => sid !== seatId && l.some((o) => o.teamId === offer.teamId));
    const vacancies = v && !othersHold
      ? { ...state.vacancies, [offer.teamId]: { ...v, hireOn: maxDate(addDays(date, 1), vacancyHireOn(v.since, mulberry32(seedFrom(`${saveId}:${offer.teamId}:${v.since}:hire`)))) } }
      : state.vacancies;
    await service.writeNationalState(saveId, { ...state, offers: { ...state.offers, [seatId]: mine }, vacancies });
    return { ok: true, teamId: offer.teamId };
  }
  // A seat coaches one national team at most; the team must still be vacant.
  if (state.human?.[seatId] || !team || !state.vacancies[team.id]) return { ok: false, status: 409, error: "offerClosed" };
  await service.writeManagers(saveId, takeNationalJob(await service.getManagers(saveId), { seatId, teamId: team.id, date }));
  const { [team.id]: _v, ...vacancies } = state.vacancies;
  // The team is taken: its offers close for every seat.
  const offers = Object.fromEntries(
    Object.entries(state.offers ?? {}).map(([sid, list]) => [sid, list.filter((o) => o.teamId !== team.id)]),
  );
  await service.writeNationalState(saveId, {
    ...state,
    offers,
    vacancies,
    teams: { ...state.teams, [team.id]: { ...team, managerId: seatManagerId(seatId) } },
    human: { ...state.human, [seatId]: { teamId: team.id, since: date, wage: offer.wage, tactics: DEFAULT_TACTICS } },
  });
  await emitInboxMessage(saveId, buildNationalCoachMessage({ kind: "hired", date, teamId: team.id, nation: team.nation }), service, seatId);
  return { ok: true, teamId: team.id };
}

const maxDate = (a: string, b: string) => (a > b ? a : b);

/** He leaves his national team on his own (`left: "moved"`): interim + AI vacancy, his club untouched. */
export async function resignNationalTeam(service: SaveService, saveId: string, seatId: string, date: string): Promise<{ ok: true } | Fail> {
  const state = await service.getNationalState(saveId);
  const h = state?.human?.[seatId];
  if (!state || !h) return { ok: false, status: 409, error: "notCoach" };
  const team = state.teams[h.teamId]!;
  const r = await leaveNationalTeam(service, saveId, seatId, state, date, "moved");
  await service.writeNationalState(saveId, r.state);
  await emitInboxMessage(saveId, buildNationalCoachMessage({ kind: "resigned", date, teamId: team.id, nation: team.nation }), service, seatId);
  return { ok: true };
}

// ── Call-up ───────────────────────────────────────────────────────────────────

/** Drawn tournaments of the save with their call-up date (a team only goes to the ones it is in). */
async function drawnTournaments(service: SaveService, saveId: string, state: NationalState): Promise<{ slug: string; callUp: string; teams: string[]; first: string }[]> {
  const out: { slug: string; callUp: string; teams: string[]; first: string }[] = [];
  for (const slug of state.competitions) {
    const c = await service.getNationalComp(saveId, slug);
    if (!c || c.kind !== "tournament" || !c.tournament || c.status === "finished") continue;
    const td = tournamentDates(c.tournament, c.year);
    out.push({ slug, callUp: td.callUp, teams: c.teams, first: td.stageDates[0]!.dates[0]! });
  }
  return out;
}

/** The first game of a call-up (the injury cut-off of `callableCandidates`). */
function firstGameOf(callUp: string, tournaments: { callUp: string; first: string }[]): string {
  const w = fifaWindows(Number(callUp.slice(0, 4))).find((x) => x.start === callUp);
  if (w) return w.matchDates[0]!;
  return tournaments.find((t) => t.callUp === callUp)?.first ?? callUp;
}

/** The candidates of his team's next call-up (`callableCandidates` of the nation on its first game). */
async function nextCallUp(service: SaveService, saveId: string, state: NationalState, h: NationalHumanCoach, date: string) {
  const team = state.teams[h.teamId]!;
  const tours = await drawnTournaments(service, saveId, state);
  const callUp = nextCallUpDate(date, team.id, tours);
  if (!callUp) return null;
  const first = firstGameOf(callUp, tours);
  const index = await service.getSquadIndex(saveId);
  const pool = await nationPool(index, (id) => service.getSquadById(saveId, id));
  const all = pool.get(team.nation) ?? [];
  const callable = callableCandidates(all, first);
  return { callUp, first, all, callable, suggestion: pickCallUp(callable).map((c) => c.player.id) };
}

/** Saves his call-up for the next call-up date (`null` = back to the suggestion). */
export async function saveNationalCallUp(service: SaveService, saveId: string, seatId: string, date: string, ids: unknown): Promise<{ ok: true } | Fail> {
  const state = await service.getNationalState(saveId);
  const human = state?.human?.[seatId];
  if (!state || !human) return { ok: false, status: 409, error: "notCoach" };
  const next = await nextCallUp(service, saveId, state, human, date);
  if (!next) return { ok: false, status: 409, error: "callUpClosed" };
  if (ids === null) {
    const { callUp: _c, ...h } = human;
    await service.writeNationalState(saveId, { ...state, human: { ...state.human, [seatId]: h } });
    return { ok: true };
  }
  const check = checkCallUp(ids, new Map(next.callable.map((c) => [c.player.id, c.player])));
  if (!check.ok) return { ok: false, status: 400, error: "invalidCallUp", reason: check.reason };
  await service.writeNationalState(saveId, { ...state, human: { ...state.human, [seatId]: { ...human, callUp: { date: next.callUp, players: check.players.map((p) => p.id) } } } });
  return { ok: true };
}

/**
 * Saves his national tactics (12.2): the same shape and the same checks as the club's `PUT /tactics`
 * (`mergeTacticsBody`), a partial body merged over the stored ones. Formation: a ready-made id or `custom` with a
 * valid free formation; up to 11 unique player ids. Returns the stored tactics.
 */
export async function saveNationalTactics(service: SaveService, saveId: string, seatId: string, body: unknown): Promise<{ ok: true; tactics: NationalTactics } | Fail> {
  const state = await service.getNationalState(saveId);
  const human = state?.human?.[seatId];
  if (!state || !human) return { ok: false, status: 409, error: "notCoach" };
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, status: 400, error: "invalidFormation" };
  const b = body as Partial<NationalTactics>;
  if (b.formation !== undefined && (typeof b.formation !== "string" || (b.formation !== CUSTOM_FORMATION_ID && !FORMATION_IDS.includes(b.formation)))) {
    return { ok: false, status: 400, error: "invalidFormation" };
  }
  if (b.tactical_style !== undefined && (typeof b.tactical_style !== "string" || !(b.tactical_style in STYLE_TO_AXES))) {
    return { ok: false, status: 400, error: "invalidStyle" };
  }
  if (b.lineup !== undefined) {
    const lineup: unknown = b.lineup;
    if (!Array.isArray(lineup) || lineup.length > 11 || lineup.some((x) => typeof x !== "string" || x.length > 64)) {
      return { ok: false, status: 400, error: "invalidLineup" };
    }
    const real = (lineup as string[]).filter(Boolean);
    if (new Set(real).size !== real.length) return { ok: false, status: 400, error: "invalidLineup" };
  }
  const { assistantRotation: _r, ...rest } = b as Partial<TacticsSave>;
  const merged = mergeTacticsBody(human.tactics ?? DEFAULT_TACTICS, rest);
  if (!merged.ok) return { ok: false, status: 400, error: merged.error };
  const { assistantRotation: _a, ...tactics } = merged.value;
  await service.writeNationalState(saveId, { ...state, human: { ...state.human, [seatId]: { ...human, tactics } } });
  return { ok: true, tactics };
}

/** His stored national tactics (the Formation screen in national mode); null when he coaches no national team. */
export async function nationalTacticsOf(service: SaveService, saveId: string, seatId: string): Promise<NationalTactics | null> {
  const h = (await service.getNationalState(saveId))?.human?.[seatId];
  return h ? h.tactics ?? DEFAULT_TACTICS : null;
}

/** Where the squad of the national Formation screen comes from. */
export type NationalSquadSource = "active" | "next" | "last";

/**
 * The players his national tactics are set with (12.2): the call-up in force; between call-ups, the next one as it
 * stands today (his own choice for it, else the suggested 23: who will play the next game, without the generated
 * players, who only exist once the call-up is made); with no call-up ahead, the last one.
 */
export async function nationalTacticsSquad(service: SaveService, saveId: string, seatId: string, date: string): Promise<{
  teamId: string; nation: string; source: NationalSquadSource; squad: Squad;
} | null> {
  const state = await service.getNationalState(saveId);
  const h = state?.human?.[seatId];
  if (!state || !h) return null;
  const nation = state.teams[h.teamId]?.nation ?? h.teamId;
  const squadOf = (id: string) => service.getSquadById(saveId, id);
  const out = (source: NationalSquadSource, players: RosterPlayer[]) => ({
    teamId: h.teamId, nation, source, squad: nationalPseudoSquad(state, h.teamId, players.map(asNationalPlayer)),
  });
  const active = await callUpSquad(saveId, state, h.teamId, squadOf);
  if (active) return out("active", active.players);
  const next = await nextCallUp(service, saveId, state, h, date);
  if (next) {
    const byId = new Map(next.all.map((c) => [c.player.id, c.player]));
    const ids = h.callUp?.date === next.callUp ? h.callUp.players : next.suggestion;
    const players = ids.map((id) => byId.get(id)).filter((p): p is RosterPlayer => !!p);
    if (players.length > 0) return out("next", players);
  }
  const last = state.lastCallUps?.[h.teamId];
  if (last) {
    const sq = await callUpSquad(saveId, { ...state, callUps: { ...state.callUps, [h.teamId]: last } }, h.teamId, squadOf);
    if (sq) return out("last", sq.players);
  }
  return out("next", []);
}

// ── The "My national team" view ──────────────────────────────────────────────

export interface CoachCandidate {
  id: string; name: string; squadId: string; clubName: string | null; role: string; overall: number; age: number;
  fitness: number; injured: boolean; suggested: boolean;
}

export interface NationalCoachView {
  offers: NationalCoachOffer[];
  team: { id: string; nation: string; confed: string; elo: number; rank: number; since: string; wage: number } | null;
  objectives: NationalObjective[];
  callUp: {
    date: string; firstGame: string; chosen: string[] | null; suggestion: string[]; candidates: CoachCandidate[];
  } | null;
  /** The active call-up (the XI picker): real and generated players. */
  squad: { id: string; name: string; role: string; overall: number; generated: boolean; fitness: number }[];
  tactics: NationalTactics;
  upcoming: (Fixture & { competition: string })[];
  names: Record<string, string>;
}

export async function nationalCoachView(service: SaveService, saveId: string, seatId: string, meta: SeatMeta): Promise<NationalCoachView | null> {
  const state = await service.getNationalState(saveId);
  if (!state) return null;
  const date = meta.currentDate ?? "";
  const names: Record<string, string> = {};
  const offers = (state.offers?.[seatId] ?? []).filter((o) => o.expires >= date);
  for (const o of offers) names[o.teamId] = o.nation;
  const view: NationalCoachView = { offers, team: null, objectives: [], callUp: null, squad: [], tactics: DEFAULT_TACTICS, upcoming: [], names };
  const h = state.human?.[seatId];
  if (!h) return view;
  const team = state.teams[h.teamId]!;
  const all = Object.values(state.teams);
  const rank = rankTeams(all).findIndex((t) => t.id === team.id) + 1;
  view.team = { id: team.id, nation: team.nation, confed: team.confed, elo: Math.round(team.elo), rank, since: h.since, wage: h.wage };
  view.tactics = h.tactics ?? DEFAULT_TACTICS;
  const games: (Fixture & { competition: string })[] = [];
  for (const slug of state.competitions) {
    const c: NationalCompetition | null = await service.getNationalComp(saveId, slug);
    if (!c) continue;
    if (c.status !== "finished") {
      const o = nationalObjective(c, team.id, all);
      if (o) view.objectives.push(o);
    }
    for (const f of c.fixtures) if (!f.played && (f.home === team.id || f.away === team.id)) games.push(f);
  }
  games.sort((a, b) => a.date.localeCompare(b.date));
  view.upcoming = games.slice(0, 6);
  for (const f of view.upcoming) for (const id of [f.home, f.away]) names[id] = state.teams[id]?.nation ?? id;

  const index = await service.getSquadIndex(saveId);
  const squad = await callUpSquad(saveId, state, team.id, (id) => service.getSquadById(saveId, id));
  if (squad) {
    view.squad = squad.players.map((p) => ({
      id: p.id, name: p.name, role: preferredRole(p), overall: round2(overallAvg(p)), generated: p.id.startsWith("ngen_"),
      fitness: Math.round(p.seasonLog?.fitness ?? 100),
    }));
  }
  const next = await nextCallUp(service, saveId, state, h, date);
  if (next) {
    const suggested = new Set(next.suggestion);
    const callable = new Set(next.callable.map((c) => c.player.id));
    view.callUp = {
      date: next.callUp, firstGame: next.first,
      chosen: h.callUp?.date === next.callUp ? h.callUp.players : null,
      suggestion: next.suggestion,
      candidates: next.all
        .map((c) => ({
          id: c.player.id, name: c.player.name, squadId: c.squadId, clubName: index.byId(c.squadId)?.name ?? null,
          role: preferredRole(c.player), overall: round2(overallAvg(c.player)), age: c.player.age,
          fitness: Math.round(c.player.seasonLog?.fitness ?? 100), injured: !callable.has(c.player.id) || isInjured(c.player, next.first),
          suggested: suggested.has(c.player.id),
        }))
        .sort((a, b) => b.overall - a.overall || a.id.localeCompare(b.id))
        // The best CANDIDATE_ROWS, plus whoever is suggested or chosen (a big nation has hundreds of players).
        .filter((c, i) => i < CANDIDATE_ROWS || c.suggested || (h.callUp?.players ?? []).includes(c.id)),
    };
  }
  return view;
}

const round2 = (v: number) => Math.round(v * 100) / 100;
const CANDIDATE_ROWS = 60;

// ── Calendar, fast-forward and the live match ────────────────────────────────

/** His national team's unplayed games from `from` on (with the competition). */
async function humanGames(service: SaveService, saveId: string, state: NationalState, seatId: string): Promise<Fixture[]> {
  const h = state.human?.[seatId];
  if (!h) return [];
  const out: Fixture[] = [];
  for (const slug of state.competitions) {
    const c = await service.getNationalComp(saveId, slug);
    if (!c || c.status === "finished" && !c.fixtures.some((f) => f.home === h.teamId || f.away === h.teamId)) continue;
    for (const f of c.fixtures) if (f.home === h.teamId || f.away === h.teamId) out.push(f);
  }
  return out;
}

/** Every unplayed game date of his national team on or after `from`, ascending. */
export async function nationalFixtureDates(service: SaveService, saveId: string, seatId: string, from: string): Promise<string[]> {
  const state = await service.getNationalState(saveId);
  if (!state?.human?.[seatId]) return [];
  return (await humanGames(service, saveId, state, seatId)).filter((f) => !f.played && f.date >= from).map((f) => f.date).sort();
}

/** His national team's unplayed game of `date` (Etapa 41b), or null. */
export async function nationalFixtureOn(service: SaveService, saveId: string, seatId: string, date: string): Promise<Fixture | null> {
  const state = await service.getNationalState(saveId);
  if (!state?.human?.[seatId]) return null;
  return (await humanGames(service, saveId, state, seatId)).find((f) => !f.played && f.date === date) ?? null;
}

/** The next unplayed game day of his national team (the fast-forward stops there), or null. */
export async function nextNationalFixtureDate(service: SaveService, saveId: string, seatId: string, from: string): Promise<string | null> {
  const state = await service.getNationalState(saveId);
  if (!state?.human?.[seatId]) return null;
  const dates = (await humanGames(service, saveId, state, seatId)).filter((f) => !f.played && f.date >= from).map((f) => f.date).sort();
  return dates[0] ?? null;
}

/**
 * His national games for the player's calendar (`season.calendar`): the national side's id swapped for the club's
 * (every "my match day" flow of the screens reads the club id), the real team in `nationalTeam`; the names of the
 * national teams for the screens.
 */
export async function playerNationalCalendar(service: SaveService, saveId: string, seatId: string, clubId: string): Promise<{
  teamId: string | null; fixtures: Fixture[]; teamNames: Record<string, string>;
}> {
  const state = await service.getNationalState(saveId);
  const h = state?.human?.[seatId];
  if (!state || !h) return { teamId: null, fixtures: [], teamNames: {} };
  const teamId = h.teamId;
  const games = await humanGames(service, saveId, state, seatId);
  const teamNames: Record<string, string> = {};
  for (const f of games) for (const id of [f.home, f.away]) teamNames[id] = state.teams[id]?.nation ?? id;
  const fixtures = games.map((f) => ({
    ...f,
    home: f.home === teamId ? clubId : f.home,
    away: f.away === teamId ? clubId : f.away,
    nationalTeam: teamId,
  }));
  return { teamId, fixtures, teamNames };
}

/** What `match-setup` returns for his national game of `date` (null when there is none). */
export async function nationalMatchSetup(service: SaveService, saveId: string, seatId: string, date: string): Promise<{
  fixture: Fixture; teamId: string; mySquad: Squad; opponentSquad: Squad; myFormation: Formation; oppFormation: Formation;
  myLineup: string[]; oppLineup: string[]; tactics: NationalTactics;
} | null> {
  const state = await service.getNationalState(saveId);
  const h = state?.human?.[seatId];
  if (!state || !h) return null;
  const fixture = (await humanGames(service, saveId, state, seatId)).find((f) => !f.played && f.date === date);
  if (!fixture) return null;
  const oppId = fixture.home === h.teamId ? fixture.away : fixture.home;
  const squadOf = (id: string) => service.getSquadById(saveId, id);
  const mine = await callUpSquad(saveId, state, h.teamId, squadOf);
  const opp = await callUpSquad(saveId, state, oppId, squadOf);
  if (!mine || !opp) return null;
  const tactics = h.tactics ?? DEFAULT_TACTICS;
  // The formation his tactics play (12.2: a free formation included).
  const myFormation = formationForTactics(tactics);
  const oppFormation = formationForSimId(NATIONAL_SQUAD.FORMATION);
  const myPlayers = mine.players.map(asNationalPlayer);
  return {
    fixture, teamId: h.teamId,
    mySquad: nationalPseudoSquad(state, h.teamId, myPlayers),
    opponentSquad: nationalPseudoSquad(state, oppId, opp.players),
    myFormation, oppFormation,
    myLineup: padLineup(coachLineup(myPlayers, myFormation, tactics.lineup, date), myFormation),
    oppLineup: nationalLineup(opp.players, date),
    tactics,
  };
}

const padLineup = (lineup: string[], f: Formation) => slotsFor(f).map((_, i) => lineup[i] ?? "");
