import { describe, expect, test } from "bun:test";
import { parseTmRefereeTotals, pickReferees, realStrictness, type WdRefereeRow } from "@/../scripts/wikidata/refereesSource";

const row = (o: Partial<WdRefereeRow>): WdRefereeRow => ({
  qid: "Q1", label: "A B", iso2: "IT", sportIso2: null, birth: "1985-03-01", death: null, gender: "male",
  sitelinks: 3, fifaFrom: null, fifaTo: null, otherPositions: 0, role: "referee", ...o,
});
const italy = (i: string) => (i === "IT" ? "Italy" : null);

describe("pickReferees", () => {
  test("drops unknown gender, the dead, out of the 27..50 window and politicians; keeps women", () => {
    const out = pickReferees([
      row({ qid: "Q1" }), row({ qid: "Q2", gender: null }), row({ qid: "Q3", death: "2020-01-01" }),
      row({ qid: "Q4", birth: "1970-01-01" }), row({ qid: "Q5", otherPositions: 1 }), row({ qid: "Q6", gender: "female" }),
    ], { year: 2027, countryOfIso: italy });
    expect(out.map((r) => r.wikidataQid).sort()).toEqual(["Q1", "Q6"]);
    expect(out.find((r) => r.wikidataQid === "Q6")!.gender).toBe("female");
  });
  test("sport country wins over citizenship; GB is England", () => {
    const out = pickReferees([row({ qid: "Q1", iso2: "GB" }), row({ qid: "Q2", iso2: "GB", sportIso2: "IT" })],
      { year: 2027, countryOfIso: (i) => ({ GB: "England", IT: "Italy" } as Record<string, string>)[i] ?? null });
    expect(out.find((r) => r.wikidataQid === "Q1")!.country).toBe("England");
    expect(out.find((r) => r.wikidataQid === "Q2")!.country).toBe("Italy");
  });
  test("ranks fifa, then sitelinks, caps 24 referees and 12 assistants per country", () => {
    const rows = Array.from({ length: 30 }, (_, i) => row({ qid: `Q${i}`, sitelinks: i }));
    rows.push(row({ qid: "QF", sitelinks: 0, fifaFrom: "2015-01-01" }));
    rows.push(...Array.from({ length: 20 }, (_, i) => row({ qid: `QA${i}`, role: "assistant" })));
    const out = pickReferees(rows, { year: 2027, countryOfIso: () => "Italy" });
    const refs = out.filter((r) => r.role === "referee");
    expect(refs).toHaveLength(24);
    expect(refs[0]!.wikidataQid).toBe("QF");
    expect(refs[0]!.fifa).toBe(true);
    expect(refs[1]!.wikidataQid).toBe("Q29");
    expect(out.filter((r) => r.role === "assistant")).toHaveLength(12);
  });
  test("an old FIFA badge does not count", () => {
    const out = pickReferees([row({ qid: "Q1", fifaFrom: "2005-01-01", fifaTo: "2015-12-31" })], { year: 2027, countryOfIso: italy });
    expect(out[0]!.fifa).toBe(false);
  });
  test("a person listed as referee and assistant is kept once, as referee", () => {
    const out = pickReferees([row({ qid: "Q1", role: "assistant" }), row({ qid: "Q1" })], { year: 2027, countryOfIso: italy });
    expect(out).toHaveLength(1);
    expect(out[0]!.role).toBe("referee");
  });
  test("ids, decoded names, trimmed, transfermarkt id kept", () => {
    const out = pickReferees([row({ qid: "Q9", label: "  Anthony Taylor&apos;s ", tmId: "847" })], { year: 2027, countryOfIso: () => "England" });
    expect(out[0]!.id).toBe("ref_Q9");
    expect(out[0]!.name).toBe("Anthony Taylor's");
    expect(out[0]!.tmId).toBe("847");
  });
});

describe("parseTmRefereeTotals", () => {
  const html = (foot: string) => `<div class="responsive-table"><table><thead><tr><th>x</th></tr></thead>
    <tfoot><tr><td class="hide">&nbsp;</td><td colspan="2">&nbsp;</td>${foot}</tr></tfoot><tbody></tbody></table></div>`;
  test("reads the totals row", () => {
    const t = parseTmRefereeTotals(html(`<td>839</td><td>2953</td><td>64</td><td>88</td><td>260</td>`));
    expect(t).toEqual({ matches: 839, yellows: 2953, secondYellows: 64, reds: 88, penalties: 260 });
  });
  test("dashes are zero; thousands separators dropped", () => {
    const t = parseTmRefereeTotals(html(`<td>1.039</td><td>3.953</td><td>-</td><td>-</td><td>12</td>`));
    expect(t).toEqual({ matches: 1039, yellows: 3953, secondYellows: 0, reds: 0, penalties: 12 });
  });
  test("no table / no data → null", () => {
    expect(parseTmRefereeTotals("<div class=\"responsive-table\">No data available</div>")).toBeNull();
    expect(parseTmRefereeTotals("<html></html>")).toBeNull();
  });
});

describe("realStrictness", () => {
  const e = (id: string, country: string, matches: number, cards: number) =>
    ({ id, country, totals: { matches, yellows: cards, secondYellows: 0, reds: 0, penalties: 0 } });
  test("relative to the country, mean 0, in [-1,1], small samples dropped", () => {
    const entries = [
      ...Array.from({ length: 10 }, (_, i) => e(`es${i}`, "Spain", 200, 200 * 4.5 * (1 + (i - 4.5) * 0.04))),
      ...Array.from({ length: 10 }, (_, i) => e(`en${i}`, "England", 200, 200 * 3.2 * (1 + (i - 4.5) * 0.04))),
      e("tiny", "Spain", 5, 50),
    ];
    const s = realStrictness(entries);
    expect(s.has("tiny")).toBe(false);
    const vals = [...s.values()];
    expect(Math.abs(vals.reduce((a, b) => a + b, 0) / vals.length)).toBeLessThan(0.02);
    for (const v of vals) { expect(v).toBeGreaterThanOrEqual(-1); expect(v).toBeLessThanOrEqual(1); }
    // the strictest Spaniard and the strictest Englishman look alike (relative to their league)
    expect(Math.abs(s.get("es9")! - s.get("en9")!)).toBeLessThan(0.05);
    expect(s.get("es9")!).toBeGreaterThan(0.3);
    expect(s.get("es0")!).toBeLessThan(-0.3);
  });
});
