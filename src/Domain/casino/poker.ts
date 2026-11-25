/**
 * Texas Hold'em, no limit: the manager against three bots. Pure: every draw comes from the injected rng.
 * Seat 0 is the manager ("you"); seats are in table order (clockwise).
 */
import { type Card, rankOf, shuffledShoe, suitOf } from "@/Domain/casino/cards";
import { evaluate7 } from "@/Domain/casino/pokerEval";

export type PokerStyle = "cautious" | "balanced" | "aggressive";
export type Street = "preflop" | "flop" | "turn" | "river" | "showdown" | "done";

export interface PokerSeat {
  id: "you" | "b1" | "b2" | "b3";
  style: PokerStyle | null; // null for you
  stack: number;
  hole: Card[];
  bet: number; // this street
  committed: number; // this hand
  folded: boolean;
  allIn: boolean;
}

export type PokerAction =
  | { kind: "fold" }
  | { kind: "check" }
  | { kind: "call" }
  | { kind: "raise"; to: number } // total bet on this street
  | { kind: "allin" };

export interface PokerEvent {
  seat: number; // -1 for the board
  kind: "blind" | "fold" | "check" | "call" | "raise" | "allin" | "deal" | "win";
  amount?: number;
  street: Street;
}

export interface PokerHandResult {
  pots: { amount: number; winners: number[] }[];
  youWon: number; // chips you received (uncalled bet back included), after rake
  youCommitted: number;
  rake: number;
  shown: Record<number, Card[]>; // seat -> hole, only seats that reached showdown
}

export interface PokerTable {
  id: string;
  buyIn: number;
  bigBlind: number;
  smallBlind: number;
  handNo: number;
  button: number;
  seats: PokerSeat[]; // 4, index 0 = you
  deck: Card[];
  board: Card[];
  street: Street;
  toAct: number | null;
  currentBet: number;
  minRaise: number;
  lastAggressor: number | null;
  events: PokerEvent[]; // this hand
  result: PokerHandResult | null;
  acted: boolean[]; // per seat: has acted since the last full raise on this street
}

export interface PokerLegal {
  canCheck: boolean;
  toCall: number;
  minRaiseTo: number;
  maxRaiseTo: number;
  canRaise: boolean;
}

export type PokerTableView = Omit<PokerTable, "deck"> & { legal: PokerLegal | null };

export const POKER = {
  RAKE: 0.03,
  MONTE_CARLO: 300,
  SEATS: 4,
  /** Re-raises a bot makes on one street before it only calls. */
  MAX_RAISES_PER_STREET: 4,
} as const;

const STYLE = {
  cautious: { raiseAt: 0.75, callMargin: 0.05, bluff: 0.03, sizeMin: 0.5, sizeMax: 0.8 },
  balanced: { raiseAt: 0.65, callMargin: 0, bluff: 0.08, sizeMin: 0.5, sizeMax: 1 },
  aggressive: { raiseAt: 0.55, callMargin: -0.05, bluff: 0.15, sizeMin: 0.75, sizeMax: 1 },
} as const;

export function bigBlindOf(buyIn: number): number {
  return Math.max(100, Math.floor(buyIn / 50 / 100) * 100);
}

export function smallBlindOf(bigBlind: number): number {
  return Math.max(50, Math.floor(bigBlind / 2 / 50) * 50);
}

function clone(t: PokerTable): PokerTable {
  return {
    ...t,
    seats: t.seats.map((s) => ({ ...s })),
    deck: [...t.deck],
    board: [...t.board],
    events: [...t.events],
    acted: [...t.acted],
  };
}

const nextSeat = (i: number) => (i + 1) % POKER.SEATS;
const canBet = (s: PokerSeat) => !s.folded && !s.allIn;
const potOf = (t: PokerTable) => t.seats.reduce((a, s) => a + s.committed, 0);

/** Total chips on the table: stacks plus what is committed in the current hand. */
export function chipsInPlay(t: PokerTable): number {
  return t.seats.reduce((a, s) => a + s.stack + s.committed, 0);
}

export function newTable(id: string, buyIn: number, rng: () => number): PokerTable {
  const bigBlind = bigBlindOf(buyIn);
  const seat = (id: PokerSeat["id"], style: PokerStyle | null): PokerSeat => ({
    id, style, stack: buyIn, hole: [], bet: 0, committed: 0, folded: false, allIn: false,
  });
  const table: PokerTable = {
    id,
    buyIn,
    bigBlind,
    smallBlind: smallBlindOf(bigBlind),
    handNo: 0,
    button: Math.floor(rng() * POKER.SEATS),
    seats: [seat("you", null), seat("b1", "cautious"), seat("b2", "balanced"), seat("b3", "aggressive")],
    deck: [],
    board: [],
    street: "done",
    toAct: null,
    currentBet: 0,
    minRaise: bigBlind,
    lastAggressor: null,
    events: [],
    result: null,
    acted: [false, false, false, false],
  };
  return startHand(table, rng);
}

function post(t: PokerTable, i: number, amount: number) {
  const s = t.seats[i]!;
  const pay = Math.min(amount, s.stack);
  s.stack -= pay;
  s.bet += pay;
  s.committed += pay;
  if (s.stack === 0) s.allIn = true;
  return pay;
}

export function startHand(table: PokerTable, rng: () => number): PokerTable {
  if (table.street !== "done") return table;
  const t = clone(table);
  for (const s of t.seats) if (s.style !== null && s.stack < t.bigBlind) s.stack = t.buyIn;
  if (t.seats[0]!.stack <= 0) return { ...t, street: "done", toAct: null };
  for (const s of t.seats) {
    s.hole = [];
    s.bet = 0;
    s.committed = 0;
    s.folded = s.stack <= 0;
    s.allIn = false;
  }
  let b = nextSeat(t.button);
  while (t.seats[b]!.stack <= 0) b = nextSeat(b);
  t.button = b;
  t.handNo += 1;
  t.board = [];
  t.events = [];
  t.result = null;
  t.street = "preflop";
  t.acted = [false, false, false, false];
  t.lastAggressor = null;
  const sb = nextSeat(t.button);
  const bb = nextSeat(sb);
  t.events.push({ seat: sb, kind: "blind", amount: post(t, sb, t.smallBlind), street: "preflop" });
  t.events.push({ seat: bb, kind: "blind", amount: post(t, bb, t.bigBlind), street: "preflop" });
  t.currentBet = t.bigBlind;
  t.minRaise = t.bigBlind;
  t.deck = shuffledShoe(1, rng);
  for (let round = 0; round < 2; round++) {
    for (let k = 1; k <= POKER.SEATS; k++) {
      const i = (t.button + k) % POKER.SEATS;
      t.seats[i]!.hole = [...t.seats[i]!.hole, t.deck.shift()!];
    }
  }
  t.toAct = nextToAct(t, bb);
  return advance(t, rng);
}

/** Next seat after `from` that still has to act on this street, or null. */
function nextToAct(t: PokerTable, from: number): number | null {
  for (let k = 1; k <= POKER.SEATS; k++) {
    const i = (from + k) % POKER.SEATS;
    const s = t.seats[i]!;
    if (canBet(s) && (!t.acted[i] || s.bet < t.currentBet)) return i;
  }
  return null;
}

function roundComplete(t: PokerTable): boolean {
  const live = t.seats.filter(canBet);
  if (live.length === 0) return true;
  if (live.length === 1 && live[0]!.bet >= t.currentBet) return true;
  return t.seats.every((s, i) => !canBet(s) || (t.acted[i] && s.bet === t.currentBet));
}

function legalOf(t: PokerTable, i: number): PokerLegal {
  const s = t.seats[i]!;
  const toCall = Math.max(0, t.currentBet - s.bet);
  const maxRaiseTo = s.bet + s.stack;
  const minRaiseTo = t.currentBet + Math.max(t.minRaise, t.bigBlind);
  return {
    canCheck: toCall === 0,
    toCall,
    minRaiseTo,
    maxRaiseTo,
    canRaise: s.stack > toCall && maxRaiseTo >= minRaiseTo,
  };
}

export function legalFor(t: PokerTable): PokerLegal | null {
  if (t.toAct !== 0 || t.street === "done" || t.street === "showdown") return null;
  return legalOf(t, 0);
}

/** Whether `a` is a legal action for seat `i` now (ignores whose turn it is). */
export function isLegal(t: PokerTable, i: number, a: PokerAction): boolean {
  const s = t.seats[i]!;
  const l = legalOf(t, i);
  switch (a.kind) {
    case "fold": return true;
    case "check": return l.canCheck;
    case "call": return l.toCall > 0;
    case "allin": return s.stack > 0;
    case "raise":
      if (!Number.isFinite(a.to) || !Number.isInteger(a.to)) return false;
      if (a.to === l.maxRaiseTo) return a.to > t.currentBet;
      return l.canRaise && a.to >= l.minRaiseTo && a.to < l.maxRaiseTo;
  }
}

/** Applies a legal action of seat `i` (mutates the working copy). */
function apply(t: PokerTable, i: number, a: PokerAction) {
  const s = t.seats[i]!;
  const street = t.street;
  t.acted[i] = true;
  if (a.kind === "fold") {
    s.folded = true;
    t.events.push({ seat: i, kind: "fold", street });
  } else if (a.kind === "check") {
    t.events.push({ seat: i, kind: "check", street });
  } else if (a.kind === "call") {
    const pay = post(t, i, t.currentBet - s.bet);
    t.events.push({ seat: i, kind: s.allIn ? "allin" : "call", amount: pay, street });
  } else {
    const to = a.kind === "allin" ? s.bet + s.stack : a.to;
    post(t, i, to - s.bet);
    if (to > t.currentBet) {
      const increment = to - t.currentBet;
      if (increment >= t.minRaise) t.minRaise = increment;
      t.currentBet = to;
      t.lastAggressor = i;
      for (let k = 0; k < POKER.SEATS; k++) if (k !== i) t.acted[k] = false;
    }
    t.events.push({ seat: i, kind: s.allIn ? "allin" : "raise", amount: s.bet, street });
  }
  t.toAct = roundComplete(t) ? null : nextToAct(t, i);
}

const STREET_AFTER: Record<string, { street: Street; deal: number }> = {
  preflop: { street: "flop", deal: 3 },
  flop: { street: "turn", deal: 1 },
  turn: { street: "river", deal: 1 },
};

function nextStreet(t: PokerTable) {
  const nx = STREET_AFTER[t.street]!;
  t.board = [...t.board, ...t.deck.slice(0, nx.deal)];
  t.deck = t.deck.slice(nx.deal);
  t.street = nx.street;
  for (const s of t.seats) s.bet = 0;
  t.currentBet = 0;
  t.minRaise = t.bigBlind;
  t.lastAggressor = null;
  t.acted = [false, false, false, false];
  t.events.push({ seat: -1, kind: "deal", street: t.street });
  t.toAct = roundComplete(t) ? null : nextToAct(t, t.button);
}

/** Runs the hand until it is the manager's turn or the hand is over. */
function advance(t: PokerTable, rng: () => number): PokerTable {
  for (let guard = 0; guard < 500; guard++) {
    if (t.street === "done") return t;
    if (t.seats.filter((s) => !s.folded).length === 1) return finish(t, false);
    if (t.toAct === null || roundComplete(t)) {
      if (t.street === "river") return finish(t, true);
      nextStreet(t);
      continue;
    }
    if (t.toAct === 0) return t;
    const seat = t.toAct;
    let a = botDecide(t, seat, rng);
    if (!isLegal(t, seat, a)) a = legalOf(t, seat).canCheck ? { kind: "check" } : { kind: "fold" };
    apply(t, seat, a);
  }
  return finish(t, true);
}

/** Seats in award order: the first left of the button first. */
function fromButton(t: PokerTable, seats: number[]): number[] {
  const order = (i: number) => (i - t.button - 1 + POKER.SEATS) % POKER.SEATS;
  return [...seats].sort((a, b) => order(a) - order(b));
}

/** Ends the hand: uncalled bet back, side pots, rake on your shares, stacks paid. */
function finish(t: PokerTable, showdown: boolean): PokerTable {
  const seats = t.seats;
  const youCommitted = seats[0]!.committed;
  const commit = seats.map((s) => s.committed);
  const received = [0, 0, 0, 0];
  // Uncalled part of the biggest commitment goes back unraked.
  const sorted = [...commit].sort((a, b) => b - a);
  if (sorted[0]! > sorted[1]!) {
    const top = commit.indexOf(sorted[0]!);
    const back = sorted[0]! - sorted[1]!;
    commit[top] = commit[top]! - back;
    received[top] = received[top]! + back;
  }
  const alive = seats.map((s, i) => (s.folded ? -1 : i)).filter((i) => i >= 0);
  if (showdown) while (t.board.length < 5) t.board = [...t.board, t.deck.shift()!];
  const score = seats.map((s, i) => (showdown && !s.folded ? evaluate7([...s.hole, ...t.board]) : 0));
  const levels = [...new Set(alive.map((i) => commit[i]!))].filter((l) => l > 0).sort((a, b) => a - b);
  const pots: { amount: number; winners: number[] }[] = [];
  let prev = 0;
  for (const level of levels) {
    let amount = 0;
    for (const c of commit) amount += Math.min(c, level) - Math.min(c, prev);
    const eligible = alive.filter((i) => commit[i]! >= level);
    const best = Math.max(...eligible.map((i) => score[i]!));
    pots.push({ amount, winners: fromButton(t, eligible.filter((i) => score[i] === best)) });
    prev = level;
  }
  const total = commit.reduce((a, c) => a + c, 0);
  const assigned = pots.reduce((a, p) => a + p.amount, 0);
  if (total > assigned) {
    if (pots.length) pots[pots.length - 1]!.amount += total - assigned;
    else pots.push({ amount: total - assigned, winners: fromButton(t, alive) });
  }
  let rake = 0;
  const events = [...t.events];
  const street: Street = showdown ? "showdown" : t.street;
  for (const pot of pots) {
    const share = Math.floor(pot.amount / pot.winners.length);
    const odd = pot.amount - share * pot.winners.length;
    pot.winners.forEach((w, k) => {
      let win = share + (k === 0 ? odd : 0);
      if (w === 0) {
        const r = Math.floor(POKER.RAKE * win);
        rake += r;
        win -= r;
      }
      received[w] = received[w]! + win;
      events.push({ seat: w, kind: "win", amount: win, street });
    });
  }
  const shown: Record<number, Card[]> = {};
  if (showdown && alive.length > 1) for (const i of alive) shown[i] = [...seats[i]!.hole];
  return {
    ...t,
    seats: seats.map((s, i) => ({ ...s, stack: s.stack + received[i]!, bet: 0, committed: 0 })),
    street: "done",
    toAct: null,
    currentBet: 0,
    events,
    result: { pots, youWon: received[0]!, youCommitted, rake, shown },
  };
}

/** The manager's action (seat 0), then the hand runs on until his next turn or its end. */
export function act(table: PokerTable, action: PokerAction, rng: () => number): { table: PokerTable; error?: "notYourTurn" | "illegal" } {
  if (table.toAct !== 0 || table.street === "done" || table.street === "showdown") return { table, error: "notYourTurn" };
  if (!isLegal(table, 0, action)) return { table, error: "illegal" };
  const t = clone(table);
  apply(t, 0, action);
  return { table: advance(t, rng) };
}

/** Chen-like preflop score of two cards, 0..1. */
export function preflopStrength(hole: readonly Card[]): number {
  const [a, b] = hole as [Card, Card];
  const ra = rankOf(a), rb = rankOf(b);
  const hi = Math.max(ra, rb), lo = Math.min(ra, rb);
  const pts = (r: number) => (r === 14 ? 10 : r === 13 ? 8 : r === 12 ? 7 : r === 11 ? 6 : r / 2);
  let score = pts(hi);
  if (ra === rb) score = Math.max(5, score * 2);
  if (suitOf(a) === suitOf(b)) score += 2;
  if (ra !== rb) {
    const gap = hi - lo - 1;
    score -= gap === 0 ? 0 : gap === 1 ? 1 : gap === 2 ? 2 : gap === 3 ? 4 : 5;
    if (gap <= 1 && hi < 12) score += 1;
  }
  return Math.min(1, Math.max(0, (Math.ceil(score) + 1) / 21));
}

/**
 * Bot equity by Monte Carlo against the other live seats, with their hole cards drawn from the cards
 * the bot can't see (it never reads the opponents' real cards).
 */
export function botEquity(t: PokerTable, seat: number, rng: () => number, trials: number = POKER.MONTE_CARLO): number {
  const me = t.seats[seat]!;
  const opps = t.seats.filter((s, i) => i !== seat && !s.folded).length;
  if (opps === 0) return 1;
  const known = new Set<Card>([...me.hole, ...t.board]);
  const unseen: Card[] = [];
  for (let c = 0; c < 52; c++) if (!known.has(c)) unseen.push(c);
  const need = 2 * opps + (5 - t.board.length);
  const mine: Card[] = [...me.hole, ...t.board];
  const theirs: Card[] = [0, 0];
  let equity = 0;
  for (let n = 0; n < trials; n++) {
    for (let k = 0; k < need; k++) {
      const j = k + Math.floor(rng() * (unseen.length - k));
      const x = unseen[k]!;
      unseen[k] = unseen[j]!;
      unseen[j] = x;
    }
    const board = [...t.board];
    for (let k = 2 * opps; k < need; k++) board.push(unseen[k]!);
    mine.length = 2;
    for (const c of board) mine.push(c);
    const myScore = evaluate7(mine);
    let best = 0, ties = 0, lost = false;
    for (let o = 0; o < opps && !lost; o++) {
      theirs.length = 2;
      theirs[0] = unseen[2 * o]!;
      theirs[1] = unseen[2 * o + 1]!;
      for (const c of board) theirs.push(c);
      const sc = evaluate7(theirs);
      if (sc > myScore) lost = true;
      else if (sc === myScore) ties++;
      if (sc > best) best = sc;
    }
    if (!lost) equity += 1 / (ties + 1);
  }
  return equity / trials;
}

export function botDecide(t: PokerTable, seat: number, rng: () => number): PokerAction {
  const s = t.seats[seat]!;
  const style = STYLE[s.style ?? "balanced"];
  const l = legalOf(t, seat);
  const opps = Math.max(1, t.seats.filter((x, i) => i !== seat && !x.folded).length);
  let raw: number, adj: number;
  if (t.street === "preflop") {
    adj = preflopStrength(s.hole);
    raw = 0.15 + 0.6 * adj;
  } else {
    raw = botEquity(t, seat, rng);
    adj = Math.pow(raw, 1 / opps); // ≈ chance to beat one opponent
  }
  const roll = rng();
  const raises = t.events.filter((e) => e.street === t.street && (e.kind === "raise" || e.kind === "allin")).length;
  const mayRaise = l.canRaise && raises < POKER.MAX_RAISES_PER_STREET;
  const raiseAction = (): PokerAction => {
    const pot = potOf(t) + l.toCall;
    const frac = style.sizeMin + rng() * (style.sizeMax - style.sizeMin);
    const sized = Math.round((frac * pot) / t.smallBlind) * t.smallBlind;
    const to = Math.min(l.maxRaiseTo, Math.max(l.minRaiseTo, t.currentBet + sized));
    return to >= l.maxRaiseTo ? { kind: "allin" } : { kind: "raise", to };
  };
  if (l.toCall === 0) {
    if (mayRaise && (adj >= style.raiseAt || roll < style.bluff)) return raiseAction();
    return { kind: "check" };
  }
  const potOdds = l.toCall / (potOf(t) + l.toCall);
  if (mayRaise && adj >= style.raiseAt + 0.1) return raiseAction();
  if (raw >= potOdds + style.callMargin) return { kind: "call" };
  if (mayRaise && roll < style.bluff * 0.5) return raiseAction();
  return { kind: "fold" };
}

/** Client view: no deck, bot hole cards hidden unless revealed at showdown. */
export function publicTable(t: PokerTable, reveal: boolean): PokerTableView {
  const { deck: _deck, ...rest } = t;
  const shown = t.result?.shown ?? {};
  return {
    ...rest,
    seats: t.seats.map((s, i) => ({ ...s, hole: i === 0 || (reveal && shown[i]) ? [...s.hole] : [] })),
    legal: legalFor(t),
  };
}
