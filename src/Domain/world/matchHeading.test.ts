import { describe, expect, test } from "bun:test";
import { matchHeading } from "@/Domain/world/matchHeading";

const t = (key: string, o?: Record<string, unknown>) => (o ? `${key}:${JSON.stringify(o)}` : key);

describe("matchHeading", () => {
  test("league shows the matchday", () => {
    expect(matchHeading({ fixture: { competition: "premier_league", round: 7 }, competition: "Premier League" }, t))
      .toBe('leagues.matchday:{"round":7} • Premier League');
  });
  test("cup shows the stage, or the name alone while unknown", () => {
    const fixture = { competition: "cup_england", round: 3 };
    expect(matchHeading({ fixture, competition: "FA Cup", cupStage: "qf" }, t)).toBe("cups.stage.qf • FA Cup");
    expect(matchHeading({ fixture, competition: "FA Cup" }, t)).toBe("FA Cup");
  });
  test("continental shows group round or stage with leg", () => {
    const g = matchHeading({ fixture: { competition: "ucl", round: 2 }, competition: "UCL", continentalStage: "group", continentalGroup: "B" }, t);
    expect(g).toContain("continental.groupRound");
    const k = matchHeading({ fixture: { competition: "ucl", round: 9, leg: 2 }, competition: "UCL", continentalStage: "qf" }, t);
    expect(k).toBe("continental.stage.qf · continental.leg2 • UCL");
  });
});
