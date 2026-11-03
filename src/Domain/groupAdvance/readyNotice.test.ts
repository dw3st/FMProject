import { describe, expect, test } from "bun:test";
import { isOnlyMe, myTurnNow, othersNowReady } from "@/Domain/groupAdvance/readyNotice";

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

describe("myTurnNow", () => {
  test("the others got ready and only I am left", () => {
    expect(myTurnNow(["Emy", "Fabio"], ["Emy"], "Emy")).toBe(true);
    // The world ran and stopped at my game: it passes through an empty list.
    expect(myTurnNow([], ["Emy"], "Emy")).toBe(true);
  });
  test("once per turn", () => {
    expect(myTurnNow(["Emy"], ["Emy"], "Emy")).toBe(false);
  });
  test("not while someone else is also waited for, nor when it is someone else's turn", () => {
    expect(myTurnNow([], ["Emy", "Fabio"], "Emy")).toBe(false);
    expect(myTurnNow(["Emy", "Fabio"], ["Fabio"], "Emy")).toBe(false);
  });
  test("nothing on the first state or without a nickname", () => {
    expect(myTurnNow(null, ["Emy"], "Emy")).toBe(false);
    expect(myTurnNow(["Emy", "Fabio"], ["Emy"], null)).toBe(false);
  });
  test("isOnlyMe", () => {
    expect(isOnlyMe(["Emy"], "Emy")).toBe(true);
    expect(isOnlyMe(["Emy", "Fabio"], "Emy")).toBe(false);
    expect(isOnlyMe([], "Emy")).toBe(false);
    expect(isOnlyMe(undefined, "Emy")).toBe(false);
  });
});
