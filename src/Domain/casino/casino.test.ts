/** The manager's casino (`.claude/rules/game/casino.md`): the machines' return, the crash game and the limits. */
import { describe, expect, test } from "bun:test";
import { closeCrash, emptyCasino, limitsOf, nextDraw, onDay, openCrash, record, stakeRefusal } from "@/Domain/casino/casino";
import { CLASSIC_STRIP, classicPay, classicRtp, spinClassic } from "@/Domain/casino/classicSlot";
import { cashOutAt, crashPoint, multiplierAt, parseAutoCashOut, secondsTo, settleUnclaimed } from "@/Domain/casino/crash";
import { STADIUM_STRIPS, evaluateStadium, linePay, spinStadium, stadiumRtp } from "@/Domain/casino/stadiumSlot";
import { mulberry32 } from "@/Domain/rng";

describe("classic machine", () => {
  test("strip of 20 with the agreed counts", () => {
    const count = (s: string) => CLASSIC_STRIP.filter((x) => x === s).length;
    expect(CLASSIC_STRIP).toHaveLength(20);
    expect([count("seven"), count("bar"), count("bell"), count("lemon"), count("cherry"), count("blank")]).toEqual([1, 2, 3, 5, 4, 5]);
  });

  test("pays three of a kind and two cherries", () => {
    expect(classicPay(["seven", "seven", "seven"])).toBe(500);
    expect(classicPay(["cherry", "cherry", "lemon"])).toBe(3);
    expect(classicPay(["cherry", "cherry", "cherry"])).toBe(20);
    expect(classicPay(["lemon", "cherry", "cherry"])).toBe(0);
  });

  test("exact return between 93% and 95%", () => {
    const rtp = classicRtp();
    expect(rtp).toBeCloseTo(0.93975, 5);
    expect(rtp).toBeGreaterThan(0.93);
    expect(rtp).toBeLessThan(0.95);
  });

  test("a sample of spins agrees with the exact return", () => {
    const rng = mulberry32(7);
    let sum = 0;
    const n = 200_000;
    for (let i = 0; i < n; i++) sum += spinClassic(rng).multiplier;
    expect(Math.abs(sum / n - classicRtp())).toBeLessThan(0.03);
  });
});

describe("stadium machine", () => {
  test("the crest is wild and the best run pays", () => {
    expect(linePay(["ball", "ball", "ball", "card", "ball"]).pay).toBe(4);
    expect(linePay(["crest", "ball", "ball", "card", "ball"]).count).toBe(3);
    expect(linePay(["crest", "crest", "crest", "trophy", "ball"])).toEqual({ pay: 140, count: 4, symbol: "trophy" });
    expect(linePay(["crest", "crest", "crest", "crest", "crest"]).pay).toBe(1500);
    expect(linePay(["ball", "card", "ball", "ball", "ball"]).pay).toBe(0);
  });

  test("ten lines over five reels of 32", () => {
    expect(STADIUM_STRIPS).toHaveLength(5);
    for (const s of STADIUM_STRIPS) expect(s).toHaveLength(32);
    const spin = evaluateStadium([0, 0, 0, 0, 0]);
    expect(spin.multiplier).toBe(spin.wins.reduce((a, w) => a + w.pay, 0) / 10);
  });

  test("exact return between 94% and 96%", () => {
    const rtp = stadiumRtp();
    expect(rtp).toBeGreaterThan(0.94);
    expect(rtp).toBeLessThan(0.96);
  });

  test("a sample of spins agrees with the exact return", () => {
    const rng = mulberry32(11);
    let sum = 0;
    const n = 100_000;
    for (let i = 0; i < n; i++) sum += spinStadium(rng).multiplier;
    expect(Math.abs(sum / n - stadiumRtp())).toBeLessThan(0.06);
  });
});

describe("crash", () => {
  test("crash point from the draw", () => {
    expect(crashPoint(0)).toBe(1);
    expect(crashPoint(0.5)).toBe(1.9);
    expect(crashPoint(0.999999999)).toBe(1_000);
  });

  test("curve and time", () => {
    expect(multiplierAt(0)).toBe(1);
    expect(multiplierAt(secondsTo(2) + 0.001)).toBe(2);
    expect(multiplierAt(-5)).toBe(1);
  });

  test("cash-out below the crash point wins, at it loses, the auto cash-out caps it", () => {
    expect(cashOutAt(secondsTo(1.5) + 0.01, 2, null)).toEqual({ won: true, multiplier: 1.5 });
    expect(cashOutAt(secondsTo(2.5), 2, null)).toEqual({ won: false });
    expect(cashOutAt(secondsTo(3), 5, 2)).toEqual({ won: true, multiplier: 2 });
    expect(settleUnclaimed(5, 2)).toEqual({ won: true, multiplier: 2 });
    expect(settleUnclaimed(1.5, 2)).toEqual({ won: false });
    expect(parseAutoCashOut("1.005")).toBe("invalid");
    expect(parseAutoCashOut(2.555)).toBe(2.55);
    expect(parseAutoCashOut(undefined)).toBeNull();
  });

  test("auto cash-out at 2x returns about 95%", () => {
    const rng = mulberry32(3);
    let sum = 0;
    const n = 400_000;
    for (let i = 0; i < n; i++) {
      const out = settleUnclaimed(crashPoint(rng()), 2);
      sum += out.won ? out.multiplier : 0;
    }
    expect(sum / n).toBeGreaterThan(0.93);
    expect(sum / n).toBeLessThan(0.96);
  });
});

describe("limits", () => {
  const today = (wallet: number) => onDay(emptyCasino("salt"), "2027-03-01", wallet);

  test("stake between the minimum and 2% of the wallet", () => {
    const s = today(1_000_000);
    expect(stakeRefusal(s, 1_000_000, 500)).toBe("invalidStake");
    expect(stakeRefusal(s, 1_000_000, 20_000)).toBeNull();
    expect(stakeRefusal(s, 1_000_000, 20_001)).toBe("stakeTooHigh");
    expect(stakeRefusal(today(40_000), 40_000, 1_000)).toBe("noMoney");
  });

  test("daily loss cap and rounds cap; a new day resets them", () => {
    let s = today(1_000_000);
    for (let i = 0; i < 5; i++) s = record(s, { id: `${i}`, game: "classic", date: s.day, stake: 20_000, payout: 0, multiplier: 0 });
    expect(limitsOf(s, 900_000).lost).toBe(100_000);
    expect(stakeRefusal(s, 900_000, 1_000)).toBe("dailyLossCap");
    s = { ...s, dayNet: 0, rounds: 100 };
    expect(stakeRefusal(s, 900_000, 1_000)).toBe("roundsCap");
    const next = onDay(s, "2027-03-02", 900_000);
    expect(next.rounds).toBe(0);
    expect(limitsOf(next, 900_000).lossCap).toBe(90_000);
  });

  test("the draw moves the nonce; the same salt and nonce give the same draw", () => {
    const s = emptyCasino("abc");
    const a = nextDraw(s);
    expect(a.state.nonce).toBe(1);
    expect(nextDraw(s).rng()).toBe(a.rng());
    expect(nextDraw(emptyCasino("abd")).rng()).not.toBe(nextDraw(s).rng());
  });

  test("a crash round takes the stake at once and gives back the payout", () => {
    let s = today(1_000_000);
    s = openCrash(s, { id: "r", stake: 10_000, startedAt: 0, crash: 3, auto: null, date: s.day });
    expect(s.dayNet).toBe(-10_000);
    expect(s.rounds).toBe(1);
    s = closeCrash(s, 20_000, 2);
    expect(s.dayNet).toBe(10_000);
    expect(s.open).toBeUndefined();
    expect(s.history[0]).toMatchObject({ game: "crash", crash: 3, payout: 20_000 });
  });
});
