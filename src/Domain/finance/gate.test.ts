import { describe, expect, test } from "bun:test";
import { GATE, gateRevenue } from "@/Domain/finance/gate";

describe("gateRevenue", () => {
  test("league: capacity × fill rate × ticket price", () => {
    expect(gateRevenue(40_000, "league")).toBe(Math.round(40_000 * GATE.FILL_RATE * GATE.TICKET_PRICE));
    expect(gateRevenue(40_000, "league")).toBe(650_000);
  });

  test("cup uses the same price as league", () => {
    expect(gateRevenue(40_000, "cup")).toBe(gateRevenue(40_000, "league"));
  });

  test("continental doubles the ticket price", () => {
    expect(gateRevenue(40_000, "continental")).toBe(gateRevenue(40_000, "league") * 2);
  });

  test("neutral venue is always 0, regardless of kind", () => {
    expect(gateRevenue(40_000, "league", true)).toBe(0);
    expect(gateRevenue(40_000, "continental", true)).toBe(0);
  });

  test("no stadium capacity is 0", () => {
    expect(gateRevenue(0, "league")).toBe(0);
    expect(gateRevenue(-5, "league")).toBe(0);
  });

  test("fill rate (fans): 0.45..0.9 replaces the default", () => {
    expect(gateRevenue(40_000, "league", false, 0.9)).toBe(Math.round(40_000 * 0.9 * GATE.TICKET_PRICE));
    expect(gateRevenue(40_000, "league", false, 0.45)).toBe(Math.round(40_000 * 0.45 * GATE.TICKET_PRICE));
    expect(gateRevenue(40_000, "league", true, 0.9)).toBe(0);
  });
});
