import { describe, expect, test } from "bun:test";
import { continentalClubStatusOf } from "@/Domain/continental/clubStatus";
import type { ContinentalMetaData, Fixture } from "@/types/calendarTypes";

function meta(overrides: Partial<ContinentalMetaData> = {}): ContinentalMetaData {
  return {
    competition: "ucl",
    continent: "Europe",
    groups: [{ name: "C", clubs: ["my_club", "real_madrid", "bayern", "ajax"] }],
    stages: [
      { name: "group", rounds: [1, 2, 3, 4, 5, 6], dates: [], drawn: true },
      { name: "r16", rounds: [7, 8], dates: [], drawn: false },
      { name: "qf", rounds: [9, 10], dates: [], drawn: false },
      { name: "sf", rounds: [11, 12], dates: [], drawn: false },
      { name: "final", rounds: [13], dates: [], drawn: false },
    ],
    countryOf: {},
    level: {},
    championId: null,
    ...overrides,
  };
}

function tie(home: string, away: string, date: string, extra: Partial<Fixture> = {}): Fixture {
  return {
    id: `f_${home}_${away}`, date, competition: "ucl", round: 7, home, away,
    played: false, result: null, tieId: `t_${home}_${away}`, leg: 1,
    ...extra,
  };
}

describe("continentalClubStatusOf", () => {
  test("club not in any group returns null", () => {
    expect(continentalClubStatusOf(meta(), "outsider", [])).toBeNull();
  });

  test("r16 not drawn yet: still in the group stage", () => {
    const status = continentalClubStatusOf(meta(), "my_club", []);
    expect(status).toEqual({
      kind: "group",
      group: "C",
      opponentIds: ["real_madrid", "bayern", "ajax"],
    });
  });

  test("r16 drawn and club is the home side of its tie", () => {
    const r16Fixtures = [tie("my_club", "real_madrid", "2028-02-16")];
    const cont = meta({
      stages: [
        { name: "group", rounds: [1, 2, 3, 4, 5, 6], dates: [], drawn: true },
        { name: "r16", rounds: [7, 8], dates: [], drawn: true },
        { name: "qf", rounds: [9, 10], dates: [], drawn: false },
        { name: "sf", rounds: [11, 12], dates: [], drawn: false },
        { name: "final", rounds: [13], dates: [], drawn: false },
      ],
    });
    const status = continentalClubStatusOf(cont, "my_club", r16Fixtures);
    expect(status).toEqual({
      kind: "drawn",
      stage: "r16",
      opponentId: "real_madrid",
      firstLegDate: "2028-02-16",
      venue: "home",
    });
  });

  test("r16 drawn and club is the away side of its tie", () => {
    const r16Fixtures = [tie("real_madrid", "my_club", "2028-02-16")];
    const cont = meta({
      stages: [
        { name: "group", rounds: [1, 2, 3, 4, 5, 6], dates: [], drawn: true },
        { name: "r16", rounds: [7, 8], dates: [], drawn: true },
        { name: "qf", rounds: [9, 10], dates: [], drawn: false },
        { name: "sf", rounds: [11, 12], dates: [], drawn: false },
        { name: "final", rounds: [13], dates: [], drawn: false },
      ],
    });
    const status = continentalClubStatusOf(cont, "my_club", r16Fixtures);
    expect(status).toEqual({
      kind: "drawn",
      stage: "r16",
      opponentId: "real_madrid",
      firstLegDate: "2028-02-16",
      venue: "away",
    });
  });

  test("r16 drawn and club is not in it: eliminated in the group stage", () => {
    const r16Fixtures = [tie("real_madrid", "bayern", "2028-02-16")];
    const cont = meta({
      stages: [
        { name: "group", rounds: [1, 2, 3, 4, 5, 6], dates: [], drawn: true },
        { name: "r16", rounds: [7, 8], dates: [], drawn: true },
        { name: "qf", rounds: [9, 10], dates: [], drawn: false },
        { name: "sf", rounds: [11, 12], dates: [], drawn: false },
        { name: "final", rounds: [13], dates: [], drawn: false },
      ],
    });
    const status = continentalClubStatusOf(cont, "my_club", r16Fixtures);
    expect(status).toEqual({ kind: "eliminatedGroup" });
  });
});
