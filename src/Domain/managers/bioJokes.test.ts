import { describe, expect, test } from "bun:test";
import { matchingJokes, pickJoke, type JokeInput } from "@/Domain/managers/bioJokes";
import en from "@/i18n/locales/en.json";
import pt from "@/i18n/locales/pt-BR.json";

const base = (id: string, over: Partial<JokeInput["record"]> = {}): JokeInput => ({
  record: { id, squadId: "c1", seasons: 6, titles: [], awards: [], points: 0, clubs: [{ squadId: "c1", from: "2027-02-05" }], ...over },
  clubName: "Club One", today: "2034-11-01", rank: 50, total: 200, jobLevel: 3,
});

describe("rare funny lines of the automatic bio (8.9.41)", () => {
  test("situations: a drought, the sack, first job", () => {
    const ids = matchingJokes(base("a")).map((j) => j.id);
    expect(ids).toContain("drought");
    expect(ids).toContain("zeroPoints");
    const sacked = matchingJokes(base("b", { clubs: [
      { squadId: "x", from: "2027-01-01", to: "2027-03-01", left: "sacked" },
      { squadId: "y", from: "2027-06-01", to: "2028-06-01", left: "sacked" },
      { squadId: "z", from: "2028-07-01", to: "2029-06-01", left: "sacked" },
    ], squadId: "" })).map((j) => j.id);
    expect(sacked).toEqual(expect.arrayContaining(["sacked", "quickSack", "freeAfterSack"]));
    expect(matchingJokes(base("c", { seasons: 0 })).map((j) => j.id)).toContain("firstJob");
  });

  test("about one manager in five gets one, always the same", () => {
    let got = 0;
    for (let i = 0; i < 1000; i++) if (pickJoke(base(`m${i}`))) got++;
    expect(got).toBeGreaterThan(140);
    expect(got).toBeLessThan(260);
    expect(pickJoke(base("m7"))).toEqual(pickJoke(base("m7")));
  });

  test("every joke has a sentence in both languages", () => {
    const ids = ["sacked", "hopper", "drought", "cupsNoLeague", "interimCareer", "promotions", "freeLong", "oneClub", "europeNoLeague",
      "southAmericaNoLeague", "firstJob", "world", "worldMany", "trophies", "leagueRoutine", "hotSeat", "safeSeat", "redCards", "yellowCards",
      "cleanRecord", "debts", "privateJet", "richNoTitles", "mattress", "carNotJob", "topTen", "numberOne", "lowRank", "zeroPoints",
      "nationalJob", "nationalTitle", "resigned", "quickSack", "contracts", "bestMany", "oneTitle", "human", "manyClubs", "veteran",
      "earlyTrophy", "continentalMany", "cupMaster", "promotedStay", "interimNow", "freeAfterSack", "freeAfterResign", "neverSacked",
      "noJobYet", "oneClubTitles", "relegationMagnet"];
    const src = Bun.file("src/Domain/managers/bioJokes.ts");
    return src.text().then((code) => {
      const used = [...code.matchAll(/add\("([a-zA-Z]+)"/g)].map((m) => m[1]);
      expect(used.sort()).toEqual([...ids].sort());
      for (const id of ids) {
        expect((pt.managerPage.bio.joke as Record<string, string>)[id]).toBeTruthy();
        expect((en.managerPage.bio.joke as Record<string, string>)[id]).toBeTruthy();
      }
    });
  });
});
