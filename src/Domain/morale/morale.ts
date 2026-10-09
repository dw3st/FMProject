/**
 * Pure morale and talks model (`.claude/rules/game/morale.md`). No I/O.
 *
 * Only the human club simulates morale (`RosterPlayer.morale`, `squadStatus`, `moraleLog`,
 * `Squad.moraleClub`). AI clubs store nothing: every reader here treats an absent value as the
 * neutral start (65), whose match effect is exactly zero.
 */
import { YOUTH_COMP } from "@/Domain/youthComps/youthCompConfig";
import { MORALE } from "@/Domain/morale/moraleConfig";
import { AWARDS } from "@/Domain/awards/awardsConfig";
import type { AwardKind } from "@/types/awardTypes";
import { clamp } from "@/Domain/math";
import { addDays, daysBetween } from "@/Domain/dates";
import { overallAvg } from "@/Domain/playerRating";
import { getMainRole, type MainRole } from "@/Domain/roles";
import { isInjured } from "@/Domain/injury/injury";
import { isSuspended } from "@/Domain/discipline/discipline";
import {
  listedUnaskedMult, minutesDeficitMult, moraleVolatility, promiseBrokenMult, takesDemandWell, transferRequestBelow, wantsMove,
} from "@/Domain/personality/personality";
import type { RosterPlayer, Squad } from "@/types/playerTypes";
import type {
  ClubMoraleState, MoraleBand, PlayerMoraleLog, PlayerPromise, SquadStatus, TalkAnswer, TalkReason, TalkRequest,
} from "@/types/moraleTypes";

const round1 = (v: number) => Math.round(v * 10) / 10;

// ── Value, band, effects ─────────────────────────────────────────────────────

/** Stored morale, or the neutral start when absent. */
export function moraleOf(p: Pick<RosterPlayer, "morale">): number {
  return p.morale ?? MORALE.NEUTRAL;
}

export function clampMorale(v: number): number {
  return round1(clamp(v, MORALE.MIN, MORALE.MAX));
}

export function moraleBand(v: number): MoraleBand {
  if (v >= MORALE.BAND_MIN.very_happy) return "very_happy";
  if (v >= MORALE.BAND_MIN.content) return "content";
  if (v >= MORALE.BAND_MIN.neutral) return "neutral";
  if (v >= MORALE.BAND_MIN.unhappy) return "unhappy";
  return "furious";
}

/** −1 at 0, 0 at the neutral value, +1 at 100 (linear on each side). Undefined = 0. */
export function moraleFactor(v: number | undefined): number {
  if (v === undefined || !Number.isFinite(v)) return 0;
  const m = clamp(v, MORALE.MIN, MORALE.MAX);
  if (m <= MORALE.NEUTRAL) return (m - MORALE.NEUTRAL) / (MORALE.NEUTRAL - MORALE.MIN);
  return ((m - MORALE.NEUTRAL) / (MORALE.MAX - MORALE.NEUTRAL)) * MORALE.FACTOR_AT_MAX;
}

/** Attribute multiplier in a match (1 at the neutral value). */
export function moraleExecutionMult(v: number | undefined): number {
  return 1 + MORALE.EXECUTION_STAT_SCALE * moraleFactor(v);
}

/** `stats` × the morale multiplier, each attribute capped at 10. Neutral / absent = same object. */
export function withMoraleExecution<S extends object>(stats: S, morale: number | undefined): S {
  const k = moraleExecutionMult(morale);
  if (k === 1) return stats;
  const out: Record<string, number> = { ...(stats as unknown as Record<string, number>) };
  for (const key of Object.keys(out)) out[key] = Math.min(10, out[key]! * k);
  return out as unknown as S;
}

/** quickSim line-strength multiplier for a side morale (1 when absent). */
export function moraleQuickSimMult(v: number | undefined): number {
  return 1 + MORALE.QUICKSIM_STRENGTH * moraleFactor(v);
}

/** Development points multiplier (1 for a player without stored morale). */
export function moraleDpMult(p: Pick<RosterPlayer, "morale">): number {
  if (p.morale === undefined) return 1;
  return MORALE.DP_MULT[moraleBand(p.morale)];
}

/** Wage demand multiplier: an unhappy or furious player asks more. */
export function moraleDemandMult(p: Pick<RosterPlayer, "morale">): number {
  if (p.morale === undefined) return 1;
  const band = moraleBand(p.morale);
  return band === "unhappy" || band === "furious" ? MORALE.UNHAPPY_DEMAND_MULT : 1;
}

// ── Squad status ─────────────────────────────────────────────────────────────

/**
 * Suggested status of every player, from his rank by rating in his line and his age: the top of
 * each line is `starter` (an XI ~4-3-3), the squad's best `KEY_COUNT` starters are `key`, the next
 * of the line `rotation`, a young non-starter `youth`, the rest `backup`.
 */
export function suggestedStatuses(squad: Pick<Squad, "players">): Record<string, SquadStatus> {
  const players = squad.players;
  const rating = new Map(players.map((p) => [p.id, overallAvg(p)]));
  const byLine = new Map<MainRole, RosterPlayer[]>();
  for (const p of players) {
    const line = getMainRole(p.positions[0] ?? "CM");
    byLine.set(line, [...(byLine.get(line) ?? []), p]);
  }
  const out: Record<string, SquadStatus> = {};
  const starters: RosterPlayer[] = [];
  for (const [line, list] of byLine) {
    const sorted = [...list].sort((a, b) => rating.get(b.id)! - rating.get(a.id)! || a.id.localeCompare(b.id));
    const nStart = MORALE.LINE_STARTERS[line];
    const nRot = MORALE.LINE_ROTATION[line];
    sorted.forEach((p, i) => {
      if (i < nStart) { out[p.id] = "starter"; starters.push(p); }
      else if (p.age <= MORALE.YOUTH_MAX_AGE) out[p.id] = "youth";
      else if (i < nStart + nRot) out[p.id] = "rotation";
      else out[p.id] = "backup";
    });
  }
  const key = [...players].sort((a, b) => rating.get(b.id)! - rating.get(a.id)! || a.id.localeCompare(b.id))
    .slice(0, MORALE.KEY_COUNT);
  for (const p of key) if (out[p.id] === "starter") out[p.id] = "key";
  return out;
}

/** The manager's choice, else the suggestion. */
export function statusOf(p: RosterPlayer, suggested: Record<string, SquadStatus>): SquadStatus {
  return p.squadStatus ?? suggested[p.id] ?? "backup";
}

export function expectedRange(status: SquadStatus): [number, number] {
  return MORALE.EXPECTED[status];
}

/** Full-match equivalents played over the window, scaled to a window of 5; null when too short. */
export function windowMatches(minutes: number[]): number | null {
  if (minutes.length < MORALE.WINDOW_MIN_MATCHES) return null;
  const played = minutes.reduce((a, m) => a + Math.min(1, m / 90), 0);
  return (played * MORALE.WINDOW) / minutes.length;
}

/**
 * Monday minutes delta: at or above the top of the expectation +1 (+2, +3 for one or two matches
 * more), inside it 0, below it −1.5 per missing match (rounded, at least −1, at most −6).
 * `excused` (injured or suspended) never loses morale for missing minutes.
 */
export function minutesDelta(status: SquadStatus, minutes: number[], excused = false, youthMinutes?: number[]): number {
  const p = windowMatches(minutes);
  if (p === null) return 0;
  const base = deltaFor(status, p, excused);
  // Youth-competition games only soften a loss for missing minutes (youth, backup, rotation); they
  // never give the "played above the expectation" bonus (`.claude/rules/game/youth-competitions.md`).
  if (base >= 0 || !youthMinutes?.length || !YOUTH_MINUTES_ROLES.has(status)) return base;
  const y = (youthMinutes.reduce((a, m) => a + Math.min(1, m / 90), 0) * MORALE.WINDOW) / youthMinutes.length;
  return Math.min(0, deltaFor(status, p + YOUTH_COMP.MORALE_YOUTH_WEIGHT * y, excused));
}

const YOUTH_MINUTES_ROLES: ReadonlySet<SquadStatus> = new Set<SquadStatus>(["youth", "backup", "rotation"]);

/** Minutes delta for `p` full-match equivalents over the window (see `minutesDelta`). */
function deltaFor(status: SquadStatus, p: number, excused: boolean): number {
  const [lo, hi] = expectedRange(status);
  if (p >= hi) return Math.min(MORALE.MINUTES_MAX_DELTA, 1 + Math.floor(p - hi));
  if (p >= lo) return 0;
  if (excused) return 0;
  return Math.max(MORALE.MINUTES_MIN_DELTA, -Math.max(1, Math.round(MORALE.MINUTES_DEFICIT_SLOPE * (lo - p))));
}

/** Below the expected minutes (a reason to ask for a talk). */
function belowExpectation(status: SquadStatus, minutes: number[]): boolean {
  const p = windowMatches(minutes);
  return p !== null && p < expectedRange(status)[0];
}

// ── Player helpers ───────────────────────────────────────────────────────────

function emptyLog(): PlayerMoraleLog {
  return { minutes: [], trend: [] };
}

function logOf(p: RosterPlayer): PlayerMoraleLog {
  return p.moraleLog ?? emptyLog();
}

/** Morale moved by `delta`, clamped. */
function withMoraleDelta(p: RosterPlayer, delta: number): RosterPlayer {
  if (delta === 0) return p;
  return { ...p, morale: clampMorale(moraleOf(p) + delta) };
}

/**
 * Morale moved by an EVENT `delta`, scaled by his temperament (`personality.md`: a hot-head reacts
 * up to 25% more, a calm one 25% less). The weekly drift never goes through here.
 */
function withEventDelta(p: RosterPlayer, delta: number): RosterPlayer {
  return withMoraleDelta(p, delta * moraleVolatility(p));
}

function emptyClubMorale(): ClubMoraleState {
  return { talks: [], promises: [] };
}

/** Morale state of the human club (empty when absent). */
export function clubMoraleOf(squad: Squad): ClubMoraleState {
  return squad.moraleClub ?? emptyClubMorale();
}

/** Starts (or restarts) morale for the club the human takes over: everyone at 65, nothing open. */
export function initClubMorale(squad: Squad): Squad {
  return {
    ...squad,
    players: squad.players.map(stripPlayerMorale).map((p) => ({ ...p, morale: MORALE.NEUTRAL })),
    moraleClub: emptyClubMorale(),
  };
}

/** A player leaving the human club (or a club becoming AI) drops every morale field. */
export function stripPlayerMorale<P extends RosterPlayer>(p: P): P {
  if (p.morale === undefined && p.squadStatus === undefined && p.moraleLog === undefined) return p;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { morale: _m, squadStatus: _s, moraleLog: _l, ...rest } = p;
  return rest as P;
}

/** The human club becomes an AI club: no morale anywhere. */
export function stripClubMorale(squad: Squad): Squad {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { moraleClub: _c, ...rest } = squad;
  return { ...rest, players: squad.players.map(stripPlayerMorale) };
}

// ── News (inbox `player`) ────────────────────────────────────────────────────

type PlayerNewsKind = "talk" | "promise_kept" | "promise_broken" | "transfer_request";

export interface PlayerNews {
  date: string;
  kind: PlayerNewsKind;
  playerId: string;
  playerName: string;
  reason?: TalkReason;
  talkId?: string;
  promiseKind?: PlayerPromise["kind"];
  clubName?: string;
}

// ── One day of the human club ───────────────────────────────────────────────

/** The human club's official match of the day, from its side. */
export interface ClubMatchSummary {
  result: "W" | "D" | "L";
  /** Minutes of every player who appeared (absent = 0). */
  minutes: Record<string, number>;
  goals: Record<string, number>;
  ratings: Record<string, number>;
}

export interface MoraleDayInput {
  squad: Squad;
  date: string;
  /** Monday: minutes window, drift, transfer requests, talk triggers. */
  monday: boolean;
  matches: ClubMatchSummary[];
  /** New AI bids for the human's players today (wants_move talks). */
  bids: { playerId: string; clubName: string; stronger: boolean }[];
  /** Players on the human's sell list (with the `requested` flag). */
  sellList: { playerId: string; requested?: boolean }[];
  /** Injured or suspended before today's matches: no window entry, no promise match for them. */
  unavailable?: ReadonlySet<string>;
  /** The human club's country rolled over today: the minutes windows start over. */
  seasonRolled?: boolean;
  /**
   * The director handles contracts (`docs/superpowers/specs/2026-10-07-responsibilities-inbox-design.md`):
   * a contract talk is answered at once instead of opening a request — `true` = he renews (as a
   * renewal promise: +3), `false` = refused (−10). No talk request, no news.
   */
  directorContractTalk?: (p: RosterPlayer) => boolean;
  newId: () => string;
}

export interface MoraleDayOutput {
  squad: Squad;
  news: PlayerNews[];
  /** Players to put on the sell list as requested (transfer request). */
  listRequested: string[];
  /** Players whose request was withdrawn (taken off the list if they were only there by request). */
  unlistRequested: string[];
}

function pushTrend(log: PlayerMoraleLog, v: number): PlayerMoraleLog {
  return { ...log, trend: [...log.trend, v].slice(-MORALE.TREND_DAYS) };
}

/** 7-day trend: today's value minus the oldest kept (null with no history yet). */
export function moraleTrend(p: RosterPlayer): number | null {
  const t = p.moraleLog?.trend ?? [];
  if (t.length < 2) return null;
  return round1(t[t.length - 1]! - t[0]!);
}

/** Monday of the week of `date` (ISO). */
function weekStartOf(date: string): string {
  const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
  return addDays(date, -((dow + 6) % 7));
}

function hasOpenTalk(state: ClubMoraleState, playerId: string): boolean {
  return state.talks.some((t) => t.playerId === playerId);
}

function hasPromise(state: ClubMoraleState, playerId: string, kind: PlayerPromise["kind"]): boolean {
  return state.promises.some((p) => p.playerId === playerId && p.kind === kind);
}

function quiet(p: RosterPlayer, date: string): boolean {
  const q = p.moraleLog?.quietUntil;
  return q !== undefined && date < q;
}

/**
 * One day of morale for the human club. Order: today's matches (result, personal bonus, minutes
 * window, minutes promises), expired talks (= refused), sale/renewal promise deadlines, the Monday
 * block (minutes vs. expectation, drift towards 65, transfer requests, talk triggers), wants_move
 * talks from today's bids, then the daily trend value.
 */
export function moraleDay(input: MoraleDayInput): MoraleDayOutput {
  const { date } = input;
  const news: PlayerNews[] = [];
  const listRequested: string[] = [];
  const unlistRequested: string[] = [];
  let state: ClubMoraleState = clubMoraleOf(input.squad);
  const players = new Map(input.squad.players.map((p) => [p.id, p]));
  const set = (p: RosterPlayer) => players.set(p.id, p);
  const delta = (id: string, d: number) => {
    const p = players.get(id);
    if (p) set(withEventDelta(p, d));
  };
  const requestTransfer = (id: string) => {
    const p = players.get(id);
    if (!p || p.loan) return;
    const log = logOf(p);
    if (log.transferRequest) return;
    set({ ...p, moraleLog: { ...log, transferRequest: date } });
    if (!input.sellList.some((c) => c.playerId === id)) listRequested.push(id);
    news.push({ date, kind: "transfer_request", playerId: id, playerName: p.name });
  };
  const breakPromise = (pr: PlayerPromise) => {
    // The loyal one forgives a broken promise more (`personality.md`).
    const who = players.get(pr.playerId);
    delta(pr.playerId, MORALE.PROMISE_BROKEN * (who ? promiseBrokenMult(who) : 1));
    news.push({ date, kind: "promise_broken", playerId: pr.playerId, playerName: pr.playerName, promiseKind: pr.kind });
    requestTransfer(pr.playerId);
  };
  const keepPromise = (pr: PlayerPromise) => {
    delta(pr.playerId, MORALE.PROMISE_KEPT);
    news.push({ date, kind: "promise_kept", playerId: pr.playerId, playerName: pr.playerName, promiseKind: pr.kind });
  };

  const unavailable = input.unavailable ?? new Set<string>();
  const week = weekStartOf(date);
  let weekCount = state.week?.start === week ? state.week.count : 0;

  // Every player starts from a stored value.
  for (const p of players.values()) if (p.morale === undefined) set({ ...p, morale: MORALE.NEUTRAL });

  // ── Today's matches ──
  for (const m of input.matches) {
    for (const p of [...players.values()]) {
      let d = m.result === "W" ? MORALE.WIN : m.result === "L" ? MORALE.LOSS : 0;
      const personal = (m.goals[p.id] ?? 0) * MORALE.GOAL
        + ((m.ratings[p.id] ?? 0) >= MORALE.GOOD_RATING ? MORALE.GOOD_RATING_BONUS : 0);
      d += Math.min(MORALE.MATCH_PERSONAL_CAP, personal);
      const log = logOf(p);
      // A match he could not play (injured, suspended) does not count against his minutes.
      const out = unavailable.has(p.id) && (m.minutes[p.id] ?? 0) === 0;
      const nextLog = out ? log : {
        ...log,
        minutes: [...log.minutes, m.minutes[p.id] ?? 0].slice(-MORALE.WINDOW),
        newMatches: (log.newMatches ?? 0) + 1,
      };
      set({ ...withEventDelta(p, d), moraleLog: nextLog });
    }
    // Minutes promises: count the match, resolve as soon as decided.
    const next: PlayerPromise[] = [];
    for (const pr of state.promises) {
      if (pr.kind !== "minutes" || !players.has(pr.playerId)) { next.push(pr); continue; }
      if (unavailable.has(pr.playerId) && (m.minutes[pr.playerId] ?? 0) === 0) { next.push(pr); continue; }
      const matches = (pr.matches ?? 0) + 1;
      const played = (pr.played ?? 0) + ((m.minutes[pr.playerId] ?? 0) > 0 ? 1 : 0);
      const target = pr.target ?? 1;
      if (played >= target) keepPromise(pr);
      else if (MORALE.WINDOW - matches < target - played) breakPromise(pr);
      else next.push({ ...pr, matches, played });
    }
    state = { ...state, promises: next };
  }

  // ── Talks and promises of players who left, expired talks, deadlines ──
  const talks: TalkRequest[] = [];
  for (const t of state.talks) {
    if (!players.has(t.playerId)) continue;
    if (t.expires < date) {
      delta(t.playerId, t.reason === "contract" ? MORALE.RENEWAL_REFUSED : MORALE.REFUSE);
      const p = players.get(t.playerId)!;
      set({ ...p, moraleLog: { ...logOf(p), quietUntil: addDays(date, MORALE.TALK_QUIET_DAYS) } });
      continue;
    }
    talks.push(t);
  }
  const promises: PlayerPromise[] = [];
  for (const pr of state.promises) {
    // A sale promise is kept by his leaving; any promise of a player gone simply ends.
    if (!players.has(pr.playerId)) continue;
    if ((pr.kind === "sale" || pr.kind === "renewal") && pr.until && pr.until < date) { breakPromise(pr); continue; }
    promises.push(pr);
  }
  state = { ...state, talks, promises };

  // ── Season over: the minutes windows start again ──
  if (input.seasonRolled) {
    for (const p of [...players.values()]) {
      if (p.moraleLog) set({ ...p, moraleLog: { ...p.moraleLog, minutes: [], newMatches: 0 } });
    }
  }

  // ── Monday ──
  if (input.monday) {
    const suggested = suggestedStatuses({ players: [...players.values()] });
    for (const p0 of [...players.values()]) {
      const status = statusOf(p0, suggested);
      const log = logOf(p0);
      const excused = isInjured(p0, date) || isSuspended(p0);
      // The window only counts again once new matches entered it (breaks, off-season: no change).
      const fresh = (log.newMatches ?? 0) > 0;
      // Personality: an ambitious player feels missing minutes more; every event × temperament.
      const md = fresh ? minutesDelta(status, log.minutes, excused, log.youthMinutes) : 0;
      let v = moraleOf(p0) + (md < 0 ? md * minutesDeficitMult(p0) : md) * moraleVolatility(p0);
      v += (MORALE.NEUTRAL - v) * MORALE.DRIFT;
      let p: RosterPlayer = { ...p0, morale: clampMorale(v), ...(p0.moraleLog ? { moraleLog: { ...log, newMatches: 0 } } : {}) };
      set(p);
      // Transfer request: furious and not yet asked (the threshold moves with ambition; a loyal
      // player never asks from morale alone); withdrawn once he is fine again.
      const below = transferRequestBelow(p, MORALE.TRANSFER_REQUEST_BELOW);
      if (below !== null && moraleOf(p) < below) requestTransfer(p.id);
      p = players.get(p.id)!;
      const plog = logOf(p);
      if (plog.transferRequest && moraleOf(p) >= MORALE.TRANSFER_REQUEST_WITHDRAW && !hasPromise(state, p.id, "sale")) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { transferRequest: _r, ...rest } = plog;
        set({ ...p, moraleLog: rest });
        if (input.sellList.some((c) => c.playerId === p.id && c.requested)) unlistRequested.push(p.id);
        p = players.get(p.id)!;
      }
      // Talk triggers.
      if (weekCount >= MORALE.MAX_NEW_TALKS_PER_WEEK || hasOpenTalk(state, p.id) || quiet(p, date) || p.loan) continue;
      const reason = talkReasonOf(p, status, date, state);
      if (reason === "contract" && input.directorContractTalk) {
        const renews = input.directorContractTalk(p);
        const answered = withEventDelta(p, renews ? MORALE.PROMISE_MADE : MORALE.RENEWAL_REFUSED);
        set({ ...answered, moraleLog: { ...logOf(answered), quietUntil: addDays(date, MORALE.TALK_QUIET_DAYS) } });
        continue;
      }
      if (reason) {
        const talk: TalkRequest = {
          id: input.newId(), playerId: p.id, playerName: p.name, reason, date,
          expires: addDays(date, MORALE.TALK_VALID_DAYS),
        };
        state = { ...state, talks: [...state.talks, talk] };
        news.push({ date, kind: "talk", playerId: p.id, playerName: p.name, reason, talkId: talk.id });
        weekCount++;
      }
    }
  }

  // ── Bids: a player who wants the move asks to talk ──
  for (const b of input.bids) {
    const p = players.get(b.playerId);
    if (weekCount >= MORALE.MAX_NEW_TALKS_PER_WEEK) break;
    if (!p || p.loan || hasOpenTalk(state, p.id) || hasPromise(state, p.id, "sale") || quiet(p, date)) continue;
    if (!wantsMove(p, moraleOf(p), b.stronger, MORALE.WANTS_MOVE_BELOW)) continue;
    const talk: TalkRequest = {
      id: input.newId(), playerId: p.id, playerName: p.name, reason: "wants_move", date,
      expires: addDays(date, MORALE.TALK_VALID_DAYS), clubName: b.clubName,
    };
    state = { ...state, talks: [...state.talks, talk] };
    news.push({ date, kind: "talk", playerId: p.id, playerName: p.name, reason: "wants_move", talkId: talk.id, clubName: b.clubName });
    weekCount++;
  }
  state = { ...state, week: { start: week, count: weekCount } };

  // ── Daily trend ──
  for (const p of [...players.values()]) set({ ...p, moraleLog: pushTrend(logOf(p), moraleOf(p)) });

  return {
    squad: { ...input.squad, players: input.squad.players.map((p) => players.get(p.id)!), moraleClub: state },
    news,
    listRequested,
    unlistRequested,
  };
}

/** Why `p` would ask for a talk this Monday (null = he would not). */
export function talkReasonOf(p: RosterPlayer, status: SquadStatus, date: string, state: ClubMoraleState): TalkReason | null {
  const v = moraleOf(p);
  const log = logOf(p);
  if (v < MORALE.MINUTES_TALK_BELOW && belowExpectation(status, log.minutes)) return "minutes";
  const until = p.contract?.until;
  if ((status === "key" || status === "starter") && until && daysBetween(date, until) <= MORALE.CONTRACT_TALK_DAYS
    && !hasPromise(state, p.id, "renewal")) return "contract";
  if (status === "youth" && v >= MORALE.YOUTH_TALK_MORALE) {
    const r = p.seasonLog?.recentRatings ?? [];
    const avg = r.length ? r.reduce((a, b) => a + b, 0) / r.length : 0;
    if (r.length >= 2 && avg >= MORALE.YOUTH_TALK_RATING && r[r.length - 1]! >= r[0]!) return "chance";
  }
  return null;
}

// ── Answering a talk ─────────────────────────────────────────────────────────

/** Answers a talk with this reason accepts (no reason = a free talk). */
export function answersFor(reason: TalkReason | null): TalkAnswer[] {
  switch (reason) {
    case "minutes": return ["promise_minutes", "promise_sale", "praise", "refuse"];
    case "contract": return ["promise_renewal", "praise", "refuse"];
    case "wants_move": return ["promise_sale", "praise", "refuse"];
    case "chance": return ["promise_minutes", "praise", "refuse"];
    default: return ["praise", "demand"];
  }
}

export type TalkError = "notYourPlayer" | "invalidAnswer" | "invalidMinutes" | "invalidDays" | "onLoan";

export interface TalkResult {
  squad: Squad;
  /** Morale change of the answer itself. */
  change: number;
  /** praise/demand inside the once-a-month window: no effect. */
  noEffect?: true;
  promise?: PlayerPromise;
  /** promise_sale: put him on the sell list as requested. */
  listRequested?: true;
}

/**
 * The manager answers `playerId`'s open talk (or, without one, a free praise/demand talk).
 * Returns the updated squad or an error code.
 */
export function answerTalk(args: {
  squad: Squad;
  playerId: string;
  answer: TalkAnswer;
  date: string;
  /** promise_minutes: matches of the next 5. */
  minutes?: number;
  /** promise_sale: days until the deadline. */
  days?: number;
  newId: () => string;
}): TalkResult | { error: TalkError } {
  const { squad, playerId, answer, date } = args;
  const player = squad.players.find((p) => p.id === playerId);
  if (!player) return { error: "notYourPlayer" };
  if (player.loan) return { error: "onLoan" };
  const state = clubMoraleOf(squad);
  const talk = state.talks.find((t) => t.playerId === playerId) ?? null;
  if (!answersFor(talk?.reason ?? null).includes(answer)) return { error: "invalidAnswer" };

  let change = 0;
  let noEffect = false;
  let promise: PlayerPromise | undefined;
  let listRequested = false;
  const log = logOf(player);
  let nextLog: PlayerMoraleLog = { ...log };

  switch (answer) {
    case "promise_minutes": {
      const target = args.minutes;
      if (target === undefined || !Number.isInteger(target) || target < 1 || target > MORALE.WINDOW) return { error: "invalidMinutes" };
      promise = { id: args.newId(), playerId, playerName: player.name, kind: "minutes", madeOn: date, target, matches: 0, played: 0 };
      change = MORALE.PROMISE_MADE;
      break;
    }
    case "promise_sale": {
      const days = args.days ?? MORALE.SALE_PROMISE_DAYS;
      if (!Number.isInteger(days) || days < MORALE.SALE_PROMISE_MIN_DAYS || days > MORALE.SALE_PROMISE_MAX_DAYS) return { error: "invalidDays" };
      promise = { id: args.newId(), playerId, playerName: player.name, kind: "sale", madeOn: date, until: addDays(date, days) };
      change = MORALE.PROMISE_MADE;
      listRequested = true;
      nextLog = { ...nextLog, transferRequest: nextLog.transferRequest ?? date };
      break;
    }
    case "promise_renewal": {
      promise = { id: args.newId(), playerId, playerName: player.name, kind: "renewal", madeOn: date, until: addDays(date, MORALE.RENEWAL_PROMISE_DAYS) };
      change = MORALE.PROMISE_MADE;
      break;
    }
    case "praise":
    case "demand": {
      const recent = log.talkedOn !== undefined && daysBetween(log.talkedOn, date) < MORALE.PRAISE_EVERY_DAYS;
      if (recent) { noEffect = true; break; }
      const band = moraleBand(moraleOf(player));
      change = answer === "praise"
        ? MORALE.PRAISE
        : band === "very_happy" || band === "content" || takesDemandWell(player) ? MORALE.DEMAND_GOOD : MORALE.DEMAND_BAD;
      nextLog = { ...nextLog, talkedOn: date };
      break;
    }
    case "refuse":
      change = talk?.reason === "contract" ? MORALE.RENEWAL_REFUSED : MORALE.REFUSE;
      break;
  }

  if (talk) nextLog = { ...nextLog, quietUntil: addDays(date, MORALE.TALK_QUIET_DAYS) };
  const updated: RosterPlayer = { ...withEventDelta(player, change), moraleLog: nextLog };
  const nextState: ClubMoraleState = {
    ...state,
    talks: talk ? state.talks.filter((t) => t.id !== talk.id) : state.talks,
    promises: promise
      ? [...state.promises.filter((p) => !(p.playerId === playerId && p.kind === promise!.kind)), promise]
      : state.promises,
  };
  return {
    squad: { ...squad, players: squad.players.map((p) => (p.id === playerId ? updated : p)), moraleClub: nextState },
    change,
    ...(noEffect ? { noEffect: true as const } : {}),
    ...(promise ? { promise } : {}),
    ...(listRequested ? { listRequested: true as const } : {}),
  };
}

// ── Hooks from other routes ──────────────────────────────────────────────────

/** A renewal of the human club: +6, and an open renewal promise is kept (+8). */
export function afterRenewal(squad: Squad, playerId: string, date: string): { squad: Squad; news: PlayerNews[] } {
  const player = squad.players.find((p) => p.id === playerId);
  if (!player) return { squad, news: [] };
  const state = clubMoraleOf(squad);
  const promise = state.promises.find((p) => p.playerId === playerId && p.kind === "renewal");
  const news: PlayerNews[] = promise
    ? [{ date, kind: "promise_kept", playerId, playerName: player.name, promiseKind: "renewal" }]
    : [];
  const d = MORALE.RENEWAL_ACCEPTED + (promise ? MORALE.PROMISE_KEPT : 0);
  return {
    squad: {
      ...squad,
      players: squad.players.map((p) => (p.id === playerId ? withEventDelta(p, d) : p)),
      moraleClub: {
        ...state,
        talks: state.talks.filter((t) => !(t.playerId === playerId && t.reason === "contract")),
        promises: state.promises.filter((p) => p !== promise),
      },
    },
    news,
  };
}

/** A furious player only renews with an open renewal promise. */
export function refusesRenewal(squad: Squad, player: RosterPlayer): boolean {
  if (player.morale === undefined || moraleBand(player.morale) !== "furious") return false;
  return !clubMoraleOf(squad).promises.some((p) => p.playerId === player.id && p.kind === "renewal");
}

/**
 * A season award (`.claude/rules/game/awards.md`): only the largest award of the rollover counts,
 * scaled by the temperament like every event. No award with a morale value → same squad.
 */
export function afterAward(squad: Squad, playerId: string, kinds: AwardKind[], key?: string): Squad {
  const delta = Math.max(0, ...kinds.map((k) => AWARDS.MORALE[k] ?? 0));
  const player = squad.players.find((p) => p.id === playerId);
  if (delta <= 0 || !player) return squad;
  // The award event is recorded once (`moraleLog.awards`): a retried day applies nothing twice, and
  // the event stays visible even when the morale is already at the top of the scale.
  if (key && player.moraleLog?.awards?.includes(key)) return squad;
  const moved = withEventDelta(player, delta);
  const next = key
    ? { ...moved, moraleLog: { ...logOf(moved), awards: [...(logOf(moved).awards ?? []), key].slice(-MORALE.AWARD_KEYS) } }
    : moved;
  return { ...squad, players: squad.players.map((p) => (p.id === playerId ? next : p)) };
}

/** The manager put him on the sell list: −8 unless he asked for it (request or sale promise). */
export function afterListedForSale(squad: Squad, playerId: string): Squad {
  const player = squad.players.find((p) => p.id === playerId);
  if (!player) return squad;
  const asked = !!player.moraleLog?.transferRequest
    || clubMoraleOf(squad).promises.some((p) => p.playerId === playerId && p.kind === "sale");
  if (asked) return squad;
  // The loyal one feels being listed more (`personality.md`).
  return {
    ...squad,
    players: squad.players.map((p) => (p.id === playerId ? withEventDelta(p, MORALE.LISTED_UNASKED * listedUnaskedMult(p)) : p)),
  };
}

/** Open talk requests and promises due within `days` (the dashboard's Attention card). */
export function moraleAttention(squad: Squad, date: string, days = 7): { talks: TalkRequest[]; promisesDue: PlayerPromise[] } {
  const state = clubMoraleOf(squad);
  const limit = addDays(date, days);
  return {
    talks: state.talks,
    promisesDue: state.promises.filter((p) =>
      (p.until !== undefined && p.until <= limit)
      || (p.kind === "minutes" && MORALE.WINDOW - (p.matches ?? 0) <= (p.target ?? 1) - (p.played ?? 0) + 1)),
  };
}
