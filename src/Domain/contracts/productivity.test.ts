import { describe, expect, test } from "bun:test";
import { demandBreakdown, evaluateContractOffer } from "@/Domain/contracts/contracts";
import { expectedWeeklyBonus, goalsPerGame, parseContractBonus, productivityEntries, PRODUCTIVITY } from "@/Domain/contracts/productivity";
import type { RosterPlayer, Squad } from "@/types/playerTypes";

function player(age: number, extra: Partial<RosterPlayer> = {}): RosterPlayer {
  const v = 5;
  return {
    id: "p1", name: "Veteran", age, squadId: "c1", preferredFoot: "right", positions: ["ST"],
    stats: { passing: v, vision: v, finishing: v, dribbling: v, speed: v, acceleration: v, tackling: v, pressing: v,
      stamina: v, heading: v, strength: v, reflex: v, jump: v, decisions: v, composure: v, flair: v, anticipation: v },
    profile: { summary: "" } as RosterPlayer["profile"],
    personality: { ambition: 10.5, loyalty: 10.5, professionalism: 10.5, temperament: 10.5 },
    ...extra,
  };
}
function squad(players: RosterPlayer[]): Squad {
  return {
    id: "c1", name: "Test FC", colors: ["#000", "#fff"], money: 0, players,
    finances: { broadcasting: 10_000_000, commercial: 5_000_000, total: 15_000_000, budget: 0, followers: 0 },
    venue: { name: "A", city: "C", capacity: 40_000, surface: "grass" }, wageFactor: 1,
  };
}
const DATE = "2027-03-01";

describe("productivity contract", () => {
  test("goals per game: season, else history, else the line", () => {
    expect(goalsPerGame(player(32, { seasonLog: { appearances: 10, goals: 5 } as RosterPlayer["seasonLog"] }))).toBe(0.5);
    expect(goalsPerGame(player(32, { history: [{ apps: 20, goals: 4 } as NonNullable<RosterPlayer["history"]>[number]] }))).toBe(0.2);
    expect(goalsPerGame(player(32))).toBe(PRODUCTIVITY.GOALS_FALLBACK.Forward);
  });

  test("parse", () => {
    expect(parseContractBonus(undefined)).toBeNull();
    expect(parseContractBonus({ appearance: 0, goal: 0 })).toBeNull();
    expect(parseContractBonus({ appearance: 1000, goal: 5000 })).toEqual({ appearance: 1000, goal: 5000 });
    expect(parseContractBonus({ appearance: -1, goal: 0 })).toBe("invalid");
    expect(parseContractBonus("x")).toBe("invalid");
  });

  test("accepted when fixed ≥ 60% and fixed + expected bonus ≥ demand; only from 30", () => {
    const p = player(32);
    const s = squad([p]);
    const demand = demandBreakdown(p, s, DATE, { renewal: true }).demand;
    const fixed = Math.ceil(demand * 0.7);
    const bonus = { appearance: Math.ceil((demand - fixed) / 0.8) + 100, goal: 0 };
    expect(expectedWeeklyBonus(p, bonus)).toBeGreaterThanOrEqual(demand - fixed);
    expect(evaluateContractOffer({ wage: fixed, years: 1, productivity: bonus }, p, s, DATE, { renewal: true }).accepted).toBe(true);
    expect(evaluateContractOffer({ wage: Math.floor(demand * 0.5), years: 1, productivity: { appearance: demand * 5, goal: 0 } }, p, s, DATE, { renewal: true }).reason).toBe("lowWage");
    expect(evaluateContractOffer({ wage: fixed, years: 1, productivity: { appearance: 100, goal: 0 } }, p, s, DATE, { renewal: true }).reason).toBe("lowWage");
    const young = player(27);
    expect(evaluateContractOffer({ wage: 1_000_000, years: 1, productivity: bonus }, young, squad([young]), DATE).reason).toBe("noProductivity");
  });

  test("paid per match played and per goal", () => {
    const p = player(33, { contract: { until: "2028-05-31", wage: 10_000, bonus: { appearance: 2_000, goal: 5_000 } } });
    const bench = player(33, { id: "p2", name: "Bench", contract: { until: "2028-05-31", wage: 10_000, bonus: { appearance: 2_000, goal: 5_000 } } });
    const s = squad([p, bench]);
    const lines = productivityEntries(s, [{
      competition: "premier_league", home: "c1", away: "c2", playerRatings: { p1: 7.5 },
      scorers: [{ playerId: "p1", goals: 2 }],
    }], DATE);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.amount).toBe(-12_000);
    expect(lines[0]!.ref.stage).toBe("productivity");
    expect(productivityEntries(s, [{ competition: "x", home: "c3", away: "c2", playerRatings: { p1: 7 } }], DATE)).toHaveLength(0);
  });
});
