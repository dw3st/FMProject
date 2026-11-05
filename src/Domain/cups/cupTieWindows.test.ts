import { describe, expect, test } from "bun:test";
import { cupTieWindows } from "@/Domain/cups/cupDates";

describe("cupTieWindows", () => {
  test("up to two days before the next stage; the final up to the end of the cup", () => {
    const w = cupTieWindows([{ round: 2, date: "2031-04-23" }, { round: 1, date: "2031-02-05" }, { round: 3, date: "2031-05-14" }], "2030-08-01", "2031-05-30");
    expect(w[1]).toEqual({ start: "2030-08-01", end: "2031-04-21" });
    expect(w[2]).toEqual({ start: "2030-08-01", end: "2031-05-12" });
    expect(w[3]).toEqual({ start: "2030-08-01", end: "2031-05-30" });
  });
});
