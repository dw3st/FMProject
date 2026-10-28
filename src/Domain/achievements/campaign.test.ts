import { describe, expect, test } from "bun:test";
import { addCampaign, applyCampaignRecord, earnedPoints, emptyAchievements } from "@/Domain/achievements/progress";
import { boughtThisSeason, recordPurchase, shopPrice } from "@/Domain/achievements/shop";
import type { ManagerRecord } from "@/types/managerTypes";

const manager = {
  id: "seat:s", name: "M", squadId: "c", isPlayer: true, points: 0, seasons: 1,
  titles: [
    { season: "2026-27", kind: "league", competition: "la_liga", squadId: "c", points: 100 },
    { season: "2026-27", kind: "continental", competition: "ucl", squadId: "c", points: 150 },
  ],
  awards: [{ season: "2026-27", kind: "best_manager", competition: "la_liga", squadId: "c" }],
} as unknown as ManagerRecord;

describe("campaign points", () => {
  test("titles and awards count once, whatever how often the record is seen", () => {
    const once = applyCampaignRecord(emptyAchievements(), manager);
    expect(once.campaign?.points).toBe(60 + 80 + 20);
    expect(applyCampaignRecord(once, manager).campaign?.points).toBe(160);
    expect(earnedPoints(once)).toBe(160);
  });

  test("an event key counts once", () => {
    const s = addCampaign(addCampaign(emptyAchievements(), "continental:ucl:2026:sf:c", 15), "continental:ucl:2026:sf:c", 15);
    expect(s.campaign?.points).toBe(15);
  });
});

describe("shop once per season, rising price", () => {
  test("a purchase blocks the season and raises the price", () => {
    const rich = { ...emptyAchievements(), campaign: { points: 5000, seen: [] } };
    expect(shopPrice(rich, "created")).toBe(300);
    const after = recordPurchase(rich, "created", "2027-01-10", "la_liga:2026");
    expect(after.spent).toBe(300);
    expect(boughtThisSeason(after, "created", "la_liga:2026")).toBe(true);
    expect(boughtThisSeason(after, "created", "la_liga:2027")).toBe(false);
    expect(shopPrice(after, "created")).toBe(400);
    expect(recordPurchase(after, "created", "2027-09-01", "la_liga:2027").spent).toBe(700);
  });

  test("a purchase from before this rule counts as one", () => {
    const old = { ...emptyAchievements(), bought: { legend: "2027-01-01" } };
    expect(shopPrice(old, "legend")).toBe(600);
    expect(boughtThisSeason(old, "legend", "x:2027")).toBe(false);
  });
});
