import { describe, expect, test } from "bun:test";
import {
  afterAward,
  afterListedForSale,
  afterRenewal,
  answerTalk,
  answersFor,
  clampMorale,
  initClubMorale,
  minutesDelta,
  moraleBand,
  moraleDay,
  moraleDemandMult,
  moraleDpMult,
  moraleExecutionMult,
  moraleFactor,
  moraleQuickSimMult,
  refusesRenewal,
  stripClubMorale,
  suggestedStatuses,
  talkReasonOf,
  windowMatches,
  withMoraleExecution,
  moraleOf,
  type ClubMatchSummary,
} from "@/Domain/morale/morale";
import { MORALE } from "@/Domain/morale/moraleConfig";
import type { PlayerStatsRecord, RosterPlayer, Squad } from "@/types/playerTypes";

const NEUTRAL_PERSONALITY = { ambition: 10.5, loyalty: 10.5, professionalism: 10.5, temperament: 10.5 };

function stats(v: number): PlayerStatsRecord {
  return {
    passing: v, vision: v, finishing: v, dribbling: v, speed: v, acceleration: v, tackling: v,
    pressing: v, stamina: v, heading: v, strength: v, reflex: v, jump: v,
  };
}

function player(id: string, pos: string, level: number, extra: Partial<RosterPlayer> = {}): RosterPlayer {
  return {
    id, name: `P ${id}`, age: 26, squadId: "h", preferredFoot: "right", positions: [pos],
    stats: stats(level), profile: { summary: "", archetype: "" },
    // Neutral personality: the morale rules on their own (`personality.md` effects tested below).
    personality: NEUTRAL_PERSONALITY, ...extra,
  };
}

function squadOf(players: RosterPlayer[], extra: Partial<Squad> = {}): Squad {
  return { id: "h", name: "Home", colors: ["#000", "#fff"], money: 0, players, ...extra } as Squad;
}

/** 1 GK, 6 DEF, 5 MID, 4 FWD, decreasing levels inside each line. */
function fullSquad(): Squad {
  const ps: RosterPlayer[] = [player("g1", "GK", 7), player("g2", "GK", 5)];
  for (let i = 0; i < 6; i++) ps.push(player(`d${i}`, "CB", 7 - i * 0.4));
  for (let i = 0; i < 5; i++) ps.push(player(`m${i}`, "CM", 7.5 - i * 0.4));
  for (let i = 0; i < 4; i++) ps.push(player(`f${i}`, "ST", 8 - i * 0.5));
  return squadOf(ps);
}

let ids = 0;
const newId = () => `id${++ids}`;

describe("value, band and effects", () => {
  test("bands", () => {
    expect(moraleBand(80)).toBe("very_happy");
    expect(moraleBand(79.9)).toBe("content");
    expect(moraleBand(60)).toBe("content");
    expect(moraleBand(40)).toBe("neutral");
    expect(moraleBand(25)).toBe("unhappy");
    expect(moraleBand(24.9)).toBe("furious");
  });

  test("factor: -1 at 0, 0 at 65, +1 at 100; absent = 0", () => {
    expect(moraleFactor(0)).toBe(-1);
    expect(moraleFactor(65)).toBe(0);
    expect(moraleFactor(100)).toBe(1);
    expect(moraleFactor(undefined)).toBe(0);
    expect(moraleExecutionMult(65)).toBe(1);
    expect(moraleExecutionMult(100)).toBeCloseTo(1.02);
    expect(moraleExecutionMult(0)).toBeCloseTo(0.98);
    expect(moraleQuickSimMult(undefined)).toBe(1);
  });

  test("execution: identical object at 65, scaled and capped at 10 elsewhere", () => {
    const s = stats(5);
    expect(withMoraleExecution(s, 65)).toBe(s);
    expect(withMoraleExecution(s, undefined)).toBe(s);
    expect(withMoraleExecution(s, 100).passing).toBeCloseTo(5.1);
    expect(withMoraleExecution(stats(10), 100).passing).toBe(10);
  });

  test("DP and contract demand by band; absent = neutral", () => {
    expect(moraleDpMult({})).toBe(1);
    expect(moraleDpMult({ morale: 90 })).toBe(1.05);
    expect(moraleDpMult({ morale: 10 })).toBe(0.9);
    expect(moraleDemandMult({ morale: 30 })).toBe(MORALE.UNHAPPY_DEMAND_MULT);
    expect(moraleDemandMult({ morale: 70 })).toBe(1);
    expect(moraleDemandMult({})).toBe(1);
  });
});

describe("squad status and minutes", () => {
  test("suggested statuses: key / starter / rotation / backup / youth", () => {
    const sq = fullSquad();
    sq.players.push(player("y1", "CB", 3, { age: 18 }));
    const s = suggestedStatuses(sq);
    expect(s.g1).toBe("starter");
    expect(s.g2).toBe("backup");
    expect(s.f0).toBe("key");
    expect(s.d0).toBe("starter");
    expect(s.d4).toBe("rotation");
    expect(s.y1).toBe("youth");
    expect(Object.values(s).filter((v) => v === "key").length).toBe(MORALE.KEY_COUNT);
  });

  test("window matches need 3 matches and scale to 5", () => {
    expect(windowMatches([90, 90])).toBeNull();
    expect(windowMatches([90, 90, 90])).toBe(5);
    expect(windowMatches([90, 45, 0, 0, 0])).toBeCloseTo(1.5);
  });

  test("minutes delta: -6 … +3, excused never loses", () => {
    const five = (n: number) => [...Array(n).fill(90), ...Array(5 - n).fill(0)];
    expect(minutesDelta("key", five(5))).toBe(1);
    expect(minutesDelta("key", five(4))).toBe(0);
    expect(minutesDelta("key", five(0))).toBe(-6);
    expect(minutesDelta("starter", five(2))).toBe(-2);
    expect(minutesDelta("rotation", five(5))).toBe(3);
    expect(minutesDelta("youth", five(0))).toBe(0);
    expect(minutesDelta("key", five(0), true)).toBe(0);
    expect(minutesDelta("key", [0, 0])).toBe(0);
  });
});

describe("moraleDay", () => {
  const match = (result: ClubMatchSummary["result"], minutes: Record<string, number>, extra: Partial<ClubMatchSummary> = {}): ClubMatchSummary =>
    ({ result, minutes, goals: {}, ratings: {}, ...extra });

  test("absent morale starts at 65; a win lifts everyone, a scorer more (capped)", () => {
    const sq = fullSquad();
    const out = moraleDay({
      squad: sq, date: "2027-03-02", monday: false, bids: [], sellList: [], newId,
      matches: [match("W", { f0: 90 }, { goals: { f0: 3 }, ratings: { f0: 8.4 } })],
    });
    const p = (id: string) => out.squad.players.find((x) => x.id === id)!;
    expect(p("g2").morale).toBe(66);
    expect(p("f0").morale).toBe(65 + 1 + MORALE.MATCH_PERSONAL_CAP);
    expect(p("f0").moraleLog!.minutes).toEqual([90]);
    expect(p("g2").moraleLog!.minutes).toEqual([0]);
    expect(p("g2").moraleLog!.trend).toEqual([66]);
  });

  test("Monday: benched key player loses, drifts towards 65, asks to talk when below 40", () => {
    const sq = fullSquad();
    sq.players = sq.players.map((p) =>
      p.id === "f0" ? { ...p, morale: 38, moraleLog: { minutes: [0, 0, 0, 0, 0], trend: [], newMatches: 2 } } : p);
    const out = moraleDay({ squad: sq, date: "2027-03-01", monday: true, matches: [], bids: [], sellList: [], newId });
    const f0 = out.squad.players.find((x) => x.id === "f0")!;
    // 38 - 6 = 32, then +5% of (65 - 32)
    expect(f0.morale).toBeCloseTo(33.7, 1);
    expect(out.squad.moraleClub!.talks.map((t) => t.reason)).toEqual(["minutes"]);
    expect(out.news.some((n) => n.kind === "talk" && n.playerId === "f0")).toBe(true);
  });

  test("Monday without a new match in the window: no minutes delta (international break, off-season)", () => {
    const sq = fullSquad();
    sq.players = sq.players.map((p) =>
      p.id === "f0" ? { ...p, morale: 50, moraleLog: { minutes: [0, 0, 0, 0, 0], trend: [], newMatches: 0 } } : p);
    const out = moraleDay({ squad: sq, date: "2027-03-01", monday: true, matches: [], bids: [], sellList: [], newId });
    const f0 = out.squad.players.find((x) => x.id === "f0")!;
    expect(f0.morale).toBe(clampMorale(50 + 15 * MORALE.DRIFT)); // drift only
    expect(f0.moraleLog!.newMatches).toBe(0);
  });

  test("unavailable before the match: no window entry, no promise match; season rollover resets windows", () => {
    const sq = {
      ...fullSquad(),
      moraleClub: { talks: [], promises: [{ id: "p1", playerId: "d4", playerName: "x", kind: "minutes" as const, madeOn: "2027-03-01", target: 1, matches: 0, played: 0 }] },
    };
    sq.players = sq.players.map((p) => (p.id === "d4" ? { ...p, moraleLog: { minutes: [90], trend: [] } } : p));
    const out = moraleDay({
      squad: sq, date: "2027-03-03", monday: false, bids: [], sellList: [], newId,
      matches: [{ result: "D", minutes: {}, goals: {}, ratings: {} }], unavailable: new Set(["d4"]),
    });
    const d4 = out.squad.players.find((x) => x.id === "d4")!;
    expect(d4.moraleLog!.minutes).toEqual([90]);
    expect(out.squad.moraleClub!.promises[0]!.matches).toBe(0);
    const rolled = moraleDay({ squad: out.squad, date: "2027-03-04", monday: false, matches: [], bids: [], sellList: [], seasonRolled: true, newId });
    expect(rolled.squad.players.find((x) => x.id === "d4")!.moraleLog!.minutes).toEqual([]);
  });

  test("the weekly cap of talk requests covers wants_move talks", () => {
    const sq = fullSquad();
    sq.players = sq.players.map((p) => ({ ...p, morale: 30 }));
    const bids = ["d4", "d5", "m4"].map((playerId) => ({ playerId, clubName: "Rich", stronger: true }));
    const out = moraleDay({ squad: sq, date: "2027-03-03", monday: false, matches: [], bids, sellList: [], newId });
    expect(out.squad.moraleClub!.talks).toHaveLength(MORALE.MAX_NEW_TALKS_PER_WEEK);
    expect(out.squad.moraleClub!.week).toEqual({ start: "2027-03-01", count: MORALE.MAX_NEW_TALKS_PER_WEEK });
    const later = moraleDay({ squad: out.squad, date: "2027-03-04", monday: false, matches: [], sellList: [], newId, bids: [{ playerId: "m3", clubName: "R", stronger: true }] });
    expect(later.squad.moraleClub!.talks).toHaveLength(MORALE.MAX_NEW_TALKS_PER_WEEK);
  });

  test("Monday: furious player requests a transfer (listed), withdrawn when fine again", () => {
    const sq = fullSquad();
    sq.players = sq.players.map((p) => (p.id === "d5" ? { ...p, morale: 10 } : p));
    const out = moraleDay({ squad: sq, date: "2027-03-01", monday: true, matches: [], bids: [], sellList: [], newId });
    expect(out.listRequested).toEqual(["d5"]);
    const d5 = out.squad.players.find((x) => x.id === "d5")!;
    expect(d5.moraleLog!.transferRequest).toBe("2027-03-01");
    const calm = { ...out.squad, players: out.squad.players.map((p) => (p.id === "d5" ? { ...p, morale: 70 } : p)) };
    const out2 = moraleDay({
      squad: calm, date: "2027-03-08", monday: true, matches: [], bids: [],
      sellList: [{ playerId: "d5", requested: true }], newId,
    });
    expect(out2.unlistRequested).toEqual(["d5"]);
    expect(out2.squad.players.find((x) => x.id === "d5")!.moraleLog!.transferRequest).toBeUndefined();
  });

  test("contract talk in the last 6 months for a key player", () => {
    const sq = fullSquad();
    const f0 = { ...sq.players.find((p) => p.id === "f0")!, contract: { until: "2027-06-30", wage: 1000 } };
    expect(talkReasonOf(f0, "key", "2027-03-01", { talks: [], promises: [] })).toBe("contract");
    expect(talkReasonOf(f0, "backup", "2027-03-01", { talks: [], promises: [] })).toBeNull();
  });

  test("the director answers a contract talk at once: no request, morale as the answer", () => {
    const sq = fullSquad();
    sq.players = sq.players.map((p) => (p.id === "f0" ? { ...p, morale: 65, contract: { until: "2027-06-30", wage: 1000 } } : p));
    const base = { squad: sq, date: "2027-03-01", monday: true, matches: [], bids: [], sellList: [], newId };
    // The manager in charge: the talk request opens.
    const manager = moraleDay(base);
    expect(manager.squad.moraleClub!.talks.some((t) => t.playerId === "f0" && t.reason === "contract")).toBe(true);
    expect(manager.news.some((n) => n.kind === "talk" && n.playerId === "f0")).toBe(true);
    // The director refuses: −10, quiet, no request, no news.
    const refused = moraleDay({ ...base, directorContractTalk: () => false });
    const f0 = refused.squad.players.find((p) => p.id === "f0")!;
    expect(f0.morale).toBe(65 + MORALE.RENEWAL_REFUSED);
    expect(f0.moraleLog!.quietUntil).toBeDefined();
    expect(refused.squad.moraleClub!.talks.some((t) => t.playerId === "f0")).toBe(false);
    expect(refused.news.some((n) => n.playerId === "f0")).toBe(false);
    // The director renews: as a renewal promise (+3).
    const renewed = moraleDay({ ...base, directorContractTalk: () => true });
    expect(renewed.squad.players.find((p) => p.id === "f0")!.morale).toBe(65 + MORALE.PROMISE_MADE);
  });

  test("bid for an unhappy player: wants_move talk", () => {
    const sq = fullSquad();
    sq.players = sq.players.map((p) => (p.id === "m4" ? { ...p, morale: 50 } : p));
    const out = moraleDay({
      squad: sq, date: "2027-03-03", monday: false, matches: [], sellList: [], newId,
      bids: [{ playerId: "m4", clubName: "Rich FC", stronger: false }, { playerId: "m0", clubName: "Small FC", stronger: false }],
    });
    expect(out.squad.moraleClub!.talks).toHaveLength(1);
    expect(out.squad.moraleClub!.talks[0]!.clubName).toBe("Rich FC");
  });

  test("expired talk = refused", () => {
    const sq = { ...fullSquad(), moraleClub: { talks: [{ id: "t", playerId: "d5", playerName: "x", reason: "minutes" as const, date: "2027-02-01", expires: "2027-02-15" }], promises: [] } };
    const out = moraleDay({ squad: sq, date: "2027-02-16", monday: false, matches: [], bids: [], sellList: [], newId });
    expect(out.squad.moraleClub!.talks).toHaveLength(0);
    expect(out.squad.players.find((p) => p.id === "d5")!.morale).toBe(65 + MORALE.REFUSE);
  });
});

describe("talks and promises", () => {
  const withTalk = (reason: "minutes" | "contract" | "wants_move" | "chance"): Squad =>
    ({ ...fullSquad(), moraleClub: { talks: [{ id: "t1", playerId: "d4", playerName: "P d4", reason, date: "2027-03-01", expires: "2027-03-15" }], promises: [] } });

  test("answers per reason; free talk only praise/demand", () => {
    expect(answersFor("contract")).toContain("promise_renewal");
    expect(answersFor(null)).toEqual(["praise", "demand"]);
    const r = answerTalk({ squad: fullSquad(), playerId: "d4", answer: "refuse", date: "2027-03-02", newId });
    expect(r).toEqual({ error: "invalidAnswer" });
  });

  test("promise minutes: kept after enough appearances (+8), broken when impossible (-15 + request)", () => {
    const r = answerTalk({ squad: withTalk("minutes"), playerId: "d4", answer: "promise_minutes", minutes: 2, date: "2027-03-02", newId });
    if ("error" in r) throw new Error(r.error);
    expect(r.squad.moraleClub!.talks).toHaveLength(0);
    expect(r.squad.players.find((p) => p.id === "d4")!.morale).toBe(65 + MORALE.PROMISE_MADE);
    const m = (mins: number): ClubMatchSummary => ({ result: "D", minutes: { d4: mins }, goals: {}, ratings: {} });
    const kept = moraleDay({ squad: r.squad, date: "2027-03-05", monday: false, matches: [m(90), m(30)], bids: [], sellList: [], newId });
    expect(kept.squad.moraleClub!.promises).toHaveLength(0);
    expect(kept.news.map((n) => n.kind)).toContain("promise_kept");
    expect(kept.squad.players.find((p) => p.id === "d4")!.morale).toBe(65 + MORALE.PROMISE_MADE + MORALE.PROMISE_KEPT);

    const broken = moraleDay({ squad: r.squad, date: "2027-03-05", monday: false, matches: [m(0), m(0), m(0), m(0)], bids: [], sellList: [], newId });
    expect(broken.news.map((n) => n.kind)).toEqual(["promise_broken", "transfer_request"]);
    expect(broken.listRequested).toEqual(["d4"]);
  });

  test("promise sale: listed as requested; deadline passed = broken", () => {
    const r = answerTalk({ squad: withTalk("wants_move"), playerId: "d4", answer: "promise_sale", days: 30, date: "2027-03-02", newId });
    if ("error" in r) throw new Error(r.error);
    expect(r.listRequested).toBe(true);
    expect(afterListedForSale(r.squad, "d4")).toBe(r.squad);
    const late = moraleDay({ squad: r.squad, date: "2027-04-02", monday: false, matches: [], bids: [], sellList: [{ playerId: "d4", requested: true }], newId });
    expect(late.news.map((n) => n.kind)).toContain("promise_broken");
    // He left before the deadline: the promise just ends.
    const gone = { ...r.squad, players: r.squad.players.filter((p) => p.id !== "d4") };
    expect(moraleDay({ squad: gone, date: "2027-03-20", monday: false, matches: [], bids: [], sellList: [], newId }).squad.moraleClub!.promises).toHaveLength(0);
  });

  test("renewal promise kept by the renewal; furious refuses without it", () => {
    const r = answerTalk({ squad: withTalk("contract"), playerId: "d4", answer: "promise_renewal", date: "2027-03-02", newId });
    if ("error" in r) throw new Error(r.error);
    const after = afterRenewal(r.squad, "d4", "2027-03-03");
    expect(after.news.map((n) => n.kind)).toEqual(["promise_kept"]);
    expect(after.squad.players.find((p) => p.id === "d4")!.morale).toBe(65 + MORALE.PROMISE_MADE + MORALE.RENEWAL_ACCEPTED + MORALE.PROMISE_KEPT);
    const furious = { ...fullSquad().players[0]!, morale: 10 };
    expect(refusesRenewal(squadOf([furious]), furious)).toBe(true);
    expect(refusesRenewal(squadOf([furious], { moraleClub: { talks: [], promises: [{ id: "p", playerId: furious.id, playerName: "", kind: "renewal", madeOn: "x", until: "z" }] } }), furious)).toBe(false);
  });

  test("praise works once a month; refusing a contract talk costs -10", () => {
    const a = answerTalk({ squad: fullSquad(), playerId: "d4", answer: "praise", date: "2027-03-02", newId });
    if ("error" in a) throw new Error(a.error);
    expect(a.change).toBe(MORALE.PRAISE);
    const b = answerTalk({ squad: a.squad, playerId: "d4", answer: "praise", date: "2027-03-20", newId });
    if ("error" in b) throw new Error(b.error);
    expect(b.noEffect).toBe(true);
    const c = answerTalk({ squad: withTalk("contract"), playerId: "d4", answer: "refuse", date: "2027-03-02", newId });
    if ("error" in c) throw new Error(c.error);
    expect(c.change).toBe(MORALE.RENEWAL_REFUSED);
  });

  test("listing unasked costs -8", () => {
    const s = afterListedForSale(fullSquad(), "d4");
    expect(s.players.find((p) => p.id === "d4")!.morale).toBe(65 + MORALE.LISTED_UNASKED);
  });
});

describe("club switch", () => {
  test("init puts everyone at 65 with nothing open; strip removes everything", () => {
    const sq = fullSquad();
    sq.players[0] = { ...sq.players[0]!, morale: 20, squadStatus: "key", moraleLog: { minutes: [1], trend: [2] } };
    const init = initClubMorale(sq);
    expect(init.players.every((p) => p.morale === 65 && !p.squadStatus && !p.moraleLog)).toBe(true);
    expect(init.moraleClub).toEqual({ talks: [], promises: [] });
    const ai = stripClubMorale(init);
    expect(ai.moraleClub).toBeUndefined();
    expect(ai.players.every((p) => p.morale === undefined)).toBe(true);
  });
});

describe("personality (`personality.md`)", () => {
  const withPers = (sq: Squad, id: string, p: Partial<typeof NEUTRAL_PERSONALITY>, extra: Partial<RosterPlayer> = {}): Squad => ({
    ...sq,
    players: sq.players.map((x) => (x.id === id ? { ...x, ...extra, personality: { ...NEUTRAL_PERSONALITY, ...p } } : x)),
  });

  test("temperament scales event deltas (a hot-head reacts 25% more)", () => {
    const sq = withPers(withPers(fullSquad(), "g2", { temperament: 20 }), "g1", { temperament: 1 });
    const out = moraleDay({ squad: sq, date: "2027-03-02", monday: false, bids: [], sellList: [], newId, matches: [{ result: "L", minutes: {}, goals: {}, ratings: {} }] });
    const p = (id: string) => out.squad.players.find((x) => x.id === id)!;
    expect(p("g2").morale).toBe(63.8); // 65 − 1.25, one decimal
    expect(p("g1").morale).toBe(64.3); // 65 − 0.75
  });

  test("ambition moves the transfer-request threshold; a loyal player never asks from morale alone", () => {
    let sq = withPers(fullSquad(), "d5", { ambition: 20, loyalty: 5 }, { morale: 31 });
    sq = withPers(sq, "d4", { loyalty: 18 }, { morale: 5 });
    const out = moraleDay({ squad: sq, date: "2027-03-01", monday: true, matches: [], bids: [], sellList: [], newId });
    expect(out.listRequested).toContain("d5");
    expect(out.listRequested).not.toContain("d4");
  });

  test("wants_move: a stronger club tempts only the ambitious; the loyal needs morale below 40", () => {
    let sq = withPers(fullSquad(), "m4", { ambition: 15, loyalty: 8 }, { morale: 80 });
    sq = withPers(sq, "m3", { ambition: 8, loyalty: 8 }, { morale: 80 });
    sq = withPers(sq, "m2", { loyalty: 18 }, { morale: 50 });
    const bids = ["m4", "m3", "m2"].map((playerId) => ({ playerId, clubName: "Big", stronger: true }));
    const out = moraleDay({ squad: sq, date: "2027-03-03", monday: false, matches: [], sellList: [], newId, bids });
    expect(out.squad.moraleClub!.talks.map((t) => t.playerId)).toEqual(["m4"]);
  });

  test("the loyal feels being listed more; demand works on a professional", () => {
    const sq = withPers(fullSquad(), "d4", { loyalty: 20 });
    expect(afterListedForSale(sq, "d4").players.find((p) => p.id === "d4")!.morale).toBe(65 + MORALE.LISTED_UNASKED * 1.5);
    const pro = withPers(fullSquad(), "d3", { professionalism: 15 }, { morale: 50 });
    const r = answerTalk({ squad: pro, playerId: "d3", answer: "demand", date: "2027-03-01", newId });
    if ("error" in r) throw new Error(r.error);
    expect(r.change).toBe(MORALE.DEMAND_GOOD);
  });
});

describe("season awards (`awards.md`)", () => {
  test("afterAward uses only the largest award (scaled by the temperament)", () => {
    const sq = { players: [{ id: "a", morale: 65 }, { id: "b", morale: 65 }] } as never as Squad;
    const both = moraleOf(afterAward(sq, "a", ["team_of_season", "best_player"]).players[0]!);
    expect(both).toBe(moraleOf(afterAward(sq, "a", ["best_player"]).players[0]!));
    expect(both).toBeGreaterThan(moraleOf(afterAward(sq, "a", ["team_of_season"]).players[0]!));
    expect(both).toBeGreaterThan(65);
    expect(afterAward(sq, "a", []).players[0]).toBe(sq.players[0]);
    expect(afterAward(sq, "a", ["best_manager"])).toBe(sq);
    expect(afterAward(sq, "zz", ["best_player"])).toBe(sq);
    expect(afterAward(sq, "a", ["best_player"]).players[1]).toBe(sq.players[1]);
  });

  test("afterAward records the award event once (keyed), even at the top of the scale", () => {
    const sq = { players: [{ id: "a", morale: 99.4 }] } as never as Squad;
    const once = afterAward(sq, "a", ["best_player"], "league:premier_league:2026-27");
    expect(moraleOf(once.players[0]!)).toBe(100);
    expect(once.players[0]!.moraleLog?.awards).toEqual(["league:premier_league:2026-27"]);
    // A retried day applies nothing twice.
    expect(afterAward(once, "a", ["best_player"], "league:premier_league:2026-27")).toBe(once);
    // Another award event is applied and kept, the list bounded.
    const top = { players: [{ id: "a", morale: 50 }] } as never as Squad;
    let s = top;
    for (let i = 0; i < 6; i++) s = afterAward(s, "a", ["team_of_season"], `league:l${i}:2027`);
    expect(s.players[0]!.moraleLog?.awards).toEqual(["league:l2:2027", "league:l3:2027", "league:l4:2027", "league:l5:2027"]);
    // No morale award → nothing recorded.
    expect(afterAward(sq, "a", ["best_manager"], "league:x:2027")).toBe(sq);
  });
});
