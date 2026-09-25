import { describe, expect, test } from "bun:test";
import { espnRole, matchPlayers, type AthleteRef, type WorldPlayerRef } from "@/../scripts/espn/matchPlayers";

const wp = (id: string, name: string, age: number, role: WorldPlayerRef["role"], squadId = "s1", fullName?: string): WorldPlayerRef =>
  ({ id, name, fullName, age, role, squadId });
const ath = (espnId: string, name: string, age: number | null, role: AthleteRef["role"], teamSquadId: string | null = "s1", fullName = name): AthleteRef =>
  ({ espnId, displayName: name, fullName, age, role, teamSquadId });

describe("espnRole", () => {
  test("maps G/D/M/F", () => {
    expect(espnRole("G")).toBe("GK");
    expect(espnRole("F")).toBe("Forward");
    expect(espnRole(null)).toBeNull();
  });
});

describe("matchPlayers", () => {
  const world = [
    wp("p1", "Bukayo Saka", 23, "Forward"),
    wp("p2", "Martin Ødegaard", 26, "Midfielder", "s2"),
    wp("p3", "João Silva", 20, "Defender", "s3"),
    wp("p4", "João Silva", 22, "Defender", "s4"),
    wp("p5", "Kepa", 30, "GK", "s5", "Kepa Arrizabalaga Revuelta"),
  ];

  test("matches by name + age window + role, anywhere in the world", () => {
    const m = matchPlayers([ath("a1", "Bukayo Saka", 25, "Forward"), ath("a2", "Martin Odegaard", 28, "Midfielder")], world, {});
    expect(m.get("a1")).toBe("p1");
    expect(m.get("a2")).toBe("p2");
  });

  test("rejects an impossible age", () => {
    const m = matchPlayers([ath("a1", "Bukayo Saka", 30, "Forward")], world, {});
    expect(m.has("a1")).toBe(false);
  });

  test("rejects GK vs outfield, accepts an adjacent line", () => {
    expect(matchPlayers([ath("a1", "Bukayo Saka", 25, "GK")], world, {}).has("a1")).toBe(false);
    expect(matchPlayers([ath("a1", "Bukayo Saka", 25, "Midfielder")], world, {}).get("a1")).toBe("p1");
  });

  test("uses fullName and picks the age closest to +2", () => {
    const m = matchPlayers([ath("a1", "Kepa", 32, "GK", "s9", "Kepa Arrizabalaga"), ath("a2", "Joao Silva", 24, "Defender", "x")], world, {});
    expect(m.get("a1")).toBe("p5");
    expect(m.get("a2")).toBe("p4");
  });

  test("a world player is claimed once", () => {
    const m = matchPlayers([ath("a1", "Bukayo Saka", 25, "Forward"), ath("a2", "Bukayo Saka", 25, "Forward")], world, {});
    expect(m.get("a1")).toBe("p1");
    expect(m.has("a2")).toBe(false);
  });

  test("override wins and must exist", () => {
    expect(matchPlayers([ath("a1", "Someone Else", 25, "Forward")], world, { a1: "p1" }).get("a1")).toBe("p1");
    expect(() => matchPlayers([ath("a1", "X", 25, "Forward")], world, { a1: "zz" })).toThrow(/unknown player/);
  });
});
