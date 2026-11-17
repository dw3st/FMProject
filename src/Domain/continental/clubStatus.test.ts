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

describe("continentalClubStatusOf (league format)", () => {
  const others = Array.from({ length: 35 }, (_, i) => `c${i + 1}`);
  const pots = [["my_club", ...others.slice(0, 8)], others.slice(8, 17), others.slice(17, 26), others.slice(26, 35)];
  function leagueMeta(drawn: { playoff?: boolean; r16?: boolean } = {}, seeds?: Record<string, number>): ContinentalMetaData {
    return {
      competition: "ucl", continent: "Europe", format: "league", groups: [], pots,
      stages: [
        { name: "league", rounds: [1, 2, 3, 4, 5, 6, 7, 8], dates: [], drawn: true },
        { name: "playoff", rounds: [9, 10], dates: [], drawn: !!drawn.playoff },
        { name: "r16", rounds: [11, 12], dates: [], drawn: !!drawn.r16 },
        { name: "qf", rounds: [13, 14], dates: [], drawn: false },
        { name: "sf", rounds: [15, 16], dates: [], drawn: false },
        { name: "final", rounds: [17], dates: [], drawn: false },
      ],
      countryOf: {}, level: {}, championId: null, ...(seeds ? { seeds } : {}),
    };
  }
  const leagueRounds = new Map<number, Fixture[]>(
    [1, 2, 3, 4, 5, 6, 7, 8].map((r) => [r, [tie(r % 2 ? "my_club" : `c${r}`, r % 2 ? `c${r}` : "my_club", "2027-10-01", { round: r })]]),
  );

  test("league phase running: the 8 opponents in round order", () => {
    expect(continentalClubStatusOf(leagueMeta(), "my_club", leagueRounds))
      .toEqual({ kind: "league", opponentIds: ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"] });
    expect(continentalClubStatusOf(leagueMeta(), "outsider", leagueRounds)).toBeNull();
  });

  test("play-off drawn: top 8 waits, 9th-24th drawn, 25th-36th out", () => {
    const m = (pos: number) => leagueMeta({ playoff: true }, { my_club: pos });
    const playoff = new Map([[9, [tie("c20", "my_club", "2028-02-11", { round: 9 })]]]);
    expect(continentalClubStatusOf(m(3), "my_club", new Map([[9, []]]))).toEqual({ kind: "top8", position: 3 });
    expect(continentalClubStatusOf(m(30), "my_club", new Map([[9, []]]))).toEqual({ kind: "eliminatedLeague", position: 30 });
    expect(continentalClubStatusOf(m(12), "my_club", playoff)).toEqual({
      kind: "drawn", stage: "playoff", opponentId: "c20", firstLegDate: "2028-02-11", venue: "away",
    });
  });

  test("r16 drawn: in it -> drawn r16; lost the play-off -> eliminated in the play-off", () => {
    const m = (pos: number) => leagueMeta({ playoff: true, r16: true }, { my_club: pos });
    const playoff = new Map([[9, [tie("c20", "my_club", "2028-02-11", { round: 9 })]], [11, []]]);
    expect(continentalClubStatusOf(m(12), "my_club", playoff)).toEqual({ kind: "eliminated", stage: "playoff" });
    const r16 = new Map([[9, []], [11, [tie("my_club", "c5", "2028-03-03", { round: 11 })]]]);
    expect(continentalClubStatusOf(m(2), "my_club", r16)).toEqual({
      kind: "drawn", stage: "r16", opponentId: "c5", firstLegDate: "2028-03-03", venue: "home",
    });
  });
});
