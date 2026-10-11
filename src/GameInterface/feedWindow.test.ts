import { describe, expect, test } from "bun:test";
import { clampFeedWindow, DEFAULT_FEED_WINDOW, parseFeedWindow } from "@/GameInterface/feedWindow";

describe("feed window (#148)", () => {
  test("a malformed or missing value is the default (closed)", () => {
    expect(parseFeedWindow(null)).toEqual(DEFAULT_FEED_WINDOW);
    expect(parseFeedWindow("{oops")).toEqual(DEFAULT_FEED_WINDOW);
    expect(parseFeedWindow(JSON.stringify({ open: "yes", x: "a" }))).toEqual(DEFAULT_FEED_WINDOW);
  });

  test("a stored window keeps its place", () => {
    expect(parseFeedWindow(JSON.stringify({ open: true, x: 300, y: 120 }))).toEqual({ open: true, x: 300, y: 120 });
  });

  test("the window never leaves the viewport", () => {
    const vp = { w: 1280, h: 800 };
    expect(clampFeedWindow({ x: 100, y: 100 }, vp)).toEqual({ x: 100, y: 100 });
    expect(clampFeedWindow({ x: 5000, y: -50 }, vp)).toEqual({ x: 1232, y: 0 });
    expect(clampFeedWindow({ x: -5000, y: 5000 }, vp)).toEqual({ x: 48 - 320, y: 752 });
  });
});
