import { describe, expect, test } from "bun:test";
import { buildDayNews, emptyDayNewsInput, NEWS } from "@/Domain/news/buildDayNews";

const club = (id: string) => ({ id, name: id.toUpperCase() });
const res = (fixtureId: string, league: string, h: number, a: number, tier = 1, levels?: { home: number; away: number }) =>
  ({ fixtureId, league, country: "England", tier, home: club(`h${fixtureId}`), away: club(`a${fixtureId}`), score: { home: h, away: a }, ...(levels ? { levels } : {}) });

describe("buildDayNews", () => {
  test("goleada só na primeira divisão; ids estáveis", () => {
    const input = { ...emptyDayNewsInput("2027-03-10"), results: [res("1", "pl", 5, 0), res("2", "ch", 5, 0, 2), res("3", "pl", 2, 1)] };
    const out = buildDayNews(input);
    expect(out.map((n) => n.kind)).toEqual(["thrashing"]);
    expect(out[0]!.id).toBe("2027-03-10:thrashing:1");
    expect(buildDayNews(input)).toEqual(out);
  });
  test("zebra pelo nível", () => {
    const out = buildDayNews({ ...emptyDayNewsInput("d"), results: [res("1", "pl", 0, 1, 1, { home: 5.5, away: 4.8 })] });
    expect(out.map((n) => n.kind)).toEqual(["upset"]);
  });
  test("teto por liga e no mundo; coletiva sempre entra", () => {
    const results = Array.from({ length: 10 }, (_, i) => res(`${i}`, "pl", 6, 0));
    const press = [{ kind: "press_quote" as const, club: club("me"), manager: "Eu", key: "provocative", scope: { league: "pl" } }];
    const out = buildDayNews({ ...emptyDayNewsInput("d"), results, press });
    expect(out.filter((n) => n.league === "pl" && !n.kind.startsWith("press")).length).toBe(NEWS.PER_LEAGUE);
    expect(out.some((n) => n.kind === "press_quote")).toBe(true);
    const many = Array.from({ length: 50 }, (_, i) => res(`${i}`, `l${i}`, 6, 0));
    expect(buildDayNews({ ...emptyDayNewsInput("d"), results: many }).length).toBe(NEWS.PER_DAY);
  });
  test("acesso/rebaixamento só até o nível 2, campeão de qualquer nível", () => {
    const out = buildDayNews({ ...emptyDayNewsInput("d"),
      moves: [{ league: "x", tier: 3, club: club("a"), kind: "promoted" }, { league: "y", tier: 2, club: club("b"), kind: "relegated" }],
      champions: [{ league: "z", tier: 4, club: club("c") }] });
    expect(out.map((n) => n.kind).sort()).toEqual(["champion", "relegated"]);
  });
  test("importância: título 3, transferência ≥ €60M 3, liga do jogador 2, resto 1", () => {
    const out = buildDayNews({ ...emptyDayNewsInput("d"), humanLeague: "pl",
      champions: [{ league: "it", tier: 1, club: club("c") }],
      transfers: [{ league: "es", playerId: "p", player: "P", from: club("x"), to: club("y"), fee: 70_000_000, star: true, clubRecord: false }],
      results: [res("1", "pl", 4, 0), res("2", "fr", 4, 0)] });
    const imp = Object.fromEntries(out.map((n) => [n.id.split(":").slice(1).join(":"), n.importance]));
    expect(imp["champion:it:c"]).toBe(3);
    expect(imp["big_transfer:p"]).toBe(3);
    expect(imp["thrashing:1"]).toBe(2);
    expect(imp["thrashing:2"]).toBe(1);
  });
});
