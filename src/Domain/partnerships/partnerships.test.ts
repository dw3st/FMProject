import { describe, expect, test } from "bun:test";
import {
  answerPartnership, compareStanding, parentOfferCandidate, satelliteLoanBlock, satelliteTakes,
} from "@/Domain/partnerships/partnerships";
import type { RosterPlayer, Squad } from "@/types/playerTypes";

function stats(v: number): RosterPlayer["stats"] {
  return {
    passing: v, vision: v, finishing: v, dribbling: v, speed: v, acceleration: v, tackling: v, pressing: v,
    stamina: v, heading: v, strength: v, reflex: v, jump: v, decisions: v, composure: v, flair: v, anticipation: v,
  };
}
function player(id: string, pos: string, age = 26, v = 5): RosterPlayer {
  return {
    id, name: id, age, squadId: "c", preferredFoot: "right", positions: [pos], stats: stats(v),
    profile: { summary: "", archetype: "t" }, contract: { until: "2029-05-31", wage: 10_000 },
  };
}
function squad(id: string, v: number, extra: RosterPlayer[] = []): Squad {
  const mk = (n: number, pos: string) => Array.from({ length: n }, (_, i) => player(`${id}${pos}${i}`, pos, 26, v));
  return {
    id, name: `Club ${id}`, colors: ["#fff", "#000"], money: 0,
    players: [...mk(3, "GK"), ...mk(8, "CB"), ...mk(8, "CM"), ...mk(5, "ST"), ...extra],
  } as Squad;
}

describe("standing", () => {
  test("a lower division is below whatever the money", () => {
    expect(compareStanding({ division: 2, tier: "ELITE" }, { division: 1, tier: "LOW" })).toBe(-1);
    expect(compareStanding({ division: 1, tier: "HIGH" }, { division: 1, tier: "MEDIUM" })).toBe(1);
    expect(compareStanding({ division: 1, tier: "HIGH" }, { division: 1, tier: "HIGH" })).toBe(0);
  });
});

describe("answer to a proposal", () => {
  const human = { id: "h", division: 1, tier: "HIGH" as const };
  const base = { human, current: undefined, targetHuman: false, takenElsewhere: false };
  test("a satellite must stand below, a parent above", () => {
    expect(answerPartnership({ ...base, kind: "satellite", target: { id: "a", division: 2, tier: "MEDIUM" } })).toBeNull();
    expect(answerPartnership({ ...base, kind: "satellite", target: { id: "a", division: 1, tier: "ELITE" } })).toBe("wrongSide");
    expect(answerPartnership({ ...base, kind: "parent", target: { id: "a", division: 1, tier: "ELITE" } })).toBeNull();
    expect(answerPartnership({ ...base, kind: "parent", target: { id: "a", division: 1, tier: "HIGH" } })).toBe("sameLevel");
  });
  test("one of each, one manager per AI club, never a human club", () => {
    const target = { id: "a", division: 2, tier: "LOW" as const };
    const cur = { satellite: { clubId: "x", clubName: "X", since: "2027-01-01" } };
    expect(answerPartnership({ ...base, kind: "satellite", target, current: cur })).toBe("slotFull");
    expect(answerPartnership({ ...base, kind: "satellite", target, takenElsewhere: true })).toBe("taken");
    expect(answerPartnership({ ...base, kind: "satellite", target, targetHuman: true })).toBe("human");
    expect(answerPartnership({ ...base, kind: "satellite", target: { ...target, id: "h" } })).toBe("self");
  });
});

describe("lending to the satellite", () => {
  const sat = squad("s", 4);
  test("only a player who would start there", () => {
    expect(satelliteTakes(player("p", "CB", 22, 4), sat)).toBe(true);
    expect(satelliteTakes(player("p", "CB", 22, 3.2), sat)).toBe(false);
  });
  test("limits", () => {
    const p = player("p", "CB", 22, 5);
    expect(satelliteLoanBlock({ player: p, satellite: undefined, lentNow: 0, wageShare: 0 })).toBe("noSatellite");
    expect(satelliteLoanBlock({ player: p, satellite: sat, lentNow: 5, wageShare: 0 })).toBe("loanLimit");
    expect(satelliteLoanBlock({ player: p, satellite: sat, lentNow: 0, wageShare: 0.6 })).toBe("invalidShare");
    expect(satelliteLoanBlock({ player: p, satellite: sat, lentNow: 4, wageShare: 0.5 })).toBeNull();
  });
});

describe("the parent's offer", () => {
  test("a young player good enough, in a line the satellite needs", () => {
    const parent = squad("p", 6, [player("y1", "ST", 20, 4.5), player("y2", "ST", 21, 5.5), player("old", "ST", 28, 6)]);
    const sat = squad("s", 4.5);
    const pick = parentOfferCandidate({
      parent, satellite: sat, neededLines: new Set(["Forward"]), available: () => true, excluded: new Set(),
    });
    expect(pick?.id).toBe("y2");
    expect(parentOfferCandidate({
      parent, satellite: sat, neededLines: new Set(["Defender"]), available: () => true, excluded: new Set(),
    })).toBeNull();
  });
});
