import { describe, expect, test } from "bun:test";
import type { DetailedRole, PlayerStatsRecord, RosterPlayer } from "@/types/playerTypes";
import { depthStatus, depthTarget, squadDepth } from "@/Domain/squad/depth";

const BASE: PlayerStatsRecord = {
  passing: 5, vision: 5, finishing: 5, dribbling: 5, speed: 5, acceleration: 5, tackling: 5,
  pressing: 5, stamina: 5, heading: 5, strength: 5, reflex: 0, jump: 0,
} as PlayerStatsRecord;

let seq = 0;
function mk(line: string, natural: DetailedRole, over: Partial<RosterPlayer> = {}, stats: Partial<PlayerStatsRecord> = {}): RosterPlayer {
  seq++;
  return {
    id: `p${seq}`, name: `P${seq}`, age: 25, squadId: "s", preferredFoot: "right", positions: [line],
    naturalPosition: natural,
    stats: { ...BASE, ...stats } as PlayerStatsRecord,
    profile: {} as RosterPlayer["profile"],
    ...over,
  };
}

const gk = (over: Partial<RosterPlayer> = {}) => mk("GK", "GK", over, { reflex: 7, jump: 7 });
const F433 = ["GK", "LB", "CB", "CB", "RB", "CM", "CDM", "CM", "LW", "ST", "RW"];
const DATE = "2027-03-01";

describe("depth target and status", () => {
  test("one backup per slot, at most two", () => {
    expect(depthTarget(1)).toBe(2);
    expect(depthTarget(2)).toBe(4);
    expect(depthTarget(3)).toBe(5);
    expect(depthTarget(0)).toBe(0);
  });
  test("ok / thin / short / unused", () => {
    expect(depthStatus(2, 1)).toBe("ok");
    expect(depthStatus(1, 1)).toBe("thin");
    expect(depthStatus(0.5, 1)).toBe("short");
    expect(depthStatus(3, 0)).toBe("unused");
  });
});

describe("squadDepth", () => {
  test("goalkeepers: two is enough, one is thin, none is short", () => {
    expect(squadDepth([gk(), gk()], DATE, F433).groups.gk.status).toBe("ok");
    expect(squadDepth([gk()], DATE, F433).groups.gk.status).toBe("thin");
    expect(squadDepth([], DATE, F433).groups.gk.status).toBe("short");
  });

  test("naturals first, then adapted, each by value", () => {
    const strong = mk("Midfielder", "CDM", {}, { passing: 8, vision: 8, tackling: 8, pressing: 8 });
    const cm = mk("Midfielder", "CM");
    const d = squadDepth([cm, strong], DATE, F433);
    const cdm = d.cells.CDM.players;
    expect(cdm[0]!.id).toBe(strong.id);
    expect(cdm[0]!.natural).toBe(true);
    expect(cdm.at(-1)!.natural).toBe(false);
    expect(d.cells.CDM.naturals).toBe(1);
  });

  test("adapted players count half, once per group", () => {
    // Uniform midfielders adapt to every midfield role: one natural CM + one natural LM.
    const d = squadDepth([mk("Midfielder", "CM"), mk("Midfielder", "LM")], DATE, F433);
    // central mid: CM natural (1) + LM adapted (0.5).
    expect(d.groups.centralMid.supply).toBe(1.5);
    expect(d.groups.centralMid.slots).toBe(3);
    expect(d.groups.centralMid.status).toBe("short");
  });

  test("a long injury does not count, a short one and a ban do", () => {
    const longOut = gk({ injury: { severity: "severe", returnDate: "2027-05-01" } });
    const shortOut = gk({ injury: { severity: "light", returnDate: "2027-03-04" } });
    const banned = gk({ suspension: { matches: 1 } });
    const d = squadDepth([longOut, shortOut, banned], DATE, F433);
    expect(d.groups.gk.supply).toBe(2);
    const byId = new Map(d.cells.GK.players.map((p) => [p.id, p]));
    expect(byId.get(longOut.id)!.longInjury).toBe(true);
    expect(byId.get(shortOut.id)!.unavailable).toBe("injured");
    expect(byId.get(shortOut.id)!.daysOut).toBe(3);
    expect(byId.get(banned.id)!.unavailable).toBe("suspended");
  });

  test("a position the formation does not use and nobody plays is hidden", () => {
    const d = squadDepth([gk()], DATE, F433);
    expect(d.cells.LWB.inFormation).toBe(false);
    expect(d.cells.LWB.hidden).toBe(true);
    expect(d.cells.LB.hidden).toBe(false);
    expect(d.groups.leftWide.slots).toBe(1);
    expect(squadDepth([gk()], DATE, ["GK", "CB", "CB", "LB", "RB", "CDM", "CM", "CM", "CAM", "ST", "ST"]).groups.leftWide.status).toBe("unused");
  });
});
