import { describe, expect, test } from "bun:test";
import {
  ATMOSPHERE, burstLength, fireworks, flareSmoke, phoneAlpha, phoneLights, towerPanel, towerSpots,
  type CelebrationBurst,
} from "@/GraficsEngine/stadiumAtmosphere";
import { buildMetrics } from "@/GraficsEngine/pitchMetrics";
import { standSeatGrid } from "@/GraficsEngine/crowd";
import { isBigMatch } from "@/Domain/matchday/bigMatch";

const stand = buildMetrics(900, 520, { stadium: true }).stand!;

const burst = (over: Partial<CelebrationBurst> = {}): CelebrationBurst => ({
  at: 10, seed: "fix_1", end: { x: 0, y: 100, w: 40, h: 300 }, sky: [{ x: 0, y: 0, w: 900, h: 30 }],
  color: 0xcc0000, night: true, ...over,
});

describe("stadium atmosphere", () => {
  test("a tower in each corner, the panel turned to the pitch", () => {
    const towers = towerSpots(stand);
    expect(towers).toHaveLength(4);
    const cx = stand.inner.x + stand.inner.w / 2;
    const cy = stand.inner.y + stand.inner.h / 2;
    for (const t of towers) {
      const p = towerPanel(t);
      expect(Math.hypot(p.x - cx, p.y - cy)).toBeLessThan(Math.hypot(t.x - cx, t.y - cy));
      expect(t.x).toBeGreaterThanOrEqual(0);
      expect(t.y).toBeGreaterThanOrEqual(0);
    }
  });

  test("phone lights: about the night share, the same seats for the same game, all on during a home goal", () => {
    const seats = standSeatGrid(stand);
    const a = phoneLights(seats, "fix_1");
    expect(phoneLights(seats, "fix_1")).toEqual(a);
    const night = a.filter((p) => phoneAlpha(p, 3, false) > 0).length / seats.length;
    expect(night).toBeGreaterThan(ATMOSPHERE.PHONES.SHARE * 0.7);
    expect(night).toBeLessThan(ATMOSPHERE.PHONES.SHARE * 1.3);
    expect(a.every((p) => phoneAlpha(p, 3, true) > 0)).toBe(true);
  });

  test("big game: continental, cup from the quarter-finals, derby", () => {
    expect(isBigMatch({ continental: true, cupStage: null, derby: false })).toBe(true);
    expect(isBigMatch({ continental: false, cupStage: "qf", derby: false })).toBe(true);
    expect(isBigMatch({ continental: false, cupStage: "final", derby: false })).toBe(true);
    expect(isBigMatch({ continental: false, cupStage: "r16", derby: false })).toBe(false);
    expect(isBigMatch({ continental: false, cupStage: null, derby: true })).toBe(true);
    expect(isBigMatch({ continental: false, cupStage: null, derby: false })).toBe(false);
  });

  test("flares burn in the home end, the smoke rises and fades, nothing after the burst", () => {
    const b = burst();
    const early = flareSmoke(b, 12);
    expect(early.glows.length).toBeGreaterThan(0);
    for (const g of early.glows) {
      expect(g.x).toBeGreaterThanOrEqual(b.end.x);
      expect(g.x).toBeLessThanOrEqual(b.end.x + b.end.w);
    }
    expect(early.puffs.length).toBeGreaterThan(0);
    expect(flareSmoke(b, 5)).toEqual({ glows: [], puffs: [] });
    expect(flareSmoke(b, b.at + burstLength(b) + 0.1)).toEqual({ glows: [], puffs: [] });
    expect(flareSmoke(b, 12)).toEqual(early);
  });

  test("fireworks only at night, gone after the last shell", () => {
    expect(fireworks(burst({ night: false }), 10.5)).toEqual([]);
    expect(fireworks(burst(), 10.5).length).toBeGreaterThan(0);
    expect(fireworks(burst(), 10 + burstLength(burst()) + 0.1)).toEqual([]);
  });

  test("fireworks: a rocket with a trail, then two rings of square sparks that blink out", () => {
    const W = ATMOSPHERE.FIREWORKS;
    const rocket = fireworks(burst(), 10 + W.RISE_S * 0.5);
    expect(rocket).toHaveLength(W.TRAIL);
    expect(rocket.every((k) => k.square)).toBe(true);
    // The first shell has burst (the next ones are still climbing or bursting over it).
    expect(fireworks(burst(), 10 + W.RISE_S + 0.05).length).toBeGreaterThanOrEqual(W.OUTER + W.INNER);
    // The last shell alone, late in its life: some sparks blink off.
    const lastStart = 10 + (W.SHELLS - 1) * W.EVERY_S + W.RISE_S;
    expect(fireworks(burst(), lastStart + W.LIFE_S * 0.95).length).toBeLessThan(W.OUTER + W.INNER);
  });
});
