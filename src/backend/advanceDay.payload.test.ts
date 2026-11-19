import { describe, expect, test } from "bun:test";
import { advanceDayResponseFor, payloadForSeat } from "@/backend/advanceDay";

describe("day payload per seat", () => {
  test("world payload + the seat's part; another seat's part is not mixed in", () => {
    const outcome = {
      ok: true as const,
      payload: { newDate: "2027-03-02", events: [] },
      seats: { a: { seasonEnded: true, archiveYear: 2026 }, b: { sacked: true } },
    };
    expect(payloadForSeat(outcome, "a")).toEqual({ newDate: "2027-03-02", events: [], seasonEnded: true, archiveYear: 2026 });
    expect(payloadForSeat(outcome, "b")).toEqual({ newDate: "2027-03-02", events: [], sacked: true });
    expect(payloadForSeat(outcome, "z")).toEqual({ newDate: "2027-03-02", events: [] });
  });

  test("the advance-day response keeps the date and the seat's flags, never the day's events", () => {
    const outcome = {
      ok: true as const,
      payload: { saveId: "s", date: "2027-03-01", newDate: "2027-03-02", events: [{ kind: "match" }], youthMatches: [{}] },
      seats: { a: { seasonEnded: true, archiveYear: 2026, sacked: true } },
    };
    expect(advanceDayResponseFor(outcome, "a")).toEqual({
      saveId: "s", date: "2027-03-01", newDate: "2027-03-02", seasonEnded: true, archiveYear: 2026, sacked: true,
    });
    expect(advanceDayResponseFor(outcome, "z")).toEqual({ saveId: "s", date: "2027-03-01", newDate: "2027-03-02" });
  });
});
