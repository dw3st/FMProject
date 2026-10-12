import { describe, expect, test } from "bun:test";
import { fansBounds, goalPulseAlpha, worksPieces } from "@/GraficsEngine/stadiumRender";
import { buildMetrics } from "@/GraficsEngine/pitchMetrics";
import { crowdSeats, standSideRects } from "@/GraficsEngine/crowd";
import { STADIUM } from "@/GraficsEngine/pitchStyle";

describe("crowd goal pulse", () => {
  test("starts and ends at full alpha, dips to 0.85 halfway", () => {
    expect(goalPulseAlpha(0)).toBe(1);
    expect(goalPulseAlpha(STADIUM.GOAL_PULSE_S)).toBe(1);
    expect(goalPulseAlpha(STADIUM.GOAL_PULSE_S / 2)).toBeCloseTo(0.85, 9);
    expect(goalPulseAlpha(-1)).toBe(1);
  });
});

describe("stand under works (#137)", () => {
  test("scaffolding and hazard tape stay inside the stand, the tape on the pitch side", () => {
    const stand = buildMetrics(1100, 700, { stadium: true }).stand!;
    for (const r of standSideRects(stand)) {
      const { scaffold, tape } = worksPieces(r, 6);
      expect(scaffold.length).toBeGreaterThan(2);
      expect(tape.length).toBeGreaterThan(2);
      for (const p of [...scaffold, ...tape]) {
        expect(p.x).toBeGreaterThanOrEqual(r.x - 1e-9); expect(p.y).toBeGreaterThanOrEqual(r.y - 1e-9);
        expect(p.x + p.w).toBeLessThanOrEqual(r.x + r.w + 1e-9); expect(p.y + p.h).toBeLessThanOrEqual(r.y + r.h + 1e-9);
      }
      const t = tape[0]!;
      if (r.side === "top") expect(t.y + t.h).toBeCloseTo(r.y + r.h, 9);
      if (r.side === "bottom") expect(t.y).toBeCloseTo(r.y, 9);
      if (r.side === "left") expect(t.x + t.w).toBeCloseTo(r.x + r.w, 9);
      if (r.side === "right") expect(t.x).toBeCloseTo(r.x, 9);
    }
  });
});

describe("fans layers (#129)", () => {
  test("each side's fans fit in their own box; none = no box", () => {
    const stand = buildMetrics(1100, 700, { stadium: true }).stand!;
    const seats = crowdSeats({ stand, fill: 0.7, homeColor: 0x2255cc, awayColor: 0xcc2222, homeSide: "left", neutral: false, seed: "t" });
    const away = seats.filter((s) => s.team === "away");
    const box = fansBounds(stand, away)!;
    expect(away.length).toBeGreaterThan(0);
    for (const s of away) {
      expect(s.x).toBeGreaterThan(box.x); expect(s.x).toBeLessThan(box.x + box.w);
      expect(s.y).toBeGreaterThan(box.y); expect(s.y).toBeLessThan(box.y + box.h);
    }
    expect(fansBounds(stand, [])).toBeNull();
  });
});
