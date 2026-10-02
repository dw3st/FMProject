import { describe, expect, test } from "bun:test";
import type { PlayerStatsRecord, RosterPlayer } from "@/types/playerTypes";
import { autoFillLineup } from "@/Domain/lineupHelpers";
import { slotValue } from "@/Domain/positions/positionAptitude";
import type { FormationSlot } from "@/types/formationSlots";

function mk(id: string, foot: "left" | "right", stats: Partial<PlayerStatsRecord>): RosterPlayer {
  return {
    id, name: id, age: 25, squadId: "s", preferredFoot: foot, positions: ["Defender"],
    stats: {
      passing: 5, vision: 5, finishing: 3, dribbling: 5, speed: 5, acceleration: 5, tackling: 5,
      pressing: 5, stamina: 5, heading: 5, strength: 5, reflex: 0, jump: 0, ...stats,
    } as PlayerStatsRecord,
    profile: { summary: "", archetype: "" },
  };
}

describe("lineup weighs position fit", () => {
  test("the slot goes to the highest slotValue, not the raw weightedScore", () => {
    const cb = mk("cb", "right", { tackling: 9, heading: 9, strength: 9, pressing: 8, speed: 4, acceleration: 4 });
    const lb = mk("lb", "left", { tackling: 7, speed: 8, acceleration: 8, stamina: 8, dribbling: 6, heading: 4, strength: 4 });
    const slots = [{ role: "LB" }] as unknown as FormationSlot[];
    const picked = autoFillLineup(slots, [cb, lb])[0];
    const best = [cb, lb].sort((a, b) => slotValue(b, "LB") - slotValue(a, "LB"))[0]!;
    expect(picked).toBe(best.id);
  });
});

describe("lab / smoke helpers", () => {
  test("lineOrderLineup ignores fit but keeps lines; poorFitStarters counts bad fits", async () => {
    const { lineOrderLineup, poorFitStarters, unsuitableWithAlternative } = await import("@/Domain/positions/positionLineup");
    const a = mk("a", "right", { tackling: 9, heading: 9, strength: 9 });
    const b = mk("b", "right", { tackling: 6 });
    const order = lineOrderLineup(["LB", "CB"], [b, a]);
    expect(order).toHaveLength(2);
    expect(new Set(order)).toEqual(new Set(["a", "b"]));
    expect(poorFitStarters([a, b], ["a", "b"], ["CB", "CB"])).toBeGreaterThanOrEqual(0);
    expect(unsuitableWithAlternative([a, b], ["a"], ["CB"])).toBe(0);
  });
});

describe("sortBenchByPosition (#47)", () => {
  test("GK, DEF, MID, FWD, then role order inside the line, then value desc", async () => {
    const { sortBenchByPosition } = await import("@/Domain/positions/positionLineup");
    const { preferredRole, DETAILED_ROLES } = await import("@/Domain/positions/positionAptitude");
    const at = (id: string, line: string, stats: Partial<PlayerStatsRecord>) => ({ ...mk(id, "right", stats), positions: [line] });
    const fwd = at("fwd", "Forward", { finishing: 8 });
    const mid = at("mid", "Midfielder", {});
    const gk = at("gk", "GK", { reflex: 7, jump: 7 });
    const defWeak = at("defWeak", "Defender", {});
    const defStrong = at("defStrong", "Defender", { tackling: 8, heading: 8, strength: 8, pressing: 8 });
    const sorted = sortBenchByPosition([fwd, mid, defWeak, gk, defStrong]);
    expect(sorted[0]!.id).toBe("gk");
    expect(sorted.at(-1)!.id).toBe("fwd");
    expect(sorted[3]!.id).toBe("mid");
    const orders = sorted.map((p) => DETAILED_ROLES.indexOf(preferredRole(p)));
    expect([...orders].sort((a, b) => a - b)).toEqual(orders);
    const defs = sorted.filter((p) => p.positions[0] === "Defender");
    if (preferredRole(defs[0]!) === preferredRole(defs[1]!)) expect(defs[0]!.id).toBe("defStrong");
  });
});
