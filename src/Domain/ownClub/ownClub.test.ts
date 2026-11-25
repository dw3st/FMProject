import { describe, expect, test } from "bun:test";
import {
  OWN_CLUB_KEYS, foundedSquadPlan, isPresident, managerWageCap, ownClubUnlock, parseIdentity,
  parseTicketPrice, ticketDemandMult,
} from "@/Domain/ownClub/ownClub";
import { FOUNDED } from "@/Domain/ownClub/ownClubConfig";
import type { AchievementsState } from "@/types/achievementTypes";

function stateWith(keys: string[]): AchievementsState {
  return { unlocked: Object.fromEntries(keys.map((k) => [k, "2027-01-01"])) } as unknown as AchievementsState;
}

describe("ownClubUnlock", () => {
  test("all keys unlock", () => {
    const r = ownClubUnlock(stateWith(OWN_CLUB_KEYS));
    expect(r.unlocked).toBe(true);
    expect(r.done).toBe(r.total);
  });
  test("all but one does not", () => {
    const r = ownClubUnlock(stateWith(OWN_CLUB_KEYS.slice(1)));
    expect(r.unlocked).toBe(false);
    expect(r.done).toBe(r.total - 1);
  });
  test("undefined state", () => {
    const r = ownClubUnlock(undefined);
    expect(r.unlocked).toBe(false);
    expect(r.done).toBe(0);
  });
});

describe("parseIdentity", () => {
  const ok = { name: "Real Test", shortName: "rtf", colors: ["#112233", "#ffffff"] };
  test("valid, code uppercased", () => {
    const r = parseIdentity(ok);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.identity.shortName).toBe("RTF");
  });
  test("invalid cases", () => {
    expect(parseIdentity({ ...ok, name: " Real" }).ok).toBe(false);
    expect(parseIdentity({ ...ok, shortName: "R1F" }).ok).toBe(false);
    expect(parseIdentity({ ...ok, colors: ["#112233", "#112233"] }).ok).toBe(false);
    expect(parseIdentity({ ...ok, name: "Re\nal" }).ok).toBe(false);
    expect(parseIdentity({ ...ok, name: "R" }).ok).toBe(false);
  });
});

describe("foundedSquadPlan", () => {
  const plan = foundedSquadPlan(4.2);
  test("shape", () => {
    expect(plan.length).toBe(22);
    expect(plan.filter((s) => s.line === "GK").length).toBe(3);
    expect(plan.filter((s) => s.line === "FWD").length).toBe(5);
  });
  test("levels and ages", () => {
    for (const s of plan) {
      expect(s.level).toBeCloseTo(4.2 - FOUNDED.LEVEL_GAP, 9);
      expect(s.age).toBeGreaterThanOrEqual(FOUNDED.AGE_MIN);
      expect(s.age).toBeLessThanOrEqual(FOUNDED.AGE_MAX);
    }
  });
});

describe("misc rules", () => {
  test("ticketDemandMult", () => {
    expect(ticketDemandMult(1)).toBe(1);
    expect(ticketDemandMult(2)).toBeCloseTo(2 ** -0.6, 9);
    expect(ticketDemandMult(0.5)).toBeGreaterThan(1);
  });
  test("isPresident", () => {
    expect(isPresident({ foundedBy: { seatId: "a", on: "2027-01-01" } }, "a")).toBe(true);
    expect(isPresident({ foundedBy: { seatId: "a", on: "2027-01-01" } }, "b")).toBe(false);
    expect(isPresident({}, "a")).toBe(false);
    expect(isPresident({ foundedBy: { seatId: "a", on: "2027-01-01", left: "2027-06-01" } }, "a")).toBe(false);
  });
  test("managerWageCap", () => {
    expect(managerWageCap(10_000_000, 50)).toBeGreaterThan(0);
  });
  test("parseTicketPrice", () => {
    expect(parseTicketPrice(1.5)).toBe(1.5);
    expect(parseTicketPrice(2.5)).toBeNull();
    expect(parseTicketPrice(1.55)).toBeNull();
    expect(parseTicketPrice("1")).toBeNull();
    expect(parseTicketPrice(0.5)).toBe(0.5);
  });
});
