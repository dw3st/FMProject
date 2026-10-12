import { describe, expect, test } from "bun:test";
import { fitsScoutBudget, interestInputFor, interestScore, scoutInterest, scoutRowExtras, type InterestInput } from "@/Domain/scout/scoutInterest";

const base = (over: Partial<InterestInput> = {}): InterestInput => ({
  ambition: 10, loyalty: 10, stepsDown: 0, stepsUp: 0, free: false, sameLeague: false,
  age: 24, rating: 5, buyerAvg: 5, appeal: 100, trainingCondition: 100, ...over,
});

describe("scoutInterest", () => {
  test("a starter at a club of the same size is interested", () => {
    expect(scoutInterest(base())).toBe("interested");
  });

  test("a bigger club attracts, a smaller one puts him off", () => {
    expect(interestScore(base({ stepsUp: 1 }))).toBeGreaterThan(interestScore(base()));
    expect(interestScore(base({ stepsDown: 1 }))).toBeLessThan(interestScore(base()));
  });

  test("the very ambitious (as the scout sees him) would not come two tiers down", () => {
    expect(scoutInterest(base({ ambition: 18, stepsDown: 2 }))).toBe("not_coming");
    expect(scoutInterest(base({ ambition: 16, stepsDown: 2, rating: 4.5 }))).not.toBe("interested");
  });

  test("the very ambitious would not come with a run-down training ground", () => {
    expect(scoutInterest(base({ ambition: 17, trainingCondition: 20, appeal: 20 }))).toBe("not_coming");
    expect(scoutInterest(base({ ambition: 12, trainingCondition: 20, appeal: 20 }))).not.toBe("not_coming");
  });

  test("a direct rival is harder than a club from another league", () => {
    expect(interestScore(base({ sameLeague: true }))).toBeLessThan(interestScore(base()));
    expect(scoutInterest(base({ sameLeague: true, loyalty: 18 }))).toBe("hesitant");
  });

  test("a star in his prime does not step sideways, but moves up", () => {
    const star = base({ age: 27, rating: 6.2 });
    expect(interestScore(star)).toBeLessThan(interestScore(base({ age: 20, rating: 6.2 })));
    expect(interestScore({ ...star, stepsUp: 1 })).toBeGreaterThan(interestScore(star));
  });

  test("a free agent is keener; loyalty does not hold him", () => {
    expect(interestScore(base({ free: true, loyalty: 20 }))).toBeGreaterThan(interestScore(base({ loyalty: 20 })));
  });

  test("a player well below the buyer's level (no place in the XI) is less keen", () => {
    expect(interestScore(base({ rating: 3.5 }))).toBeLessThan(interestScore(base()));
  });

  test("unknown traits read as neutral", () => {
    expect(interestScore(base({ ambition: null, loyalty: null }))).toBeCloseTo(interestScore(base()), 6);
  });
});

describe("fitsScoutBudget", () => {
  const b = { feeEur: 5_000_000, weeklyWage: 20_000, balance: 10_000_000, wageBill: 100_000, maxWageBudget: 150_000 };
  test("fee and wage both fit", () => expect(fitsScoutBudget(b)).toBe(true));
  test("fee above the balance", () => expect(fitsScoutBudget({ ...b, feeEur: 11_000_000 })).toBe(false));
  test("a negative balance affords only free players", () => {
    expect(fitsScoutBudget({ ...b, balance: -1 })).toBe(false);
    expect(fitsScoutBudget({ ...b, balance: -1, feeEur: 0 })).toBe(true);
  });
  test("wage over the cap", () => expect(fitsScoutBudget({ ...b, weeklyWage: 60_000 })).toBe(false));
});

describe("scoutRowExtras", () => {
  const buyer = {
    squadId: "me", leagueSlug: "premier_league", tier: 2, buyerAvg: 5, appealFor: () => 100,
    trainingCondition: 100, balance: 10_000_000, wageBill: 100_000, maxWageBudget: 150_000, wageFactor: 1,
    tierOf: (id: string) => (id === "big" ? 3 : id === "small" ? 0 : 2),
  };
  const wage = () => 20_000;
  const row = { squadId: "x", leagueSlug: "la_liga", age: 24, avg: 5, valueMillions: 4, personality: { traits: { ambition: 10, loyalty: 10 } } };

  test("own players carry nothing", () => {
    expect(scoutRowExtras({ ...row, squadId: "me" }, buyer, wage)).toBeUndefined();
  });

  test("tier steps come from the clubs; the same league is a rival", () => {
    const fromBig = interestInputFor({ ...row, squadId: "big" }, buyer);
    expect(fromBig.stepsDown).toBe(1);
    const fromSmall = interestInputFor({ ...row, squadId: "small" }, buyer);
    expect(fromSmall.stepsUp).toBe(2);
    expect(interestInputFor({ ...row, leagueSlug: "premier_league" }, buyer).sameLeague).toBe(true);
  });

  test("the fee is the shown value; a free agent has none", () => {
    expect(scoutRowExtras(row, buyer, wage)!.affordable).toBe(true);
    expect(scoutRowExtras({ ...row, valueMillions: 12 }, buyer, wage)!.affordable).toBe(false);
    expect(scoutRowExtras({ ...row, valueMillions: 12, free: true, squadId: "" }, buyer, wage)!.affordable).toBe(true);
  });
});
