import { describe, expect, test } from "bun:test";
import { addDayLogSetPieces } from "@/lab/setPieceStats";
import type { TeamRawStats } from "@/lab/types";

const zero = () =>
  ({ corners: 0, freeKicks: 0, directFreeKickShots: 0, directFreeKickGoals: 0, setPieceGoals: 0 }) as TeamRawStats;
const base = { shots: 5, passesCompleted: 40, passesAttempted: 42, tackles: 3, interceptions: 2 };

describe("addDayLogSetPieces (/lab quickSim path)", () => {
  test("adds every set-piece field", () => {
    const t = zero();
    addDayLogSetPieces(t, { ...base, corners: 4, freeKicks: 5, directFreeKickShots: 1, directFreeKickGoals: 1, setPieceGoals: 2 });
    addDayLogSetPieces(t, { ...base, corners: 3, freeKicks: 6 });
    expect(t).toMatchObject({ corners: 7, freeKicks: 11, directFreeKickShots: 1, directFreeKickGoals: 1, setPieceGoals: 2 });
  });

  test("missing fields count as 0", () => {
    const t = zero();
    addDayLogSetPieces(t, base);
    expect(t).toMatchObject({ corners: 0, freeKicks: 0, setPieceGoals: 0 });
  });
});
