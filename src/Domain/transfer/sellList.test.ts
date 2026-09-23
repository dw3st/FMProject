import { describe, expect, test } from "bun:test";
import type { RosterPlayer, Squad } from "@/types/playerTypes";
import { generateSellList, getSellPriority, minBandDepth } from "@/Domain/transfer/sellList";

function flatStats(v: number): RosterPlayer["stats"] {
  return {
    passing: v, vision: v, finishing: v, dribbling: v,
    speed: v, acceleration: v, tackling: v, pressing: v,
    stamina: v, heading: v, strength: v, reflex: v, jump: v,
  };
}

function makePlayer(
  id: string,
  pos: string,
  statVal: number,
  age = 25,
): RosterPlayer {
  return {
    id,
    name: id,
    age,
    squadId: "s",
    preferredFoot: "right",
    positions: [pos],
    stats: flatStats(statVal),
    profile: { summary: "", archetype: "test" },
  };
}

function makeSquad(players: RosterPlayer[], budget = 0): Squad {
  return {
    id: "s",
    name: "Club",
    colors: ["#fff", "#000"],
    money: 0,
    players,
    finances: {
      broadcasting: 0, commercial: 0, total: 0,
      budget, followers: 0,
    },
  };
}

const rng = () => 0.5;

describe("minBandDepth", () => {
  test("GK never scales with budget", () => {
    expect(minBandDepth("GK", "low")).toBe(3);
    expect(minBandDepth("GK", "high")).toBe(3);
  });

  test("outfield bands scale with tier", () => {
    expect(minBandDepth("Midfielder", "low")).toBe(7);
    expect(minBandDepth("Midfielder", "mid")).toBe(8);
    expect(minBandDepth("Midfielder", "high")).toBe(9);
  });
});

describe("generateSellList", () => {
  test("empty squad returns empty list", () => {
    expect(generateSellList(makeSquad([]), 0)).toHaveLength(0);
  });

  test("surplus player in bottom half of oversized band appears on list", () => {
    // 10 midfielders: the worst-rated ones should be listed (low budget, min=7, excess threshold=8)
    const players = [
      ...Array.from({ length: 6 }, (_, i) => makePlayer(`good${i}`, "CM", 9)),   // high quality
      ...Array.from({ length: 4 }, (_, i) => makePlayer(`weak${i}`, "CM", 4)),   // low quality
    ];
    const squad = makeSquad(players, 0);
    const list = generateSellList(squad, rng);
    expect(list.length).toBeGreaterThan(0);
    const ids = list.map((c) => c.playerId);
    // weak players should be listed
    expect(ids.some((id) => id.startsWith("weak"))).toBe(true);
    // strong players should not be listed
    expect(ids.some((id) => id.startsWith("good"))).toBe(false);
  });

  test("below-team-average player (age >= 23) appears on list", () => {
    // Need more than minBandDepth(Defender, low)=7 players so depth protection doesn't block everyone
    const players = [
      ...Array.from({ length: 8 }, (_, i) => makePlayer(`def${i}`, "CB", 8)),
      makePlayer("weakDef", "CB", 4, 28), // well below avg, old enough
    ];
    const squad = makeSquad(players, 0);
    const list = generateSellList(squad, rng);
    const ids = list.map((c) => c.playerId);
    expect(ids).toContain("weakDef");
  });

  test("young below-average player (age < 23) is protected", () => {
    const players = [
      ...Array.from({ length: 4 }, (_, i) => makePlayer(`def${i}`, "CB", 8)),
      makePlayer("youngWeak", "CB", 4, 19), // young and weak — should be protected
    ];
    const squad = makeSquad(players, 0);
    const list = generateSellList(squad, rng);
    const ids = list.map((c) => c.playerId);
    expect(ids).not.toContain("youngWeak");
  });

  test("aging player below team average appears on list", () => {
    // Need more than minBandDepth(Midfielder, low)=7 players so depth protection doesn't block everyone
    const players = [
      ...Array.from({ length: 8 }, (_, i) => makePlayer(`mid${i}`, "CM", 7)),
      makePlayer("oldMid", "CM", 5, 33), // age > 30 and below avg
    ];
    const squad = makeSquad(players, 0);
    const list = generateSellList(squad, rng);
    const ids = list.map((c) => c.playerId);
    expect(ids).toContain("oldMid");
  });

  test("star player (rating > teamAvg + 0.5) is never listed", () => {
    const players = [
      ...Array.from({ length: 6 }, (_, i) => makePlayer(`mid${i}`, "CM", 5)),
      makePlayer("star", "CM", 9, 28), // significantly above average
    ];
    const squad = makeSquad(players, 0);
    const list = generateSellList(squad, rng);
    expect(list.map((c) => c.playerId)).not.toContain("star");
  });

  test("protection: selling would breach minimum depth — player not listed", () => {
    // Exactly at min depth (7 for low budget mid), so none can be sold
    const players = Array.from({ length: 7 }, (_, i) =>
      makePlayer(`mid${i}`, "CM", i < 3 ? 8 : 3), // 3 good + 4 bad
    );
    const squad = makeSquad(players, 0);
    const list = generateSellList(squad, rng);
    // All bad players are at min depth — cannot be listed
    expect(list.map((c) => c.playerId).some((id) => id.startsWith("mid3") || id.startsWith("mid4"))).toBe(false);
  });

  test("only viable player for detailed position is protected", () => {
    // 1 LB, several CBs — the LB should not be listed (only one LB)
    const players = [
      makePlayer("lb", "LB", 4, 28),
      ...Array.from({ length: 7 }, (_, i) => makePlayer(`cb${i}`, "CB", 7)),
    ];
    const squad = makeSquad(players, 0);
    const list = generateSellList(squad, rng);
    expect(list.map((c) => c.playerId)).not.toContain("lb");
  });

  test("list is capped at 5 entries", () => {
    // Large squad with many weak players
    const players = [
      ...Array.from({ length: 4 }, (_, i) => makePlayer(`good${i}`, "CM", 9)),
      ...Array.from({ length: 12 }, (_, i) => makePlayer(`weak${i}`, "CM", 3, 32)),
    ];
    const squad = makeSquad(players, 0);
    const list = generateSellList(squad, rng);
    expect(list.length).toBeLessThanOrEqual(5);
  });

  test("priority values are clamped to [0, 1]", () => {
    const players = [
      ...Array.from({ length: 4 }, (_, i) => makePlayer(`def${i}`, "CB", 8)),
      makePlayer("weakDef", "CB", 3, 33),
    ];
    const squad = makeSquad(players, 0);
    const list = generateSellList(squad, rng);
    for (const c of list) {
      expect(c.priority).toBeGreaterThanOrEqual(0);
      expect(c.priority).toBeLessThanOrEqual(1);
    }
  });

  test("list is sorted descending by priority", () => {
    const players = [
      ...Array.from({ length: 4 }, (_, i) => makePlayer(`def${i}`, "CB", 8)),
      makePlayer("weak1", "CB", 3, 33), // aging + below avg
      makePlayer("weak2", "CB", 5, 27), // slightly below avg
    ];
    const squad = makeSquad(players, 0);
    const list = generateSellList(squad, rng);
    for (let i = 1; i < list.length; i++) {
      expect(list[i - 1]!.priority).toBeGreaterThanOrEqual(list[i]!.priority);
    }
  });
});

describe("getSellPriority", () => {
  test("returns priority when player is listed", () => {
    const list = [{ playerId: "p1", priority: 0.8 }];
    expect(getSellPriority("p1", list)).toBe(0.8);
  });

  test("returns null when player is not listed", () => {
    expect(getSellPriority("p99", [])).toBeNull();
  });
});
