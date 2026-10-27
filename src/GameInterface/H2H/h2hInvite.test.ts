import { describe, expect, test } from "bun:test";
import { inviteFor, parseH2HInvite } from "@/GameInterface/H2H/h2hInvite";
import { parseServerEvent } from "@/GameInterface/Social/socialState";

describe("h2h invite", () => {
  test("parses only a complete invite", () => {
    expect(parseH2HInvite(JSON.stringify({ saveId: "s", fixtureId: "f", from: "Fabio" }))).toEqual({ saveId: "s", fixtureId: "f", from: "Fabio" });
    expect(parseH2HInvite(null)).toBeNull();
    expect(parseH2HInvite("nope")).toBeNull();
    expect(parseH2HInvite(JSON.stringify({ saveId: "s", from: "Fabio" }))).toBeNull();
    expect(parseH2HInvite(JSON.stringify({ saveId: "", fixtureId: "f", from: "x" }))).toBeNull();
  });

  test("matches only the same world and game", () => {
    const inv = { saveId: "s", fixtureId: "f", from: "Fabio" };
    expect(inviteFor(inv, "s", "f")).toBe(inv);
    expect(inviteFor(inv, "s", "g")).toBeNull();
    expect(inviteFor(inv, "t", "f")).toBeNull();
    expect(inviteFor(inv, "s", null)).toBeNull();
    expect(inviteFor(null, "s", "f")).toBeNull();
  });

  test("the social socket parses the invite and the closed room", () => {
    expect(parseServerEvent(JSON.stringify({ type: "h2h_invite", saveId: "s", fixtureId: "f", from: "Fabio" })))
      .toEqual({ type: "h2h_invite", saveId: "s", fixtureId: "f", from: "Fabio" });
    expect(parseServerEvent(JSON.stringify({ type: "h2h_closed", saveId: "s", fixtureId: "f", reason: "simulated" })))
      .toEqual({ type: "h2h_closed", saveId: "s", fixtureId: "f", reason: "simulated" });
    expect(parseServerEvent(JSON.stringify({ type: "h2h_closed", saveId: "s", fixtureId: "f", reason: "boom" }))).toBeNull();
    expect(parseServerEvent(JSON.stringify({ type: "h2h_invite", saveId: "s", from: "Fabio" }))).toBeNull();
  });
});
