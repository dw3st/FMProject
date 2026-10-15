import { describe, expect, test } from "bun:test";
import { joinCodeFromPath, joinLink, worldRedirect } from "@/GameInterface/World/worldNav";

describe("world navigation", () => {
  test("in the lobby every game screen goes to /world", () => {
    const lobby = { mode: "multi" as const, world: { phase: "lobby" as const } };
    expect(worldRedirect("/dashboard", lobby)).toBe("/world");
    expect(worldRedirect("/squad/premier_league/33", lobby)).toBe("/world");
    expect(worldRedirect("/world", lobby)).toBeNull();
  });

  test("the lobby never redirects the entry pages", () => {
    const lobby = { mode: "multi" as const, world: { phase: "lobby" as const } };
    for (const p of ["/join/23456789AB", "/new-game", "/start", "/login", "/world"]) expect(worldRedirect(p, lobby)).toBeNull();
  });

  test("running: nothing moves; a solo save has no /world", () => {
    expect(worldRedirect("/dashboard", { mode: "multi", world: { phase: "running" } })).toBeNull();
    expect(worldRedirect("/world", { mode: "multi", world: { phase: "running" } })).toBeNull();
    expect(worldRedirect("/world", { mode: "solo" })).toBe("/dashboard");
    expect(worldRedirect("/dashboard", null)).toBeNull();
  });

  test("join links", () => {
    expect(joinCodeFromPath("/join/23456789AB")).toBe("23456789AB");
    expect(joinCodeFromPath("/join/")).toBe("");
    expect(joinCodeFromPath("/join/%E0")).toBe("");
    expect(joinCodeFromPath("/join/%")).toBe("");
    expect(joinLink("https://fm.example", "23456789AB")).toBe("https://fm.example/join/23456789AB");
  });
});
