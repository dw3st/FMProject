/** Hold'em hand evaluator. */
import { describe, expect, test } from "bun:test";
import { HAND_NAMES, evaluate7, handCategory } from "@/Domain/casino/pokerEval";

// "As" = ace of spades; suits s h d c.
const SUITS = "shdc";
const RANKS = "23456789TJQKA";
const card = (s: string) => SUITS.indexOf(s[1]!) * 13 + RANKS.indexOf(s[0]!);
const hand = (s: string) => evaluate7(s.split(" ").map(card));
const cat = (s: string) => HAND_NAMES[handCategory(hand(s))];

describe("evaluate7", () => {
  test("every category", () => {
    expect(cat("As Kd 9h 7c 4s 3d 2h")).toBe("high");
    expect(cat("As Ad 9h 7c 4s 3d 2h")).toBe("pair");
    expect(cat("As Ad 9h 9c 4s 3d Th")).toBe("twoPair");
    expect(cat("As Ad Ah 9c 4s 3d Th")).toBe("trips");
    expect(cat("6s 7d 8h 9c Ts 2d 2h")).toBe("straight");
    expect(cat("As 9s 7s 4s 2s Kd Kh")).toBe("flush");
    expect(cat("As Ad Ah 9c 9s 3d Th")).toBe("fullHouse");
    expect(cat("As Ad Ah Ac 9s 3d Th")).toBe("quads");
    expect(cat("6s 7s 8s 9s Ts 2d 2h")).toBe("straightFlush");
  });

  test("the wheel is a 5-high straight", () => {
    expect(cat("As 2d 3h 4c 5s 9d Kh")).toBe("straight");
    expect(hand("As 2d 3h 4c 5s 9d Kh")).toBeLessThan(hand("6s 2d 3h 4c 5s 9d Kh"));
    expect(cat("As 2s 3s 4s 5s 9d Kh")).toBe("straightFlush");
    expect(hand("As 2s 3s 4s 5s 9d Kh")).toBeLessThan(hand("6s 2s 3s 4s 5s 9d Kh"));
  });

  test("kickers decide", () => {
    expect(hand("As Ad Kh 7c 4s 3d 2h")).toBeGreaterThan(hand("As Ad Qh 7c 4s 3d 2h"));
    expect(hand("As Ad 9h 9c Ks 3d 2h")).toBeGreaterThan(hand("As Ad 9h 9c Qs 3d 2h"));
    expect(hand("As Ad Ah Ac Ks 3d 2h")).toBeGreaterThan(hand("As Ad Ah Ac Qs Jd Th"));
    // only the best five count
    expect(hand("As Kd Qh Jc 9s 3d 2h")).toBe(hand("As Kd Qh Jc 9s 4d 2h"));
    // three pairs: the third pair is only a kicker
    expect(hand("As Ad Kh Kc Qs Qd 2h")).toBeGreaterThan(hand("As Ad Kh Kc Js Jd 2h"));
    // two trips make a full house with the higher trips
    expect(hand("As Ad Ah Kc Ks Kd 2h")).toBeGreaterThan(hand("As Ad Ah Qc Qs 3d 2h"));
  });

  test("flush beats straight, full house beats flush", () => {
    expect(hand("As 9s 7s 4s 2s Kd Kh")).toBeGreaterThan(hand("6s 7d 8h 9c Ts 2d 2h"));
    expect(hand("As Ad Ah 9c 9s 3d Th")).toBeGreaterThan(hand("As 9s 7s 4s 2s Kd Kh"));
  });

  test("ties", () => {
    expect(hand("As Kd 9h 7c 4s 3d 2h")).toBe(hand("Ah Kc 9d 7s 4h 3c 2d"));
    expect(hand("6s 7d 8h 9c Ts 2d 2h")).toBe(hand("6h 7c 8d 9s Tc Ad Kh"));
  });

  test("five cards work", () => {
    expect(cat("As Ad Ah 9c 9s")).toBe("fullHouse");
  });
});
