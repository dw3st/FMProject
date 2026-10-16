import { describe, expect, test } from "bun:test";
import { aiPitchCondition, matchPitch, matchPitchCondition, pitchInjuryMult } from "@/Domain/facilities/pitch";
import { FACILITIES as F } from "@/Domain/facilities/facilityConfig";
import { aiMowingOf, clubTurf } from "@/Domain/facilities/turf";
import { financialTierOf } from "@/Domain/aiFinance/aiClubFinance";
import { initialFacilities, withFacilities } from "@/Domain/facilities/facilities";
import { conditionOf, wearFor } from "@/Domain/facilities/facilityItems";
import type { Squad } from "@/types/playerTypes";

const club = (income: number): Squad => ({
  id: "c", name: "C", colors: ["#000", "#fff"], money: 0, players: [],
  venue: { name: "A", city: "B", capacity: 20000 },
  finances: { broadcasting: income, commercial: 0, total: income, budget: 0, followers: 1e6 },
});

describe("AI pitch", () => {
  test("by tier and fraction of the season", () => {
    expect(aiPitchCondition("LOW", 0)).toBe(70);
    expect(aiPitchCondition("LOW", 1)).toBe(30);
    expect(aiPitchCondition("ELITE", 0.5)).toBe(79);
    expect(aiPitchCondition("MEDIUM", 1)).toBe(36);
    expect(aiPitchCondition("HIGH", 1)).toBe(48);
    expect(aiPitchCondition("LOW", -1)).toBe(70);
    expect(aiPitchCondition("LOW", 2)).toBe(30);
  });

  test("injury multiplier", () => {
    expect(pitchInjuryMult(90)).toBe(1);
    expect(pitchInjuryMult(40)).toBe(1);
    expect(pitchInjuryMult(20)).toBeCloseTo(1.3, 10);
    expect(pitchInjuryMult(0)).toBeCloseTo(1.6, 10);
  });
});

describe("match pitch", () => {
  const window = { start: "2026-08-15", end: "2027-05-20" };
  test("neutral venue 90", () => {
    expect(matchPitchCondition(club(1e6), { neutral: true }, window, "2027-05-20")).toBe(90);
  });
  test("AI home club: the formula with its tier and the season fraction; no window = middle", () => {
    expect(matchPitchCondition(club(1e6), {}, window, "2026-08-15")).toBe(70);
    expect(matchPitchCondition(club(1e6), {}, window, "2027-05-20")).toBe(30);
    expect(matchPitchCondition(club(1e6), {}, null, "2027-01-01")).toBe(50);
  });
  test("human home club: its stadium pitch (condemned 0)", () => {
    const sq = club(30e6);
    const f = initialFacilities(sq, 1);
    expect(matchPitchCondition(withFacilities(sq, f), {}, window, "2027-05-20")).toBeCloseTo(conditionOf(f.items.stadiumPitch), 10);
    const worn = { ...f, items: { ...f.items, stadiumPitch: { ...f.items.stadiumPitch, wear: wearFor(25) } } };
    expect(matchPitchCondition(withFacilities(sq, worn), {}, window, "2027-05-20")).toBeCloseTo(25, 6);
    const condemned = { ...f, items: { ...f.items, stadiumPitch: { ...f.items.stadiumPitch, condemned: true as const } } };
    expect(matchPitchCondition(withFacilities(sq, condemned), {}, window, "2027-05-20")).toBe(0);
  });
  test("renewed at the new season: last day of the old window < first day of the next", () => {
    const next = { start: "2027-08-14", end: "2028-05-19" };
    const last = matchPitchCondition(club(20e6), {}, window, window.end);
    const first = matchPitchCondition(club(20e6), {}, next, next.start);
    expect(last).toBeLessThan(first);
  });
});

describe("matchPitch (spec 2026-10-16)", () => {
  const window = { start: "2026-08-15", end: "2027-05-20" };
  const ai = { ...club(500_000_000), id: "33" } as Squad;

  test("neutral venue: 90, natural, stripes", () => {
    expect(matchPitch(ai, { neutral: true }, window, "2027-01-01")).toEqual({ condition: 90, turf: "natural", mowing: "stripes" });
  });

  test("AI home: its grass and mowing; the season drop x the grass wear", () => {
    const p = matchPitch(ai, {}, window, "2027-05-20");
    const turf = clubTurf(ai);
    expect(p.turf).toBe(turf);
    expect(p.mowing).toBe(aiMowingOf("33"));
    expect(p.condition).toBeCloseTo(
      F.AI_PITCH.START[financialTierOf(ai)] - F.AI_PITCH.DROP[financialTierOf(ai)] * F.TURF.WEAR_MULT[turf], 10);
    expect(matchPitchCondition(ai, {}, window, "2027-05-20")).toBe(p.condition);
  });

  test("aiPitchCondition: natural is the old formula", () => {
    expect(aiPitchCondition("LOW", 1)).toBe(F.AI_PITCH.START.LOW - F.AI_PITCH.DROP.LOW);
    expect(aiPitchCondition("LOW", 1, "synthetic")).toBeCloseTo(F.AI_PITCH.START.LOW - F.AI_PITCH.DROP.LOW * 0.25, 10);
  });

  test("human home: the stadium pitch's condition, grass and mowing", () => {
    const sq = club(30e6);
    const f = initialFacilities(sq, 1);
    const custom = { ...f, mowing: "diagonal" as const, items: { ...f.items, stadiumPitch: { ...f.items.stadiumPitch, wear: 0, turf: "hybrid" as const } } };
    expect(matchPitch(withFacilities(sq, custom), {}, window, "2027-01-01")).toEqual({ condition: 100, turf: "hybrid", mowing: "diagonal" });
  });
});
