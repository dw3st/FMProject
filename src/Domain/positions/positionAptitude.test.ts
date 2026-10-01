import { describe, expect, test } from "bun:test";
import type { PlayerStatsRecord, RosterPlayer } from "@/types/playerTypes";
import { aptitudeFor, positionAptitudes, preferredRole, scaleStats } from "@/Domain/positions/positionAptitude";

const BASE: PlayerStatsRecord = {
  passing: 5, vision: 5, finishing: 5, dribbling: 5, speed: 5, acceleration: 5, tackling: 5,
  pressing: 5, stamina: 5, heading: 5, strength: 5, reflex: 0, jump: 0,
} as PlayerStatsRecord;

function mk(positions: string[], foot: "left" | "right", over: Partial<PlayerStatsRecord> = {}): RosterPlayer {
  return {
    id: "p", name: "P", age: 25, squadId: "s", preferredFoot: foot, positions,
    stats: { ...BASE, ...over } as PlayerStatsRecord,
    profile: {} as RosterPlayer["profile"],
  };
}

const cb = { tackling: 9, heading: 9, strength: 9, pressing: 8, finishing: 2, dribbling: 3 } as Partial<PlayerStatsRecord>;

describe("positionAptitudes", () => {
  test("a strong defender is natural at CB", () => {
    const p = mk(["Defender"], "right", cb);
    expect(preferredRole(p)).toBe("CB");
    expect(aptitudeFor(p, "CB")).toBe("natural");
  });
  test("foot decides the side", () => {
    const fast = { ...cb, speed: 10, acceleration: 10, dribbling: 8, tackling: 5, heading: 3, strength: 3 };
    const l = mk(["Defender"], "left", fast);
    const r = mk(["Defender"], "right", fast);
    expect(["RB", "RWB"]).not.toContain(preferredRole(l));
    expect(["LB", "LWB"]).not.toContain(preferredRole(r));
  });
  test("outside the line at most training; GK only for goalkeepers", () => {
    const a = positionAptitudes(mk(["Defender"], "right", cb));
    for (const r of ["CM", "ST", "LW", "CAM"] as const) expect(["training", "unsuitable"]).toContain(a[r]);
    expect(a.GK).toBe("unsuitable");
    const g = positionAptitudes(mk(["GK"], "right", { reflex: 9, jump: 9 }));
    expect(g.GK).toBe("natural");
    expect(g.CB).toBe("unsuitable");
    expect(g.ST).toBe("unsuitable");
  });
  test("exactly one natural, deterministic, valid thresholds", () => {
    const p = mk(["Midfielder"], "left", { passing: 8, vision: 8, dribbling: 7 });
    const a = positionAptitudes(p);
    expect(Object.values(a).filter((v) => v === "natural")).toHaveLength(1);
    expect(positionAptitudes(p)).toEqual(a);
    expect(aptitudeFor(p, "XX")).toBe("natural");
  });
  test("scaleStats scales every attribute", () => {
    expect(scaleStats(mk(["Forward"], "right", { finishing: 8 }).stats, 0.5).finishing).toBe(4);
  });
});

describe("same-line neighbours", () => {
  test("a midfielder is never flagged as a misfit across CDM/CM/CAM", () => {
    const m = mk(["Midfielder"], "right");
    for (const r of ["CDM", "CM", "CAM"]) {
      expect(["natural", "apt"]).toContain(aptitudeFor(m, r));
    }
  });

  test("a centre-back at full-back is still a misfit", () => {
    const p = mk(["Defender"], "right", cb);
    expect(["training", "unsuitable"]).toContain(aptitudeFor(p, "RB"));
  });
});
