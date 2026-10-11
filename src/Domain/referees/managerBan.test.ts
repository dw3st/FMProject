import { describe, expect, test } from "bun:test";
import { nextManagerBan, sanitizeManagerCards } from "@/Domain/referees/managerBan";

describe("nextManagerBan", () => {
  test("a red starts a 1-match ban, 2 from the 3rd complaint", () => {
    expect(nextManagerBan(undefined, true, [{ card: "red", minute: 50, complaint: 1 }], "2027-03-01")).toEqual({ ban: { matches: 1, since: "2027-03-01" }, given: 1 });
    expect(nextManagerBan(undefined, true, [{ card: "yellow", minute: 20, complaint: 1 }, { card: "red", minute: 70, complaint: 3 }], "d").given).toBe(2);
  });
  test("a yellow alone bans nobody", () => {
    expect(nextManagerBan(undefined, true, [{ card: "yellow", minute: 20, complaint: 1 }], "d")).toEqual({ ban: undefined, given: null });
  });
  test("an official match serves one match; no match, no change", () => {
    expect(nextManagerBan({ matches: 2, since: "a" }, true, [], "d").ban).toEqual({ matches: 1, since: "a" });
    expect(nextManagerBan({ matches: 1, since: "a" }, true, [], "d").ban).toBeUndefined();
    expect(nextManagerBan({ matches: 1, since: "a" }, false, [], "d").ban).toEqual({ matches: 1, since: "a" });
  });
});

describe("sanitizeManagerCards", () => {
  test("keeps well-formed cards only", () => {
    expect(sanitizeManagerCards([{ card: "red", minute: 10.4, complaint: 2 }, { card: "blue", minute: 1, complaint: 1 }, null])).toEqual([{ card: "red", minute: 10, complaint: 2 }]);
    expect(sanitizeManagerCards("x")).toEqual([]);
  });
});
