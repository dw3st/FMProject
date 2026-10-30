import { describe, expect, test } from "bun:test";
import { parseWatchTarget } from "@/GameInterface/Watch/watchWindow";

describe("broadcast window target", () => {
  test("parses a stored match and refuses anything else", () => {
    expect(parseWatchTarget('{"saveId":"abc-1","seatId":"s2"}')).toEqual({ saveId: "abc-1", seatId: "s2" });
    expect(parseWatchTarget('{"saveId":"a/b","seatId":"s2"}')).toBeNull();
    expect(parseWatchTarget('{"saveId":"a"}')).toBeNull();
    expect(parseWatchTarget("x")).toBeNull();
    expect(parseWatchTarget(null)).toBeNull();
  });
});
