import { describe, expect, test } from "bun:test";
import {
  humanWindowStatus, isDeadlineRush, isWindowOpen, midWindow, seasonWindows, windowStatus,
} from "@/Domain/market/windows";

const europe = { start: "2026-08-15", end: "2027-05-17" };
const calendar = { start: "2027-02-05", end: "2027-12-06" };

describe("transfer windows", () => {
  test("cross-year league: 31/05 → 31/08 and January", () => {
    const [pre, mid] = seasonWindows(europe);
    expect(pre).toEqual({ kind: "pre", open: "2026-05-31", close: "2026-08-31" });
    expect(mid).toEqual({ kind: "mid", open: "2027-01-01", close: "2027-01-31" });
  });

  test("calendar-year league: mid-December → 21/02 and July", () => {
    const [pre, mid] = seasonWindows(calendar);
    expect(pre).toEqual({ kind: "pre", open: "2026-12-20", close: "2027-02-21" });
    expect(mid).toEqual({ kind: "mid", open: "2027-07-01", close: "2027-07-31" });
  });

  test("mid point on the 15th stays in its month, after it moves to the next", () => {
    expect(midWindow({ start: "2027-01-01", end: "2027-01-29" }).open).toBe("2027-01-01");
    expect(midWindow({ start: "2027-01-01", end: "2027-02-02" }).open).toBe("2027-02-01");
  });

  test("status: open until / opens on, across seasons", () => {
    expect(windowStatus(europe, "2026-08-20")).toMatchObject({ open: true, until: "2026-08-31" });
    expect(windowStatus(europe, "2027-02-05")).toMatchObject({ open: false, opensOn: "2027-05-31" });
    expect(isWindowOpen(europe, "2027-06-10")).toBe(true);
    expect(isWindowOpen(europe, "2027-09-01")).toBe(false);
    expect(windowStatus(europe, "2027-09-01").opensOn).toBe("2028-01-01");
  });

  test("arrival grace opens the human market for 30 days", () => {
    const s = humanWindowStatus(europe, "2027-02-05", "2027-02-05");
    expect(s.open).toBe(true);
    expect(s.until).toBe("2027-03-06");
    expect(humanWindowStatus(europe, "2027-03-07", "2027-02-05").open).toBe(false);
    expect(humanWindowStatus(europe, "2027-02-05").open).toBe(false);
  });

  test("deadline rush in the last 5 days", () => {
    expect(isDeadlineRush(windowStatus(europe, "2026-08-27"), "2026-08-27")).toBe(true);
    expect(isDeadlineRush(windowStatus(europe, "2026-08-20"), "2026-08-20")).toBe(false);
  });
});
