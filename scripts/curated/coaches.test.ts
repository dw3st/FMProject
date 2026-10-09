import { describe, expect, test } from "bun:test";
import {
  ageOn, applyCoach, coachFor, coachId, locateCoachSquads, parseCoachCorrections, parseWikidataCoaches,
} from "@/../scripts/curated/coaches";

describe("parse", () => {
  test("accepts the Wikidata file and the corrections", () => {
    expect(parseWikidataCoaches({ "85": { name: "Luis Enrique", nationality: "Spain", birthDate: "1970-05-08", wikidataQid: "Q190405" } }))
      .toEqual({ "85": { name: "Luis Enrique", nationality: "Spain", birthDate: "1970-05-08", wikidataQid: "Q190405" } });
    expect(parseCoachCorrections({ "85": { name: "Luis Enrique", nationality: "Spain", age: 56 } }))
      .toEqual({ "85": { name: "Luis Enrique", nationality: "Spain", age: 56 } });
  });
  test("rejects empty or padded names, HTML entities, unknown fields and bad values", () => {
    expect(() => parseCoachCorrections([])).toThrow();
    expect(() => parseCoachCorrections({ a: { name: "" } })).toThrow();
    expect(() => parseCoachCorrections({ a: { name: " X" } })).toThrow();
    expect(() => parseCoachCorrections({ a: { name: "Jos&eacute;" } })).toThrow(/entity/);
    expect(() => parseCoachCorrections({ a: { name: "X", team: "y" } })).toThrow(/unknown field/);
    expect(() => parseCoachCorrections({ a: { name: "X", age: 7 } })).toThrow(/age/);
    expect(() => parseWikidataCoaches({ a: { name: "X", wikidataQid: "123" } })).toThrow(/QID/);
    expect(() => parseWikidataCoaches({ a: { name: "X", wikidataQid: "Q1", birthDate: "1970" } })).toThrow(/birthDate/);
  });
});

describe("coachFor", () => {
  const wd = { name: "Carlo Ancelotti", nationality: "Italy", birthDate: "1959-06-10", wikidataQid: "Q55" };
  test("a correction wins and is taken whole", () => {
    expect(coachFor("85", wd, { name: "Luis Enrique", nationality: "Spain" }))
      .toEqual({ id: coachId("85", "Luis Enrique"), name: "Luis Enrique", nationality: "Spain" });
  });
  test("Wikidata: nationality and age on the season start", () => {
    expect(coachFor("85", wd, undefined)).toEqual({ id: coachId("85", "Carlo Ancelotti"), name: "Carlo Ancelotti", nationality: "Italy", age: 67 });
  });
  test("neither keeps the squad's coach", () => {
    expect(coachFor("85", undefined, undefined)).toBeNull();
  });
  test("the id is stable and depends on club and name", () => {
    expect(coachId("85", "A")).toBe(coachId("85", "A"));
    expect(coachId("85", "A")).not.toBe(coachId("86", "A"));
    expect(Number.isInteger(coachId("85", "A"))).toBe(true);
  });
  test("ageOn", () => {
    expect(ageOn("1970-05-08", "2026-07-01")).toBe(56);
    expect(ageOn("1970-07-02", "2026-07-01")).toBe(55);
    expect(ageOn("1970-07-01", "2026-07-01")).toBe(56);
  });
});

describe("applyCoach", () => {
  test("replaces the whole coach (no stale fields) and is idempotent", () => {
    const squad: { id: string; name: string; coach?: unknown } = { id: "85", name: "PSG", coach: { id: 193, name: "Carlo Ancelotti", points: 3, firstname: "Carlo" } };
    const coach = { id: 1, name: "Luis Enrique", nationality: "Spain" };
    const r = applyCoach(squad, coach);
    expect(r.changed).toBe(true);
    expect(r.squad.coach).toEqual(coach);
    expect((squad.coach as { name: string }).name).toBe("Carlo Ancelotti");
    expect(applyCoach(r.squad, coach).changed).toBe(false);
  });
});

describe("locateCoachSquads", () => {
  const files = new Map([["a/85.json", { id: "85" }], ["b/541.json", { id: "541" }]]);
  test("finds each id; throws on a missing or repeated one", () => {
    expect(locateCoachSquads(files, ["541"], "f")).toEqual(new Map([["541", "b/541.json"]]));
    expect(() => locateCoachSquads(files, ["999"], "f")).toThrow(/999/);
    expect(() => locateCoachSquads(new Map([...files, ["c/85.json", { id: "85" }]]), ["85"], "f")).toThrow(/85/);
  });
});
