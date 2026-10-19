import { describe, expect, test } from "bun:test";
import { humanClubsOf } from "@/Domain/multiplayer/humanClubs";
import type { WorldMemberView } from "@/types/multiplayerTypes";

const member = (over: Partial<WorldMemberView>): WorldMemberView => ({
  seatId: "s1", role: "member", nickname: "dw3st", managerName: "Dave", face: null, nationalityIso: null,
  clubId: "33", clubName: "Man United", clubColors: ["#f00", "#fff"], leagueSlug: "premier_league",
  leagueName: "Premier League", unemployed: false, ...over,
});

describe("humanClubsOf", () => {
  test("maps each club to the nickname, falling back to the manager's name", () => {
    const map = humanClubsOf([member({}), member({ seatId: "s2", clubId: "40", nickname: null, managerName: "Fabio" })]);
    expect([...map]).toEqual([["33", "dw3st"], ["40", "Fabio"]]);
  });
  test("skips members without a club", () => {
    expect(humanClubsOf([member({ unemployed: true }), member({ clubId: "" })]).size).toBe(0);
  });
});
