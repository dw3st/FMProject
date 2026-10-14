import type { SaveMeta, SaveService } from "@/backend/SaveService";
import type { SquadIndex } from "@/backend/squadIndex";
import { playerCupSlug } from "@/backend/cupWorld";
import { playerContinentalSlug } from "@/backend/continentalWorld";
import { isDerby } from "@/Domain/boardFans/boardFans";
import { isCupSlug } from "@/Domain/cups/cupIds";
import { isContinentalSlug } from "@/Domain/continental/competitions";
import { addDays } from "@/Domain/dates";
import { PRESS } from "@/Domain/press/pressConfig";
import { emptyPressState, ignoreConference, resolveMatchPromises, resolveObjectivePromise, type PromiseOutcome } from "@/Domain/press/effects";
import { buildConference, type ConferenceInput } from "@/Domain/press/questions";
import { isRunIn, nextWinless, pickTrigger, postMatchTriggers, preMatchTriggers, zoneBoundaries } from "@/Domain/press/triggers";
import { buildPressInviteMessage } from "@/Domain/inbox/inboxEvents";
import type { BoardState } from "@/types/boardTypes";
import type { Fixture, LeagueSeasonState } from "@/types/calendarTypes";
import type { MatchEvent } from "@/types/dayLogTypes";
import type { PressInboxMessage } from "@/types/inboxTypes";
import type { DayNewsInput } from "@/types/newsTypes";
import type { LeagueZone, Squad, StandingRow } from "@/types/playerTypes";
import type { PressParams, PressState, PressTrigger } from "@/types/pressTypes";

/**
 * The human club's press conferences in the day pipeline (Etapa 42, `.claude/rules/game/press.md`): an expired invite
 * is ignored, today's matches resolve the promises and the winless run, the rollover resolves the objective promise,
 * and today's matches / the games two days ahead may open a new conference (an inbox invite dated tomorrow; a
 * pre-match one expires on the eve of the game).
 */

export interface PressDayInput {
  saveId: string;
  service: SaveService;
  /** The meta as the day started. */
  meta: SaveMeta;
  /** The day being advanced (`currentDate`). */
  date: string;
  clubId: string;
  /** The club's league now (after a rollover move). */
  leagueSlug: string;
  leagueState: LeagueSeasonState | undefined;
  leagueZones: LeagueZone[];
  index: SquadIndex;
  /** The local `board` of the day, already moved by the day's matches and reviews. */
  board: BoardState;
  /** Official matches of the club today (league, cup, continental). */
  myMatches: MatchEvent[];
  /** Titles decided today ("cup:…", "continental:…"). */
  titlesToday: string[];
  /** Competitions (slug) the club went out of today. */
  eliminatedToday: string[];
  rollover?: { objectiveMet: boolean; move: { kind: "promoted" | "relegated"; to: string } | null; championOf: string | null };
  /** Expectation and derby of each of today's matches (`boardAfterMatches`). */
  matchContext: Map<string, { expectation: number; derby: boolean }>;
}

export interface PressDayResult {
  press: PressState;
  board: BoardState;
  /** Emitted after any `clearInbox` of the day. */
  invite?: PressInboxMessage;
  /** Absence and promises resolved today. */
  news: DayNewsInput["press"];
}

type Result = "W" | "D" | "L";

/** The club's side of a match: goals (extra time included) and the result (a shootout counts as a draw). */
function sideOf(m: MatchEvent, clubId: string): { home: boolean; goalsFor: number; goalsAgainst: number; result: Result; opponentId: string } {
  const home = m.home === clubId;
  const goalsFor = home ? m.score.home : m.score.away;
  const goalsAgainst = home ? m.score.away : m.score.home;
  const result: Result = goalsFor > goalsAgainst ? "W" : goalsFor < goalsAgainst ? "L" : "D";
  return { home, goalsFor, goalsAgainst, result, opponentId: home ? m.away : m.home };
}

interface Candidate {
  trigger: PressTrigger;
  kind: "pre" | "post";
  fixtureId?: string;
  /** Pre-match: the game's date (the conference expires the day before). */
  matchDate?: string;
  params: PressParams;
  player?: ConferenceInput["player"];
}

export async function pressDay(input: PressDayInput): Promise<PressDayResult> {
  const { service, saveId, date, clubId } = input;
  let state: PressState = input.meta.press ?? emptyPressState();
  let board = input.board;
  const news: DayNewsInput["press"] = [];
  const club = { id: clubId, name: input.meta.clubName };
  const manager = input.meta.manager?.name ?? "";
  const scope = { league: input.leagueSlug };
  const inviteDate = addDays(date, 1);

  const ignorePending = () => {
    if (!state.pending) return;
    const id = state.pending.id;
    const r = ignoreConference({ conference: state.pending, board, state });
    board = r.board;
    state = r.state;
    news.push({ kind: "press_absent", club, manager, key: id, scope });
  };
  const promiseNews = (outcomes: PromiseOutcome[]) => {
    for (const o of outcomes) {
      if (o.outcome === "draw") continue;
      news.push({ kind: o.outcome === "kept" ? "press_promise_kept" : "press_promise_broken", club, manager, key: o.promise.id, scope });
    }
  };

  // 1. An invite past its expiry was ignored.
  if (state.pending && date >= state.pending.expires) ignorePending();

  // 2. Today's matches: promises and the winless run.
  const sides = new Map<string, ReturnType<typeof sideOf>>();
  const winlessAfter = new Map<string, number>();
  for (const m of input.myMatches) {
    const s = sideOf(m, clubId);
    sides.set(m.fixtureId, s);
    const r = resolveMatchPromises(state, board, { fixtureId: m.fixtureId, result: s.result });
    state = { ...r.state, winless: nextWinless(r.state.winless, s.result) };
    board = r.board;
    winlessAfter.set(m.fixtureId, state.winless);
    promiseNews(r.outcomes);
  }

  // 3. Rollover: the objective promise; a promise tied to last season's game has nothing left to resolve.
  if (input.rollover) {
    const r = resolveObjectivePromise(state, board, input.rollover.objectiveMet);
    state = { ...r.state, promises: r.state.promises.filter((p) => p.kind === "objective" || !p.fixtureId) };
    board = r.board;
    promiseNews(r.outcomes);
  }

  const nameOf = (id: string) => input.index.byId(id)?.name ?? id;
  const me = await service.getSquadById(saveId, clubId);
  const candidates: Candidate[] = [];

  // 4. After the game: today's matches and the rollover.
  if (input.rollover?.championOf) candidates.push({ trigger: "title", kind: "post", params: { competition: input.rollover.championOf } });
  if (input.rollover?.move) {
    candidates.push({ trigger: input.rollover.move.kind, kind: "post", params: { competition: input.rollover.move.to } });
  }
  for (const m of input.myMatches) {
    const s = sides.get(m.fixtureId)!;
    const triggers = postMatchTriggers({
      goalsFor: s.goalsFor,
      goalsAgainst: s.goalsAgainst,
      eliminated: input.eliminatedToday.includes(m.competition),
      title: input.titlesToday.some((t) => t.endsWith(`:${m.competition}`)),
      expectation: input.matchContext.get(m.fixtureId)?.expectation ?? 0,
      winless: winlessAfter.get(m.fixtureId) ?? state.winless,
    });
    if (triggers.length === 0) continue;
    const stage = await stageOf(service, saveId, m.competition, m.round);
    const params: PressParams = {
      opponent: nameOf(s.opponentId), opponentId: s.opponentId, competition: m.competition,
      score: `${s.goalsFor}–${s.goalsAgainst}`, ...(stage ? { stage } : {}),
    };
    const player = postMatchPlayer(m, s.home, s.result);
    for (const trigger of triggers) {
      candidates.push({ trigger, kind: "post", fixtureId: m.fixtureId, params, ...(player ? { player } : {}) });
    }
  }

  // 5. Before the game: the club's games in two days. The invite (dated tomorrow) expires on the eve of the game, so it
  // is never answerable on the match day itself; a game tomorrow gets no pre-match conference.
  const pre = await upcomingFixtures(input, [addDays(date, 2)]);
  let standings: StandingRow[] | null = null;
  for (const f of pre) {
    const isLeague = f.competition === input.leagueSlug;
    if (isLeague && standings === null) standings = (await service.getLeagueStandings(saveId, input.leagueSlug)) ?? [];
    const table = isLeague ? (standings ?? []) : [];
    const opponentId = f.home === clubId ? f.away : f.home;
    const opponent = await service.getSquadById(saveId, opponentId);
    const leader = table[0];
    const derby = isDerby({
      myCity: me?.venue?.city ?? "",
      opponentCity: opponent?.venue?.city ?? "",
      opponentIsLeader: isLeague && !!leader && leader.mp > 0 && leader.squadId === opponentId,
    });
    const stage = await stageOf(service, saveId, f.competition, f.round);
    const knockout = !!f.knockout && (isCupSlug(f.competition) ? ["qf", "sf", "final"].includes(stage ?? "") : isContinentalSlug(f.competition));
    // Rounds left in the club's league: from the season's round count (a rescheduled game may shift it by one).
    const roundsLeft = isLeague && input.leagueState ? input.leagueState.totalRounds - f.round + 1 : 0;
    const runIn = isLeague && roundsLeft >= 1 && roundsLeft <= PRESS.RUN_IN_ROUNDS && isRunIn({
      table: table.map((r) => ({ squadId: r.squadId, points: r.pts })),
      myId: clubId, roundsLeft, boundaries: zoneBoundaries(input.leagueZones, table.length),
    });
    const triggers = preMatchTriggers({ derby, knockout, runIn, ultimatum: !!board.ultimatum });
    if (triggers.length === 0) continue;
    const params: PressParams = {
      opponent: nameOf(opponentId), opponentId, competition: f.competition, ...(stage ? { stage } : {}),
    };
    const player = me ? seasonScorer(me) : undefined;
    for (const trigger of triggers) {
      candidates.push({ trigger, kind: "pre", fixtureId: f.id, matchDate: f.date, params, ...(player ? { player } : {}) });
    }
  }

  // 6. One conference at most (priority, 7-day gap, a pending one is never replaced — a title closes it).
  let invite: PressInboxMessage | undefined;
  const winner = pickTrigger(candidates.map((c) => c.trigger), { today: inviteDate, lastDate: state.lastDate, pending: !!state.pending });
  if (winner) {
    if (winner === "title" && state.pending) ignorePending();
    const c = candidates.find((x) => x.trigger === winner)!;
    const id = `press-${inviteDate}`;
    const expires = c.kind === "pre" ? addDays(c.matchDate!, -1) : addDays(inviteDate, PRESS.POST_VALID_DAYS);
    const conference = buildConference({
      id, trigger: c.trigger, kind: c.kind, date: inviteDate, expires,
      ...(c.fixtureId ? { fixtureId: c.fixtureId } : {}),
      params: c.params,
      ...(c.player ? { player: c.player } : {}),
      seed: `${saveId}:${id}`,
    });
    state = { ...state, pending: conference };
    invite = buildPressInviteMessage(inviteDate, {
      pressId: id, trigger: c.trigger, kind: c.kind, expires,
      ...(c.params.opponent ? { opponent: c.params.opponent } : {}),
    });
  }

  return { press: state, board, news, ...(invite ? { invite } : {}) };
}

/** Name of the cup stage of a round; continental: the stage holding the round. */
async function stageOf(service: SaveService, saveId: string, competition: string, round: number): Promise<string | undefined> {
  if (isCupSlug(competition)) {
    const meta = await service.getLeagueMeta(saveId, competition);
    return meta?.cup?.stages.find((s) => s.round === round)?.name;
  }
  if (isContinentalSlug(competition)) {
    const meta = await service.getLeagueMeta(saveId, competition);
    return meta?.continental?.stages.find((s) => s.rounds.includes(round))?.name;
  }
  return undefined;
}

/** The club's unplayed official games on the given dates (league, national cup, continental), by date-index. */
async function upcomingFixtures(input: PressDayInput, dates: string[]): Promise<Fixture[]> {
  const { service, saveId, clubId } = input;
  const cup = await playerCupSlug(input.leagueSlug);
  const continental = await playerContinentalSlug(service, saveId, clubId);
  const out: Fixture[] = [];
  for (const slug of [input.leagueSlug, cup, continental]) {
    if (!slug) continue;
    const index = (await service.getDateIndex(saveId, slug)) ?? {};
    for (const date of dates) {
      for (const r of index[date] ?? []) {
        const round = await service.getRound(saveId, slug, r);
        for (const f of round?.fixtures ?? []) {
          if (f.date === date && !f.played && (f.home === clubId || f.away === clubId)) out.push(f);
        }
      }
    }
  }
  return out;
}

/** After the game: the culprit of a defeat (lowest rating), else the star (best rating ≥ 7.5). */
function postMatchPlayer(m: MatchEvent, home: boolean, result: Result): ConferenceInput["player"] | undefined {
  const side = home ? "home" : "away";
  const mine = Object.entries(m.playerRatings).filter(([id]) => m.playerTeams[id] === side);
  if (mine.length === 0) return undefined;
  const byRating = [...mine].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));
  if (result === "L") {
    const [id] = byRating[0]!;
    return { id, name: m.playerNames[id] ?? id, angle: "culprit" };
  }
  const [id, rating] = byRating[byRating.length - 1]!;
  return rating >= 7.5 ? { id, name: m.playerNames[id] ?? id, angle: "star" } : undefined;
}

/** Before the game: the squad's top scorer of the season, with at least 5 goals. */
function seasonScorer(squad: Squad): ConferenceInput["player"] | undefined {
  let best: { id: string; name: string; goals: number } | undefined;
  for (const p of squad.players) {
    const goals = p.seasonLog?.goals ?? 0;
    if (goals >= 5 && (!best || goals > best.goals || (goals === best.goals && p.id < best.id))) best = { id: p.id, name: p.name, goals };
  }
  return best ? { id: best.id, name: best.name, angle: "scorer" } : undefined;
}
