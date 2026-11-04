import { describe, expect, test } from "bun:test";
import { advanceMentoring, mentoringRefusal } from "@/Domain/personality/mentoring";
import { generatePersonality, personalityOf } from "@/Domain/personality/personality";
import type { RosterPlayer, Squad } from "@/types/playerTypes";

const player = (over: Partial<RosterPlayer> = {}): RosterPlayer =>
  ({ id: "m1", name: "M", age: 20, positions: ["Midfielder"], stats: {}, personality: { ambition: 10, loyalty: 10, professionalism: 8, temperament: 12 }, ...over }) as unknown as RosterPlayer;
const squad = (players: RosterPlayer[]): Squad => ({ id: "s", players }) as unknown as Squad;
const m = (progress = 0, trait: "professionalism" | "temperament" = "professionalism") => ({ trait, since: "2027-01-01", progress });
const END = "2027-12-01";

describe("personalityOf with growth", () => {
  test("growth improves: professionalism up, temperament down, within 1..20", () => {
    const base = { ambition: 10, loyalty: 10, professionalism: 19, temperament: 2 };
    const t = personalityOf({ id: "x", personality: base, personalityGrowth: { professionalism: 3, temperament: 3 } });
    expect(t).toEqual({ ambition: 10, loyalty: 10, professionalism: 20, temperament: 1 });
  });
  test("without growth, the same object as ever", () => {
    expect(personalityOf({ id: "abc" })).toBe(generatePersonality("abc"));
  });
});

describe("advanceMentoring", () => {
  test("young +1 a season, up to 29 +1 every two, with the news", () => {
    const young = player({ id: "y", age: 21, mentoring: m() });
    const older = player({ id: "o", age: 27, mentoring: m() });
    let r = advanceMentoring(squad([young, older]), END);
    expect(r.squad.players[0]!.personalityGrowth).toEqual({ professionalism: 1 });
    expect(r.squad.players[1]!.personalityGrowth).toBeUndefined();
    expect(r.news.map((n) => n.playerId)).toEqual(["y"]);
    r = advanceMentoring(r.squad, END);
    expect(r.squad.players[1]!.personalityGrowth).toEqual({ professionalism: 1 });
  });
  test("too recent: nothing", () => {
    const r = advanceMentoring(squad([player({ mentoring: { ...m(), since: "2027-10-01" } })]), END);
    expect(r.news).toEqual([]);
    expect(r.squad.players[0]!.mentoring?.progress).toBe(0);
  });
  test("temperament goes down; reaching the best ends the work", () => {
    const p = player({ personality: { ambition: 10, loyalty: 10, professionalism: 8, temperament: 2 }, mentoring: m(0, "temperament") });
    const r = advanceMentoring(squad([p]), END);
    expect(personalityOf(r.squad.players[0]!).temperament).toBe(1);
    expect(r.squad.players[0]!.mentoring).toBeUndefined();
    expect(r.news[0]!.finished).toBe(true);
  });
  test("a squad without it is the same object", () => {
    const s = squad([player()]);
    expect(advanceMentoring(s, END).squad).toBe(s);
  });
});

describe("mentoringRefusal", () => {
  const p = player();
  test("age, loan, full, already the best", () => {
    expect(mentoringRefusal(squad([p]), p, "professionalism")).toBeNull();
    const old = player({ age: 30 });
    expect(mentoringRefusal(squad([old]), old, "professionalism")).toBe("tooOld");
    const lent = player({ loan: {} as RosterPlayer["loan"] });
    expect(mentoringRefusal(squad([lent]), lent, "professionalism")).toBe("onLoan");
    const three = ["a", "b", "c"].map((id) => player({ id, mentoring: m() }));
    expect(mentoringRefusal(squad([p, ...three]), p, "professionalism")).toBe("mentoringFull");
    expect(mentoringRefusal(squad(three), three[0]!, "temperament")).toBeNull();
    const best = player({ personality: { ambition: 10, loyalty: 10, professionalism: 20, temperament: 10 } });
    expect(mentoringRefusal(squad([best]), best, "professionalism")).toBe("atBest");
  });
});
