import { describe, expect, test } from "bun:test";
import { liveStageOf } from "@/Domain/rivals/liveStage";
import type { LeagueSeasonMeta } from "@/types/calendarTypes";

const fx = (round: number, extra: { leg?: 1 | 2; home?: string } = {}) => ({ round, home: "A", ...extra });

describe("liveStageOf", () => {
  test("a league game: its round", () => {
    expect(liveStageOf({} as LeagueSeasonMeta, fx(12))).toEqual({ kind: "round", round: 12 });
  });
  test("a cup tie: its stage", () => {
    const meta = { cup: { stages: [{ round: 6, name: "sf" }] } } as unknown as LeagueSeasonMeta;
    expect(liveStageOf(meta, fx(6))).toEqual({ kind: "cup", stage: "sf" });
    expect(liveStageOf(meta, fx(7))).toBeNull();
  });
  test("a continental game: group and round, or stage and leg", () => {
    const meta = { continental: {
      groups: [{ name: "B", clubs: ["A"] }],
      stages: [{ name: "group", rounds: [1, 2, 3] }, { name: "qf", rounds: [11, 12] }, { name: "final", rounds: [13] }],
    } } as unknown as LeagueSeasonMeta;
    expect(liveStageOf(meta, fx(2))).toEqual({ kind: "group", group: "B", round: 2 });
    expect(liveStageOf(meta, fx(12, { leg: 2 }))).toEqual({ kind: "continental", stage: "qf", leg: 2 });
    expect(liveStageOf(meta, fx(13))).toEqual({ kind: "continental", stage: "final" });
  });
  test("no meta: unknown", () => {
    expect(liveStageOf(null, fx(1))).toBeNull();
  });
});
