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

test("the notice keeps the club and league of the season", () => {
  const out = summaryOutcome([{ date: "2031-05-24", newDate: "2031-05-25", seat: { seasonEnded: true, moves: [], playerMove: null, playerChampionOf: "la_liga", playerLeague: "la_liga", playerClubId: "529", playerClubName: "Barcelona" } }]);
  expect(out?.notice?.playerLeague).toBe("la_liga");
  expect(out?.notice?.playerClubName).toBe("Barcelona");
  expect(out?.notice?.playerClubId).toBe("529");
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
