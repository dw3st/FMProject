import { describe, expect, test } from "bun:test";
import { addDayLogAerial } from "@/lab/aerialStats";
import type { TeamRawStats } from "@/lab/types";

const zero = () =>
  ({
    crosses: 0, crossesCompleted: 0, aerialDuels: 0, aerialDuelsWon: 0, headerGoals: 0, longBalls: 0, longBallsCompleted: 0,
  }) as TeamRawStats;
const base = { shots: 5, passesCompleted: 40, passesAttempted: 42, tackles: 3, interceptions: 2 };

describe("addDayLogAerial (/lab quickSim path)", () => {
  test("adds every aerial field", () => {
    const t = zero();
    addDayLogAerial(t, { ...base, crosses: 6, crossesCompleted: 2, aerialDuels: 5, aerialDuelsWon: 3, headerGoals: 1, longBalls: 4, longBallsCompleted: 2 });
    addDayLogAerial(t, { ...base, crosses: 4, aerialDuels: 6, aerialDuelsWon: 2 });
    expect(t).toMatchObject({ crosses: 10, crossesCompleted: 2, aerialDuels: 11, aerialDuelsWon: 5, headerGoals: 1, longBalls: 4, longBallsCompleted: 2 });
  });

  test("missing fields count as 0", () => {
    const t = zero();
    addDayLogAerial(t, base);
    expect(t).toMatchObject({ crosses: 0, headerGoals: 0, longBalls: 0 });
  });
});
