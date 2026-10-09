import { describe, expect, test } from "bun:test";
import { currentCoach, dedupeCoaches, matchClubsToWikidata } from "@/../scripts/wikidata/coachesSource";

describe("matchClubsToWikidata", () => {
  test("exact key, then loose key, unique on both sides", () => {
    const ours = [{ id: "1", name: "Paris Saint Germain" }, { id: "2", name: "Manchester United" }, { id: "3", name: "Manchester City" }];
    const wd = [
      { qid: "Q483020", names: ["Paris Saint-Germain F.C.", "PSG"] },
      { qid: "Q18656", names: ["Manchester United F.C."] },
      { qid: "Q50602", names: ["Manchester City F.C."] },
    ];
    expect(matchClubsToWikidata(ours, wd)).toEqual(new Map([["1", "Q483020"], ["2", "Q18656"], ["3", "Q50602"]]));
  });
  test("an ambiguous name matches nothing; mapped squads and items are skipped", () => {
    const wd = [{ qid: "Q1", names: ["Nacional"] }, { qid: "Q2", names: ["Club Nacional"] }];
    expect(matchClubsToWikidata([{ id: "a", name: "Nacional" }], wd).size).toBe(0);
    expect(matchClubsToWikidata([{ id: "a", name: "Nacional" }], wd, new Set(), new Set(["Q1"]))).toEqual(new Map([["a", "Q2"]]));
    expect(matchClubsToWikidata([{ id: "a", name: "Nacional" }], wd, new Set(["a"])).size).toBe(0);
  });
});

describe("currentCoach", () => {
  const today = "2026-10-09";
  test("the open statement with the latest start", () => {
    const st = [
      { coach: "Qa", rank: "normal" as const, start: "2020-01-01", end: "2023-01-01" },
      { coach: "Qb", rank: "normal" as const, start: "2023-01-02" },
      { coach: "Qc", rank: "normal" as const, start: "2025-07-01" },
    ];
    expect(currentCoach(st, today)?.coach).toBe("Qc");
  });
  test("ended, future and deprecated statements are out", () => {
    expect(currentCoach([{ coach: "Qa", rank: "normal", start: "2020-01-01", end: "2026-01-01" }], today)).toBeNull();
    expect(currentCoach([{ coach: "Qa", rank: "normal", start: "2027-01-01" }], today)).toBeNull();
    expect(currentCoach([{ coach: "Qa", rank: "deprecated", start: "2025-01-01" }], today)).toBeNull();
  });
  test("undated: a lone one, or a lone preferred one", () => {
    expect(currentCoach([{ coach: "Qa", rank: "normal" }], today)?.coach).toBe("Qa");
    expect(currentCoach([{ coach: "Qa", rank: "normal" }, { coach: "Qb", rank: "normal" }], today)).toBeNull();
    expect(currentCoach([{ coach: "Qa", rank: "normal" }, { coach: "Qb", rank: "preferred" }], today)?.coach).toBe("Qb");
  });
  test("rejected when the coach is at another team from a later date", () => {
    const st = [{ coach: "Qa", rank: "normal" as const, start: "2024-01-01" }];
    expect(currentCoach(st, today, [{ coach: "Qa", team: "Qother", start: "2025-06-01" }], "Qclub")).toBeNull();
    expect(currentCoach(st, today, [{ coach: "Qa", team: "Qother", start: "2023-06-01" }], "Qclub")?.coach).toBe("Qa");
    expect(currentCoach(st, today, [{ coach: "Qa", team: "Qclub", start: "2025-06-01" }], "Qclub")?.coach).toBe("Qa");
  });
});

describe("dedupeCoaches", () => {
  test("the latest start keeps the coach; a tie keeps none", () => {
    const picks = new Map([
      ["vasco", { coach: "Qc", start: "2024-12-19" }], ["vitoria", { coach: "Qc", start: "2025-07-10" }],
      ["x", { coach: "Qd", start: "2025-01-01" }], ["y", { coach: "Qd", start: "2025-01-01" }], ["z", { coach: "Qe" }],
    ]);
    expect([...dedupeCoaches(picks).keys()].sort()).toEqual(["vitoria", "z"]);
  });
});
