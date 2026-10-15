import { describe, expect, test } from "bun:test";
import { payloadForSeat } from "@/backend/advanceDay";

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
});
