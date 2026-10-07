import { describe, expect, test } from "bun:test";
import { balanceSquadLines, squadLineIssues } from "@/../scripts/transfermarkt/balance";
import { getMainRole } from "@/Domain/roles";
import type { PlayerStatsRecord, RosterPlayer } from "@/types/playerTypes";

const stats = (v: number): PlayerStatsRecord => ({
  passing: v, vision: v, finishing: v, dribbling: v, speed: v, acceleration: v,
  tackling: v, pressing: v, stamina: v, heading: v, strength: v, reflex: v, jump: v,
});

function player(id: string, line: string, level: number): RosterPlayer {
  return {
    id, name: `P ${id}`, age: 25, squadId: "c1", preferredFoot: "right", positions: [line], stats: stats(level),
    profile: { summary: "" } as RosterPlayer["profile"],
  };
}

const level = (p: RosterPlayer) => p.stats.passing;
const base = { GK: stats(4), Defender: stats(4), Midfielder: stats(4), Forward: stats(4) };
const input = (players: RosterPlayer[]) => ({
  squadId: "c1", players, pool: { first: ["Ana"], last: ["Lima"] }, country: "Brazil",
  leagueBase: base, worldBase: base, overall: level, rank: level,
});
const count = (ps: RosterPlayer[], line: string) => ps.filter((p) => getMainRole(p.positions[0] ?? "") === line).length;

describe("balanceSquadLines", () => {
  test("fills a short line with filler youth and cuts back to 30 keeping every minimum", () => {
    // 30 players, only 4 midfielders (the Richards Bay case): 3 GK, 14 DEF, 4 MID, 9 FWD.
    const players = [
      ...Array.from({ length: 3 }, (_, i) => player(`g${i}`, "GK", 5)),
      ...Array.from({ length: 14 }, (_, i) => player(`d${i}`, "Defender", 5 + (i % 7) / 10)),
      ...Array.from({ length: 4 }, (_, i) => player(`m${i}`, "Midfielder", 5)),
      ...Array.from({ length: 8 }, (_, i) => player(`f${i}`, "Forward", 5 + i / 10)),
      player("es_youth_c1_0", "Forward", 5), // an earlier filler: its id is never reused
    ];
    const r = balanceSquadLines(input(players));
    expect(r.players.length).toBe(30);
    expect(squadLineIssues(r.players)).toEqual([]);
    expect(count(r.players, "Midfielder")).toBe(7);
    expect(r.added.length).toBe(3);
    expect(r.added.every((p) => p.id.startsWith("es_youth_c1_") && p.id !== "es_youth_c1_0")).toBe(true);
    expect(new Set(r.players.map((p) => p.id)).size).toBe(30);
    // The cut takes the lowest ranked of the lines with a surplus (defenders at 5.0).
    expect(r.cut.length).toBe(3);
    expect(r.cut.every((p) => getMainRole(p.positions[0]!) !== "Midfielder" && level(p) === 5)).toBe(true);
    // Idempotent: a second pass changes nothing.
    expect(balanceSquadLines(input(r.players)).players).toBe(r.players);
  });

  test("cuts a squad above 30 without breaking a line minimum", () => {
    const players = [
      ...Array.from({ length: 3 }, (_, i) => player(`g${i}`, "GK", 1)),
      ...Array.from({ length: 7 }, (_, i) => player(`d${i}`, "Defender", 2)),
      ...Array.from({ length: 18 }, (_, i) => player(`m${i}`, "Midfielder", 4 + i / 10)),
      ...Array.from({ length: 4 }, (_, i) => player(`f${i}`, "Forward", 2)),
    ];
    const r = balanceSquadLines(input(players));
    expect(r.players.length).toBe(30);
    expect(r.added).toEqual([]);
    expect(r.cut.map((p) => p.id).sort()).toEqual(["m0", "m1"]);
  });

  test("a squad within the limits is returned as is", () => {
    const players = [
      ...Array.from({ length: 3 }, (_, i) => player(`g${i}`, "GK", 5)),
      ...Array.from({ length: 7 }, (_, i) => player(`d${i}`, "Defender", 5)),
      ...Array.from({ length: 7 }, (_, i) => player(`m${i}`, "Midfielder", 5)),
      ...Array.from({ length: 4 }, (_, i) => player(`f${i}`, "Forward", 5)),
    ];
    expect(balanceSquadLines(input(players)).players).toBe(players);
    expect(squadLineIssues(players.slice(1))).toContain("GK 2 < 3");
  });
});
