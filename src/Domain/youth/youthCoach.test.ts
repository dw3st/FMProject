import { describe, expect, test } from "bun:test";
import {
  YOUTH_COACH, coachCallUps, coachFocus, coachIntensity, coachTrainingPlan, managerSavesPlan, youthCoachOnDuty,
} from "@/Domain/youth/youthCoach";
import { makeProfessional } from "@/Domain/staff/staff";
import { advanceCallUps, type YouthCallUp } from "@/Domain/youthComps/callUps";
import { YOUTH_COMP } from "@/Domain/youthComps/youthCompConfig";
import { emptySeasonLog, type RosterPlayer, type Squad } from "@/types/playerTypes";
import type { YouthTrainingPlan } from "@/types/youthTrainingTypes";

const DATE = "2027-03-10";

function mk(
  id: string, age: number,
  o: { apps?: number; fitness?: number; stats?: Partial<RosterPlayer["stats"]> } & Omit<Partial<RosterPlayer>, "stats"> = {},
): RosterPlayer {
  const { apps = 0, fitness = 90, stats, ...rest } = o;
  const v = 5;
  return {
    id, name: `P ${id}`, age, squadId: "s1", preferredFoot: "right", positions: ["Midfielder"], naturalPosition: "CM",
    stats: {
      passing: v, vision: v, finishing: v, dribbling: v, speed: v, acceleration: v, tackling: v,
      pressing: v, stamina: v, heading: v, strength: v, reflex: 0, jump: 0, ...stats,
    },
    profile: { summary: "", archetype: "" },
    seasonLog: { ...emptySeasonLog(), appearances: apps, fitness },
    ...rest,
  } as RosterPlayer;
}

const squadOf = (players: RosterPlayer[], youth: RosterPlayer[] = [], extra: Partial<Squad> = {}): Squad => ({
  id: "s1", name: "S", colors: ["#000", "#fff"], money: 0, players, youth, ...extra,
} as Squad);

describe("youthCoachOnDuty", () => {
  const coach = makeProfessional("yc", "youthCoach", 3);
  test("needs a youth coach hired and not on a course", () => {
    expect(youthCoachOnDuty(squadOf([]))).toBe(false);
    expect(youthCoachOnDuty(squadOf([], [], { staff: { members: [] } }))).toBe(false);
    expect(youthCoachOnDuty(squadOf([], [], { staff: { members: [coach] } }))).toBe(true);
    const away = { ...coach, course: { started: DATE, until: "2027-05-10", specialty: "youth" as const } };
    expect(youthCoachOnDuty(squadOf([], [], { staff: { members: [away] } }))).toBe(false);
  });
});

describe("coachCallUps", () => {
  const starter = mk("starter", 20, { apps: 20 });
  const regular = mk("regular", 21, { apps: 12 });
  const low = mk("low", 20, { apps: 3 });
  const lower = mk("lower", 18, { apps: 1 });
  const old = mk("old", 24, { apps: 0 });
  const tired = mk("tired", 19, { apps: 0, fitness: 60 });
  const hurt = mk("hurt", 19, { apps: 0, injury: { severity: "light", returnDate: "2027-04-01" } });
  const inXi = mk("inxi", 19, { apps: 2 });
  const kid = mk("kid", 17);
  const squad = squadOf([starter, regular, low, lower, old, tired, hurt, inXi], [kid]);
  const xi = new Set(["starter", "inxi"]);

  test("squad youngsters short of minutes, fewest appearances first, flagged and for the next game", () => {
    const list = coachCallUps({ squad, age: "u21", current: undefined, firstTeamXI: xi, date: DATE });
    expect(list.map((c) => c.id)).toEqual(["lower", "low"]);
    expect(list.every((c) => c.byCoach === true && c.duration === "next" && c.left === 1)).toBe(true);
  });
  test("the under-19 only takes players up to 19", () => {
    const list = coachCallUps({ squad, age: "u19", current: undefined, firstTeamXI: xi, date: DATE });
    expect(list.map((c) => c.id)).toEqual(["lower"]);
  });
  test("never the academy, the XI, the unavailable, the tired or who played half the games", () => {
    const ids = coachCallUps({ squad, age: "u21", current: undefined, firstTeamXI: xi, date: DATE }).map((c) => c.id);
    for (const id of ["kid", "starter", "inxi", "hurt", "tired", "regular", "old"]) expect(ids).not.toContain(id);
    // Exactly half of the most used player's games is not "short of minutes".
    const half = squadOf([starter, mk("half", 20, { apps: 10 })]);
    expect(coachCallUps({ squad: half, age: "u21", current: undefined, firstTeamXI: xi, date: DATE })).toEqual([]);
  });
  test("before anybody played, every youngster outside the XI qualifies", () => {
    const fresh = squadOf([mk("a", 20), mk("b", 19), mk("c", 30)]);
    const list = coachCallUps({ squad: fresh, age: "u21", current: undefined, firstTeamXI: new Set(["a"]), date: DATE });
    expect(list.map((c) => c.id)).toEqual(["b"]);
  });
  test("the manager's entries stay as they are; his own are rebuilt; no duplicates", () => {
    const mine: YouthCallUp = { id: "low", duration: "games3", left: 2 };
    const stale: YouthCallUp = { id: "starter", duration: "next", left: 1, byCoach: true };
    const list = coachCallUps({ squad, age: "u21", current: [mine, stale], firstTeamXI: xi, date: DATE });
    expect(list[0]).toBe(mine);
    expect(list.map((c) => c.id)).toEqual(["low", "lower"]);
    expect(list[1]!.byCoach).toBe(true);
  });
  test("at most 6 of his own and never past the cap of the age", () => {
    const many = squadOf([mk("s", 25, { apps: 20 }), ...Array.from({ length: 10 }, (_, i) => mk(`y${i}`, 19, { apps: i % 3 }))]);
    const list = coachCallUps({ squad: many, age: "u21", current: undefined, firstTeamXI: new Set(), date: DATE });
    expect(list).toHaveLength(YOUTH_COACH.MAX_CALL_UPS);
    const manager: YouthCallUp[] = Array.from({ length: 9 }, (_, i) => ({ id: `m${i}`, duration: "indefinite" as const }));
    const capped = coachCallUps({ squad: many, age: "u21", current: manager, firstTeamXI: new Set(), date: DATE });
    expect(capped).toHaveLength(YOUTH_COMP.MAX_CALL_UPS);
    expect(capped.slice(0, 9)).toEqual(manager);
    const full: YouthCallUp[] = Array.from({ length: 11 }, (_, i) => ({ id: `m${i}`, duration: "indefinite" as const }));
    expect(coachCallUps({ squad: many, age: "u21", current: full, firstTeamXI: new Set(), date: DATE })).toEqual(full);
  });
  test("who is called up for the other age today is left out", () => {
    const list = coachCallUps({ squad, age: "u21", current: undefined, firstTeamXI: xi, date: DATE, exclude: new Set(["lower"]) });
    expect(list.map((c) => c.id)).toEqual(["low"]);
  });
  test("the game uses his call-ups up like any one-game call-up", () => {
    const list = coachCallUps({ squad, age: "u21", current: [{ id: "regular", duration: "indefinite" }], firstTeamXI: xi, date: DATE });
    const after = advanceCallUps(list, new Map([["low", 7]]), new Set(squad.players.map((p) => p.id)));
    expect(after).toEqual([{ id: "regular", duration: "indefinite" }]);
  });
});

describe("coach training plan", () => {
  test("intensity by the academy's mean fitness", () => {
    expect(coachIntensity([mk("a", 17, { fitness: 90 }), mk("b", 17, { fitness: 70 })])).toBe("heavy");
    expect(coachIntensity([mk("a", 17, { fitness: 70 }), mk("b", 17, { fitness: 62 })])).toBe("normal");
    expect(coachIntensity([mk("a", 17, { fitness: 50 })])).toBe("light");
    expect(coachIntensity([])).toBe("normal");
  });
  test("focus: the weakest area among those that matter for the position", () => {
    // CM: passing 0.35, technical 0.25, defending 0.15, physical 0.15 matter; shooting and set pieces do not.
    expect(coachFocus(mk("a", 17, { stats: { dribbling: 2 } }))).toBe("technical");
    expect(coachFocus(mk("b", 17, { stats: { tackling: 1, pressing: 2 } }))).toBe("defending");
    expect(coachFocus(mk("c", 17, { stats: { finishing: 0, heading: 0 } }))).toBe("passing"); // all level: the heaviest
  });
  test("first plan: his intensity and a focus per youngster, all marked", () => {
    const squad = squadOf([], [mk("a", 17, { fitness: 90, stats: { dribbling: 2 } }), mk("b", 17, { fitness: 90, stats: { passing: 1, vision: 1 } })]);
    const plan = coachTrainingPlan(squad);
    expect(plan).toEqual({
      intensity: "heavy", intensityByCoach: true, focus: "balanced",
      players: { a: { focus: "technical", byCoach: true }, b: { focus: "passing", byCoach: true } },
    });
    // Nothing new the Monday after: the very same plan object comes back.
    const again = { ...squad, youthTraining: plan };
    expect(coachTrainingPlan(again)).toBe(plan);
  });
  test("never touches what the manager set by hand", () => {
    const current: YouthTrainingPlan = {
      intensity: "light", focus: "physical",
      players: { a: { focus: "shooting" }, b: { position: "ST" }, c: { focus: "physical", byCoach: true }, gone: { focus: "passing", byCoach: true }, left: { focus: "passing" } },
    };
    const youth = [mk("a", 17), mk("b", 17), mk("c", 17, { stats: { dribbling: 1 } }), mk("d", 17, { stats: { tackling: 1, pressing: 1 } })];
    const plan = coachTrainingPlan(squadOf([], youth, { youthTraining: current }));
    expect(plan.intensity).toBe("light");
    expect(plan.intensityByCoach).toBeUndefined();
    expect(plan.focus).toBe("physical");
    expect(plan.players).toEqual({
      a: { focus: "shooting" }, b: { position: "ST" }, left: { focus: "passing" },
      c: { focus: "technical", byCoach: true }, d: { focus: "defending", byCoach: true },
    });
  });
  test("his own intensity follows the fitness week after week", () => {
    const current: YouthTrainingPlan = { intensity: "heavy", intensityByCoach: true, focus: "balanced" };
    const plan = coachTrainingPlan(squadOf([], [mk("a", 17, { fitness: 50 })], { youthTraining: current }));
    expect(plan.intensity).toBe("light");
    expect(plan.intensityByCoach).toBe(true);
  });
});

describe("managerSavesPlan", () => {
  const stored: YouthTrainingPlan = {
    intensity: "heavy", intensityByCoach: true, focus: "balanced",
    players: { a: { focus: "technical", byCoach: true }, b: { focus: "passing", byCoach: true }, c: { focus: "shooting" } },
  };
  test("what he left untouched keeps the coach's mark", () => {
    const sent: YouthTrainingPlan = {
      intensity: "heavy", focus: "physical",
      players: { a: { focus: "technical" }, b: { focus: "passing" }, c: { focus: "shooting" } },
    };
    expect(managerSavesPlan(stored, sent)).toEqual({ ...stored, focus: "physical" });
  });
  test("what he changed is his", () => {
    const sent: YouthTrainingPlan = {
      intensity: "normal", focus: "balanced",
      players: { a: { focus: "defending" }, b: { focus: "passing", position: "ST" }, c: { focus: "shooting" }, d: { focus: "physical" } },
    };
    expect(managerSavesPlan(stored, sent)).toEqual({
      intensity: "normal", focus: "balanced",
      players: { a: { focus: "defending" }, b: { focus: "passing", position: "ST" }, c: { focus: "shooting" }, d: { focus: "physical" } },
    });
  });
  test("a mark sent by the client is never trusted", () => {
    const sent = { intensity: "light", focus: "balanced", intensityByCoach: true, players: { z: { focus: "passing", byCoach: true } } } as YouthTrainingPlan;
    expect(managerSavesPlan(undefined, sent)).toEqual({ intensity: "light", focus: "balanced", players: { z: { focus: "passing" } } });
  });
});
