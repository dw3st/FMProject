/** Hold'em against three bots: chips, blinds, legality, side pots, hidden cards, the bots' information. */
import { describe, expect, test } from "bun:test";
import { type Card } from "@/Domain/casino/cards";
import {
  type PokerAction, type PokerTable, POKER, act, bigBlindOf, botDecide, botEquity, chipsInPlay, isLegal, legalFor,
  newTable, publicTable, smallBlindOf, startHand,
} from "@/Domain/casino/poker";
import { mulberry32 } from "@/Domain/rng";

const SUITS = "shdc";
const RANKS = "23456789TJQKA";
const card = (s: string): Card => SUITS.indexOf(s[1]!) * 13 + RANKS.indexOf(s[0]!);
const cards = (s: string) => s.split(" ").map(card);

const sumStacks = (t: PokerTable) => t.seats.reduce((a, s) => a + s.stack, 0);
const callOrCheck = (t: PokerTable): PokerAction => (legalFor(t)!.canCheck ? { kind: "check" } : { kind: "call" });

describe("blinds", () => {
  test("sizes from the buy-in", () => {
    expect(bigBlindOf(100_000)).toBe(2000);
    expect(bigBlindOf(1_000)).toBe(100);
    expect(bigBlindOf(12_345)).toBe(200);
    expect(smallBlindOf(2000)).toBe(1000);
    expect(smallBlindOf(100)).toBe(50);
    expect(smallBlindOf(300)).toBe(150);
  });

  test("posted left of the button, and the button moves", () => {
    const rng = mulberry32(7);
    let t = newTable("t", 100_000, rng);
    const blinds = t.events.filter((e) => e.kind === "blind");
    expect(blinds.map((e) => e.seat)).toEqual([(t.button + 1) % 4, (t.button + 2) % 4]);
    expect(blinds.map((e) => e.amount)).toEqual([1000, 2000]);
    expect(t.handNo).toBe(1);
    for (const s of t.seats) expect(s.hole).toHaveLength(2);
    const button = t.button;
    while (t.street !== "done") t = act(t, { kind: "fold" }, rng).table;
    t = startHand(t, rng);
    expect(t.button).toBe((button + 1) % 4);
    expect(t.handNo).toBe(2);
  });
});

describe("whole hands", () => {
  test("chips conserved over 200 hands, rake only when you win, bot decisions legal", () => {
    const rng = mulberry32(12345);
    let t = newTable("t", 100_000, rng);
    let before = 4 * 100_000;
    let hands = 0;
    let raked = 0;
    while (hands < 200) {
      if (t.street === "done") {
        const r = t.result!;
        expect(sumStacks(t) + r.rake).toBe(before);
        if (r.rake > 0) {
          raked++;
          expect(r.youWon).toBeGreaterThan(0);
          expect(r.pots.some((p) => p.winners.includes(0))).toBe(true);
        }
        if (!r.pots.some((p) => p.winners.includes(0))) expect(r.rake).toBe(0);
        hands++;
        if (t.seats[0]!.stack === 0) {
          t = newTable(`t${hands}`, 100_000, rng);
          before = 4 * 100_000;
          continue;
        }
        before = sumStacks(t);
        for (const s of t.seats) if (s.style && s.stack < t.bigBlind) before += t.buyIn - s.stack;
        t = startHand(t, rng);
        continue;
      }
      expect(t.toAct).toBe(0);
      expect(chipsInPlay(t)).toBe(before);
      // the bot logic gives a legal action in every state it can face
      expect(isLegal(t, 0, botDecide(t, 0, rng))).toBe(true);
      const res = act(t, callOrCheck(t), rng);
      expect(res.error).toBeUndefined();
      t = res.table;
    }
    expect(raked).toBeGreaterThan(0);
  });

  test("bot logic playing your seat too: legal and every hand ends", () => {
    const rng = mulberry32(99);
    let t = newTable("t", 50_000, rng);
    for (let hand = 0; hand < 60; hand++) {
      let guard = 0;
      while (t.street !== "done" && guard++ < 200) {
        const a = botDecide(t, 0, rng);
        expect(isLegal(t, 0, a)).toBe(true);
        t = act(t, a, rng).table;
      }
      expect(t.street).toBe("done");
      if (t.seats[0]!.stack === 0) t = newTable("t", 50_000, rng);
      else t = startHand(t, rng);
    }
  });
});

describe("actions", () => {
  test("illegal actions and acting out of turn are rejected", () => {
    const rng = mulberry32(3);
    const t = newTable("t", 100_000, rng);
    expect(t.toAct).toBe(0);
    const l = legalFor(t)!;
    expect(act(t, { kind: "raise", to: l.minRaiseTo - 50 }, rng).error).toBe("illegal");
    expect(act(t, { kind: "raise", to: l.maxRaiseTo + 50 }, rng).error).toBe("illegal");
    if (!l.canCheck) expect(act(t, { kind: "check" }, rng).error).toBe("illegal");
    expect(act(t, { kind: "raise", to: l.minRaiseTo }, rng).error).toBeUndefined();
    const notYours = { ...t, toAct: 2 };
    expect(act(notYours, { kind: "call" }, rng).error).toBe("notYourTurn");
    expect(legalFor(notYours)).toBeNull();
  });

  test("does not mutate the input table", () => {
    const rng = mulberry32(4);
    const t = newTable("t", 100_000, rng);
    const copy = JSON.stringify(t);
    act(t, { kind: "call" }, rng);
    expect(JSON.stringify(t)).toBe(copy);
  });
});

/** A river spot built by hand: you to act, the rest given. */
function riverSpot(over: Partial<PokerTable["seats"][number]>[], currentBet: number, board: string): PokerTable {
  const base = newTable("t", 100_000, mulberry32(1));
  const used = new Set<Card>([...cards(board), ...over.flatMap((o) => o.hole ?? [])]);
  return {
    ...base,
    street: "river",
    board: cards(board),
    deck: Array.from({ length: 52 }, (_, i) => i).filter((c) => !used.has(c)),
    button: 3,
    toAct: 0,
    currentBet,
    minRaise: base.bigBlind,
    acted: [false, true, true, true],
    events: [],
    result: null,
    seats: base.seats.map((s, i) => ({ ...s, ...over[i] })),
  };
}

describe("pots", () => {
  const board = "2c 7d 9h Js 4c";

  test("side pots for three different all-ins", () => {
    const t = riverSpot([
      { hole: cards("Qh Qd"), stack: 1000, bet: 0, committed: 0, allIn: false, folded: false },
      { hole: cards("Ah Ad"), stack: 0, bet: 100, committed: 100, allIn: true, folded: false },
      { hole: cards("Kh Kd"), stack: 0, bet: 300, committed: 300, allIn: true, folded: false },
      { hole: cards("3h 5d"), stack: 500, bet: 50, committed: 50, allIn: false, folded: true },
    ], 300, board);
    const done = act(t, { kind: "call" }, mulberry32(2)).table;
    const r = done.result!;
    expect(r.pots).toEqual([
      { amount: 350, winners: [1] },
      { amount: 400, winners: [2] },
    ]);
    expect(r.rake).toBe(0);
    expect(r.youWon).toBe(0);
    expect(done.seats.map((s) => s.stack)).toEqual([700, 350, 400, 500]);
    expect(Object.keys(r.shown).map(Number).sort()).toEqual([0, 1, 2]);
  });

  test("you win main and side: rake on your share, uncalled chips back", () => {
    const t = riverSpot([
      { hole: cards("Ah Ad"), stack: 1000, bet: 0, committed: 0, allIn: false, folded: false },
      { hole: cards("Qh Qd"), stack: 0, bet: 100, committed: 100, allIn: true, folded: false },
      { hole: cards("Kh Kd"), stack: 0, bet: 300, committed: 300, allIn: true, folded: false },
      { hole: cards("3h 5d"), stack: 500, bet: 0, committed: 0, allIn: false, folded: true },
    ], 300, board);
    const done = act(t, { kind: "allin" }, mulberry32(2)).table;
    const r = done.result!;
    // you shove 1000 but only 300 is called: 700 back unraked
    expect(r.pots.map((p) => p.amount)).toEqual([300, 400]);
    expect(r.rake).toBe(Math.floor(300 * POKER.RAKE) + Math.floor(400 * POKER.RAKE));
    expect(r.youWon).toBe(700 + 700 - r.rake);
    expect(done.seats[0]!.stack).toBe(r.youWon);
  });

  test("split pot: odd chip to the first winner left of the button", () => {
    const t = riverSpot([
      { hole: cards("Ah 3d"), stack: 1000, bet: 0, committed: 1, allIn: false, folded: false },
      { hole: cards("As 3s"), stack: 0, bet: 100, committed: 101, allIn: true, folded: false },
      { hole: cards("5h 6d"), stack: 0, bet: 0, committed: 0, allIn: false, folded: true },
      { hole: cards("8h 8d"), stack: 0, bet: 0, committed: 1, allIn: false, folded: true },
    ], 100, "Kc Kd Qh Js Tc");
    const done = act(t, { kind: "call" }, mulberry32(2)).table;
    const r = done.result!;
    // 101 + 101 + 1 folded = 203, split: 102 to seat 0 (first left of the button 3), 101 to seat 1
    expect(r.pots).toEqual([{ amount: 203, winners: [0, 1] }]);
    expect(done.seats[1]!.stack).toBe(101);
    expect(r.youWon).toBe(102 - Math.floor(102 * POKER.RAKE));
  });

  test("folding hands the pot to the last player, nothing shown", () => {
    const t = riverSpot([
      { hole: cards("Qh Qd"), stack: 1000, bet: 0, committed: 200, allIn: false, folded: false },
      { hole: cards("Ah Ad"), stack: 800, bet: 0, committed: 200, allIn: false, folded: true },
      { hole: cards("Kh Kd"), stack: 800, bet: 0, committed: 200, allIn: false, folded: true },
      { hole: cards("3h 5d"), stack: 500, bet: 400, committed: 600, allIn: false, folded: false },
    ], 400, board);
    const done = act(t, { kind: "fold" }, mulberry32(2)).table;
    const r = done.result!;
    expect(r.pots).toEqual([{ amount: 800, winners: [3] }]);
    expect(done.seats[3]!.stack).toBe(500 + 400 + 800);
    expect(r.shown).toEqual({});
    expect(r.rake).toBe(0);
  });
});

describe("information", () => {
  test("bot hole cards hidden before showdown", () => {
    const t = newTable("t", 100_000, mulberry32(8));
    const v = publicTable(t, true);
    expect("deck" in v).toBe(false);
    expect(v.seats[0]!.hole).toHaveLength(2);
    for (const s of v.seats.slice(1)) expect(s.hole).toEqual([]);
    expect(v.legal).toEqual(legalFor(t));
  });

  test("shown hands revealed after a showdown", () => {
    const t = riverSpot([
      { hole: cards("Qh Qd"), stack: 1000, bet: 0, committed: 0, allIn: false, folded: false },
      { hole: cards("Ah Ad"), stack: 0, bet: 100, committed: 100, allIn: true, folded: false },
      { hole: cards("Kh Kd"), stack: 500, bet: 0, committed: 0, allIn: false, folded: true },
      { hole: cards("3h 5d"), stack: 500, bet: 0, committed: 0, allIn: false, folded: true },
    ], 100, "2c 7d 9h Js 4c");
    const done = act(t, { kind: "call" }, mulberry32(2)).table;
    const v = publicTable(done, true);
    expect(v.seats[1]!.hole).toEqual(cards("Ah Ad"));
    expect(v.seats[2]!.hole).toEqual([]);
    expect(publicTable(done, false).seats[1]!.hole).toEqual([]);
  });

  test("bot equity ignores the opponents' real cards", () => {
    const t = riverSpot([
      { hole: cards("Qh Qd"), stack: 1000, bet: 0, committed: 0, allIn: false, folded: false },
      { hole: cards("Ah Kd"), stack: 1000, bet: 0, committed: 0, allIn: false, folded: false },
      { hole: cards("8h 8d"), stack: 1000, bet: 0, committed: 0, allIn: false, folded: false },
      { hole: cards("3h 5d"), stack: 1000, bet: 0, committed: 0, allIn: false, folded: true },
    ], 0, "2c 7d 9h");
    const flop = { ...t, street: "flop" as const };
    const other = {
      ...flop,
      seats: flop.seats.map((s, i) => (i === 0 ? { ...s, hole: cards("As Ks") } : i === 2 ? { ...s, hole: cards("Jc Td") } : s)),
    };
    expect(botEquity(flop, 1, mulberry32(5))).toBe(botEquity(other, 1, mulberry32(5)));
    expect(botDecide(flop, 1, mulberry32(5))).toEqual(botDecide(other, 1, mulberry32(5)));
  });

  test("equity is sensible", () => {
    const t = riverSpot([
      { hole: cards("Qh Qd"), stack: 1000, bet: 0, committed: 0, allIn: false, folded: false },
      { hole: cards("Ah As"), stack: 1000, bet: 0, committed: 0, allIn: false, folded: false },
      { hole: cards("8h 8d"), stack: 1000, bet: 0, committed: 0, allIn: false, folded: true },
      { hole: cards("3h 5d"), stack: 1000, bet: 0, committed: 0, allIn: false, folded: true },
    ], 0, "2c 7d 9h");
    expect(botEquity({ ...t, street: "flop" }, 1, mulberry32(6))).toBeGreaterThan(0.75);
  });
});
