import { describe, expect, test } from "bun:test";
import { matchClubs, type EspnClubRef, type WorldClubRef } from "@/../scripts/espn/matchClubs";

const world: WorldClubRef[] = [
  { id: "33", name: "Manchester United", country: "England", league: "league" },
  { id: "50", name: "Manchester City", country: "England", league: "league" },
  { id: "47", name: "Tottenham", country: "England", league: "league" },
  { id: "39", name: "Wolves", country: "England", league: "league" },
  { id: "of_gb_coventry_city", name: "Coventry City", country: "England", league: "league" },
  { id: "of_es_coventry", name: "Coventry City", country: "Spain", league: "league" },
];
const team = (espnId: string, name: string, country = "England", league = "league"): EspnClubRef => ({ espnId, name, shortName: name, country, league });

describe("matchClubs", () => {
  test("override, exact, loose and new", () => {
    const m = matchClubs(
      [team("1", "Manchester United"), team("2", "Tottenham Hotspur"), team("3", "Wolverhampton Wanderers"),
       team("4", "Coventry City"), team("5", "Hull City")],
      world, { "3": "39" },
    );
    expect(m.get("1")).toEqual({ squadId: "33", via: "exact" });
    expect(m.get("2")).toEqual({ squadId: "47", via: "loose" });
    expect(m.get("3")).toEqual({ squadId: "39", via: "override" });
    expect(m.get("4")).toEqual({ squadId: "of_gb_coventry_city", via: "exact" });
    expect(m.get("5")).toEqual({ squadId: null, via: "new" });
  });

  test("never matches across countries", () => {
    const m = matchClubs([team("9", "Coventry City", "Spain")], world, {});
    expect(m.get("9")!.squadId).toBe("of_es_coventry");
  });

  test("ambiguous loose key does not match", () => {
    const m = matchClubs([team("7", "Manchester")], world, {});
    expect(m.get("7")).toEqual({ squadId: null, via: "new" });
  });

  test("two ESPN clubs on the same squad throws", () => {
    expect(() => matchClubs([team("1", "Everton"), team("2", "Everton FC")], [{ id: "e", name: "Everton", country: "England", league: "league" }], {}))
      .toThrow(/both match/);
  });

  test("override to an unknown squad throws", () => {
    expect(() => matchClubs([team("1", "X")], world, { "1": "nope" })).toThrow(/unknown squad/);
  });

  test("a loose key shared by two ESPN clubs of the same country is not used", () => {
    const w: WorldClubRef[] = [{ id: "u", name: "Man Utd", country: "England", league: "league" }, { id: "c", name: "Manchester", country: "England", league: "league" }];
    const m = matchClubs([team("1", "Manchester United"), team("2", "Manchester City")], w, {});
    expect(m.get("1")).toEqual({ squadId: null, via: "new" });
    expect(m.get("2")).toEqual({ squadId: null, via: "new" });
  });

  test("loose/prefix never pick a sibling whose twin was already claimed", () => {
    const w: WorldClubRef[] = [{ id: "bc", name: "Bristol City", country: "England", league: "league" }, { id: "br", name: "Bristol Rovers", country: "England", league: "league" }];
    const m = matchClubs([team("1", "Bristol City"), team("2", "Bristol Wanderers")], w, {});
    expect(m.get("1")).toEqual({ squadId: "bc", via: "exact" });
    expect(m.get("2")).toEqual({ squadId: null, via: "new" });
  });

  test("prefix pass catches what exact and loose don't", () => {
    const w: WorldClubRef[] = [{ id: "bha", name: "Brighton & Hove Albion", country: "England", league: "league" }];
    const m = matchClubs([team("1", "Brighton")], w, {});
    expect(m.get("1")).toEqual({ squadId: "bha", via: "prefix" });
  });

  test("matches on shortName when the full name doesn't match", () => {
    const w: WorldClubRef[] = [{ id: "rp", name: "River Plate", country: "Argentina", league: "league" }];
    const m = matchClubs(
      [{ espnId: "1", name: "Club Atlético River Plate", shortName: "River Plate", country: "Argentina", league: "league" }],
      w, {},
    );
    expect(m.get("1")).toEqual({ squadId: "rp", via: "exact" });
  });
});

describe("matchClubs — name-first / shortName-fallback and same-league tie-break", () => {
  test("a clean name match is not made ambiguous by a shortName that also matches something else", () => {
    // Old behaviour: name∪shortName unions "real sociedad" (name) with "sociedad" (shortName),
    // matching BOTH clubs below → ambiguous → no match. New behaviour: name alone already gives a
    // unique candidate, so shortName is never consulted.
    const w: WorldClubRef[] = [
      { id: "rs", name: "Real Sociedad", country: "Spain", league: "la_liga" },
      { id: "soc", name: "Sociedad", country: "Spain", league: "segunda" },
    ];
    const m = matchClubs([{ espnId: "1", name: "Real Sociedad", shortName: "Sociedad", country: "Spain", league: "la_liga" }], w, {});
    expect(m.get("1")).toEqual({ squadId: "rs", via: "exact" });
  });

  test("league tie-break resolves a top-flight club against its reserve/lower-division namesake", () => {
    // Name alone matches nothing (falls back to shortName "Zenit"), which exact-matches BOTH
    // "Zenit" and "Zenit 2" (digits are stripped by clubKey normalization, so both keys are "zenit").
    // The ESPN team's own league (premier) narrows it to the one candidate sharing that league.
    const w: WorldClubRef[] = [
      { id: "zenit1", name: "Zenit", country: "Russia", league: "premier" },
      { id: "zenit2", name: "Zenit 2", country: "Russia", league: "second_division" },
    ];
    const m = matchClubs([{ espnId: "1", name: "Zenit Saint Petersburg", shortName: "Zenit", country: "Russia", league: "premier" }], w, {});
    expect(m.get("1")).toEqual({ squadId: "zenit1", via: "exact" });
  });

  test("without a candidate in the ESPN team's own league, the ambiguity is preserved (no false resolution)", () => {
    const w: WorldClubRef[] = [
      { id: "zenit1", name: "Zenit", country: "Russia", league: "championship" },
      { id: "zenit2", name: "Zenit 2", country: "Russia", league: "second_division" },
    ];
    const m = matchClubs([{ espnId: "1", name: "Zenit Saint Petersburg", shortName: "Zenit", country: "Russia", league: "premier" }], w, {});
    expect(m.get("1")).toEqual({ squadId: null, via: "new" });
  });
});
