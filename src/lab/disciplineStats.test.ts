import { describe, expect, test } from "bun:test";
import { addDayLogDiscipline } from "@/lab/disciplineStats";
import type { TeamRawStats } from "@/lab/types";

const zero = () =>
  ({ fouls: 0, yellowCards: 0, redCards: 0, offsides: 0, penaltiesAwarded: 0, penaltyGoals: 0 }) as TeamRawStats;
const base = { shots: 5, passesCompleted: 40, passesAttempted: 42, tackles: 3, interceptions: 2 };

describe("addDayLogDiscipline (/lab quickSim path)", () => {
  test("adds every discipline field, penalty goals included", () => {
    const t = zero();
    addDayLogDiscipline(t, { ...base, fouls: 6, yellowCards: 2, redCards: 1, offsides: 1, penaltiesAwarded: 2, penaltyGoals: 1 });
    addDayLogDiscipline(t, { ...base, fouls: 4, penaltiesAwarded: 1, penaltyGoals: 1 });
    expect(t).toMatchObject({ fouls: 10, yellowCards: 2, redCards: 1, offsides: 1, penaltiesAwarded: 3, penaltyGoals: 2 });
  });

  test("missing fields count as 0", () => {
    const t = zero();
    addDayLogDiscipline(t, base);
    expect(t).toMatchObject({ fouls: 0, penaltyGoals: 0 });
  });
});
