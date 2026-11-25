/**
 * Blackjack of the games hall: 6 decks shuffled every hand, dealer stands on all 17, blackjack pays 3:2, the dealer
 * peeks for blackjack, double on the first two cards (also after a split), one split, a split ace gets one card.
 */
import { rankOf, shuffledShoe, type Card } from "@/Domain/casino/cards";

export const BLACKJACK = { DECKS: 6, BLACKJACK_PAYS: 1.5 } as const;

export type BlackjackAction = "hit" | "stand" | "double" | "split";

export interface BlackjackHand {
  cards: Card[];
  stake: number;
  done: boolean;
  doubled: boolean;
  /** A hand made from split aces: one card, then it stands. */
  splitAces: boolean;
}

export interface BlackjackRound {
  id: string;
  date: string;
  shoe: Card[];
  dealer: Card[];
  hands: BlackjackHand[];
  active: number;
  split: boolean;
}

export type BlackjackOutcome = "win" | "blackjack" | "push" | "lose" | "bust";

export interface BlackjackSettlement {
  payout: number;
  staked: number;
  outcomes: BlackjackOutcome[];
}

/** Value of a card: face cards 10, ace 11 (soft) at first. */
const cardValue = (c: Card) => { const r = rankOf(c); return r === 14 ? 11 : Math.min(10, r); };

export function handTotal(cards: readonly Card[]): { total: number; soft: boolean } {
  let total = 0;
  let aces = 0;
  for (const c of cards) { total += cardValue(c); if (rankOf(c) === 14) aces++; }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return { total, soft: aces > 0 };
}

export const isBlackjack = (cards: readonly Card[]) => cards.length === 2 && handTotal(cards).total === 21;

function draw(round: BlackjackRound): [Card, BlackjackRound] {
  const [c, ...shoe] = round.shoe;
  return [c!, { ...round, shoe }];
}

/** A fresh round: shuffled shoe, two cards each (player, dealer, player, dealer). */
export function dealRound(id: string, date: string, stake: number, rng: () => number): BlackjackRound {
  const shoe = shuffledShoe(BLACKJACK.DECKS, rng);
  const [p1, d1, p2, d2, ...rest] = shoe;
  return {
    id, date, shoe: rest, dealer: [d1!, d2!],
    hands: [{ cards: [p1!, p2!], stake, done: false, doubled: false, splitAces: false }],
    active: 0, split: false,
  };
}

/** The round is over before any action: either side has blackjack (the dealer peeks). */
export const settlesAtOnce = (r: BlackjackRound) => isBlackjack(r.dealer) || isBlackjack(r.hands[0]!.cards);

export function legalActions(r: BlackjackRound): BlackjackAction[] {
  const h = r.hands[r.active];
  if (!h || h.done) return [];
  const out: BlackjackAction[] = ["hit", "stand"];
  if (h.cards.length === 2) {
    out.push("double");
    if (!r.split && rankOf(h.cards[0]!) === rankOf(h.cards[1]!)) out.push("split");
  }
  return out;
}

/** Extra money an action takes from the wallet. */
export const extraStake = (r: BlackjackRound, a: BlackjackAction) => (a === "double" || a === "split" ? r.hands[r.active]!.stake : 0);

function nextActive(r: BlackjackRound): BlackjackRound {
  let active = r.active;
  while (active < r.hands.length && r.hands[active]!.done) active++;
  return { ...r, active };
}

function setHand(r: BlackjackRound, i: number, h: BlackjackHand): BlackjackRound {
  return { ...r, hands: r.hands.map((x, k) => (k === i ? h : x)) };
}

/** One player action (must be legal). The round may finish all the player's hands. */
export function applyAction(round: BlackjackRound, a: BlackjackAction): BlackjackRound {
  let r = round;
  const i = r.active;
  const h = r.hands[i]!;
  if (a === "stand") return nextActive(setHand(r, i, { ...h, done: true }));
  if (a === "hit" || a === "double") {
    const [c, r2] = draw(r);
    const cards = [...h.cards, c];
    const done = a === "double" || handTotal(cards).total >= 21;
    return nextActive(setHand(r2, i, { ...h, cards, done, doubled: a === "double", stake: a === "double" ? h.stake * 2 : h.stake }));
  }
  // Split: two hands of one card each, each gets a second card.
  const aces = rankOf(h.cards[0]!) === 14;
  let c1: Card, c2: Card;
  [c1, r] = draw(r);
  [c2, r] = draw(r);
  const a1 = [h.cards[0]!, c1];
  const a2 = [h.cards[1]!, c2];
  const mk = (cards: Card[]): BlackjackHand => ({ cards, stake: h.stake, done: aces || handTotal(cards).total >= 21, doubled: false, splitAces: aces });
  return nextActive({ ...r, split: true, hands: [mk(a1), mk(a2)] });
}

export const playerDone = (r: BlackjackRound) => r.active >= r.hands.length;

/** The dealer draws to 17 (only when some hand is still alive) and every hand is paid. */
export function settle(round: BlackjackRound): { round: BlackjackRound; settlement: BlackjackSettlement } {
  let r = round;
  const dealerBj = isBlackjack(r.dealer);
  const playerBj = !r.split && isBlackjack(r.hands[0]!.cards);
  const alive = r.hands.some((h) => handTotal(h.cards).total <= 21);
  if (!dealerBj && !playerBj && alive) {
    while (handTotal(r.dealer).total < 17) { const [c, r2] = draw(r); r = { ...r2, dealer: [...r2.dealer, c] }; }
  }
  const dealer = handTotal(r.dealer).total;
  const outcomes: BlackjackOutcome[] = [];
  let payout = 0;
  for (const h of r.hands) {
    const t = handTotal(h.cards).total;
    let o: BlackjackOutcome;
    if (t > 21) o = "bust";
    else if (playerBj && !dealerBj) o = "blackjack";
    else if (dealerBj) o = playerBj ? "push" : "lose";
    else if (dealer > 21 || t > dealer) o = "win";
    else if (t === dealer) o = "push";
    else o = "lose";
    outcomes.push(o);
    payout += o === "blackjack" ? Math.floor(h.stake * (1 + BLACKJACK.BLACKJACK_PAYS)) : o === "win" ? h.stake * 2 : o === "push" ? h.stake : 0;
  }
  const staked = r.hands.reduce((a, h) => a + h.stake, 0);
  return { round: { ...r, active: r.hands.length }, settlement: { payout, staked, outcomes } };
}

/** Basic strategy for S17, double after split (for the RTP script). */
export function basicStrategy(r: BlackjackRound): BlackjackAction {
  const h = r.hands[r.active]!;
  const legal = legalActions(r);
  const up = cardValue(r.dealer[0]!);
  const { total, soft } = handTotal(h.cards);
  const can = (a: BlackjackAction) => legal.includes(a);
  if (can("split")) {
    const v = cardValue(h.cards[0]!);
    if (v === 11 || v === 8) return "split";
    if ((v === 9 && ![7, 10, 11].includes(up)) || ((v === 7 || v === 3 || v === 2) && up <= 7) || (v === 6 && up <= 6) || (v === 4 && (up === 5 || up === 6))) return "split";
  }
  if (soft) {
    if (total >= 19) return total === 19 && up === 6 && can("double") ? "double" : "stand";
    if (total === 18) { if (up >= 2 && up <= 6) return can("double") ? "double" : "stand"; return up <= 8 ? "stand" : "hit"; }
    const dbl = (total === 17 && up >= 3 && up <= 6) || ((total === 15 || total === 16) && up >= 4 && up <= 6) || ((total === 13 || total === 14) && (up === 5 || up === 6));
    return dbl && can("double") ? "double" : "hit";
  }
  if (total >= 17) return "stand";
  if (total >= 13) return up <= 6 ? "stand" : "hit";
  if (total === 12) return up >= 4 && up <= 6 ? "stand" : "hit";
  if (total === 11) return can("double") ? "double" : "hit";
  if (total === 10) return up <= 9 && can("double") ? "double" : "hit";
  if (total === 9) return up >= 3 && up <= 6 && can("double") ? "double" : "hit";
  return "hit";
}

export function parseBlackjackAction(v: unknown): BlackjackAction | null {
  return v === "hit" || v === "stand" || v === "double" || v === "split" ? v : null;
}
