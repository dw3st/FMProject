import { describe, expect, test } from "bun:test";
import { appTarget, interceptedTarget, matchAppPath } from "@/GameInterface/router/appRoutes";

const ORIGIN = "http://localhost:3000";
const click = { button: 0, defaultPrevented: false, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false };
const link = (href: string, extra: Partial<{ target: string; hasDownload: boolean }> = {}) =>
  ({ href, target: "", hasDownload: false, ...extra });

describe("matchAppPath", () => {
  test("static and parameter routes", () => {
    expect(matchAppPath("/dashboard")?.route.screen).toBe("dashboard");
    expect(matchAppPath("/dashboard/")?.route.screen).toBe("dashboard");
    expect(matchAppPath("/leagues")?.params).toEqual({});
    expect(matchAppPath("/leagues/premier_league")?.params).toEqual({ league: "premier_league" });
    expect(matchAppPath("/squad/premier_league/42")?.params).toEqual({ league: "premier_league", club: "42" });
    expect(matchAppPath("/player/a%20b/42/p_1")?.params).toEqual({ league: "a b", club: "42", id: "p_1" });
  });

  test("pages of their own are not frame routes", () => {
    for (const p of ["/", "/login", "/start", "/new-game", "/join/AB", "/match-live", "/watch", "/fired", "/api/leagues", "/squad/a", "/dashboardx"]) {
      expect(matchAppPath(p)).toBeNull();
    }
  });

  test("the match screens draw without the bars", () => {
    expect(matchAppPath("/dashboard")?.route.chrome).toBeUndefined();
    expect(matchAppPath("/match-preview")?.route.chrome).toBe("bare");
    expect(matchAppPath("/match-result")?.route.chrome).toBe("bare");
    expect(matchAppPath("/match")?.route.chrome).toBe("match");
  });

  test("a broken escape is not a route", () => {
    expect(matchAppPath("/leagues/%E0%A4%A")).toBeNull();
  });
});

describe("appTarget", () => {
  test("keeps the search and the hash", () => {
    expect(appTarget("/squad/a/b?tab=history#x", ORIGIN)).toBe("/squad/a/b?tab=history#x");
    expect(appTarget(`${ORIGIN}/stats?tab=managers`, ORIGIN)).toBe("/stats?tab=managers");
  });

  test("leaves other origins and other pages to the browser", () => {
    expect(appTarget("https://westlab.dev/", ORIGIN)).toBeNull();
    expect(appTarget("/match-live", ORIGIN)).toBeNull();
    expect(appTarget("/match-preview", ORIGIN)).toBe("/match-preview");
    expect(appTarget("mailto:x@y.z", ORIGIN)).toBeNull();
  });
});

describe("interceptedTarget", () => {
  test("a plain left click on a frame link", () => {
    expect(interceptedTarget(click, link(`${ORIGIN}/club`), ORIGIN)).toBe("/club");
  });

  test("modifiers, other buttons, new tabs and downloads stay with the browser", () => {
    expect(interceptedTarget({ ...click, ctrlKey: true }, link("/club"), ORIGIN)).toBeNull();
    expect(interceptedTarget({ ...click, metaKey: true }, link("/club"), ORIGIN)).toBeNull();
    expect(interceptedTarget({ ...click, shiftKey: true }, link("/club"), ORIGIN)).toBeNull();
    expect(interceptedTarget({ ...click, button: 1 }, link("/club"), ORIGIN)).toBeNull();
    expect(interceptedTarget({ ...click, defaultPrevented: true }, link("/club"), ORIGIN)).toBeNull();
    expect(interceptedTarget(click, link("/club", { target: "_blank" }), ORIGIN)).toBeNull();
    expect(interceptedTarget(click, link("/club", { hasDownload: true }), ORIGIN)).toBeNull();
    expect(interceptedTarget(click, link("/club", { target: "_self" }), ORIGIN)).toBe("/club");
  });
});
