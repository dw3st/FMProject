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
    const w = [
      wp("q1", "Carlos Souza", 24, "Defender", "teamX"), // gap 3 at aX's own club
      wp("q2", "Carlos Souza", 25, "Defender", "teamY"), // gap 2, the numerically "better" match, but a different club
    ];
    // aX belongs to teamX and must match q1 despite q2 being a closer age match — club always wins,
    // and processing aX first must not let it reach across and steal teamY's player either.
    const m = matchPlayers(
      [ath("aX", "Carlos Souza", 27, "Defender", "teamX"), ath("aY", "Carlos Souza", 27, "Defender", "teamY")],
      w,
      {},
    );
    expect(m.get("aX")).toBe("q1");
    expect(m.get("aY")).toBe("q2");
  });

  test("ambiguous tie in pass B skips the athlete", () => {
    // EXPECTED_AGE_GAP is 1: gap 0 → |0-1| = 1, gap 2 → |2-1| = 1 (tie).
    const w = [
      wp("q1", "Andre Costa", 24, "Forward", "clubA"), // gap 0
      wp("q2", "Andre Costa", 22, "Forward", "clubB"), // gap 2 (tie)
    ];
    // The athlete belongs to neither club, so pass A never resolves it — only pass B sees it, and ties.
    const m = matchPlayers([ath("a1", "Andre Costa", 24, "Forward", "elsewhere")], w, {});
    expect(m.has("a1")).toBe(false);
  });

  test("pass A also skips on an identical-rank tie at the same club, and pass B never picks it up either", () => {
    // EXPECTED_AGE_GAP is 1: gap 0 → |0-1| = 1, gap 2 → |2-1| = 1 (tie); q3's gap 1 would be the
    // "perfect" pass-B match, but must never be reached since a1 already had a (ambiguous) club candidate.
    const w = [
      wp("q1", "Bruno Lima", 25, "Forward", "home"), // gap 0
      wp("q2", "Bruno Lima", 23, "Forward", "home"), // gap 2 (tie)
      wp("q3", "Bruno Lima", 24, "Forward", "away"), // gap 1, a perfect pass-B match — must NOT be used
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

  test("a one-token name at a foreign club is never matched (not even in pass B)", () => {
    const m = matchPlayers([ath("a1", "Kepa", 32, "GK", "s9", "Kepa Arrizabalaga")], world, {});
    expect(m.has("a1")).toBe(false);
  });

  test("a null-role athlete is rejected in pass B", () => {
    const w = [wp("q1", "Felipe Rocha", 24, "Forward", "away")];
    const m = matchPlayers([ath("a1", "Felipe Rocha", 26, null, "elsewhere")], w, {});
    expect(m.has("a1")).toBe(false);
  });

  test("a one-token displayName with a two-token fullName matches in pass B only via the fullName key", () => {
    const w = [wp("q1", "Neymar Junior", 24, "Forward", "away")];
    const m = matchPlayers([ath("a1", "Neymar", 26, "Forward", "elsewhere", "Neymar Junior")], w, {});
    expect(m.get("a1")).toBe("q1");
  });
});

describe("matchPlayers — pass A2 (club, surname fallback)", () => {
  test("matches an abbreviated world name via surname + full first name in fullName", () => {
    const w = [wp("q1", "T. Hübers", 29, "Defender", "home", "Timo Bernd Hübers")];
    const m = matchPlayers([ath("a1", "Timo Hübers", 30, "Defender", "home")], w, {});
    expect(m.get("a1")).toBe("q1");
  });

  test("matches a mononym world name via surname carried only in fullName", () => {
    const w = [wp("q1", "Kepa", 31, "GK", "home", "Kepa Arrizabalaga Revuelta")];
    const m = matchPlayers([ath("a1", "Kepa Arrizabalaga", 32, "GK", "home")], w, {});
    expect(m.get("a1")).toBe("q1");
  });

  test("two same-club candidates sharing surname and first-name initial are left unmatched", () => {
    const w = [
      wp("q1", "M. Ferreira", 24, "Forward", "home", "Mateus Ferreira"),
      wp("q2", "M. Ferreira", 23, "Forward", "home", "Miguel Ferreira"),
    ];
    const m = matchPlayers([ath("a1", "Marco Ferreira", 25, "Forward", "home")], w, {});
    expect(m.has("a1")).toBe(false);
  });

  test("a null-age athlete never matches via A2", () => {
    const w = [wp("q1", "Mateus Silva", 30, "Defender", "home")];
    const m = matchPlayers(
      [ath("a1", "Matheus Antonio Uchôa Da Silva", null, "Defender", "home")],
      w,
      {},
    );
    expect(m.has("a1")).toBe(false);
  });

  test("A2 never matches across clubs", () => {
    const w = [wp("q1", "T. Hübers", 29, "Defender", "away", "Timo Bernd Hübers")];
    const m = matchPlayers([ath("a1", "Timo Hübers", 30, "Defender", "home")], w, {});
    expect(m.has("a1")).toBe(false);
  });

  test("a surname shorter than 3 characters is never used for A2", () => {
    const w = [wp("q1", "J. Wu", 24, "Forward", "home", "Joanne Wu")];
    const m = matchPlayers([ath("a1", "Jo Wu", 25, "Forward", "home")], w, {});
    expect(m.has("a1")).toBe(false);
  });

  test("an athlete blocked by pass-A ambiguity is never retried in A2", () => {
    // Two club-mates share the exact same normalized name key and tie under EXPECTED_AGE_GAP=1
    // (gap 0 vs gap 2, both |gap-1|=1) → pass A is ambiguous and blocks a1. A distinct A2-only
    // candidate (different key, matching surname/initial) must not rescue it.
    const w = [
      wp("q1", "Diego Ramos", 25, "Forward", "home"), // gap 0
      wp("q2", "Diego Ramos", 23, "Forward", "home"), // gap 2 (tie)
      wp("q3", "D. Ramos", 24, "Forward", "home", "Diego Ramos Extra"),
    ];
    const m = matchPlayers([ath("a1", "Diego Ramos", 25, "Forward", "home")], w, {});
    expect(m.has("a1")).toBe(false);
  });

  test("matches via the initial alone when the world player has no fullName at all", () => {
    const w = [wp("q1", "T. Hübers", 30, "Defender", "home")]; // no fullName — "timo" never appears anywhere
    const m = matchPlayers([ath("a1", "Timo Hübers", 30, "Defender", "home")], w, {});
    expect(m.get("a1")).toBe("q1");
  });

  test("A2 rejects a GK vs outfield candidate even with matching surname + initial", () => {
    const w = [wp("q1", "T. Hübers", 29, "GK", "home", "Timo Bernd Hübers")];
    const m = matchPlayers([ath("a1", "Timo Hübers", 30, "Defender", "home")], w, {});
    expect(m.has("a1")).toBe(false);
  });

  test("A2 rejects a candidate whose age gap falls outside [0,3]", () => {
    const w = [wp("q1", "T. Hübers", 26, "Defender", "home", "Timo Bernd Hübers")]; // gap 4
    const m = matchPlayers([ath("a1", "Timo Hübers", 30, "Defender", "home")], w, {});
    expect(m.has("a1")).toBe(false);
  });

  test("two-sided uniqueness: two athletes whose sole A2 candidate is the same world player match neither", () => {
    // "Brothers" scenario: both athletes reduce to surname "ferreira" + initial "m" against the
    // one abbreviated world record, so each one's OWN candidate list has exactly one entry — but
    // that entry is shared, so a purely one-sided check would let whichever is processed first
    // claim it. Ages are chosen so both fall inside the [0,3] age-gap window against the world
    // player's age (21): Mateus gap 3, Marco gap 1.
    const w = [wp("q1", "M. Ferreira", 21, "Midfielder", "home")];
    const m = matchPlayers(
      [ath("a1", "Mateus Ferreira", 24, "Midfielder", "home"), ath("a2", "Marco Ferreira", 22, "Midfielder", "home")],
      w,
      {},
    );
    expect(m.has("a1")).toBe(false);
    expect(m.has("a2")).toBe(false);
  });
});
