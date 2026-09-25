import { describe, expect, test } from "bun:test";
import { matchClubs, type EspnClubRef, type WorldClubRef } from "@/../scripts/espn/matchClubs";

const world: WorldClubRef[] = [
  { id: "33", name: "Manchester United", country: "England" },
  { id: "50", name: "Manchester City", country: "England" },
  { id: "47", name: "Tottenham", country: "England" },
  { id: "39", name: "Wolves", country: "England" },
  { id: "of_gb_coventry_city", name: "Coventry City", country: "England" },
  { id: "of_es_coventry", name: "Coventry City", country: "Spain" },
];
const team = (espnId: string, name: string, country = "England"): EspnClubRef => ({ espnId, name, shortName: name, country });

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
    expect(() => matchClubs([team("1", "Everton"), team("2", "Everton FC")], [{ id: "e", name: "Everton", country: "England" }], {}))
      .toThrow(/both match/);
  });

  test("override to an unknown squad throws", () => {
    expect(() => matchClubs([team("1", "X")], world, { "1": "nope" })).toThrow(/unknown squad/);
  });

  test("a loose key shared by two ESPN clubs of the same country is not used", () => {
    const w: WorldClubRef[] = [{ id: "u", name: "Man Utd", country: "England" }, { id: "c", name: "Manchester", country: "England" }];
    const m = matchClubs([team("1", "Manchester United"), team("2", "Manchester City")], w, {});
    expect(m.get("1")).toEqual({ squadId: null, via: "new" });
    expect(m.get("2")).toEqual({ squadId: null, via: "new" });
  });

  test("loose/prefix never pick a sibling whose twin was already claimed", () => {
    const w: WorldClubRef[] = [{ id: "bc", name: "Bristol City", country: "England" }, { id: "br", name: "Bristol Rovers", country: "England" }];
    const m = matchClubs([team("1", "Bristol City"), team("2", "Bristol Wanderers")], w, {});
    expect(m.get("1")).toEqual({ squadId: "bc", via: "exact" });
    expect(m.get("2")).toEqual({ squadId: null, via: "new" });
  });

  test("prefix pass catches what exact and loose don't", () => {
    const w: WorldClubRef[] = [{ id: "bha", name: "Brighton & Hove Albion", country: "England" }];
    const m = matchClubs([team("1", "Brighton")], w, {});
    expect(m.get("1")).toEqual({ squadId: "bha", via: "prefix" });
  });

  test("matches on shortName when the full name doesn't match", () => {
    const w: WorldClubRef[] = [{ id: "rp", name: "River Plate", country: "Argentina" }];
    const m = matchClubs(
      [{ espnId: "1", name: "Club Atlético River Plate", shortName: "River Plate", country: "Argentina" }],
      w, {},
    );
    expect(m.get("1")).toEqual({ squadId: "rp", via: "exact" });
  });
});
