import { describe, expect, test } from "bun:test";
import { matchSun, matchWeatherOf } from "@/backend/stadiumData";
import { matchConditions } from "@/Domain/matchday/matchConditions";
import { stadiumIdOf } from "@/Domain/matchday/stadiumSun";

const OT = { id: "33", venue: { name: "Old Trafford", city: "Manchester" } };

describe("matchSun", () => {
  test("a club without real data: the profile drawn from its venue id, no sunset", () => {
    const r = matchSun({ id: "zz_none", venue: { name: "Nowhere", city: "X" } }, undefined, "2027-02-14", "sunny");
    expect(r.sun.real).toBeUndefined();
    expect(r.sun.stadiumId).toBe(stadiumIdOf({ id: "zz_none", venue: { name: "Nowhere", city: "X" } }));
    expect(r.sunset).toBeNull();
  });
  test("a neutral venue is never real", () => {
    expect(matchSun(OT, "f1", "2027-02-14", "sunny").sun.real).toBeUndefined();
  });
  test("a real stadium (when the data has it): its id, the real sunset for the date", () => {
    const r = matchSun(OT, undefined, "2027-12-15", "sunny");
    if (!r.sun.real) return; // no stadiums.json in this checkout
    expect(r.sun.stadiumId).toBe(r.sun.real.id);
    expect(r.sunset).toMatch(/^15:[3-5]\d$/);
  });
});

const wFixture = { id: "f1", date: "2027-01-10", home: "33", away: "34", competition: "premier_league" };
const wHome = { id: "33", country: "England", venue: { name: "Old Trafford", city: "Manchester" } };

describe("matchWeatherOf", () => {
  test("same weather as the preview (matchConditions)", () => {
    const w = matchWeatherOf(wFixture, wHome);
    expect(w.weather).toBe(matchConditions(wFixture, "England").weather);
  });
  test("deterministic", () => {
    expect(matchWeatherOf(wFixture, wHome)).toEqual(matchWeatherOf(wFixture, wHome));
  });
  test("neutral venue: no effect", () => {
    const w = matchWeatherOf({ ...wFixture, neutral: true }, wHome);
    expect(w.effective).toBe("sunny");
    expect(w.covered).toBe(false);
    expect(w.weather).toBe(matchConditions(wFixture, null).weather);
  });
});
