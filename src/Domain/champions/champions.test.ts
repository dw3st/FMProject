import { describe, expect, test } from "bun:test";
import {
  championBoard, championRowKey, championTitles, competitionHistory, mostTitles, nationalRowName, seasonColumnLabel, seasonEndYear,
  type ChampionTitle,
} from "@/Domain/champions/champions";
import type { ManagerRecord } from "@/types/managerTypes";

const manager = (over: Partial<ManagerRecord>): ManagerRecord => ({
  id: "m", name: "Técnico", squadId: "1", isPlayer: false, points: 0, seasons: 0, titles: [], ...over,
}) as ManagerRecord;
const title = (competition: string, season: string, squadId: string) => ({ competition, season, squadId, kind: "league" as const, points: 1 });
const clubOf = (id: string) => ({ name: `Clube ${id}`, league: id.startsWith("nat_") ? null : "l", nation: id.startsWith("nat_") ? "Brazil" : null });
const champ = (competition: string, season: string, squadId: string): ChampionTitle => ({
  competition, season, squadId, clubName: squadId, league: "l", nation: null, managerName: "T", human: false,
});

describe("championTitles", () => {
  test("promotions stay out and each title counts once", () => {
    const r = championTitles([
      manager({ name: "A", titles: [title("premier_league", "2026-27", "1"), { ...title("of_championship", "2026-27", "1"), kind: "promotion" }] }),
      manager({ id: "b", name: "B", titles: [title("premier_league", "2026-27", "1")] }),
    ], clubOf);
    expect(r.map((t) => [t.competition, t.managerName])).toEqual([["premier_league", "A"]]);
  });

  test("the human mark follows the manager of that day, not the club", () => {
    const r = championTitles([
      manager({ name: "fa3sd", seatId: "s1", squadId: "9", titles: [title("la_liga", "2026-27", "541")] }),
      manager({ id: "ai", name: "IA", squadId: "541", titles: [title("la_liga", "2027-28", "541")] }),
    ], clubOf);
    expect(r.map((t) => [t.season, t.human])).toEqual([["2026-27", true], ["2027-28", false]]);
  });

  test("a national team carries its nation and no league", () => {
    const [t] = championTitles([manager({ titles: [title("copa_2028", "2028", "nat_brazil")] })], clubOf);
    expect(t).toMatchObject({ nation: "Brazil", league: null, clubName: "Clube nat_brazil" });
  });
});

describe("seasons", () => {
  test("a cross-year and a calendar-year season share the column of their last year", () => {
    expect(seasonEndYear("2026-27")).toBe(2027);
    expect(seasonEndYear("2027")).toBe(2027);
    expect(seasonEndYear("1999-00")).toBe(2000);
    expect(seasonColumnLabel(2027)).toBe("2026-27");
    expect(seasonColumnLabel(2000)).toBe("1999-00");
  });
});

describe("championBoard", () => {
  const titles = [
    champ("premier_league", "2026-27", "a"),
    champ("premier_league", "2027-28", "b"),
    champ("brazil_serie_a", "2027", "c"),
    champ("euro_2028", "2028", "d"),
    champ("wc_2030", "2030", "e"),
  ];

  test("rows keep the given order, empty rows leave, columns are only the years shown", () => {
    const b = championBoard(titles, [{ key: "ucl" }, { key: "brazil_serie_a" }, { key: "premier_league" }]);
    expect(b.rows.map((r) => r.key)).toEqual(["brazil_serie_a", "premier_league"]);
    expect(b.columns).toEqual([2027, 2028]);
    expect(b.rows[0]!.cells.get(2027)!.squadId).toBe("c");
    expect(b.rows[1]!.cells.get(2027)!.squadId).toBe("a");
  });

  test("a national tournament is one row across its editions", () => {
    expect(championRowKey("wc_2030")).toBe("wc");
    expect(championRowKey("wcq_2030_uefa")).toBe("wcq_2030_uefa");
    expect(championRowKey("ucl")).toBe("ucl");
    const b = championBoard([...titles, champ("wc_2034", "2034", "f")], [{ key: "wc" }]);
    expect(b.columns).toEqual([2030, 2034]);
  });

  test("names of the national rows carry no year", () => {
    expect(nationalRowName("wc", "pt-BR")).toBe("Copa do Mundo");
    expect(nationalRowName("euro", "en")).toBe("Euro");
    expect(nationalRowName("ucl", "en")).toBeNull();
  });
});

describe("competitionHistory / mostTitles", () => {
  const titles = [
    champ("ucl", "2026-27", "rm"),
    champ("ucl", "2028-29", "vi"),
    champ("ucl", "2027-28", "rm"),
    champ("uel", "2027-28", "at"),
  ];

  test("one competition, newest first", () => {
    expect(competitionHistory(titles, "ucl").map((t) => t.season)).toEqual(["2028-29", "2027-28", "2026-27"]);
  });

  test("most titles first; a tie keeps the most recent", () => {
    const counts = mostTitles(competitionHistory(titles, "ucl"));
    expect(counts.map((c) => [c.title.squadId, c.count])).toEqual([["rm", 2], ["vi", 1]]);
    const tie = mostTitles(competitionHistory([champ("x", "2027", "old"), champ("x", "2028", "new")], "x"));
    expect(tie.map((c) => c.title.squadId)).toEqual(["new", "old"]);
  });
});
