import { describe, expect, test } from "bun:test";
import {
  aiStudyPlan, analystStudyMult, appendTacticLog, clubStudyMult, counterStyle, expectedPlan, gameScore, matchSetupStudy,
  pickMarkTarget, pickMarkerSlot, predictability, rawRead, studyLevelOf, studyRead, tacticLogEntry,
} from "@/Domain/study/study";
import { STUDY } from "@/Domain/study/studyConfig";
import { axesFor, type TacticalStyle } from "@/types/tacticsTypes";
import { emptySeasonLog, type FinancialTier, type RosterPlayer, type Squad } from "@/types/playerTypes";
import type { StaffMember } from "@/types/staffTypes";
import type { TacticLogEntry } from "@/types/studyTypes";

const game = (n: number, formation = "4-3-3", style: TacticalStyle = "high_press", axes = axesFor(style)): TacticLogEntry => ({
  date: `2027-03-${String(n).padStart(2, "0")}`, fixtureId: `f${n}`, formation, style, axes,
});
const same = (count: number) => Array.from({ length: count }, (_, i) => game(i + 1));

const ROLES_433 = ["GK", "LB", "CB", "CB", "RB", "CM", "CM", "CAM", "LW", "ST", "RW"];

function player(id: string, role: string, over: Partial<RosterPlayer["stats"]> = {}): RosterPlayer {
  return {
    id, name: `Name ${id}`, age: 25, squadId: "s", preferredFoot: "right", positions: [role],
    stats: {
      passing: 5, vision: 5, finishing: 5, dribbling: 5, speed: 5, acceleration: 5,
      tackling: 5, pressing: 5, stamina: 7, heading: 5, strength: 5, reflex: 5, jump: 5, ...over,
    },
    profile: { summary: "", archetype: "" },
    seasonLog: emptySeasonLog(),
  };
}

function squad(id: string, extra: Partial<Squad> = {}): Squad {
  return {
    id, name: id, colors: ["#000", "#fff"], money: 0,
    players: ROLES_433.map((role, i) => player(`${id}-${i}`, role)),
    ...extra,
  };
}

const aiOf = (tier: FinancialTier) => squad("ai", { financialTier: tier, finances: {} as Squad["finances"] });

/** An analyst whose every attribute is `v` (score `v`: 1 = 1 star, 10.5 = 3, 20 = 5). */
const analyst = (v: number): StaffMember => ({
  id: "an", name: "An", nationality: "England", role: "analyst", age: 40,
  attributes: { determination: v, discipline: v, adaptability: v, playerReading: v, knowledge: { analysis: v } },
});
const humanWith = (members: StaffMember[]) => squad("me", { staff: { members } });

const xi = (s: Squad, roles = ROLES_433) => ({ roles, lineup: s.players.map((p) => p.id) });

describe("tactic log", () => {
  test("an entry keeps the formation, the style and the effective axes", () => {
    const e = tacticLogEntry({ formation: "custom", tactical_style: "possession", axesOverride: { width: "wide" } }, "2027-03-01", "f1");
    expect(e).toEqual({
      date: "2027-03-01", fixtureId: "f1", formation: "custom", style: "possession",
      axes: { ...axesFor("possession"), width: "wide" },
    });
  });

  test("a game enters once and the log keeps the last five", () => {
    let log: TacticLogEntry[] | undefined;
    for (let i = 1; i <= 7; i++) log = appendTacticLog(log, game(i));
    expect(log!.map((e) => e.fixtureId)).toEqual(["f3", "f4", "f5", "f6", "f7"]);
    expect(appendTacticLog(log, game(7))).toEqual(log!);
    expect(STUDY.GAMES).toBe(5);
  });
});

describe("read", () => {
  test("expected plan is the mode; a tie goes to the most recent", () => {
    const log = [game(1, "4-4-2", "possession"), game(2, "4-3-3", "high_press"), game(3, "4-4-2", "high_press"), game(4, "4-3-3", "possession")];
    const e = expectedPlan(log)!;
    expect(e.formation).toBe("4-3-3");
    expect(e.style).toBe("possession");
    expect(expectedPlan([game(1, "4-4-2"), game(2, "4-4-2"), game(3, "4-3-3")])!.formation).toBe("4-4-2");
    expect(expectedPlan([])).toBeNull();
    expect(expectedPlan(undefined)).toBeNull();
  });

  test("the axes count together", () => {
    const wide = { ...axesFor("high_press"), width: "wide" as const };
    const e = expectedPlan([game(1), game(2, "4-3-3", "high_press", wide), game(3, "4-3-3", "high_press", wide)])!;
    expect(e.axes).toEqual(wide);
  });

  test("score of a game", () => {
    const e = expectedPlan(same(3))!;
    expect(gameScore(game(9), e)).toBe(1);
    expect(gameScore(game(9, "4-4-2"), e)).toBe(0.5);
    expect(gameScore(game(9, "4-3-3", "possession", axesFor("high_press")), e)).toBe(0.5);
    expect(gameScore(game(9, "4-3-3", "high_press", { ...axesFor("high_press"), width: "wide" }), e)).toBe(0.75);
    expect(gameScore(game(9, "4-4-2", "possession"), e)).toBe(0);
  });

  test("a missing game scores zero: under three games never reaches the plan", () => {
    expect(rawRead(same(1))).toBeCloseTo(0.2);
    expect(rawRead(same(2))).toBeCloseTo(0.4);
    expect(rawRead(same(3))).toBeCloseTo(0.6);
    expect(rawRead(same(5))).toBe(1);
    // Best case: an ELITE club and a 1-star analyst.
    expect(studyLevelOf(studyRead(same(2), aiOf("ELITE"), humanWith([analyst(1)])))).toBe("none");
    expect(studyLevelOf(studyRead(same(3), aiOf("HIGH"), humanWith([analyst(10.5)])))).toBe("medium");
  });

  test("changing the plan every game is never read", () => {
    const log = [game(1, "4-3-3", "possession"), game(2, "4-4-2", "high_press"), game(3, "3-5-2", "balanced"), game(4, "4-2-3-1", "direct_play"), game(5, "5-3-2", "counter_attack")];
    expect(rawRead(log)).toBeLessThan(STUDY.MEDIUM);
  });

  test("club tier", () => {
    expect(clubStudyMult(aiOf("LOW"))).toBe(0.8);
    expect(clubStudyMult(aiOf("MEDIUM"))).toBe(0.9);
    expect(clubStudyMult(aiOf("HIGH"))).toBe(1);
    expect(clubStudyMult(aiOf("ELITE"))).toBe(1.1);
    expect(clubStudyMult(squad("lab"))).toBe(1);
  });

  test("analyst: 1 star 1.15, 3 stars 1, 5 stars 0.8, vacant = 2 stars", () => {
    expect(analystStudyMult(humanWith([analyst(1)]))).toBeCloseTo(1.15);
    expect(analystStudyMult(humanWith([analyst(10.5)]))).toBeCloseTo(1);
    expect(analystStudyMult(humanWith([analyst(20)]))).toBeCloseTo(0.8);
    expect(analystStudyMult(humanWith([]))).toBeCloseTo(1.075);
  });

  test("levels", () => {
    expect(studyLevelOf(0.59)).toBe("none");
    expect(studyLevelOf(0.6)).toBe("medium");
    expect(studyLevelOf(0.84)).toBe("medium");
    expect(studyLevelOf(0.85)).toBe("high");
    expect(studyLevelOf(1)).toBe("high");
  });

  test("the read is clamped and a great analyst lowers the level", () => {
    expect(studyRead(same(5), aiOf("ELITE"), humanWith([analyst(1)]))).toBe(1);
    // 5 equal games, HIGH club: high with an average analyst, medium with a 5-star one.
    expect(studyLevelOf(studyRead(same(5), aiOf("HIGH"), humanWith([analyst(10.5)])))).toBe("high");
    expect(studyLevelOf(studyRead(same(5), aiOf("HIGH"), humanWith([analyst(20)])))).toBe("medium");
    // 4 equal games (0.8): a LOW club (0.64) reads medium, an ELITE one (0.88) high.
    expect(studyLevelOf(studyRead(same(4), aiOf("LOW"), humanWith([analyst(10.5)])))).toBe("medium");
    expect(studyLevelOf(studyRead(same(4), aiOf("ELITE"), humanWith([analyst(10.5)])))).toBe("high");
  });

  test("predictability (Formation screen) ignores the club tier", () => {
    expect(predictability(undefined, humanWith([analyst(10.5)]))).toBe("low");
    expect(predictability(same(3), humanWith([analyst(10.5)]))).toBe("medium");
    expect(predictability(same(5), humanWith([analyst(10.5)]))).toBe("high");
    expect(predictability(same(5), humanWith([analyst(20)]))).toBe("medium");
  });
});

describe("what the AI does", () => {
  test("counter table", () => {
    expect(STUDY.COUNTER).toEqual({
      balanced: "balanced",
      possession: "balanced",
      high_press: "counter_attack",
      counter_attack: "possession",
      direct_play: "possession",
    });
    expect(counterStyle("high_press")).toBe("counter_attack");
  });

  test("marker: the central midfielder of best tackling, else the centre-back of best tackling", () => {
    const s = squad("ai");
    s.players[6] = player("ai-6", "CM", { tackling: 8 });
    expect(pickMarkerSlot({ ...xi(s), players: s.players })).toBe(6);
    // A CDM counts like a CM.
    const roles = ["GK", "LB", "CB", "CB", "RB", "CDM", "CAM", "CAM", "LW", "ST", "RW"];
    expect(pickMarkerSlot({ roles, lineup: s.players.map((p) => p.id), players: s.players })).toBe(5);
    // No central midfielder: the centre-back.
    const noMid = ["GK", "LB", "CB", "CB", "RB", "LM", "RM", "CAM", "LW", "ST", "RW"];
    s.players[3] = player("ai-3", "CB", { tackling: 9 });
    expect(pickMarkerSlot({ roles: noMid, lineup: s.players.map((p) => p.id), players: s.players })).toBe(3);
    expect(pickMarkerSlot({ roles: ["GK", "ST"], lineup: ["ai-0", "ai-9"], players: s.players })).toBeNull();
  });

  test("target: the best rated in a forward slot, else the best outfield player", () => {
    const s = squad("me");
    s.players[10] = player("me-10", "RW", { finishing: 9, dribbling: 9, speed: 9, acceleration: 9 });
    s.players[5] = player("me-5", "CM", { passing: 10, vision: 10, tackling: 10, pressing: 10, dribbling: 10 });
    expect(pickMarkTarget({ ...xi(s), players: s.players })).toEqual({ rosterId: "me-10", name: "Name me-10" });
    const noForward = ["GK", "LB", "CB", "CB", "RB", "CM", "CM", "CAM", "LM", "CM", "RM"];
    expect(pickMarkTarget({ roles: noForward, lineup: s.players.map((p) => p.id), players: s.players })?.rosterId).toBe("me-5");
    expect(pickMarkTarget({ roles: ["GK"], lineup: ["me-0"], players: s.players })).toBeNull();
  });

  test("plan: none below the threshold, style at medium, style and marking at high", () => {
    const ai = aiOf("HIGH");
    const me = humanWith([analyst(10.5)]);
    const input = { aiSquad: ai, humanSquad: me, ai: xi(ai), human: xi(me) };
    expect(aiStudyPlan({ ...input, log: same(2) })).toBeNull();
    expect(aiStudyPlan({ ...input, log: undefined })).toBeNull();

    const medium = aiStudyPlan({ ...input, log: same(3) })!;
    expect(medium.level).toBe("medium");
    expect(medium.style).toBe("counter_attack");
    expect(medium.expected).toEqual({ formation: "4-3-3", style: "high_press" });
    expect(medium.mark).toBeUndefined();

    const high = aiStudyPlan({ ...input, log: same(5) })!;
    expect(high.level).toBe("high");
    expect(high.mark?.slot).toBe(5);
    expect(me.players.some((p) => p.id === high.mark?.targetRosterId)).toBe(true);
    expect(["LW", "ST", "RW"]).toContain(ROLES_433[me.players.findIndex((p) => p.id === high.mark!.targetRosterId)]!);
  });

  test("no swap for balanced and possession: the plan keeps the AI balanced", () => {
    const ai = aiOf("HIGH");
    const me = humanWith([analyst(10.5)]);
    const log = Array.from({ length: 5 }, (_, i) => game(i + 1, "4-3-3", "possession"));
    expect(aiStudyPlan({ log, aiSquad: ai, humanSquad: me, ai: xi(ai), human: xi(me) })!.style).toBe("balanced");
  });

  test("the analyst's hint needs 4 stars", () => {
    const ai = aiOf("ELITE");
    const plan = (me: Squad) => aiStudyPlan({ log: same(5), aiSquad: ai, humanSquad: me, ai: xi(ai), human: xi(me) })!;
    const good = humanWith([analyst(16)]);
    const average = humanWith([analyst(10.5)]);
    expect(matchSetupStudy(plan(good), good).analystHint).toBe(true);
    expect(matchSetupStudy(plan(average), average).analystHint).toBe(false);
  });

  test("deterministic: the same input gives the same plan", () => {
    const ai = aiOf("ELITE");
    const me = humanWith([]);
    const input = { log: same(5), aiSquad: ai, humanSquad: me, ai: xi(ai), human: xi(me) };
    expect(aiStudyPlan(input)).toEqual(aiStudyPlan(input));
  });
});
