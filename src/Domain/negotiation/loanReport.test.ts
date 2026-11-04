import { describe, expect, test } from "bun:test";
import { loanReport, shareWithRecall } from "@/Domain/negotiation/loanReport";
import { emptySeasonLog, type RosterPlayer } from "@/types/playerTypes";

const stats = { passing: 5, vision: 5, finishing: 5, dribbling: 5, speed: 5, acceleration: 5, tackling: 5, pressing: 5, heading: 5, strength: 5, stamina: 5, reflex: 1, jump: 1 };
const player = (over: Partial<RosterPlayer>): RosterPlayer => ({
  id: "p", name: "P", age: 20, positions: ["Midfielder"], stats, seasonLog: emptySeasonLog(), ...over,
}) as unknown as RosterPlayer;
const loan = { toClubId: "b", toClubName: "B" };

describe("loanReport", () => {
  test("adds up this spell: closed loan rows and the running season", () => {
    const r = loanReport(player({
      seasonLog: { ...emptySeasonLog(), appearances: 10, goals: 2, assists: 1, avgRating: 7, yellowCards: 1 },
      history: [
        { season: "2029", squadId: "b", clubName: "B", league: "", apps: 20, goals: 3, assists: 0, avgRating: 6, cupApps: 0, cupGoals: 0, contApps: 0, contGoals: 0, yellowCards: 2, redCards: 1, injuries: 1, daysInjured: 9, titles: [], loan: true },
        { season: "2028", squadId: "a", clubName: "A", league: "", apps: 30, goals: 9, assists: 9, avgRating: 8, cupApps: 0, cupGoals: 0, contApps: 0, contGoals: 0, yellowCards: 9, redCards: 9, injuries: 9, daysInjured: 9, titles: [] },
      ],
    }), loan);
    expect(r).toMatchObject({ apps: 30, goals: 5, assists: 1, yellowCards: 3, redCards: 1, injuries: 1, daysInjured: 9 });
    expect(r.avgRating).toBeCloseTo((20 * 6 + 10 * 7) / 30, 2);
  });
  test("no games: no rating; attribute changes only with the start known", () => {
    const p = player({ stats: { ...stats, passing: 5.3, speed: 4.9 } });
    expect(loanReport(p, loan)).toMatchObject({ apps: 0, avgRating: null, changes: [] });
    expect(loanReport(p, loan).overallAtStart).toBeUndefined();
    const r = loanReport(p, { ...loan, startStats: stats, startOverall: 5 });
    expect(r.overallAtStart).toBe(50);
    expect(r.changes).toEqual([{ attribute: "passing", delta: 3 }, { attribute: "speed", delta: -1 }]);
  });
  test("the recall clause costs wage share", () => {
    expect(shareWithRecall(0.7)).toBe(0.5);
    expect(shareWithRecall(0.1)).toBe(0);
  });
});
