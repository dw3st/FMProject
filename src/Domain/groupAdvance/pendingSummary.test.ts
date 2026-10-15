import { describe, expect, test } from "bun:test";
import { aggregatePendingDays } from "@/Domain/groupAdvance/pendingSummary";
import type { DayLog, MatchEvent, TransferEvent } from "@/types/dayLogTypes";
import type { PendingDay } from "@/types/groupAdvanceTypes";

const match = (fixtureId: string, home: string, away: string): MatchEvent =>
  ({ kind: "match", fixtureId, competition: "premier_league", round: 1, home, away, score: { home: 1, away: 0 } }) as MatchEvent;
const transfer = (id: string, from: string, to: string): TransferEvent => ({
  kind: "transfer", transferId: id, playerId: `p-${id}`, playerName: id, fromSquadId: from, toSquadId: to,
  fee: 1, status: "accepted", reason: "",
});
const log = (date: string, events: DayLog["events"]): DayLog => ({ saveId: "s", date, events });
const day = (date: string, newDate: string, seat: Record<string, unknown> = {}): PendingDay => ({ date, newDate, seat });

describe("aggregatePendingDays", () => {
  test("one summary for every day: the club's games and transfers, achievements summed", () => {
    const days = [day("2027-03-10", "2027-03-11", { achievements: 1 }), day("2027-03-11", "2027-03-12"), day("2027-03-12", "2027-03-13", { achievements: 2, pressInvite: true })];
    const logs = [
      log("2027-03-10", [match("f1", "me", "x"), match("f2", "y", "z"), transfer("t1", "me", "y")]),
      null,
      log("2027-03-12", [match("f3", "z", "me"), transfer("t2", "y", "z"), { kind: "rest", squadId: "me", effects: [] } as never]),
    ];
    const a = aggregatePendingDays(days, logs, "me")!;
    expect(a.range).toEqual({ from: "2027-03-10", to: "2027-03-12", days: 3 });
    expect(a.log.date).toBe("2027-03-12");
    expect(a.log.newDate).toBe("2027-03-13");
    expect(a.log.events.map((e) => (e.kind === "match" ? e.fixtureId : e.kind === "transfer" ? e.transferId : e.kind))).toEqual(["f1", "t1", "f3", "rest"]);
    expect(a.log.achievements).toBe(3);
    expect(a.log.pressInvite).toBe(true);
    expect(a.matchReportDate).toBe("2027-03-12");
    expect(a.notices).toEqual({ jobOffers: 0, sacked: false, seasonEnded: false, pressInvite: true, readyCleared: false });
  });

  test("the stops that cleared 'ready until' are named", () => {
    const a = aggregatePendingDays([day("2027-03-10", "2027-03-11", { jobOffers: 2 }), day("2027-03-11", "2027-03-12", { seasonEnded: true })], [null, null], "me")!;
    expect(a.notices).toMatchObject({ jobOffers: 2, seasonEnded: true, sacked: false, readyCleared: true });
    expect(a.matchReportDate).toBeNull();
  });

  test("no day, no summary", () => {
    expect(aggregatePendingDays([], [], "me")).toBeNull();
  });
});
