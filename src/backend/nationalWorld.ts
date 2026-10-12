/**
 * National teams — save I/O (`.claude/rules/game/national-teams.md`). Pure logic lives in
 * src/Domain/national/. The state is `national/state.json` (teams, Elo, managers, call-ups, draws) and one
 * file per competition (`national/comps/<slug>.json`). Every national game is a quickSim.
 */
import { faceRegionOf } from "@/Domain/faces/faceProfile";
import type { SaveService } from "@/backend/SaveService";
import type { SquadIndex } from "@/backend/squadIndex";
import { countryKey } from "@/Domain/cups/cupIds";
import { addDays, daysBetween } from "@/Domain/dates";
import { mulberry32, seedFrom } from "@/Domain/rng";
import { overallAvg } from "@/Domain/playerRating";
import { NATION_CONFED, normalizeNation } from "@/Domain/registration/nations";
import { quickSimMatch } from "@/Domain/advanceDay/quickSim";
import { slotRoles } from "@/Domain/advanceDay/matchSimulationLineups";
import { formationForSimId } from "@/Domain/matchFormations";
import { afterNationalCallUp } from "@/Domain/morale/morale";
import {
  COPA_GUEST_CONFED, EURO_SLOTS, TOURNAMENTS, WC_SLOTS, fifaWindows, friendliesSlug, hasQualifiers,
  qualifierDates, qualifierDrawDate, qualifierSlug, tournamentDates, tournamentDrawDate, tournamentSlug,
  tournamentsOfYear,
} from "@/Domain/national/fifaCalendar";
import {
  advanceTournament, buildQualifier, buildTournament, groupRoundCount, groupStageComplete, pairFriendlies,
  qualifierQualified, stageRound, type DrawTeam,
} from "@/Domain/national/competitions";
import { eloAfterMatch, initialPoints, rankTeams, type EloMatchKind } from "@/Domain/national/elo";
import {
  NATIONAL_SQUAD, asNationalPlayer, callableCandidates, fillerLevel, isGeneratedNationalId, lineOf, missingByLine,
  nationalFillers, nationalLineup, pickCallUp, squadLevel, type NationCandidate,
} from "@/Domain/national/nationalSquad";
import {
  NATIONAL_MATCH, applyNationalMatch, nationalCampDay, updateNationalLeaders, withNationalAward, withNationalTitle,
} from "@/Domain/national/nationalMatch";
import {
  NATIONAL_AWARDS, computeTournamentAwards, tournamentAwardKeys, tournamentValueMult,
} from "@/Domain/national/nationalAwards";
import {
  aiManagerReputation, chooseHire, hireManager, rolloverSackChance, sackManager, vacancyHireOn,
} from "@/Domain/managers/aiManagers";
import { cleanRecord } from "@/Domain/managers/managerRecords";
import { coachLineup } from "@/Domain/national/nationalSquad";
import {
  leaveNationalJob, nextCallUpDate, objectiveFailedBadly, objectiveMet, qualifierOutcome, rollNationalOffer, tournamentOutcome,
} from "@/Domain/national/nationalCoach";
import { simulateRecording, type PlayedMatchRecording } from "@/Domain/advanceDay/matches";
import type { NationalCoachNews } from "@/Domain/inbox/nationalCoachMessage";
import type { MatchEvent, Scorer } from "@/types/dayLogTypes";
import type { Fixture } from "@/types/calendarTypes";
import type { ManagerRecord } from "@/types/managerTypes";
import type {
  NationalCallUp, NationalCoachOffer, NationalCompetition, NationalStageName, NationalState, NationalTeam, NationalTournament,
  NationalTournamentAwards,
} from "@/types/nationalTypes";
import type { RosterPlayer, Squad } from "@/types/playerTypes";
import type { MainRole } from "@/Domain/roles";
import type { Confed } from "@/types/registrationTypes";
import { logError } from "@/Logger";

export const isNationalTeamId = (id: string): boolean => id.startsWith("nat_");
export const nationalTeamId = (nation: string): string => `nat_${countryKey(nation)}`;

const LINE_SHORT: Record<MainRole, "GK" | "DEF" | "MID" | "FWD"> = { GK: "GK", Defender: "DEF", Midfielder: "MID", Forward: "FWD" };
const MAIN_LINES: MainRole[] = ["GK", "Defender", "Midfielder", "Forward"];

// ── The world's players by nation ─────────────────────────────────────────────

/** Squad players of every club by normalized nation (academy and free agents never). */
export async function nationPool(index: SquadIndex, squadOf: (id: string) => Promise<Squad | null>): Promise<Map<string, NationCandidate[]>> {
  const out = new Map<string, NationCandidate[]>();
  for (const league of index.leagues()) {
    for (const t of index.inLeague(league)) {
      const squad = await squadOf(t.squadId);
      if (!squad) continue;
      for (const p of squad.players) {
        const n = normalizeNation(p.nationality);
        if (!n || !NATION_CONFED[n]) continue;
        (out.get(n) ?? out.set(n, []).get(n)!).push({ player: p, squadId: squad.id });
      }
    }
  }
  return out;
}

/**
 * Up to 40 full names of the nation's players (names of generated players and of the AI coach): a deterministic
 * sample spread over the whole list by a hash of each name, never the first ones in alphabetical order. A nation
 * with few players in the world (Qatar has one) is completed with the players of the nations of the same region
 * (`faceRegionOf`: Gulf names for Qatar), so its generated players never share a name.
 */
const MIN_DONORS = 15;
const MAX_DONORS = 40;
const byHash = (names: Iterable<string>) =>
  [...new Set(names)].map((n) => ({ n, h: seedFrom(`donor:${n}`) })).sort((a, b) => a.h - b.h || a.n.localeCompare(b.n)).map((x) => x.n);
function donorsOf(nation: string, cands: NationCandidate[], pool?: Map<string, NationCandidate[]>): string[] {
  const own = byHash(cands.map((c) => c.player.name)).slice(0, MAX_DONORS);
  if (own.length >= MIN_DONORS || !pool) return own;
  const region = faceRegionOf(nation);
  const near = byHash([...pool].filter(([n]) => n !== nation && faceRegionOf(n) === region).flatMap(([, cs]) => cs.map((c) => c.player.name)));
  return [...own, ...near.filter((n) => !own.includes(n))].slice(0, MAX_DONORS);
}

function coachName(nation: string, donors: string[], key: string): string {
  const rng = mulberry32(seedFrom(`coach:${key}`));
  const pick = () => donors[Math.floor(rng() * donors.length)] ?? "J. Silva";
  const first = pick().split(" ")[0]!.replace(/\.$/, "");
  const lastParts = pick().split(" ");
  const last = lastParts[lastParts.length - 1]!;
  return first.length > 1 ? `${first} ${last}` : `${first}. ${last}`;
}

// ── Creation ─────────────────────────────────────────────────────────────────

/**
 * Career creation: a national team for every nation with a player in the world (Elo from the level of its best
 * possible XI), an AI coach in `managers.json` per team, then the draws already due (the first Euro qualifiers).
 */
export async function createNationalWorld(args: { service: SaveService; saveId: string; date: string; index: SquadIndex }): Promise<NationalState> {
  const { service, saveId, date, index } = args;
  const pool = await nationPool(index, (id) => service.getSquadById(saveId, id));
  const managers = await service.getManagers(saveId);
  const taken = new Set(managers.map((m) => m.id));
  const teams: Record<string, NationalTeam> = {};
  const newManagers: ManagerRecord[] = [];
  for (const [nation, cands] of [...pool].sort(([a], [b]) => a.localeCompare(b))) {
    const id = nationalTeamId(nation);
    const confed = NATION_CONFED[nation]!;
    const real = pickCallUp(cands).map((c) => c.player);
    const fill = fillersFor({ saveId, id, nation, year: Number(date.slice(0, 4)), real, all: cands, confed, pool });
    const level = squadLevel([...real, ...fill.players]);
    // A rebuilt world (`ensureNationalWorld`) keeps the coach the team already has.
    let managerId = managers.find((m) => m.squadId === id)?.id ?? `coach_${id}`;
    if (!managers.some((m) => m.id === managerId)) {
      for (let n = 2; taken.has(managerId); n++) managerId = `coach_${id}_${n}`;
      taken.add(managerId);
      newManagers.push(cleanRecord({
        id: managerId, name: coachName(nation, donorsOf(nation, cands, pool), id), squadId: id, isPlayer: false,
        points: 0, seasons: 0, titles: [], clubs: [{ squadId: id, from: date }],
      }));
    }
    teams[id] = { id, nation, confed, elo: initialPoints(level), managerId, games: 0 };
  }
  await service.writeManagers(saveId, [...managers, ...newManagers]);
  let state: NationalState = { teams, callUps: {}, competitions: [], draws: [], vacancies: {} };
  state = await runDraws(service, saveId, state, date);
  await service.writeNationalState(saveId, state);
  return state;
}

/**
 * Safety net after the career's start (no start kit for a Brazilian career): national games dated before `today`
 * still unplayed mean the world was drawn from the world's start; it is drawn again from `today`.
 */
export async function ensureNationalWorld(args: { service: SaveService; saveId: string; today: string; index: SquadIndex }): Promise<boolean> {
  const state = await args.service.getNationalState(args.saveId);
  if (state) {
    let stale = false;
    for (const slug of state.competitions) {
      const c = await args.service.getNationalComp(args.saveId, slug);
      if (c?.fixtures.some((f) => !f.played && f.date < args.today)) { stale = true; break; }
    }
    if (!stale) return false;
  }
  await createNationalWorld({ service: args.service, saveId: args.saveId, date: args.today, index: args.index });
  return true;
}

export interface FillerSpec {
  level: number; donors: string[]; counts: Partial<Record<MainRole, number>>; year: number;
  /** Names of the real players called up: a generated player never repeats one. */
  reserved?: string[];
}

function fillersFor(a: { saveId: string; id: string; nation: string; year: number; real: RosterPlayer[]; all: NationCandidate[]; confed: Confed; pool?: Map<string, NationCandidate[]> }): { spec: FillerSpec; players: RosterPlayer[] } {
  const miss = missingByLine(a.real);
  const levels = [...a.all].map((c) => overallAvg(c.player)).sort((x, y) => y - x).slice(0, NATIONAL_SQUAD.SIZE);
  const spec: FillerSpec = {
    level: Math.round(fillerLevel(levels, a.confed) * 100) / 100, donors: donorsOf(a.nation, a.all, a.pool), counts: {}, year: a.year,
    reserved: a.real.map((p) => p.name),
  };
  for (const l of MAIN_LINES) if (miss[l] > 0) spec.counts[l] = miss[l];
  return { spec, players: regenerateFillers(a.saveId, a.id, a.nation, spec) };
}

export function regenerateFillers(saveId: string, teamId: string, nation: string, spec: FillerSpec): RosterPlayer[] {
  const out: RosterPlayer[] = [];
  const taken = new Set(spec.reserved ?? []);
  for (const l of MAIN_LINES) {
    const n = spec.counts[l] ?? 0;
    if (n > 0) out.push(...nationalFillers({ saveId, teamId, nation, year: spec.year, line: l, n, level: spec.level, donors: spec.donors, taken }));
  }
  return out;
}

// ── Draws ─────────────────────────────────────────────────────────────────────

const drawTeams = (state: NationalState, ids?: string[]): DrawTeam[] =>
  (ids ?? Object.keys(state.teams)).map((id) => state.teams[id]!).map((t) => ({ id: t.id, confed: t.confed, elo: t.elo }));

async function addComp(service: SaveService, saveId: string, state: NationalState, comp: NationalCompetition): Promise<NationalState> {
  await service.writeNationalComp(saveId, comp);
  return state.competitions.includes(comp.slug) ? state : { ...state, competitions: [...state.competitions, comp.slug] };
}

/**
 * The draws due on `date` (idempotent through `state.draws`): a tournament's qualifiers from 15/01 of year − 2 (or
 * now, while some of its dates are still ahead), the tournament itself from 01/12 of year − 1 (before it starts).
 */
async function runDraws(service: SaveService, saveId: string, state0: NationalState, date: string): Promise<NationalState> {
  let state = state0;
  const year = Number(date.slice(0, 4));
  for (let y = year; y <= year + 3; y++) {
    for (const t of tournamentsOfYear(y)) {
      const qKey = `${t}q_${y}`;
      const dates = qualifierDates(y, addDays(date, 1));
      if (hasQualifiers(t) && !state.draws.includes(qKey) && date >= qualifierDrawDate(y) && dates.length > 0) {
        const confeds: Confed[] = t === "euro" ? ["UEFA"] : (Object.keys(WC_SLOTS) as Confed[]);
        for (const confed of confeds) {
          const teams = drawTeams(state).filter((x) => x.confed === confed);
          if (teams.length === 0) continue;
          const slots = t === "euro" ? EURO_SLOTS : WC_SLOTS[confed];
          state = await addComp(service, saveId, state, buildQualifier({
            tournament: t, year: y, confed, teams, slots, dates, seedKey: `${saveId}:${qKey}:${confed}`,
          }));
        }
        state = { ...state, draws: [...state.draws, qKey] };
      }
      const tKey = tournamentSlug(t, y);
      const td = tournamentDates(t, y);
      if (!state.draws.includes(tKey) && date >= tournamentDrawDate(y) && date < td.callUp) {
        const ids = await tournamentTeams(service, saveId, state, t, y);
        state = await addComp(service, saveId, state, buildTournament({ tournament: t, year: y, teams: drawTeams(state, ids), seedKey: `${saveId}:${tKey}` }));
        state = { ...state, draws: [...state.draws, tKey] };
      }
    }
  }
  return state;
}

/** The teams of a tournament: the qualified of its qualifiers (Copa América: CONMEBOL + guests), best Elo to fill. */
async function tournamentTeams(service: SaveService, saveId: string, state: NationalState, t: NationalTournament, year: number): Promise<string[]> {
  const size = TOURNAMENTS[t].teams;
  const elo = (id: string) => state.teams[id]?.elo ?? 0;
  const ranked = rankTeams(Object.values(state.teams));
  let out: string[] = [];
  if (t === "copa") {
    out = ranked.filter((x) => x.confed === "CONMEBOL").map((x) => x.id);
    out.push(...ranked.filter((x) => x.confed === COPA_GUEST_CONFED).map((x) => x.id).slice(0, Math.max(0, size - out.length)));
  } else {
    const confeds: Confed[] = t === "euro" ? ["UEFA"] : (Object.keys(WC_SLOTS) as Confed[]);
    for (const c of confeds) {
      const q = await service.getNationalComp(saveId, qualifierSlug(t, year, c));
      if (!q) continue;
      out.push(...qualifierQualified(q, elo));
    }
  }
  const eligible = t === "euro" ? ranked.filter((x) => x.confed === "UEFA") : t === "copa" ? ranked.filter((x) => x.confed === "CONMEBOL" || x.confed === COPA_GUEST_CONFED) : ranked;
  for (const x of eligible) {
    if (out.length >= size) break;
    if (!out.includes(x.id)) out.push(x.id);
  }
  return out.slice(0, size);
}

// ── The day ───────────────────────────────────────────────────────────────────

export interface NationalNews {
  kind: "called_up" | "returned";
  date: string;
  players: { id: string; name: string; nation: string; from?: string; until?: string; apps?: number; goals?: number; injured?: boolean }[];
}

export interface NationalDayResult {
  squads: Map<string, Squad>;
  /** News of the human manager at a national team (Etapa 41b). */
  coachNews: NationalCoachNews[];
  /** The live recording of his national game was used today. */
  consumedRecording: boolean;
  /** His national game of the day (the result screen reads it from the day log). */
  humanMatch?: MatchEvent;
  /** His national team (set with `humanMatch`). */
  humanTeamId?: string;
  /** National-team wage earned today (Mondays, `managerEarnings` only). */
  earned: number;
  /** New national-team job offers today (the fast-forward stops). */
  offers: number;
  /** Real players with their national team today (they neither train nor rest at the club). */
  participants: Set<string>;
  injuries: { squadId: string; playerId: string; playerName: string; severity: "light" | "medium" | "severe"; returnDate: string }[];
  news: NationalNews[];
  played: number;
}

/** Anything national can happen today (else the day is skipped without reading the competitions). */
function isNationalDate(state: NationalState, date: string): boolean {
  if (Object.keys(state.callUps).length > 0 || Object.keys(state.vacancies).length > 0) return true;
  const y = Number(date.slice(0, 4));
  if (fifaWindows(y).some((w) => date >= w.start && date <= w.release)) return true;
  for (let ty = y; ty <= y + 2; ty++) {
    for (const t of tournamentsOfYear(ty)) {
      if (date === tournamentDrawDate(ty) || date === qualifierDrawDate(ty)) return true;
      const td = tournamentDates(t, ty);
      if (date >= td.callUp && date <= addDays(td.final, 1)) return true;
    }
  }
  return false;
}

function matchKind(comp: NationalCompetition, f: Fixture): EloMatchKind {
  if (comp.kind === "friendlies") return { kind: "friendly" };
  if (comp.kind === "qualifier") return { kind: "qualifier" };
  const n = groupRoundCount(comp);
  const stage: NationalStageName = f.round <= n ? "group" : comp.stages[f.round - n]?.name ?? "final";
  return { kind: "tournament", tournament: comp.tournament!, stage };
}

/**
 * The national day (`national-teams.md` → "O dia"): returns, draws, call-ups and friendlies of a window or a
 * tournament, today's games (quickSim, Elo, tables, leaders, post-match of the real players), knockout draws,
 * finished competitions (qualified, champion, awards, titles, value, coach sackings), camp days, coach hires.
 */
export async function playNationalDay(args: {
  service: SaveService;
  saveId: string;
  date: string;
  index: SquadIndex;
  humanClubId: string;
  squadOf: (id: string) => Promise<Squad | null>;
  rng?: () => number;
  /** The human manager (offers when a vacancy opens, Etapa 41b); absent = no offers. */
  human?: { reputation: number; nationality: string | null };
  /** The live recording of today's game of his national team (`playedMatch` of the day advance). */
  playedMatch?: PlayedMatchRecording | null;
}): Promise<NationalDayResult> {
  const { service, saveId, date, index, humanClubId } = args;
  const rng = args.rng ?? Math.random;
  const out: NationalDayResult = {
    squads: new Map(), participants: new Set(), injuries: [], news: [], played: 0, coachNews: [], consumedRecording: false, earned: 0, offers: 0,
  };
  const loaded = await service.getNationalState(saveId);
  if (!loaded || (!loaded.human && !(loaded.offers?.length) && !isNationalDate(loaded, date))) return out;
  let state: NationalState = loaded;
  // Offers that expired yesterday drop; the national-team wage on Mondays.
  if (state.offers?.some((o) => o.expires < date)) state = { ...state, offers: state.offers.filter((o) => o.expires >= date) };
  if (state.human && new Date(`${date}T12:00:00Z`).getUTCDay() === 1) out.earned = state.human.wage;
  const hc: HumanCtx = { saveId, date, human: args.human, news: out.coachNews, offers: 0 };

  const squadNow = async (id: string): Promise<Squad | null> => out.squads.get(id) ?? (await args.squadOf(id));
  const setPlayer = async (squadId: string, playerId: string, f: (p: RosterPlayer, squad: Squad) => RosterPlayer): Promise<boolean> => {
    const squad = await squadNow(squadId);
    if (!squad || !squad.players.some((p) => p.id === playerId)) return false;
    out.squads.set(squadId, { ...squad, players: squad.players.map((p) => (p.id === playerId ? f(p, squad) : p)) });
    return true;
  };

  // 1. Returns: call-ups whose duty ended yesterday (one inbox message for all the nations of the day).
  const back: NationalNews["players"] = [];
  for (const [teamId, cu] of Object.entries(state.callUps)) {
    if (cu.until >= date) continue;
    const team = state.teams[teamId]!;
    for (const pl of cu.players) {
      if (pl.generated) continue;
      let injured = false;
      const release = (p: RosterPlayer): RosterPlayer => {
        injured = !!p.injury && p.injury.returnDate > date;
        if (!p.nationalDuty) return p;
        const { nationalDuty: _d, ...rest } = p;
        return rest;
      };
      // Moved during the window (rare): found in his new club by a scan of the world.
      if (!(await setPlayer(pl.squadId, pl.id, release))) {
        for (const league of index.leagues()) {
          let done = false;
          for (const t of index.inLeague(league)) {
            const sq = await squadNow(t.squadId);
            if (sq?.players.some((p) => p.id === pl.id)) { await setPlayer(t.squadId, pl.id, release); done = true; break; }
          }
          if (done) break;
        }
      }
      if (pl.squadId === humanClubId) {
        back.push({ id: pl.id, name: pl.name, nation: team.nation, apps: cu.tally?.[pl.id]?.apps ?? 0, goals: cu.tally?.[pl.id]?.goals ?? 0, injured });
      }
    }
    const { [teamId]: _gone, ...rest } = state.callUps;
    state = { ...state, callUps: rest };
  }
  if (back.length > 0) out.news.push({ kind: "returned", date, players: back });

  // 2. Draws.
  state = await runDraws(service, saveId, state, date);

  // Active competitions (not finished, or finished today) loaded once.
  const comps = new Map<string, NationalCompetition>();
  for (const slug of state.competitions) {
    const c = await service.getNationalComp(saveId, slug);
    // Friendlies of past years are done (their file is never read again).
    if (c && c.status !== "finished" && !(c.kind === "friendlies" && c.year < Number(date.slice(0, 4)))) comps.set(slug, c);
  }
  const changed = new Set<string>();
  const elo = (id: string) => state.teams[id]?.elo ?? 0;

  // The human manager's call-up notice (a week before; once per call-up date).
  if (state.human) {
    const h = state.human;
    const drawn = [...comps.values()].filter((c) => c.kind === "tournament" && c.tournament)
      .map((c) => ({ callUp: tournamentDates(c.tournament!, c.year).callUp, teams: c.teams }));
    const next = nextCallUpDate(date, h.teamId, drawn);
    if (next && addDays(next, -NATIONAL_NOTICE_DAYS) <= date && !(h.notified ?? []).includes(next)) {
      out.coachNews.push({ kind: "callup_soon", date, teamId: h.teamId, nation: state.teams[h.teamId]?.nation ?? h.teamId, callUpDate: next });
      state = { ...state, human: { ...h, notified: [...(h.notified ?? []), next].slice(-6) } };
    }
  }

  // 3. Call-ups: a window or a tournament starting today.
  const year = Number(date.slice(0, 4));
  const window = fifaWindows(year).find((w) => w.start === date);
  const tourneys = tournamentsOfYear(year).filter((t) => tournamentDates(t, year).callUp === date);
  if (window || tourneys.length > 0) {
    const ranking = rankTeams(Object.values(state.teams));
    const teams = { ...state.teams };
    ranking.forEach((t, i) => { teams[t.id] = { ...teams[t.id]!, prevRank: i + 1 }; });
    state = { ...state, teams };
  }
  const callUpPlans: { teamId: string; until: string; competition?: string }[] = [];
  if (window) {
    const fr = await friendliesFor(service, saveId, state, comps, window.matchDates, `${saveId}:${window.id}`);
    if (fr) { comps.set(fr.slug, fr); changed.add(fr.slug); if (!state.competitions.includes(fr.slug)) state = { ...state, competitions: [...state.competitions, fr.slug] }; }
    const playing = new Set<string>();
    for (const c of comps.values()) for (const f of c.fixtures) if (!f.played && window.matchDates.includes(f.date)) { playing.add(f.home); playing.add(f.away); }
    for (const id of playing) callUpPlans.push({ teamId: id, until: window.matchDates[window.matchDates.length - 1]! });
  }
  for (const t of tourneys) {
    const comp = comps.get(tournamentSlug(t, year));
    if (!comp) continue;
    if (comp.status === "scheduled") { comps.set(comp.slug, { ...comp, status: "running" }); changed.add(comp.slug); }
    for (const id of comp.teams) callUpPlans.push({ teamId: id, until: tournamentDates(t, year).final, competition: comp.slug });
  }
  if (callUpPlans.length > 0) {
    const pool = await nationPool(index, squadNow);
    const firstMatch = (teamId: string) => {
      let first = "9999-12-31";
      for (const c of comps.values()) for (const f of c.fixtures) if (!f.played && f.date >= date && (f.home === teamId || f.away === teamId) && f.date < first) first = f.date;
      return first === "9999-12-31" ? date : first;
    };
    const humanCalled: NationalNews["players"] = [];
    for (const plan of callUpPlans) {
      const team = state.teams[plan.teamId];
      if (!team || state.callUps[plan.teamId]) continue;
      const all = pool.get(team.nation) ?? [];
      const callable = callableCandidates(all, firstMatch(plan.teamId));
      // The human manager's own call-up (Etapa 41b): his choice of the day, the players still callable.
      const draft = state.human?.teamId === team.id && state.human.callUp?.date === date ? state.human.callUp.players : null;
      const chosen = draft ? draft.map((id) => callable.find((c) => c.player.id === id)).filter((c): c is NationCandidate => !!c) : [];
      const real = chosen.length > 0 ? chosen.slice(0, NATIONAL_SQUAD.SIZE) : pickCallUp(callable);
      if (draft && state.human) { const { callUp: _c, ...h } = state.human; state = { ...state, human: h }; }
      const fill = fillersFor({ saveId, id: team.id, nation: team.nation, year, real: real.map((c) => c.player), all, confed: team.confed, pool });
      const cu: NationalCallUp & { fillers?: FillerSpec } = {
        nation: team.nation, from: date, until: plan.until, ...(plan.competition ? { competition: plan.competition } : {}),
        players: [
          ...real.map((c) => ({ id: c.player.id, squadId: c.squadId, name: c.player.name })),
          ...fill.players.map((p) => ({ id: p.id, squadId: "", name: p.name, generated: true as const })),
        ],
        tally: {},
        fillers: fill.spec,
      };
      state = { ...state, callUps: { ...state.callUps, [team.id]: cu } };
      const { tally: _t, ...last } = cu;
      state = { ...state, lastCallUps: { ...(state.lastCallUps ?? {}), [team.id]: last } };
      for (const c of real) {
        await setPlayer(c.squadId, c.player.id, (p) => {
          const duty = { ...p, nationalDuty: { nation: team.nation, from: date, until: plan.until } };
          return c.squadId === humanClubId ? afterNationalCallUp(duty) : duty;
        });
        if (c.squadId === humanClubId) humanCalled.push({ id: c.player.id, name: c.player.name, nation: team.nation, from: date, until: plan.until });
      }
    }
    if (humanCalled.length > 0) out.news.push({ kind: "called_up", date, players: humanCalled });
  }

  // 4. Today's games.
  const roles = slotRoles(formationForSimId(NATIONAL_SQUAD.FORMATION));
  const fillerCache = new Map<string, RosterPlayer[]>();
  const squadOfTeam = async (teamId: string): Promise<{ players: RosterPlayer[]; clubOf: Map<string, string> } | null> => {
    const cu = state.callUps[teamId] as (NationalCallUp & { fillers?: FillerSpec }) | undefined;
    if (!cu) return null;
    const players: RosterPlayer[] = [];
    const clubOf = new Map<string, string>();
    for (const pl of cu.players) {
      if (pl.generated) continue;
      const sq = await squadNow(pl.squadId);
      const p = sq?.players.find((x) => x.id === pl.id);
      if (p) { players.push(asNationalPlayer(p)); clubOf.set(p.id, pl.squadId); }
    }
    if (cu.fillers) {
      let gen = fillerCache.get(teamId);
      if (!gen) { gen = regenerateFillers(saveId, teamId, cu.nation, cu.fillers); fillerCache.set(teamId, gen); }
      players.push(...gen);
    }
    return { players, clubOf };
  };
  for (const [slug, comp0] of comps) {
    let comp = comp0;
    const todays = comp.fixtures.filter((f) => f.date === date && !f.played);
    if (todays.length === 0) continue;
    if (comp.status === "scheduled") comp = { ...comp, status: "running" };
    for (const fx of todays) {
      const home = await squadOfTeam(fx.home);
      const away = await squadOfTeam(fx.away);
      if (!home || !away) {
        // A team without a call-up (should not happen): the game is played 0-0 on paper, never lost.
        comp = { ...comp, fixtures: comp.fixtures.map((f) => (f.id === fx.id ? { ...f, played: true, result: { home: 0, away: 0 }, ...(f.knockout ? { decider: { extraTime: { home: 0, away: 0 }, penalties: { home: 1, away: 0 } } } : {}) } : f)) };
        logError("national", `save ${saveId}: ${fx.id} without a call-up`, { home: fx.home, away: fx.away });
        continue;
      }
      const pseudo = (teamId: string, players: RosterPlayer[]): Squad => nationalPseudoSquad(state, teamId, players);
      const humanTeam = state.human && (fx.home === state.human.teamId || fx.away === state.human.teamId) ? state.human.teamId : null;
      let recording: PlayedMatchRecording;
      if (humanTeam) {
        // The human manager's game (Etapa 41b): his live recording, or the full engine with his tactics.
        if (args.playedMatch && args.playedMatch.fixtureId === fx.id) {
          recording = args.playedMatch;
          out.consumedRecording = true;
        } else {
          const t = state.human!.tactics;
          const sideOf = (teamId: string, players: RosterPlayer[]) => teamId === humanTeam
            ? { formation: formationForSimId(t?.formation), lineup: coachLineup(players, t?.formation, t?.lineup, date), style: t?.tactical_style ?? ("balanced" as const) }
            : { formation: formationForSimId(NATIONAL_SQUAD.FORMATION), lineup: nationalLineup(players, date), style: "balanced" as const };
          const h = sideOf(fx.home, home.players);
          const a = sideOf(fx.away, away.players);
          recording = simulateRecording(fx, pseudo(fx.home, home.players), pseudo(fx.away, away.players), {
            homeFormation: h.formation, homeLineup: h.lineup, awayFormation: a.formation, awayLineup: a.lineup,
            tactics: { A: { style: h.style }, B: { style: a.style } },
          }).recording;
        }
        out.humanMatch = nationalMatchEvent(fx, recording, home.players, away.players);
        out.humanTeamId = humanTeam;
      } else {
        recording = quickSimMatch({
          fixtureId: fx.id,
          home: pseudo(fx.home, home.players), away: pseudo(fx.away, away.players),
          homeLineup: nationalLineup(home.players, date), awayLineup: nationalLineup(away.players, date),
          homeRoles: roles, awayRoles: roles,
          ...(fx.knockout ? { knockout: true } : {}), ...(fx.neutral ? { neutral: true } : {}),
          goalScale: NATIONAL_MATCH.GOAL_SCALE,
        }, rng).recording;
      }
      out.played++;
      // Generated players have no club: their caps and goals live in the state (the screen shows them).
      const local = { ...(state.localCaps ?? {}) };
      for (const [pid, ps] of Object.entries(recording.playerStats)) {
        if (!isGeneratedNationalId(pid)) continue;
        const [caps, goals] = local[pid] ?? [0, 0];
        local[pid] = [caps + 1, goals + ps.goals];
      }
      state = { ...state, localCaps: local };
      const pens = recording.decider?.penalties;
      const shootoutWinner: "home" | "away" | undefined = pens ? (pens.home > pens.away ? "home" : "away") : undefined;
      const next = eloAfterMatch({ home: elo(fx.home), away: elo(fx.away), score: recording.score, shootoutWinner, match: matchKind(comp, fx) });
      const teams = { ...state.teams };
      teams[fx.home] = { ...teams[fx.home]!, elo: next.home, games: teams[fx.home]!.games + 1 };
      teams[fx.away] = { ...teams[fx.away]!, elo: next.away, games: teams[fx.away]!.games + 1 };
      state = { ...state, teams };
      // Leaders (not of friendlies).
      const allPlayers = new Map([...home.players, ...away.players].map((p) => [p.id, p]));
      if (comp.kind !== "friendlies") {
        comp = {
          ...comp,
          leaders: updateNationalLeaders(comp.leaders, recording, (id) => {
            const p = allPlayers.get(id);
            const teamId = home.players.some((x) => x.id === id) ? fx.home : fx.away;
            return {
              name: p?.name ?? id, nation: state.teams[teamId]?.nation ?? "", squadId: home.clubOf.get(id) ?? away.clubOf.get(id) ?? "",
              line: p ? LINE_SHORT[lineOf(p)] : "MID", ...(isGeneratedNationalId(id) ? { generated: true } : {}),
            };
          }),
        };
      }
      comp = {
        ...comp,
        fixtures: comp.fixtures.map((f) => (f.id === fx.id
          ? { ...f, played: true, result: { ...recording.score }, ...(recording.decider ? { decider: recording.decider } : {}) }
          : f)),
      };
      // Post-match of the real players.
      const minutes = recording.decider ? 120 : 90;
      for (const [side, teamId] of [[home, fx.home], [away, fx.away]] as const) {
        const nation = state.teams[teamId]!.nation;
        const cu = state.callUps[teamId]!;
        const tally = { ...(cu.tally ?? {}) };
        for (const [pid, club] of side.clubOf) {
          const ps = recording.playerStats[pid];
          await setPlayer(club, pid, (p, squad) => {
            const r = applyNationalMatch(p, squad, recording, { date, rng, nation, minutes });
            if (r.injury) out.injuries.push({ squadId: club, playerId: pid, playerName: p.name, severity: r.injury.severity, returnDate: r.injury.returnDate });
            return r.player;
          });
          out.participants.add(pid);
          if (ps) tally[pid] = { apps: (tally[pid]?.apps ?? 0) + 1, goals: (tally[pid]?.goals ?? 0) + ps.goals };
        }
        state = { ...state, callUps: { ...state.callUps, [teamId]: { ...cu, tally } } };
      }
    }
    changed.add(slug);
    comps.set(slug, comp);
  }

  // 5. Competitions that moved on today.
  for (const slug of [...changed]) {
    let comp = comps.get(slug)!;
    if (comp.kind === "qualifier" && comp.status !== "finished" && groupStageComplete(comp)) {
      const qualified = qualifierQualified({ ...comp, qualified: undefined }, elo);
      comp = { ...comp, qualified, status: "finished" };
      const all = Object.values(state.teams);
      state = await sackAfter(service, saveId, state, date, comp, (id) => qualifierOutcome(comp, id, all, qualified), hc);
    } else if (comp.kind === "tournament") {
      const { comp: next, change } = advanceTournament(comp, elo);
      comp = next;
      for (const id of change.eliminated) {
        const cu = state.callUps[id];
        if (cu && cu.until > date) {
          state = { ...state, callUps: { ...state.callUps, [id]: { ...cu, until: date } } };
          for (const pl of cu.players) if (!pl.generated) await setPlayer(pl.squadId, pl.id, (p) => (p.nationalDuty ? { ...p, nationalDuty: { ...p.nationalDuty, until: date } } : p));
        }
      }
      if (change.eliminated.length > 0) {
        const all = Object.values(state.teams);
        state = await sackAfter(service, saveId, state, date, { ...comp, teams: change.eliminated.filter((id) => id !== comp.championId) },
          (id) => tournamentOutcome(comp, id, all), hc);
      }
      // The human manager won it: the objective is met.
      if (change.finished && state.human && comp.championId === state.human.teamId) {
        out.coachNews.push({ kind: "result", date, teamId: state.human.teamId, nation: state.teams[state.human.teamId]!.nation, competition: comp.slug, met: true });
      }
      if (change.finished) comp = { ...comp, awards: await closeTournament(service, saveId, state, comp, date, index, setPlayer) };
    }
    await service.writeNationalComp(saveId, comp);
  }

  // 6. Camp days: called up, on duty today, no game today.
  for (const cu of Object.values(state.callUps)) {
    if (cu.from > date || cu.until < date) continue;
    for (const pl of cu.players) {
      if (pl.generated || out.participants.has(pl.id)) continue;
      const ok = await setPlayer(pl.squadId, pl.id, (p, squad) => nationalCampDay(p, squad, date));
      if (ok) out.participants.add(pl.id);
    }
  }

  // 7. Coach hires due today.
  state = await hireDue(service, saveId, state, date, rng);
  out.offers = hc.offers;

  await service.writeNationalState(saveId, state);
  return out;
}

/** Friendlies of a window for the teams without an official game on each date (appended to `friendly_<year>`). */
async function friendliesFor(
  service: SaveService, saveId: string, state: NationalState, comps: Map<string, NationalCompetition>, dates: string[], seedKey: string,
): Promise<NationalCompetition | null> {
  const year = Number(dates[0]!.slice(0, 4));
  const slug = friendliesSlug(year);
  let comp = comps.get(slug) ?? (await service.getNationalComp(saveId, slug)) ?? {
    slug, kind: "friendlies" as const, year, teams: [], groups: [], stages: [], fixtures: [], status: "running" as const, leaders: {},
  };
  if (comp.fixtures.some((f) => dates.includes(f.date))) return comp;
  const avoid = new Map<string, string>();
  const fixtures: Fixture[] = [];
  dates.forEach((d, di) => {
    const busy = new Set<string>();
    for (const c of comps.values()) for (const f of c.fixtures) if (f.date === d) { busy.add(f.home); busy.add(f.away); }
    const free = drawTeams(state).filter((t) => !busy.has(t.id));
    const pairs = pairFriendlies(free, mulberry32(seedFrom(`${seedKey}:${di}`)), avoid);
    pairs.forEach(([h, a], i) => {
      avoid.set(h, a);
      avoid.set(a, h);
      fixtures.push({ id: `${slug}_${d}_${i}`, date: d, competition: slug, round: comp.fixtures.length + fixtures.length + 1, home: h, away: a, played: false, result: null });
    });
  });
  comp = { ...comp, status: "running", fixtures: [...comp.fixtures, ...fixtures], teams: [...new Set([...comp.teams, ...fixtures.flatMap((f) => [f.home, f.away])])] };
  return comp;
}

/** Sack draws for the coaches of `comp.teams` after their competition ended (`rolloverSackChance`). */
async function sackAfter(
  service: SaveService, saveId: string, state0: NationalState, date: string, comp: NationalCompetition,
  outcome: (teamId: string) => { position: number; target: number; size: number; relegated?: boolean },
  hc: HumanCtx,
): Promise<NationalState> {
  let state = state0;
  let managers = await service.getManagers(saveId);
  let changed = false;
  for (const id of comp.teams) {
    const team = state.teams[id];
    if (!team || state.vacancies[id] || comp.championId === id) continue;
    // The human manager (Etapa 41b): his objective is judged without a draw; failed badly = sacked from the team only.
    if (state.human?.teamId === id) {
      const o = outcome(id);
      hc.news.push({ kind: "result", date, teamId: id, nation: team.nation, competition: comp.slug, met: objectiveMet(o) });
      if (objectiveFailedBadly(o)) {
        const r = await leaveNationalTeam(service, saveId, state, date, "sacked", managers);
        state = r.state;
        managers = r.managers;
        hc.news.push({ kind: "sacked", date, teamId: id, nation: team.nation, competition: comp.slug, met: false });
      }
      continue;
    }
    const m = managers.find((x) => x.id === team.managerId);
    if (!m || m.isPlayer || m.interim) continue;
    const o = outcome(id);
    const p = rolloverSackChance({ ...o, champion: o.position === 1 });
    if (p <= 0 || mulberry32(seedFrom(`${saveId}:${id}:${comp.slug}:sack`))() >= p) continue;
    managers = sackManager(managers, { squadId: id, clubName: team.nation, date });
    const interim = managers.find((x) => x.squadId === id && x.interim);
    state = {
      ...state,
      teams: { ...state.teams, [id]: { ...team, managerId: interim?.id ?? team.managerId } },
      vacancies: { ...state.vacancies, [id]: { since: date, hireOn: vacancyHireOn(date, mulberry32(seedFrom(`${saveId}:${id}:${date}:hire`))) } },
    };
    changed = true;
    state = offerToHuman(state, id, hc);
  }
  if (changed) await service.writeManagers(saveId, managers);
  return state;
}

/** Hires of the national teams whose vacancy is due: the free pool only (`chooseHire`, prestige = Elo percentile). */
async function hireDue(service: SaveService, saveId: string, state0: NationalState, date: string, rng: () => number): Promise<NationalState> {
  let state = state0;
  const due = Object.entries(state.vacancies).filter(([, v]) => v.hireOn <= date);
  if (due.length === 0) return state;
  let managers = await service.getManagers(saveId);
  const year = Number(date.slice(0, 4));
  const ranked = rankTeams(Object.values(state.teams));
  for (const [id] of due) {
    const team = state.teams[id]!;
    const pct = ranked.length > 1 ? 1 - ranked.findIndex((t) => t.id === id) / (ranked.length - 1) : 1;
    const free = managers.filter((m) => !m.isPlayer && !m.squadId && !m.retired).map((m) => ({
      managerId: m.id, reputation: aiManagerReputation(managers, m, year), country: null, continent: null,
      freeDays: m.freeSince ? daysBetween(m.freeSince, date) : 0,
    }));
    const interim = managers.find((m) => m.squadId === id && m.interim);
    const pick = chooseHire({
      prestige: pct, country: null, continent: null, free, employed: [],
      interim: interim ? { managerId: interim.id, reputation: aiManagerReputation(managers, interim, year), country: null, continent: null } : null,
      allowPoach: false, rng,
    });
    if (pick) managers = hireManager(managers, { squadId: id, managerId: pick.managerId, date }).managers;
    const now = managers.find((m) => m.squadId === id);
    const { [id]: _v, ...vacancies } = state.vacancies;
    state = { ...state, vacancies, teams: { ...state.teams, [id]: { ...team, managerId: now?.id ?? team.managerId } } };
  }
  await service.writeManagers(saveId, managers);
  return state;
}

/** A tournament ended: awards (competition and the year's awards file), titles, value boosts, coach points. */
async function closeTournament(
  service: SaveService, saveId: string, state: NationalState, comp: NationalCompetition, date: string, index: SquadIndex,
  setPlayer: (squadId: string, playerId: string, f: (p: RosterPlayer, squad: Squad) => RosterPlayer) => Promise<boolean>,
): Promise<NationalTournamentAwards> {
  const nationOf = (id: string) => state.teams[id]?.nation ?? id;
  const awards = computeTournamentAwards(comp, nationOf);
  const file = (await service.getAwardsYear(saveId, comp.year)) ?? { year: comp.year, leagues: [] };
  await service.writeAwardsYear(saveId, { ...file, national: [...(file.national ?? []).filter((a) => a.competition !== comp.slug), awards] });
  // Players: title (champion squad, with a game), awards, value boost.
  const champion = comp.championId;
  for (const [pid, l] of Object.entries(comp.leaders)) {
    if (l.generated || !l.squadId) continue;
    const teamId = nationalTeamId(l.nation);
    const keys = tournamentAwardKeys(awards, pid);
    const mult = tournamentValueMult({ comp, awards, playerId: pid, teamId, played: l.apps > 0 });
    const league = index.byId(l.squadId)?.leagueSlug ?? "";
    await setPlayer(l.squadId, pid, (p) => {
      let q = p;
      if (champion === teamId) q = withNationalTitle(q, l.nation, comp.slug);
      for (const k of keys) q = withNationalAward(q, l.nation, k);
      if (mult > 1 && (q.awardBoost?.mult ?? 1) < mult) q = { ...q, awardBoost: { season: `national:${comp.slug}`, league, mult } };
      return q;
    });
  }
  // The champion's coach: ranking points.
  if (champion) {
    const managers = await service.getManagers(saveId);
    const mid = state.teams[champion]?.managerId;
    const points = NATIONAL_AWARDS.MANAGER_POINTS[comp.tournament!];
    const next = managers.map((m) => (m.id === mid && !m.titles.some((t) => t.competition === comp.slug)
      ? { ...m, points: m.points + points, titles: [...m.titles, { season: String(comp.year), kind: "national" as const, competition: comp.slug, squadId: champion, points, on: date }] }
      : m));
    await service.writeManagers(saveId, next);
  }
  return awards;
}

/** Day log / stage helper for the screens: the stage of a fixture's round. */
export function stageOfRound(comp: NationalCompetition, round: number): NationalStageName {
  const n = groupRoundCount(comp);
  if (round <= n) return "group";
  return comp.stages[round - n]?.name ?? "final";
}

export { stageRound };

// ── The human manager at a national team (Etapa 41b) ──────────────────────────

export const NATIONAL_NOTICE_DAYS = 7;

interface HumanCtx {
  saveId: string;
  date: string;
  human?: { reputation: number; nationality: string | null };
  news: NationalCoachNews[];
  offers: number;
}

/** A vacancy that just opened may offer its job to the human manager; the AI hire waits for his answer. */
function offerToHuman(state: NationalState, teamId: string, hc: HumanCtx): NationalState {
  if (!hc.human || state.human || state.offers?.some((o) => o.teamId === teamId)) return state;
  const team = state.teams[teamId]!;
  const offer = rollNationalOffer({
    saveId: hc.saveId, teamId, nation: team.nation, date: hc.date, reputation: hc.human.reputation,
    ownNation: normalizeNation(hc.human.nationality ?? "") === team.nation, teams: Object.values(state.teams),
  });
  if (!offer) return state;
  hc.news.push({ kind: "offer", date: hc.date, teamId, nation: team.nation, offer });
  hc.offers++;
  return withOffer(state, offer);
}

/** Adds an offer; the vacancy's AI hire waits until the day after it expires. */
export function withOffer(state: NationalState, offer: NationalCoachOffer): NationalState {
  const v = state.vacancies[offer.teamId];
  const hold = addDays(offer.expires, 1);
  return {
    ...state,
    offers: [...(state.offers ?? []).filter((o) => o.teamId !== offer.teamId), offer],
    vacancies: v ? { ...state.vacancies, [offer.teamId]: { ...v, hireOn: v.hireOn > hold ? v.hireOn : hold } } : state.vacancies,
  };
}

/**
 * The human manager leaves his national team (sacked or resigned): his spell closes, an interim takes over and the
 * team hires by the AI rule. Writes `managers.json`; the caller writes the state.
 */
export async function leaveNationalTeam(
  service: SaveService, saveId: string, state: NationalState, date: string, left: "sacked" | "moved", managers0?: ManagerRecord[],
): Promise<{ state: NationalState; managers: ManagerRecord[] }> {
  const h = state.human;
  if (!h) return { state, managers: managers0 ?? (await service.getManagers(saveId)) };
  const team = state.teams[h.teamId]!;
  const r = leaveNationalJob(managers0 ?? (await service.getManagers(saveId)), { teamId: team.id, nation: team.nation, date, left });
  await service.writeManagers(saveId, r.managers);
  const { human: _h, ...rest } = state;
  return {
    state: {
      ...rest,
      teams: { ...state.teams, [team.id]: { ...team, managerId: r.interimId } },
      vacancies: { ...state.vacancies, [team.id]: { since: date, hireOn: vacancyHireOn(date, mulberry32(seedFrom(`${saveId}:${team.id}:${date}:hire`))) } },
    },
    managers: r.managers,
  };
}

/** A national team as a squad (the engine, the quickSim and the live match read it). */
export function nationalPseudoSquad(state: NationalState, teamId: string, players: RosterPlayer[]): Squad {
  return ({
    id: teamId, name: state.teams[teamId]?.nation ?? teamId, colors: nationColors(teamId), money: 0, players, financialTier: "MEDIUM",
  }) as unknown as Squad;
}

/** Kit colours of a national team: a fixed pair picked from the team id (no national kits in the data). */
export function nationColors(teamId: string): [string, string] {
  const KITS: [string, string][] = [
    ["#c8102e", "#ffffff"], ["#0055a4", "#ffffff"], ["#ffd100", "#009739"], ["#ffffff", "#1d2a5b"], ["#00843d", "#ffffff"],
    ["#6cace4", "#ffffff"], ["#000000", "#ffd100"], ["#ff6600", "#ffffff"], ["#7a1f2b", "#ffffff"], ["#1d2a5b", "#c8102e"],
  ];
  return KITS[seedFrom(`kit:${teamId}`) % KITS.length]!;
}

/** The squad of a national team's active call-up: its real players (as the nation sees them) and the generated ones. */
export async function callUpSquad(
  saveId: string, state: NationalState, teamId: string, squadOf: (id: string) => Promise<Squad | null>,
): Promise<{ players: RosterPlayer[]; clubOf: Map<string, string> } | null> {
  const cu = state.callUps[teamId] as (NationalCallUp & { fillers?: FillerSpec }) | undefined;
  if (!cu) return null;
  const players: RosterPlayer[] = [];
  const clubOf = new Map<string, string>();
  for (const pl of cu.players) {
    if (pl.generated) continue;
    const sq = await squadOf(pl.squadId);
    const p = sq?.players.find((x) => x.id === pl.id);
    if (p) { players.push(asNationalPlayer(p)); clubOf.set(p.id, pl.squadId); }
  }
  if (cu.fillers) players.push(...regenerateFillers(saveId, teamId, cu.nation, cu.fillers));
  return { players, clubOf };
}

/** The day-log event of the human manager's national game (no development: the post-match is `applyNationalMatch`). */
function nationalMatchEvent(fx: Fixture, rec: PlayedMatchRecording, home: RosterPlayer[], away: RosterPlayer[]): MatchEvent {
  const playerNames: Record<string, string> = {};
  const playerTeams: Record<string, "home" | "away"> = {};
  for (const p of home) { playerNames[p.id] = p.name; playerTeams[p.id] = "home"; }
  for (const p of away) { playerNames[p.id] = p.name; playerTeams[p.id] = "away"; }
  const scorers: Scorer[] = Object.entries(rec.playerStats)
    .filter(([, ps]) => ps.goals > 0)
    .map(([id, ps]) => ({ playerId: id, playerName: playerNames[id] ?? id, team: playerTeams[id] ?? ("home" as const), goals: ps.goals }))
    .sort((a, b) => b.goals - a.goals);
  return {
    kind: "match", fixtureId: fx.id, competition: fx.competition, round: fx.round, home: fx.home, away: fx.away,
    score: rec.score, teamStats: rec.teamStats, playerStats: rec.playerStats, playerRatings: rec.playerRatings,
    playerNames, playerTeams, scorers, substitutions: rec.substitutions ?? [], injuries: rec.injuries ?? [],
    ...(rec.cards && rec.cards.length > 0 ? { cards: rec.cards } : {}),
    developmentChanges: [], durationMs: rec.durationMs,
    ...(rec.decider ? { decider: rec.decider } : {}),
  };
}
