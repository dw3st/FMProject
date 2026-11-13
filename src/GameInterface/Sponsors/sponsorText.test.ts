import { describe, expect, test } from "bun:test";
import { sponsorGoalText, sponsorProgressText, sponsorProgressTone } from "@/GameInterface/Sponsors/sponsorText";
import { plateNameClass, sectorIcon } from "@/GameInterface/Sponsors/sponsorPlateStyle";
import { sponsorErrorKey } from "@/GameInterface/Sponsors/sponsorsApi";

/** A translator that shows the key and its values. */
const t = (key: string, opts?: Record<string, unknown>) => (opts ? `${key} ${JSON.stringify(opts)}` : key);

describe("sponsor texts", () => {
  test("every goal in words", () => {
    expect(sponsorGoalText({ kind: "league_position", max: 4 }, t, "en")).toBe('sponsors.goal.league_position {"count":4,"ordinal":true}');
    expect(sponsorGoalText({ kind: "continental" }, t, "en")).toBe("sponsors.goal.continental");
    expect(sponsorGoalText({ kind: "cup_stage", stage: "qf" }, t, "en")).toBe("sponsors.goal.cup_stage.qf");
    expect(sponsorGoalText({ kind: "promotion" }, t, "en")).toBe("sponsors.goal.promotion");
    expect(sponsorGoalText({ kind: "followers_growth", pct: 0.06 }, t, "en")).toBe('sponsors.goal.followers_growth {"pct":6}');
    expect(sponsorGoalText({ kind: "attendance", avg: 32000 }, t, "en")).toBe('sponsors.goal.attendance {"avg":"32,000"}');
  });

  test("where a goal stands today", () => {
    expect(sponsorProgressTone({ met: null })).toBe("unknown");
    expect(sponsorProgressTone({ met: true })).toBe("met");
    expect(sponsorProgressTone({ met: false })).toBe("missed");
    expect(sponsorProgressText({ kind: "league_position", max: 4 }, { met: false, current: 6, target: 4 }, t, "en"))
      .toBe('sponsors.progress.position {"count":6,"ordinal":true}: sponsors.progress.missed');
    expect(sponsorProgressText({ kind: "league_position", max: 4 }, { met: null, target: 4 }, t, "en")).toBe("sponsors.progress.unknown");
    expect(sponsorProgressText({ kind: "cup_stage", stage: "qf" }, { met: true }, t, "en")).toBe("sponsors.progress.cupReached");
    expect(sponsorProgressText({ kind: "cup_stage", stage: "qf" }, { met: null }, t, "en")).toBe("sponsors.progress.unknown");
    expect(sponsorProgressText({ kind: "followers_growth", pct: 0.06 }, { met: true, current: 0.081, target: 0.06 }, t, "en"))
      .toBe('sponsors.progress.followers {"pct":8}: sponsors.progress.met');
    expect(sponsorProgressText({ kind: "attendance", avg: 32000 }, { met: false, current: 28000, target: 32000 }, t, "en"))
      .toBe('sponsors.progress.attendance {"avg":"28,000"}: sponsors.progress.missed');
  });

  test("the plate: a smaller step for a longer name, an icon for every sector, a text for every refusal", () => {
    const step = (cls: string) => ["text-[13px]", "text-sm", "text-base", "text-xl", "text-2xl", "text-3xl", "text-4xl"].findIndex((s) => cls.split(" ").includes(s));
    for (const size of ["sm", "md", "lg"] as const) {
      expect(step(plateNameClass(size, "Tarvo"))).toBeGreaterThan(step(plateNameClass(size, "Padaria Estrela Dourada")));
      expect(plateNameClass(size, "Tarvo")).toContain("font-display");
    }
    expect(sectorIcon("bank")).toBe("stadium");
    expect(sectorIcon("something new")).toBe("handshake");
    expect(sponsorErrorKey("slotTaken", "action")).toBe("sponsors.error.slotTaken");
    expect(sponsorErrorKey("boom", "action")).toBe("sponsors.error.generic");
    expect(sponsorErrorKey(undefined, "load")).toBe("sponsors.error.load");
  });
});
