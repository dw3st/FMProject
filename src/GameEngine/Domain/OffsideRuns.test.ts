import { describe, expect, test } from "bun:test";
import { lapseChance, perceivedLine, readInterval, readSigma, refreshLineRead } from "@/GameEngine/Domain/OffsideRuns";
import { OFFSIDE_RUNS } from "@/GameEngine/Configs/OffsideRunsConfig";
import type { GamePlayer } from "@/GameEngine/types";

const player = (mental: Partial<NonNullable<GamePlayer["mental"]>> = {}, extra: Partial<GamePlayer> = {}) => ({
  id: 1, attackDir: 1, mental: { decisions: 0.3, composure: 0.3, flair: 0.3, anticipation: 0.3, consistency: 0.5, mood: 0, ...mental },
  ...extra,
}) as unknown as GamePlayer;

describe("offside runs (stage 13)", () => {
  test("a good reader reads the line more often and misjudges less", () => {
    const good = player({ anticipation: 0.65, decisions: 0.65 });
    const poor = player({ anticipation: 0.1, decisions: 0.1 });
    expect(readInterval(good)).toBeLessThan(readInterval(poor));
    expect(readSigma(good)).toBeLessThan(readSigma(poor));
    expect(readInterval(good)).toBeCloseTo(OFFSIDE_RUNS.READ_BASE_S, 5);
  });

  test("consistency lowers the lapse chance", () => {
    expect(lapseChance(player({ consistency: 0.9 }))).toBeLessThan(lapseChance(player({ consistency: 0.1 })));
  });

  test("the read is kept until the next read, then taken again from the true line", () => {
    const p = player();
    const r1 = refreshLineRead(p, 80, 100, 10, () => 0.5)!;
    expect(r1.lineX).toBe(80);
    expect(r1.nextAt).toBeCloseTo(100 + readInterval(p) * 10, 5);
    const held = refreshLineRead({ ...p, lineRead: r1 } as GamePlayer, 70, r1.nextAt - 1, 10, () => 0.5);
    expect(held).toBe(r1);
    const again = refreshLineRead({ ...p, lineRead: r1 } as GamePlayer, 70, r1.nextAt, 10, () => 0.5)!;
    expect(again.lineX).toBe(70);
  });

  test("a stepping-up line leaves a player on his old read past the true line", () => {
    const read = { lineX: 80, err: 0, nextAt: 1e9, lapse: false };
    // The line stepped up to 77: he still believes 80, so his safe spot (80 − margin) is past 77.
    expect(perceivedLine(read, 1)).toBe(80);
    expect(perceivedLine({ ...read, err: 2 }, 1)).toBe(82);
    expect(perceivedLine({ ...read, err: 2 }, -1)).toBe(78);
  });

  test("a lapse adds LAPSE_YD and the error stays clipped", () => {
    // rng: gaussian u=1 → z=0; lapse roll 0 → lapse.
    const seq = [1, 0, 0];
    let i = 0;
    const r = refreshLineRead(player(), 80, 0, 1, () => seq[i++] ?? 0.5)!;
    expect(r.lapse).toBe(true);
    expect(r.err).toBeCloseTo(OFFSIDE_RUNS.LAPSE_YD, 5);
    expect(refreshLineRead(player(), null, 0, 1)).toBeUndefined();
  });

  test("anticipation projects the line's movement between reads", () => {
    const read = { lineX: 80, err: 0, nextAt: 1e9, lapse: false, at: 100, vel: -0.5, look: 1 };
    expect(perceivedLine(read, 1, 104)).toBeCloseTo(78, 6);
    expect(perceivedLine({ ...read, look: 0 }, 1, 104)).toBeCloseTo(80, 6);
    // The second read measures the line's speed from the first.
    const p = player({ anticipation: 0.65 });
    const first = refreshLineRead(p, 80, 0, 10, () => 0.5)!;
    const second = refreshLineRead({ ...p, lineRead: first } as GamePlayer, 77, first.nextAt, 10, () => 0.5)!;
    expect(second.vel).toBeCloseTo(-3 / first.nextAt, 6);
    expect(second.look).toBeCloseTo(1, 6);
  });
});
