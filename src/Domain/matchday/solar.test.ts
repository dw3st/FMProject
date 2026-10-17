import { describe, expect, test } from "bun:test";
import { hhmm, solarPosition, sunsetUtcMinutes, utcOffsetMinutes } from "@/Domain/matchday/solar";

describe("solarPosition", () => {
  test("London, summer solstice noon: high in the south", () => {
    const p = solarPosition(51.5, -0.13, "2027-06-21", 12 * 60 + 2);
    expect(p.elevation).toBeGreaterThan(60);
    expect(p.elevation).toBeLessThan(63);
    expect(Math.abs(p.azimuth - 180)).toBeLessThan(5);
  });
  test("Manchester, December 15:00 local: low in the south-west", () => {
    const p = solarPosition(53.46, -2.29, "2027-12-15", 15 * 60);
    expect(p.elevation).toBeGreaterThan(0);
    expect(p.elevation).toBeLessThan(8);
    expect(p.azimuth).toBeGreaterThan(200);
    expect(p.azimuth).toBeLessThan(240);
  });
  test("São Paulo afternoon: sun in the north-west (southern hemisphere)", () => {
    const p = solarPosition(-23.55, -46.63, "2027-06-20", 16 * 60 + 3 * 60);
    expect(p.azimuth).toBeGreaterThan(280);
    expect(p.azimuth).toBeLessThan(320);
  });
});

describe("sunset and the local clock", () => {
  test("London sunsets in June and December (UTC)", () => {
    const june = sunsetUtcMinutes(51.5, -0.13, "2027-06-21")!;
    expect(Math.abs(june - (20 * 60 + 21))).toBeLessThan(6);
    const dec = sunsetUtcMinutes(51.5, -0.13, "2027-12-21")!;
    expect(Math.abs(dec - (15 * 60 + 53))).toBeLessThan(6);
  });
  test("EU and US daylight saving", () => {
    expect(utcOffsetMinutes(1, "eu", "2027-07-01")).toBe(120);
    expect(utcOffsetMinutes(1, "eu", "2027-01-15")).toBe(60);
    expect(utcOffsetMinutes(1, "eu", "2027-03-28")).toBe(120); // last Sunday of March 2027
    expect(utcOffsetMinutes(1, "eu", "2027-03-27")).toBe(60);
    expect(utcOffsetMinutes(-5, "us", "2027-03-14")).toBe(-240); // second Sunday of March 2027
    expect(utcOffsetMinutes(-3, "none", "2027-07-01")).toBe(-180);
  });
  test("hhmm wraps", () => {
    expect(hhmm(-30)).toBe("23:30");
    expect(hhmm(1500)).toBe("01:00");
  });
});
