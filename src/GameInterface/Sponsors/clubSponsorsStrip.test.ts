import { describe, expect, test } from "bun:test";
import { stripPlaces } from "@/GameInterface/Sponsors/ClubSponsorsStrip";
import { sponsorHref } from "@/GameInterface/Sponsors/sponsorLinks";
import { matchAppPath } from "@/GameInterface/router/appRoutes";
import type { SponsorsView } from "@/types/sponsorTypes";

type Contract = SponsorsView["contracts"][number];

const contract = (id: string, slot: Contract["slot"]): Contract => ({
  id, slot, company: { id: `sp_${id}`, name: id, sector: "bank", size: "national", colors: ["#000000", "#ffffff"] },
  profile: "standard", annual: 1, bonus: 0, goal: { kind: "promotion" }, seasonsLeft: 1, signedOn: "2026-08-15", progress: { met: null },
});

const SLOTS: SponsorsView["slots"] = [
  { slot: "board", count: 4, share: 0.0625, filled: 0 }, { slot: "master", count: 1, share: 0.5, filled: 0 }, { slot: "kit", count: 1, share: 0.25, filled: 0 },
];

describe("the Club tab's sponsors strip", () => {
  test("six places in order (master, kit, four boards): contracts first, free places after", () => {
    const empty = stripPlaces({ slots: SLOTS, contracts: [] });
    expect(empty.map((p) => p.slot)).toEqual(["master", "kit", "board", "board", "board", "board"]);
    expect(empty.every((p) => p.contract === null)).toBe(true);
    const some = stripPlaces({ slots: SLOTS, contracts: [contract("b1", "board"), contract("m", "master"), contract("b2", "board")] });
    expect(some.map((p) => p.contract?.id ?? null)).toEqual(["m", null, "b1", "b2", null, null]);
    // Never more plates than places.
    const over = stripPlaces({ slots: SLOTS, contracts: [contract("m1", "master"), contract("m2", "master")] });
    expect(over.filter((p) => p.slot === "master")).toHaveLength(1);
  });

  test("a plate's link is a route of the frame", () => {
    expect(sponsorHref("sp_norvane_bank")).toBe("/sponsor/sp_norvane_bank");
    expect(matchAppPath(sponsorHref("sp_norvane_bank"))?.route.screen).toBe("sponsor");
    expect(matchAppPath(sponsorHref("builtin_nortia"))?.params.companyId).toBe("builtin_nortia");
  });
});
