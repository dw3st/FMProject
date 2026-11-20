import { beforeEach, describe, expect, test } from "bun:test";
import { advanceActionClock, heldAction, heldFor, noteAction, resetActionHold } from "@/GameEngine/Domain/ActionHold";
import { onShoulder, resetShoulderRuns, shoulderRunActive, shoulderRunGoing } from "@/GameEngine/Domain/ShoulderRuns";
import { TEAM_SHAPE } from "@/GameEngine/Configs/ShapeConfig";
import type { GamePlayer } from "@/GameEngine/types";

const p = (id: number, team: "A" | "B", role: string, x: number, y: number) =>
  ({ id, name: `P${id}`, team, role, x, y, attackDir: team === "A" ? 1 : -1, recoveryTime: 0 }) as unknown as GamePlayer;

beforeEach(() => { resetActionHold(); resetShoulderRuns(); });

describe("actions held by time", () => {
  test("a short action is held SHORT_HOLD_S seconds of play, then released", () => {
    noteAction(7, "track_mark", true, "A");
    advanceActionClock(TEAM_SHAPE.SHORT_HOLD_S - 0.2);
    expect(heldAction(7, "A")).toBe("track_mark");
    expect(heldFor(7)).toBeCloseTo(TEAM_SHAPE.SHORT_HOLD_S - 0.2, 9);
    advanceActionClock(0.2);
    expect(heldAction(7, "A")).toBeUndefined();
  });

  test("the ball changing side releases it; a default action clears it; noting the same action keeps the start", () => {
    noteAction(7, "track_mark", true, "A");
    expect(heldAction(7, "B")).toBeUndefined();
    noteAction(8, "make_run", true, "A");
    advanceActionClock(2);
    noteAction(8, "make_run", true, "A");
    expect(heldFor(8)).toBeCloseTo(2, 9);
    noteAction(8, "hold_space", false, "A");
    expect(heldAction(8, "A")).toBeUndefined();
  });
});

describe("runs on the shoulder", () => {
  const line = 80;
  test("on the shoulder = behind his read of the line by at most SHOULDER_YD", () => {
    expect(onShoulder(p(1, "A", "ST", line - 2, 37), line)).toBe(true);
    expect(onShoulder(p(1, "A", "ST", line - 6, 37), line)).toBe(false);
    expect(onShoulder(p(1, "B", "ST", line + 2, 37), line)).toBe(true);
  });

  test("without a make_run intent nobody goes", () => {
    const st = p(1, "A", "ST", line - 2, 37);
    const cm = p(2, "A", "CM", 60, 37);
    expect(shoulderRunGoing(st, cm, "pass", line, [st, cm], 0.2, () => 0)).toBe(false);
    expect(shoulderRunActive(1)).toBe(false);
  });
});
