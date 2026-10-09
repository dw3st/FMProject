import { describe, expect, test } from "bun:test";
import { noMinutes, pickYouthLineup, youthFillers, type YouthLineupInput } from "@/Domain/youthComps/youthLineup";
import { lineAverage } from "@/Domain/youth/youth";
import { YOUTH } from "@/Domain/youth/youthConfig";
import { getMainRole } from "@/Domain/roles";
import { preferredRole } from "@/Domain/positions/positionAptitude";
import { overallAvg } from "@/Domain/playerRating";
import { emptySeasonLog, type RosterPlayer, type Squad } from "@/types/playerTypes";

function mk(id: string, pos: string, age: number, apps = 0, level = 5): RosterPlayer {
  const v = level;
  return {
    id, name: `Player ${id} Silva`, age, squadId: "s1", preferredFoot: "right", positions: [pos],
    stats: {
      passing: v, vision: v, finishing: v, dribbling: v, speed: v, acceleration: v, tackling: v,
      pressing: v, stamina: v, heading: v, strength: v, reflex: pos === "GK" ? v : 0, jump: pos === "GK" ? v : 0,
    },
    profile: { summary: "", archetype: "" },
    seasonLog: { ...emptySeasonLog(), appearances: apps, fitness: 90 },
  };
}

/** 11 senior starters (age 27) + listed extras. */
function squad(players: RosterPlayer[], youth: RosterPlayer[] = []): Squad {
  const xi = [
    mk("x_gk", "GK", 27, 20), mk("x_cb1", "CB", 27, 20), mk("x_cb2", "CB", 27, 20), mk("x_lb", "LB", 27, 20),
    mk("x_rb", "RB", 27, 20), mk("x_cm1", "CM", 27, 20), mk("x_cm2", "CM", 27, 20), mk("x_cm3", "CM", 27, 20),
    mk("x_st", "ST", 27, 20), mk("x_lw", "LW", 27, 20), mk("x_rw", "RW", 27, 20),
  ];
  return {
    id: "s1", name: "S", colors: ["#000", "#fff"], money: 0, country: "England",
    players: [...xi, ...players], youth,
    finances: { broadcasting: 50e6, commercial: 50e6, total: 100e6, budget: 0, followers: 1e6 },
  } as Squad;
}

const XI = new Set(["x_gk", "x_cb1", "x_cb2", "x_lb", "x_rb", "x_cm1", "x_cm2", "x_cm3", "x_st", "x_lw", "x_rw"]);
const base = (s: Squad, extra: Partial<YouthLineupInput> = {}): YouthLineupInput => ({
  age: "u19", squad: s, firstTeamXI: XI, callUps: [], playedToday: new Set(), date: "2026-09-01",
  filler: { saveId: "save", slug: "u19_england", year: 2026 }, nationality: "England", ...extra,
});
const lineOf = (p: RosterPlayer) => getMainRole(preferredRole(p));
const real = (out: ReturnType<typeof pickYouthLineup>) => out.matchPlayers.filter((p) => !out.generatedIds.has(p.id)).map((p) => p.id);

describe("pickYouthLineup", () => {
  test("first-team XI never plays unless called up; always 4-3-3 lines and 11 slots", () => {
    const out = pickYouthLineup(base(squad([])));
    expect(real(out)).toEqual([]);
    expect(out.lineup.length).toBe(11);
    expect(out.lineup.every((id) => id !== "")).toBe(true);
    const lines = out.matchPlayers.map(lineOf);
    expect(lines.filter((l) => l === "GK").length).toBe(1);
    expect(lines.filter((l) => l === "Defender").length).toBe(4);
    expect(lines.filter((l) => l === "Midfielder").length).toBe(3);
    expect(lines.filter((l) => l === "Forward").length).toBe(3);
    const called = pickYouthLineup(base(squad([]), { age: "u21", callUps: ["x_st"] }));
    expect(real(called)).toEqual(["x_st"]);
  });

  test("under-19 priority: call-ups, academy, squad ≤ 19, generated; never over 19", () => {
    const s = squad(
      [mk("sq18", "ST", 18), mk("sq20", "ST", 20), mk("sq19cb", "CB", 19)],
      [mk("y17", "ST", 17), mk("y16", "ST", 16), mk("y18cb", "CB", 18)],
    );
    const out = pickYouthLineup(base(s, { callUps: ["sq20", "sq18"] }));
    const ids = real(out);
    expect(ids).toContain("sq18");
    expect(ids).toContain("y17");
    expect(ids).toContain("y16");
    expect(ids).toContain("y18cb");
    expect(ids).toContain("sq19cb");
    expect(ids).not.toContain("sq20");
    expect(out.skippedCallUps).toEqual(["sq20"]);
    expect(out.matchPlayers.every((p) => p.age <= 19)).toBe(true);
  });

  test("under-19: academy before the squad, extra call-ups of a full line are skipped", () => {
    const s = squad(
      [mk("sq18a", "ST", 18), mk("sq18b", "ST", 18)],
      [mk("y1", "ST", 17), mk("y2", "ST", 17), mk("y3", "ST", 17)],
    );
    expect(real(pickYouthLineup(base(s))).sort()).toEqual(["y1", "y2", "y3"]);
    const s2 = squad([], [mk("y1", "ST", 17), mk("y2", "ST", 17), mk("y3", "ST", 17), mk("y4", "ST", 17)]);
    const out = pickYouthLineup(base(s2, { callUps: ["y1", "y2", "y3", "y4"] }));
    expect(out.skippedCallUps.length).toBe(1);
  });

  test("under-21 priority: squad ≤ 21, academy 20-21, academy ≤ 19 not played today, overage without minutes", () => {
    const s = squad(
      [mk("sq21", "ST", 21), mk("old_nomin", "CB", 25, 0), mk("old_min", "CB", 25, 15)],
      [mk("y20", "ST", 20), mk("y17", "ST", 17), mk("y17b", "ST", 17)],
    );
    const out = pickYouthLineup(base(s, { age: "u21", playedToday: new Set(["y17b"]) }));
    const ids = real(out);
    expect(ids).toContain("sq21");
    expect(ids).toContain("y20");
    expect(ids).toContain("y17");
    expect(ids).not.toContain("y17b");
    expect(ids).toContain("old_nomin");
    expect(ids).not.toContain("old_min");
  });

  test("at most 5 overage players", () => {
    const olds = ["CB", "CB", "LB", "RB", "CM", "CM", "ST", "ST"].map((pos, i) => mk(`old${i}`, pos, 26, 0));
    const out = pickYouthLineup(base(squad(olds), { age: "u21" }));
    expect(real(out).length).toBe(5);
  });

  test("unavailable, played today and tired players are out; a tired call-up still plays", () => {
    const tired = mk("tired", "ST", 18);
    tired.seasonLog = { ...tired.seasonLog!, fitness: 50 };
    const injured = mk("inj", "ST", 18);
    injured.injury = { severity: "light", returnDate: "2026-09-10" };
    const suspended = mk("susp", "ST", 18);
    suspended.suspension = { matches: 1 };
    const played = mk("played", "ST", 18);
    const s = squad([tired, injured, suspended, played]);
    const out = pickYouthLineup(base(s, { playedToday: new Set(["played"]) }));
    expect(real(out)).toEqual([]);
    const called = pickYouthLineup(base(s, { callUps: ["tired", "inj", "played"], playedToday: new Set(["played"]) }));
    expect(real(called)).toEqual(["tired"]);
    expect(called.skippedCallUps.sort()).toEqual(["inj", "played"]);
  });

  test("within a group: fewer appearances first", () => {
    const s = squad([], [mk("a", "ST", 17, 5), mk("b", "ST", 17, 0), mk("c", "ST", 17, 2), mk("d", "ST", 17, 9)]);
    expect(real(pickYouthLineup(base(s))).sort()).toEqual(["a", "b", "c"]);
  });
});

describe("noMinutes", () => {
  test("share of the most used appearances", () => {
    expect(noMinutes(mk("r", "CB", 25, 8), 20)).toBe(true);
    expect(noMinutes(mk("r", "CB", 25, 9), 20)).toBe(false);
    expect(noMinutes(mk("r", "CB", 25, 0), 0)).toBe(true);
  });
});

describe("youthFillers", () => {
  const s = squad([]);
  const filler = { saveId: "save", slug: "u21_england", year: 2026 };
  test("deterministic, ids, age range and level", () => {
    const a = youthFillers(filler, s, "u21", "Defender", 2, "England");
    const b = youthFillers(filler, s, "u21", "Defender", 2, "England");
    expect(a).toEqual(b);
    expect(a.map((p) => p.id)).toEqual(["ygen_s1_u21_england_2026_DEF_0", "ygen_s1_u21_england_2026_DEF_1"]);
    for (const p of a) {
      expect(p.age).toBeGreaterThanOrEqual(17);
      expect(p.age).toBeLessThanOrEqual(21);
      expect(getMainRole(p.positions[0]!)).toBe("Defender");
      expect(Math.abs(overallAvg(p) - (lineAverage(s, "Defender") - YOUTH.LEVEL_OFFSET))).toBeLessThan(2);
      expect(p.nationality).toBe("England");
    }
    const u19 = youthFillers({ ...filler, slug: "u19_england" }, s, "u19", "GK", 2, "England");
    for (const p of u19) expect(p.age).toBeLessThanOrEqual(19);
  });
  test("a round needing one uses the first of the pool", () => {
    const one = youthFillers(filler, s, "u21", "Defender", 1, "England");
    const two = youthFillers(filler, s, "u21", "Defender", 2, "England");
    expect(one[0]).toEqual(two[0]!);
  });
});
