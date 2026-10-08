import { describe, expect, test } from "bun:test";
import { buildMetrics } from "@/GraficsEngine/pitchMetrics";
import { crowdBaseColor, crowdSeats, standConcreteRows, standSeatGrid } from "@/GraficsEngine/crowd";
import { contrastRatio } from "@/GraficsEngine/playerFaces";
import { STADIUM } from "@/GraficsEngine/pitchStyle";

const stand = buildMetrics(1100, 700, { stadium: true }).stand!;
const base = { stand, fill: 0.5, homeColor: 0xc8102e, awayColor: 0x1d428a, homeSide: "left" as const, neutral: false, seed: "fix_1" };

describe("crowd", () => {
  test("occupancy follows fill (±2%), fill clamped to 0..1", () => {
    const total = standSeatGrid(stand).length;
    for (const fill of [0, 0.25, 0.5, 0.65, 1]) {
      expect(Math.abs(crowdSeats({ ...base, fill }).length / total - fill)).toBeLessThanOrEqual(0.02);
    }
    expect(crowdSeats({ ...base, fill: 1.4 }).length).toBe(total);
    expect(crowdSeats({ ...base, fill: -1 })).toHaveLength(0);
  });

  test("seats on all four sides, all outside the pitch rect and inside the canvas", () => {
    const grid = standSeatGrid(stand);
    for (const side of ["top", "bottom", "left", "right"] as const) expect(grid.some((s) => s.side === side)).toBe(true);
    const { inner, outer } = stand;
    for (const s of grid) {
      const inside = s.x > inner.x && s.x < inner.x + inner.w && s.y > inner.y && s.y < inner.y + inner.h;
      expect(inside).toBe(false);
      expect(s.x).toBeGreaterThanOrEqual(outer.x); expect(s.x).toBeLessThanOrEqual(outer.x + outer.w);
      expect(s.y).toBeGreaterThanOrEqual(outer.y); expect(s.y).toBeLessThanOrEqual(outer.y + outer.h);
    }
    expect(standConcreteRows(stand).length).toBeGreaterThan(0);
  });

  test("never more than MAX_SEATS cells", () => {
    expect(standSeatGrid(buildMetrics(2400, 1500, { stadium: true }).stand!).length).toBeLessThanOrEqual(STADIUM.MAX_SEATS);
  });

  test("deterministic by seed, different seeds differ", () => {
    expect(crowdSeats(base)).toEqual(crowdSeats(base));
    expect(crowdSeats(base)).not.toEqual(crowdSeats({ ...base, seed: "fix_2" }));
  });

  test("away block in the end stand opposite the home side, ~AWAY_SHARE of the fans", () => {
    const seats = crowdSeats(base);
    const away = seats.filter((s) => s.team === "away");
    expect(away.length / seats.length).toBeGreaterThan(STADIUM.AWAY_SHARE - 0.03);
    expect(away.length / seats.length).toBeLessThan(STADIUM.AWAY_SHARE + 0.03);
    expect(away.every((s) => s.x > stand.inner.x + stand.inner.w)).toBe(true);
    const flipped = crowdSeats({ ...base, homeSide: "right" }).filter((s) => s.team === "away");
    expect(flipped.length).toBeGreaterThan(0);
    expect(flipped.every((s) => s.x < stand.inner.x)).toBe(true);
  });

  test("neutral venue: halves split by the drawn halfway line", () => {
    const seats = crowdSeats({ ...base, neutral: true });
    const mid = stand.outer.x + stand.outer.w / 2;
    expect(seats.filter((s) => s.x < mid).every((s) => s.team === "home")).toBe(true);
    expect(seats.filter((s) => s.x >= mid).every((s) => s.team === "away")).toBe(true);
  });

  test("lower rows fill first", () => {
    const grid = standSeatGrid(stand);
    const seats = crowdSeats({ ...base, fill: 0.3 });
    const density = (pred: (s: { rowFrac: number }) => boolean) =>
      seats.filter(pred).length / grid.filter(pred).length;
    expect(density((s) => s.rowFrac < 0.5)).toBeGreaterThan(density((s) => s.rowFrac >= 0.5) * 1.3);
  });

  test("a colour that vanishes on the stand is lightened", () => {
    const dark = 0x1a2430;
    expect(contrastRatio(crowdBaseColor(dark), STADIUM.STAND_COLOR)).toBeGreaterThan(contrastRatio(dark, STADIUM.STAND_COLOR));
    expect(crowdBaseColor(0xffd400)).toBe(0xffd400);
  });
});
