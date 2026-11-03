import { describe, expect, test } from "bun:test";
import { othersNowReady } from "@/Domain/groupAdvance/readyNotice";

describe("othersNowReady", () => {
  test("someone else left the waiting list", () => {
    expect(othersNowReady(["Emy", "Fabio"], ["Emy"], "Emy")).toEqual(["Fabio"]);
    // He was the last one: the world starts running and nobody is waited for.
    expect(othersNowReady(["Fabio"], [], "Emy")).toEqual(["Fabio"]);
  });
  test("my own ready never counts", () => {
    expect(othersNowReady(["Emy", "Fabio"], ["Fabio"], "Emy")).toEqual([]);
    expect(othersNowReady(["Emy"], [], "Emy")).toEqual([]);
  });
  test("nothing on the first state, or when the list only grows", () => {
    expect(othersNowReady(null, ["Fabio"], "Emy")).toEqual([]);
    expect(othersNowReady([], ["Emy", "Fabio"], "Emy")).toEqual([]);
  });
});
