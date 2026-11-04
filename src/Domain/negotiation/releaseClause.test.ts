import { describe, expect, test } from "bun:test";
import { playerMarketValue } from "@/Domain/negotiation/askingPrice";
import { RELEASE_CLAUSE, releaseClause } from "@/Domain/negotiation/releaseClause";
import type { RosterPlayer } from "@/types/playerTypes";

const STATS = (n: number) => ({ finishing: n, dribbling: n, speed: n, acceleration: n, strength: n, stamina: n, passing: n, vision: n, tackling: n, pressing: n, heading: n, jump: n, reflex: n });
const player = (level: number) => ({ id: "p", name: "P", age: 26, positions: ["Midfielder"], stats: STATS(level) }) as unknown as RosterPlayer;

describe("release clause", () => {
  test("at least three times his value, on the fee grid", () => {
    const p = player(7);
    expect(releaseClause(p)).toBeGreaterThanOrEqual(playerMarketValue(p) * RELEASE_CLAUSE.VALUE_MULT);
    expect(releaseClause(p) % 100_000).toBe(0);
  });
  test("never below the floor", () => expect(releaseClause(player(1))).toBeGreaterThanOrEqual(RELEASE_CLAUSE.MIN_FEE));
});
