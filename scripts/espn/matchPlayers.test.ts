import { describe, expect, test } from "bun:test";
import { espnRole, matchPlayers, type AthleteRef, type WorldPlayerRef } from "@/../scripts/espn/matchPlayers";

const wp = (
  id: string,
  name: string,
  age: number,
  role: WorldPlayerRef["role"],
  squadId = "s1",
  fullName?: string,
  country = "X",
): WorldPlayerRef => ({ id, name, fullName, age, role, squadId, country });

const ath = (
  espnId: string,
  name: string,
  age: number | null,
  role: AthleteRef["role"],
  teamSquadId: string | null = "s1",
  fullName = name,
  teamCountry = "X",
): AthleteRef => ({ espnId, displayName: name, fullName, age, role, teamSquadId, teamCountry });

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

  // Was "uses fullName and picks the age closest to +2" (a1's teamSquadId was "s9", a foreign club).
  // Under the new club-first policy a one-token key ("kepa") is only visible in pass A (the athlete's
  // own club) — at a foreign club it can never be matched at all, since pass B ignores one-token keys.
  // Updated a1's teamSquadId to "s5" (p5's real club) so the test demonstrates the new rule instead of
  // silently relying on behaviour the new policy forbids.
  test("a one-token name matches only at the athlete's own club", () => {
    const m = matchPlayers(
      [ath("a1", "Kepa", 32, "GK", "s5", "Kepa Arrizabalaga"), ath("a2", "Joao Silva", 24, "Defender", "x")],
      world,
      {},
    );
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

  test("duplicate override target throws", () => {
    expect(() =>
      matchPlayers([ath("a1", "X", 25, "Forward"), ath("a2", "Y", 25, "Forward")], world, { a1: "p1", a2: "p1" }),
    ).toThrow(/claimed twice/);
  });

  test("null-age athlete matches only at its own club, never a same-named player elsewhere", () => {
    const w = [wp("q1", "Marcus Silva", 24, "Midfielder", "home"), wp("q2", "Marcus Silva", 24, "Midfielder", "away")];

    const atOwnClub = matchPlayers([ath("a1", "Marcus Silva", null, "Midfielder", "home")], w, {});
    expect(atOwnClub.get("a1")).toBe("q1");

    const elsewhere = matchPlayers([ath("a1", "Marcus Silva", null, "Midfielder", "somewhere-else")], w, {});
    expect(elsewhere.has("a1")).toBe(false);
  });

  test("club beats better age elsewhere", () => {
    const w = [
      wp("q1", "Pedro Alves", 22, "Forward", "home"), // gap 3, edge of the window, but at the athlete's own club
      wp("q2", "Pedro Alves", 23, "Forward", "away"), // gap 2, the "perfect" gap, but elsewhere
    ];
    const m = matchPlayers([ath("a1", "Pedro Alves", 25, "Forward", "home")], w, {});
    expect(m.get("a1")).toBe("q1");
  });

  test("club pass removes order effects between two teams' athletes", () => {
    const w = [wp("q1", "Carlos Souza", 24, "Defender", "teamX"), wp("q2", "Carlos Souza", 24, "Defender", "teamY")];
    // teamX's athlete is processed first — it must not steal teamY's identically named player.
    const m = matchPlayers(
      [ath("aX", "Carlos Souza", 26, "Defender", "teamX"), ath("aY", "Carlos Souza", 26, "Defender", "teamY")],
      w,
      {},
    );
    expect(m.get("aX")).toBe("q1");
    expect(m.get("aY")).toBe("q2");
  });

  test("ambiguous tie in pass B skips the athlete", () => {
    const w = [
      wp("q1", "Andre Costa", 23, "Forward", "clubA"), // gap 1 → |1-2| = 1
      wp("q2", "Andre Costa", 21, "Forward", "clubB"), // gap 3 → |3-2| = 1 (tie)
    ];
    // The athlete belongs to neither club, so pass A never resolves it — only pass B sees it, and ties.
    const m = matchPlayers([ath("a1", "Andre Costa", 24, "Forward", "elsewhere")], w, {});
    expect(m.has("a1")).toBe(false);
  });

  test("pass A also skips on an identical-rank tie at the same club", () => {
    const w = [
      wp("q1", "Bruno Lima", 24, "Forward", "home"), // gap 1 → |1-2| = 1
      wp("q2", "Bruno Lima", 22, "Forward", "home"), // gap 3 → |3-2| = 1 (tie)
    ];
    const m = matchPlayers([ath("a1", "Bruno Lima", 25, "Forward", "home")], w, {});
    expect(m.has("a1")).toBe(false);
  });

  test("cross-country: adjacent line rejected, same line accepted", () => {
    const adjacentLineWorld = [wp("q1", "Nuno Ribeiro", 24, "Midfielder", "clubA", undefined, "Portugal")];
    const adjacent = matchPlayers(
      [ath("a1", "Nuno Ribeiro", 26, "Forward", "elsewhere", "Nuno Ribeiro", "Brazil")],
      adjacentLineWorld,
      {},
    );
    expect(adjacent.has("a1")).toBe(false);

    const sameLineWorld = [wp("q2", "Nuno Ribeiro", 24, "Forward", "clubB", undefined, "Portugal")];
    const sameLine = matchPlayers(
      [ath("a1", "Nuno Ribeiro", 26, "Forward", "elsewhere", "Nuno Ribeiro", "Brazil")],
      sameLineWorld,
      {},
    );
    expect(sameLine.get("a1")).toBe("q2");
  });

  test("same country preferred over cross-country", () => {
    const w = [
      wp("q1", "Diego Torres", 24, "Forward", "clubA", undefined, "Brazil"),
      wp("q2", "Diego Torres", 24, "Forward", "clubB", undefined, "Argentina"),
    ];
    const m = matchPlayers(
      [ath("a1", "Diego Torres", 26, "Forward", "elsewhere", "Diego Torres", "Argentina")],
      w,
      {},
    );
    expect(m.get("a1")).toBe("q2");
  });
});
