import { describe, expect, test } from "bun:test";
import { accountAchievements, accountSummary, parseBadges, shownBadges } from "@/Domain/account/accountProfile";
import type { AccountCareer, CareerTitle } from "@/types/accountTypes";

function career(over: Partial<AccountCareer> = {}): AccountCareer {
  return {
    saveId: "s1", seatId: "seat1", managerName: "Ana", mode: "solo", date: "2028-05-01",
    clubId: "c1", clubName: "Clube 1", passages: [{ squadId: "c1", clubName: "Clube 1", from: "2027-02-05" }],
    titles: [], awards: [], seasons: 0, matches: 0, wins: 0, cards: { yellow: 0, red: 0 }, ...over,
  };
}
const t = (kind: CareerTitle["kind"], over: Partial<CareerTitle> = {}): CareerTitle =>
  ({ kind, competition: "l1", season: "2027", squadId: "c1", ...over });

describe("accountSummary", () => {
  test("sums the careers", () => {
    const s = accountSummary([
      career({ titles: [t("league"), t("cup"), t("promotion")], seasons: 3, matches: 100, wins: 55, cards: { yellow: 2, red: 1 },
        awards: [{ kind: "best_manager", season: "2027", competition: "l1" }],
        passages: [{ squadId: "c1", clubName: "A", from: "2027-01-01", to: "2028-01-01", left: "sacked" }, { squadId: "c2", clubName: "B", from: "2028-01-02" }] }),
      career({ saveId: "s2", mode: "friends", titles: [t("continental")], seasons: 2, matches: 50, wins: 20 }),
    ]);
    expect(s.titles).toEqual({ total: 3, league: 1, cup: 1, continental: 1, national: 0, promotion: 1 });
    expect(s.seasons).toBe(5);
    expect(s.clubs).toBe(3);
    expect(s.winPct).toBe(50);
    expect(s.sackings).toBe(1);
    expect(s.cards).toEqual({ yellow: 2, red: 1 });
    expect(s.friendsCareers).toBe(1);
    expect(s.awards).toEqual({ total: 1, league: 1, world: 0 });
  });
  test("no matches: 0%", () => expect(accountSummary([career()]).winPct).toBe(0));
});

describe("accountAchievements", () => {
  test("40 in total, tracks by threshold", () => {
    const v = accountAchievements([career({ titles: [t("league"), t("league"), t("league")] })]);
    expect(v.total).toBe(40);
    expect(v.tracks.find((x) => x.id === "league_titles")!.tier).toBe("bronze");
    expect(v.unlocked).toBe(1);
  });
  test("title countries and saves", () => {
    const v = accountAchievements([
      career({ titles: [t("league", { country: "England" })] }),
      career({ saveId: "s2", titles: [t("league", { country: "Brazil" })] }),
    ]);
    expect(v.tracks.find((x) => x.id === "title_countries")!.value).toBe(2);
    expect(v.tracks.find((x) => x.id === "title_saves")!.value).toBe(2);
  });
  test("singles", () => {
    const v = accountAchievements([career({
      mode: "friends",
      awards: [{ kind: "world_manager", season: "2027", competition: "world" }],
      titles: [t("national", { competition: "wc_2030" }), t("promotion", { competition: "l2", season: "2027" }), t("league", { competition: "l1", season: "2028" })],
    })]);
    expect(v.singles.every((x) => x.unlocked)).toBe(true);
  });
  test("up and champion needs another league after the promotion", () => {
    const v = accountAchievements([career({ titles: [t("league", { competition: "l2", season: "2027" }), t("promotion", { competition: "l2", season: "2027" })] })]);
    expect(v.singles.find((x) => x.id === "up_and_champion")!.unlocked).toBe(false);
  });
  test("secrets: treble, two continents, short fuse, wanderer, phoenix", () => {
    const v = accountAchievements([career({
      titles: [t("league", { season: "2027-28" }), t("cup", { season: "2027-28" }), t("continental", { competition: "ucl", season: "2027-28" }),
        t("continental", { competition: "lib", season: "2029", squadId: "c3" }), t("league", { squadId: "c2", on: "2029-05-01" })],
      cards: { yellow: 0, red: 10 },
      passages: [
        { squadId: "c1", clubName: "A", from: "2027-01-01", to: "2028-01-01", left: "sacked" },
        { squadId: "c2", clubName: "B", from: "2028-02-01", to: "2029-08-01", left: "sacked" },
        { squadId: "c3", clubName: "C", from: "2029-09-01", to: "2030-01-01", left: "sacked" },
      ],
    })]);
    expect(v.secrets.every((x) => x.unlocked)).toBe(true);
  });
  test("locked secrets carry no id", () => {
    expect(accountAchievements([career()]).secrets[0]).toEqual({ unlocked: false });
  });
});

describe("badges", () => {
  const gold = accountAchievements([career({ seasons: 50 })]);
  test("only gold tracks, up to 3, no repeats", () => {
    expect(parseBadges(["seasons"], gold)).toEqual(["seasons"]);
    expect(parseBadges(["wins"], gold)).toBeNull();
    expect(parseBadges(["seasons", "seasons"], gold)).toBeNull();
    expect(parseBadges("x", gold)).toBeNull();
  });
  test("a stored badge that lost its gold is hidden", () => {
    expect(shownBadges(["seasons", "wins"], gold)).toEqual(["seasons"]);
  });
});
