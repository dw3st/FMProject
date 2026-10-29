import { describe, expect, test } from "bun:test";
import { breaksStarLimit, STAR_LIMIT, topPlayerCount, worldTopIds } from "@/Domain/squad/starLimit";
import type { Squad } from "@/types/playerTypes";

const squad = (ids: string[]) => ({ players: ids.map((id) => ({ id })) }) as unknown as Pick<Squad, "players">;
const top = new Set(["t1", "t2", "t3", "t4", "t5", "t6"]);

describe("star limit", () => {
  test("a club under the limit signs a top player; at the limit it signs none", () => {
    expect(breaksStarLimit(squad(["t1", "t2", "t3", "t4", "x"]), "t6", top)).toBe(false);
    expect(breaksStarLimit(squad(["t1", "t2", "t3", "t4", "t5"]), "t6", top)).toBe(true);
  });

  test("anyone outside the top is always fine, and so is a player already in the squad", () => {
    expect(breaksStarLimit(squad(["t1", "t2", "t3", "t4", "t5"]), "x2", top)).toBe(false);
    expect(breaksStarLimit(squad(["t1", "t2", "t3", "t4", "t5", "t6"]), "t6", top)).toBe(false);
  });

  test("a club over the limit (its own players climbed) keeps them and signs no other", () => {
    const over = squad(["t1", "t2", "t3", "t4", "t5", "t6"]);
    expect(topPlayerCount(over, top)).toBe(6);
    expect(breaksStarLimit(over, "t7", new Set([...top, "t7"]))).toBe(true);
  });

  test("no list = no limit", () => {
    expect(breaksStarLimit(squad(["t1", "t2", "t3", "t4", "t5"]), "t6", undefined)).toBe(false);
  });

  test("the world top is the best players of the senior squads, the academy left out", () => {
    const p = (id: string, v: number) => ({ id, positions: ["Midfielder"], preferredFoot: "right", stats: Object.fromEntries(
      ["speed", "acceleration", "stamina", "strength", "passing", "vision", "finishing", "dribbling", "tackling", "pressing", "heading", "reflex", "jump"].map((k) => [k, v]),
    ) });
    const squads = [
      { id: "a", players: [p("best", 9), p("mid", 5)], youth: [p("kid", 10)] },
      { id: "b", players: [p("good", 8), p("low", 2)] },
    ] as unknown as Squad[];
    expect([...worldTopIds(squads, 2)].sort()).toEqual(["best", "good"]);
    expect(STAR_LIMIT.MAX).toBe(5);
  });
});
