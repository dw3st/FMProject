import { describe, expect, test } from "bun:test";
import { CHIEF_PLAN, neediestLine, onHold, planChiefMissions, type ChiefPlanInput } from "@/Domain/scouting/chiefPlanner";
import { allowedWeeks } from "@/Domain/scouting/missions";

const CONTINENT: Record<string, string> = {
  England: "Europe", Spain: "Europe", France: "Europe", Brazil: "South America", Argentina: "South America", Japan: "Asia",
};

const avgs = { GK: 4.5, Defender: 5.2, Midfielder: 4.9, Forward: 5.4 };
const counts = { GK: 3, Defender: 8, Midfielder: 8, Forward: 5 };

function input(over: Partial<ChiefPlanInput> = {}): ChiefPlanInput {
  return {
    saveId: "s1", date: "2027-02-08",
    scouts: [
      { scoutId: "chief", name: "Chief", member: { nationality: "England" } },
      { scoutId: "f1", name: "Field", member: { nationality: "Brazil", countryKnowledge: { Argentina: { k: 70, last: "2027-02-01" } } } },
    ],
    countries: Object.keys(CONTINENT),
    continentOf: (c) => CONTINENT[c],
    activeTargets: [],
    lineAverages: avgs,
    lineCounts: counts,
    ...over,
  };
}

describe("neediestLine", () => {
  test("a depth shortfall wins, else the weakest outfield line (never GK by average)", () => {
    expect(neediestLine(avgs, counts)).toBe("Midfielder");
    expect(neediestLine(avgs, { ...counts, Forward: 2 })).toBe("Forward");
    expect(neediestLine({ ...avgs, GK: 1 }, counts)).toBe("Midfielder");
    expect(neediestLine(avgs, { ...counts, GK: 1 })).toBe("GK");
  });
});

describe("planChiefMissions", () => {
  test("every free scout gets one valid mission; one youth mission; focus on the neediest line", () => {
    const plan = planChiefMissions(input());
    expect(plan.map((p) => p.scoutId).sort()).toEqual(["chief", "f1"]);
    for (const p of plan) expect(allowedWeeks(p.target.kind)).toContain(p.weeks);
    const youth = plan.filter((p) => p.target.kind === "youth");
    expect(youth).toHaveLength(1);
    expect(youth[0]!.weeks).toBe(CHIEF_PLAN.YOUTH_WEEKS);
    // Best (scout, country) pair: both natives at 90; the tie-break is seeded, never a player mission.
    expect(["England", "Brazil"]).toContain(youth[0]!.target.country ?? "");
    const region = plan.find((p) => p.target.kind !== "youth")!;
    expect(region.weeks).toBe(CHIEF_PLAN.REGION_WEEKS);
    expect(region.focus).toEqual({ line: "Midfielder", improves: true });
    expect(plan.some((p) => p.target.kind === "player")).toBe(false);
  });

  test("deterministic", () => {
    expect(planChiefMissions(input())).toEqual(planChiefMissions(input()));
  });

  test("a single free scout: a country mission in his best country", () => {
    const plan = planChiefMissions(input({ scouts: [input().scouts[1]!] }));
    expect(plan).toEqual([{
      scoutId: "f1", scoutName: "Field", target: { kind: "country", country: "Brazil" }, focus: { line: "Midfielder", improves: true }, weeks: 8,
    }]);
  });

  test("active targets are not repeated (a league blocks its country)", () => {
    const plan = planChiefMissions(input({
      scouts: [input().scouts[1]!],
      activeTargets: [{ kind: "league", league: "brasileirao" }],
      countryOfLeague: (l) => (l === "brasileirao" ? "Brazil" : undefined),
    }));
    expect(plan[0]!.target).toEqual({ kind: "country", country: "Argentina" });
  });

  test("no country known at least moderately: his nationality's continent", () => {
    const plan = planChiefMissions(input({
      scouts: [{ scoutId: "f2", name: "X", member: { nationality: "Japan" } }],
      activeTargets: [{ kind: "country", country: "Japan" }],
    }));
    expect(plan[0]!.target).toEqual({ kind: "continent", continent: "Asia" });
    expect(plan[0]!.weeks).toBe(CHIEF_PLAN.CONTINENT_WEEKS);
  });

  test("no free scout or no country: nothing", () => {
    expect(planChiefMissions(input({ scouts: [] }))).toEqual([]);
    expect(planChiefMissions(input({ countries: [] }))).toEqual([]);
  });
});

describe("onHold", () => {
  test("a scout whose mission the manager cancelled stays free for 7 days", () => {
    expect(onHold(undefined, "2027-02-08")).toBe(false);
    expect(onHold("2027-02-07", "2027-02-08")).toBe(true);
    expect(onHold("2027-02-01", "2027-02-08")).toBe(false);
  });
});
