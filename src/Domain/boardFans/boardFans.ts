import { BOARD_FANS } from "@/Domain/boardFans/boardFansConfig";
import { addDays } from "@/Domain/dates";
import { GATE } from "@/Domain/finance/gate";
import { overallAvg } from "@/Domain/playerRating";
import type {
  BoardMessageKind,
  BoardSnapshot,
  BoardState,
  ResultLetter,
  SackReason,
  SeasonObjective,
  SeasonObjectiveKind,
} from "@/types/boardTypes";
import type { FinancialTier, LeagueZone, RosterPlayer, Squad } from "@/types/playerTypes";

/**
 * Board and fans of the human club (`.claude/rules/game/board-fans.md`). Pure: no I/O, every
 * function returns a new state. AI clubs simulate none of this.
 */

const round2 = (v: number) => Math.round(v * 100) / 100;
const clampMeter = (v: number) => round2(Math.min(BOARD_FANS.MAX, Math.max(BOARD_FANS.MIN, v)));

/**
 * A gain above START shrinks as the meter climbs (`DAMP_SPAN_*`); a loss below START softens a
 * little (`LOSS_DAMP_*`). Losses above START and gains below it pass unchanged.
 */
function damped(value: number, delta: number, span: number): number {
  if (delta > 0 && value > BOARD_FANS.START) {
    return delta * Math.max(BOARD_FANS.DAMP_MIN, 1 - (value - BOARD_FANS.START) / span);
  }
  if (delta < 0 && value < BOARD_FANS.START) {
    return delta * Math.max(BOARD_FANS.LOSS_DAMP_MIN, 1 - (BOARD_FANS.START - value) / BOARD_FANS.LOSS_DAMP_SPAN);
  }
  return delta;
}

function moveMeters(state: BoardState, board: number, fans: number): BoardState {
  return {
    ...state,
    board: clampMeter(state.board + damped(state.board, board, BOARD_FANS.DAMP_SPAN_BOARD)),
    fans: clampMeter(state.fans + damped(state.fans, fans, BOARD_FANS.DAMP_SPAN_FANS)),
  };
}

/** Match expectation in −1..1 from the two clubs' levels (`clubLevel`); +1 = clear favourite. */
export function matchExpectation(ownLevel: number, opponentLevel: number, home: boolean): number {
  const cfg = BOARD_FANS.match;
  const v = (ownLevel - opponentLevel + (home ? cfg.EXPECTATION_HOME_BONUS : 0)) / cfg.EXPECTATION_SCALE;
  return Math.max(-1, Math.min(1, v));
}

export function initialBoardState(date: string, objective: SeasonObjective | null): BoardState {
  return {
    board: BOARD_FANS.START,
    fans: BOARD_FANS.START,
    objective,
    history: [],
    recent: [],
    record: { startDate: date, played: 0, wins: 0, draws: 0, losses: 0, titles: [] },
  };
}

// ── Season objective ──────────────────────────────────────────────────────────

const CONTINENTAL_ZONE_IDS = new Set(["ucl", "uel", "uecl", "lib", "sud"]);

export interface ObjectiveClub {
  squadId: string;
  /** Club strength (`clubLevel`). */
  level: number;
  tier: FinancialTier;
}

/** Expected final position: clubs ranked by strength plus a small financial-tier bonus. */
export function expectedRank(squadId: string, clubs: ObjectiveClub[]): number {
  const bonus = BOARD_FANS.objective.TIER_LEVEL_BONUS;
  const ranked = [...clubs]
    .map((c) => ({ id: c.squadId, v: c.level + bonus[c.tier] }))
    .sort((a, b) => b.v - a.v || a.id.localeCompare(b.id, undefined, { numeric: true }));
  const i = ranked.findIndex((c) => c.id === squadId);
  return i < 0 ? ranked.length : i + 1;
}

/**
 * The season's objective, set at career start and at every rollover of the club's country: by the
 * expected position (squad strength relative to the league + financial tier), using the league's
 * continental and relegation zones when it has them.
 */
export function objectiveFor(args: {
  squadId: string;
  clubs: ObjectiveClub[];
  zones: LeagueZone[];
  leagueSlug: string;
  season: string;
  /**
   * Mid-season takeover (`.claude/rules/game/jobs.md`): the club's current table position replaces
   * the strength ranking.
   */
  rank?: number;
}): SeasonObjective {
  const n = Math.max(1, args.clubs.length);
  const rank = args.rank ?? expectedRank(args.squadId, args.clubs);
  const continental = Math.max(
    0,
    ...args.zones.filter((z) => CONTINENTAL_ZONE_IDS.has(z.id) && typeof z.to === "number").map((z) => z.to!),
  );
  const relegation = args.zones.find((z) => z.id === "rel")?.fromEnd ?? 0;
  const half = Math.max(1, Math.floor(n / 2));
  const cfg = BOARD_FANS.objective;

  let kind: SeasonObjectiveKind;
  let target: number;
  if (rank <= cfg.TITLE_RANK) {
    kind = "title"; target = 1;
  } else if (continental > 0 && rank <= continental) {
    kind = "continental"; target = continental;
  } else if (rank <= half) {
    kind = "top_half"; target = half;
  } else if (relegation > 0 && rank >= n - relegation - cfg.RELEGATION_MARGIN + 1) {
    kind = "avoid_relegation"; target = n - relegation;
  } else {
    kind = "mid_table";
    const cap = relegation > 0 ? n - relegation - 1 : n;
    target = Math.max(half + 1, Math.min(Math.round(n * cfg.MID_TABLE_SHARE), cap));
  }
  return { kind, target: Math.min(n, target), leagueSlug: args.leagueSlug, leagueSize: n, season: args.season };
}

// ── Matches ───────────────────────────────────────────────────────────────────

const POINTS: Record<ResultLetter, number> = { W: 3, D: 1, L: 0 };

export interface MatchForBoard {
  goalsFor: number;
  goalsAgainst: number;
  home: boolean;
  derby: boolean;
  /** −1..1, +1 = clear favourite (`matchExpectation`); absent = an even game. */
  expectation?: number;
  /** League matches only: the club's table position after the game and the season progress. */
  league?: { position: number; size: number; played: number; total: number };
}

/** One official match of the human club (league, cup or continental). */
export function applyMatchResult(state: BoardState, m: MatchForBoard): BoardState {
  const cfg = BOARD_FANS.match;
  const result: ResultLetter = m.goalsFor > m.goalsAgainst ? "W" : m.goalsFor === m.goalsAgainst ? "D" : "L";
  const recent = [...state.recent, result].slice(-BOARD_FANS.RECENT_RESULTS);

  // Expectation: a favourite gains little from a win and loses more; an underdog the opposite.
  const e = Math.max(-1, Math.min(1, m.expectation ?? 0));
  const winMult = 1 - cfg.WIN_EXPECT * e;
  const lossMult = 1 + cfg.LOSS_EXPECT * e;

  let fans = result === "W"
    ? cfg.FANS_WIN * winMult
    : result === "D" ? cfg.FANS_DRAW - cfg.DRAW_EXPECT_FANS * e : cfg.FANS_LOSS * lossMult;
  if (result === "L" && m.home) fans *= cfg.HOME_LOSS_MULT;
  if (m.derby) fans *= cfg.DERBY_MULT;
  const formPoints = recent.reduce((s, r) => s + POINTS[r], 0);
  const expectedPerGame = cfg.FORM_EXPECTED_BASE + cfg.FORM_EXPECTED_SPAN * e;
  fans += (formPoints - expectedPerGame * recent.length) * cfg.FORM_WEIGHT;

  let board = result === "W"
    ? cfg.BOARD_WIN * winMult
    : result === "D" ? cfg.BOARD_DRAW - cfg.DRAW_EXPECT_BOARD * e : cfg.BOARD_LOSS * lossMult;
  if (m.derby) board *= cfg.DERBY_MULT;
  if (m.league && state.objective && m.league.size > 0) {
    const progress = m.league.total > 0 ? Math.min(1, m.league.played / m.league.total) : 1;
    const weight = cfg.SEASON_WEIGHT_MIN + (1 - cfg.SEASON_WEIGHT_MIN) * progress;
    board += (cfg.POSITION_WEIGHT * (state.objective.target - m.league.position) / m.league.size) * weight;
  }

  const record = {
    ...state.record,
    played: state.record.played + 1,
    wins: state.record.wins + (result === "W" ? 1 : 0),
    draws: state.record.draws + (result === "D" ? 1 : 0),
    losses: state.record.losses + (result === "L" ? 1 : 0),
  };
  const ultimatum = state.ultimatum && m.league
    ? { ...state.ultimatum, matchesLeft: state.ultimatum.matchesLeft - 1, points: state.ultimatum.points + POINTS[result] }
    : state.ultimatum;
  return moveMeters({ ...state, recent, record, ...(ultimatum ? { ultimatum } : {}) }, board, fans);
}

// ── Competition events and transfers ──────────────────────────────────────────

export type CompetitionEvent =
  | { kind: "title"; title: string }
  | { kind: "stage" }
  | { kind: "early_exit" }
  | { kind: "promoted" }
  | { kind: "relegated" };

export function applyCompetitionEvent(state: BoardState, ev: CompetitionEvent): BoardState {
  const e = BOARD_FANS.events;
  switch (ev.kind) {
    case "title":
      return moveMeters(
        { ...state, record: { ...state.record, titles: [...state.record.titles, ev.title] } },
        e.TITLE_BOARD, e.TITLE_FANS,
      );
    case "stage":
      return moveMeters(state, e.STAGE_BOARD, e.STAGE_FANS);
    case "early_exit":
      return moveMeters(state, e.EARLY_EXIT_BOARD, e.EARLY_EXIT_FANS);
    case "promoted":
      return moveMeters(state, e.PROMOTED_BOARD, e.PROMOTED_FANS);
    case "relegated":
      return moveMeters(state, e.RELEGATED_BOARD, e.RELEGATED_FANS);
  }
}

/** The human club sold a player: a big fee pleases the board, an idol leaving angers the fans. */
export function applyTransferSale(
  state: BoardState,
  sale: { fee: number; annualRevenue: number; idol: boolean },
): BoardState {
  const t = BOARD_FANS.transfer;
  const big = sale.annualRevenue > 0 && sale.fee >= sale.annualRevenue * t.BIG_SALE_REVENUE_SHARE;
  return moveMeters(state, big ? t.BIG_SALE_BOARD : 0, sale.idol ? t.IDOL_SALE_FANS : 0);
}

/** The human club bought a player: spending past the balance costs board confidence. */
export function applyPurchase(state: BoardState, p: { balanceAfter: number }): BoardState {
  return p.balanceAfter < 0 ? moveMeters(state, BOARD_FANS.transfer.OVER_BUDGET_BOARD, 0) : state;
}

/** Seasons (distinct history rows) a player spent at the club. */
function seasonsAtClub(player: RosterPlayer, squadId: string): number {
  return new Set((player.history ?? []).filter((r) => r.squadId === squadId).map((r) => r.season)).size;
}

/** An idol: the squad's best player by overall, or one with IDOL_SEASONS+ seasons at the club. */
export function isIdol(player: RosterPlayer, squad: Squad): boolean {
  if (seasonsAtClub(player, squad.id) >= BOARD_FANS.transfer.IDOL_SEASONS) return true;
  const best = Math.max(...squad.players.map((p) => overallAvg(p)));
  return squad.players.length > 1 && overallAvg(player) >= best;
}

const normCity = (c: string) => c.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

/** A derby / big match: same city, or (no city rival) against the league leader. */
export function isDerby(args: { myCity: string; opponentCity: string; opponentIsLeader: boolean }): boolean {
  const a = normCity(args.myCity);
  if (a && a === normCity(args.opponentCity)) return true;
  return args.opponentIsLeader;
}

// ── Weekly ────────────────────────────────────────────────────────────────────

/** Monday: the ledger balance moves the board, then both meters drift towards START. */
export function applyWeekly(state: BoardState, money: { balance: number; weeklyRevenue: number }): BoardState {
  const w = BOARD_FANS.weekly;
  let board = state.board;
  if (money.balance < 0) {
    const depth = Math.min(1, -money.balance / Math.max(1, money.weeklyRevenue * w.NEG_DEPTH_WEEKS));
    board += w.NEG_BASE + w.NEG_EXTRA_MAX * depth;
  } else {
    board += w.POSITIVE;
  }
  board += (BOARD_FANS.START - board) * w.BOARD_DRIFT;
  const fans = state.fans + (BOARD_FANS.START - state.fans) * w.FANS_DRIFT;
  return { ...state, board: clampMeter(board), fans: clampMeter(fans) };
}

// ── Status: warning, ultimatum, praise, sacking ──────────────────────────────

export function reviewBoardStatus(
  state: BoardState,
  opts: { sackingEnabled: boolean; date: string },
): { state: BoardState; messages: BoardMessageKind[]; sacked: SackReason | null } {
  const st = BOARD_FANS.status;
  const messages: BoardMessageKind[] = [];
  let s = state;

  if (s.ultimatum) {
    if (s.ultimatum.points >= s.ultimatum.pointsNeeded) {
      const { ultimatum: _, ...rest } = s;
      s = moveMeters(rest, st.ULTIMATUM_MET_BOARD, 0);
      messages.push("ultimatum_met");
    } else if (s.ultimatum.matchesLeft <= 0) {
      if (opts.sackingEnabled) return { state: s, messages: ["sacked"], sacked: "ultimatum" };
      const { ultimatum: _, ...rest } = s;
      s = rest;
    }
  }
  if (opts.sackingEnabled && s.board < st.SACK) return { state: s, messages: ["sacked"], sacked: "board" };

  if (opts.sackingEnabled && s.board < st.ULTIMATUM && !s.ultimatum && !messages.includes("ultimatum_met")) {
    s = { ...s, ultimatum: { since: opts.date, matchesLeft: st.ULTIMATUM_MATCHES, pointsNeeded: st.ULTIMATUM_POINTS, points: 0 } };
    messages.push("ultimatum");
  }
  if (s.board < st.WARNING && !s.warned) {
    s = { ...s, warned: true };
    messages.push("warning");
  } else if (s.board >= st.WARNING_RESET && s.warned) {
    s = { ...s, warned: false };
  }
  if (s.board >= st.PRAISE && !s.praised) {
    s = { ...s, praised: true };
    messages.push("praise");
  } else if (s.board < st.PRAISE_RESET && s.praised) {
    s = { ...s, praised: false };
  }
  return { state: s, messages, sacked: null };
}

// ── Season end ────────────────────────────────────────────────────────────────

/** The board judges the final league position against the season objective. */
export function evaluateSeason(state: BoardState, r: { position: number | null }): BoardState {
  const o = state.objective;
  if (!o || r.position === null || o.leagueSize <= 0) return state;
  const c = BOARD_FANS.season;
  const delta = r.position <= o.target
    ? Math.min(c.MET_MAX, c.MET_BASE + (c.MET_SCALE * (o.target - r.position)) / o.leagueSize)
    : -Math.min(c.MISS_MAX, c.MISS_BASE + (c.MISS_SCALE * (r.position - o.target)) / o.leagueSize);
  return moveMeters(state, delta, 0);
}

/** End-of-season budget bonus (euros) for a board at BONUS_THRESHOLD or above. */
export function boardBonus(board: number, annualRevenue: number): number {
  const c = BOARD_FANS.season;
  if (board < c.BONUS_THRESHOLD || annualRevenue <= 0) return 0;
  const share = c.BONUS_BASE + (c.BONUS_SPAN * (board - c.BONUS_THRESHOLD)) / (BOARD_FANS.MAX - c.BONUS_THRESHOLD);
  return Math.round(annualRevenue * share);
}

/** New season: both meters keep CARRY of their distance to START, the ultimatum is dropped. */
export function carryIntoNewSeason(state: BoardState, objective: SeasonObjective | null): BoardState {
  const k = BOARD_FANS.season.CARRY;
  const { ultimatum: _, ...rest } = state;
  return {
    ...rest,
    board: clampMeter(BOARD_FANS.START + (state.board - BOARD_FANS.START) * k),
    fans: clampMeter(BOARD_FANS.START + (state.fans - BOARD_FANS.START) * k),
    objective,
  };
}

// ── History and trend ─────────────────────────────────────────────────────────

/** Records today's meters (one snapshot per day, last HISTORY_DAYS kept). */
export function snapshotBoard(state: BoardState, date: string): BoardState {
  const snap: BoardSnapshot = { date, board: Math.round(state.board * 10) / 10, fans: Math.round(state.fans * 10) / 10 };
  const prev = state.history.at(-1)?.date === date ? state.history.slice(0, -1) : state.history;
  return { ...state, history: [...prev, snap].slice(-BOARD_FANS.HISTORY_DAYS) };
}

/** Latest value minus the value TREND_DAYS ago (null without a snapshot that old). */
export function trendOf(history: BoardSnapshot[], date: string, key: "board" | "fans"): number | null {
  const last = history.at(-1);
  if (!last) return null;
  const cutoff = addDays(date, -BOARD_FANS.TREND_DAYS);
  const ref = [...history].reverse().find((h) => h.date <= cutoff);
  return ref ? Math.round((last[key] - ref[key]) * 10) / 10 : null;
}

// ── Effects ───────────────────────────────────────────────────────────────────

/** Piecewise linear through (0, lo), (START, mid), (100, hi). */
function byFans(fans: number, lo: number, mid: number, hi: number): number {
  const f = Math.min(BOARD_FANS.MAX, Math.max(BOARD_FANS.MIN, fans));
  return f <= BOARD_FANS.START
    ? lo + ((mid - lo) * f) / BOARD_FANS.START
    : mid + ((hi - mid) * (f - BOARD_FANS.START)) / (BOARD_FANS.MAX - BOARD_FANS.START);
}

/** Share of the stadium filled at the human club's home games (AI clubs use GATE.FILL_RATE). */
export function stadiumFillRate(fans: number): number {
  return byFans(fans, BOARD_FANS.gate.FILL_MIN, GATE.FILL_RATE, BOARD_FANS.gate.FILL_MAX);
}

/**
 * Followers after the rollover reaction, scaled by the fans' mood: a gain × 0.8..1.2, a loss ×
 * the mirror (happy fans soften it).
 */
export function followersAfterMood(before: number, after: number, fans: number): number {
  const mult = byFans(fans, BOARD_FANS.followers.MULT_MIN, 1, BOARD_FANS.followers.MULT_MAX);
  const delta = after - before;
  return Math.round(before + (delta >= 0 ? delta * mult : delta * (2 - mult)));
}
