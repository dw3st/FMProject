import { describe, expect, test } from "bun:test";
import { badgeQueries, coreTokens, nameFromId, ourVariants, pickBadgeTeam, sameCountry, type TsdbTeam } from "@/../scripts/thesportsdb/badgeMatch";

const team = (o: Partial<TsdbTeam> & { idTeam: string; strTeam: string }): TsdbTeam =>
  ({ strSport: "Soccer", strCountry: "Poland", strBadge: "https://x/b.png", ...o });
const picked = (r: ReturnType<typeof pickBadgeTeam>) => ("team" in r ? r.team.idTeam : null);

describe("names", () => {
  test("core tokens drop club types and connectors, keep years", () => {
    expect(coreTokens("FC Spartak 1918")).toEqual(["spartak", "1918"]);
    expect(coreTokens("Gimnasia y Esgrima de Jujuy")).toEqual(["gimnasia", "esgrima", "jujuy"]);
  });
  test("id name and variants: a display name inside the id name is dropped", () => {
    expect(nameFromId("of_ar_racing_de_cordoba")).toBe("racing de cordoba");
    expect(nameFromId("137")).toBeNull();
    expect(ourVariants({ id: "of_ar_racing_de_cordoba", name: "Racing", country: "Argentina" })).toEqual([["racing", "cordoba"]]);
    expect(ourVariants({ id: "of_ch_fc_basel", name: "FC Basel", country: "Switzerland" })).toEqual([["basel"]]);
    expect(ourVariants({ id: "149", name: "Paysandu", country: "Brazil" })).toEqual([["paysandu"]]);
  });
  test("queries: name, short name, id name, cleaned name", () => {
    expect(badgeQueries({ id: "of_rs_partizan", name: "FK Partizan Beograd", shortName: "Partizan", country: "Serbia" }))
      .toEqual(["FK Partizan Beograd", "Partizan", "partizan", "partizan beograd"]);
  });
});

describe("sameCountry", () => {
  test("aliases", () => {
    expect(sameCountry("USA", "United States")).toBe(true);
    expect(sameCountry("Czech Republic", "Czechia")).toBe(true);
    expect(sameCountry("England", "England")).toBe(true);
    expect(sameCountry("England", "Wales")).toBe(false);
    expect(sameCountry("Poland", null)).toBe(false);
  });
});

describe("pickBadgeTeam", () => {
  const club = { id: "of_pl_gornik_zabrze", name: "Górnik Zabrze", country: "Poland" };
  test("same tokens (accents ignored), or an alternate name with the same tokens", () => {
    expect(picked(pickBadgeTeam(club, [team({ idTeam: "1", strTeam: "Gornik Zabrze" })]))).toBe("1");
    expect(picked(pickBadgeTeam({ id: "of_bg_ludogorets", name: "Ludogorets", country: "Poland" },
      [team({ idTeam: "2", strTeam: "Ludogorets Razgrad", strTeamAlternate: "PFC Ludogorets, Ludogorets" })]))).toBe("2");
  });
  test("a longer or shorter name of another club is not enough", () => {
    expect(picked(pickBadgeTeam({ id: "of_bg_levski", name: "Levski", country: "Poland" },
      [team({ idTeam: "1", strTeam: "Levski Lom", strTeamAlternate: "FC Levski Lom, Levski 2020" })]))).toBeNull();
    expect(picked(pickBadgeTeam({ id: "of_ar_racing_de_cordoba", name: "Racing", country: "Poland" },
      [team({ idTeam: "1", strTeam: "Racing Club", strTeamAlternate: "Racing" })]))).toBeNull();
  });
  test("other country, sport, women's or reserve side and missing badge are dropped", () => {
    for (const t of [
      team({ idTeam: "1", strTeam: "Gornik Zabrze", strCountry: "Germany" }),
      team({ idTeam: "2", strTeam: "Gornik Zabrze", strSport: "Handball" }),
      team({ idTeam: "3", strTeam: "Gornik Zabrze", strGender: "Female" }),
      team({ idTeam: "4", strTeam: "Gornik Zabrze II" }),
      team({ idTeam: "5", strTeam: "Gornik Zabrze Academy", strTeamAlternate: "Gornik Zabrze" }),
      team({ idTeam: "6", strTeam: "Gornik Zabrze", strBadge: "" }),
    ]) expect(picked(pickBadgeTeam(club, [t]))).toBeNull();
  });
  test("two passing teams are ambiguous", () => {
    const r = pickBadgeTeam(club, [team({ idTeam: "1", strTeam: "Gornik Zabrze" }), team({ idTeam: "2", strTeam: "KS Gornik Zabrze" })]);
    expect("skip" in r && r.skip).toBe("ambiguous");
  });
});
