import { describe, expect, test } from "bun:test";
import { deadlineLeft, summaryOutcome } from "@/GameInterface/World/groupAdvanceText";

describe("deadlineLeft", () => {
  const now = Date.parse("2027-01-01T10:00:00.000Z");
  test("hours (rounded up) and minutes in the last hour; null when none or passed", () => {
    expect(deadlineLeft("2027-01-01T15:30:00.000Z", now)).toEqual({ hours: 6, minutes: null });
    expect(deadlineLeft("2027-01-01T10:20:00.000Z", now)).toEqual({ hours: null, minutes: 20 });
    expect(deadlineLeft(null, now)).toBeNull();
    expect(deadlineLeft("2027-01-01T09:00:00.000Z", now)).toBeNull();
  });
});

describe("summaryOutcome", () => {
  test("last day, the last season notice, sacked and offers", () => {
    const out = summaryOutcome([
      { date: "2027-05-17", newDate: "2027-05-18", seat: { seasonEnded: true, archiveYear: 2027, moves: [], playerMove: null, playerChampionOf: "premier_league" } },
      { date: "2027-05-18", newDate: "2027-05-19", seat: { jobOffers: 2 } },
    ]);
    expect(out).toEqual({
      lastDate: "2027-05-18", newDate: "2027-05-19", sacked: false, jobOffers: true,
      notice: { archiveYear: 2027, moves: [], playerMove: null, playerChampionOf: "premier_league" },
    });
    expect(summaryOutcome([])).toBeNull();
  });
});
