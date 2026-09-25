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
});
