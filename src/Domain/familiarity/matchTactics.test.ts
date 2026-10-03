import { describe, expect, test } from "bun:test";
import { computeMatchSimulationLineups } from "@/Domain/advanceDay/matchSimulationLineups";
import { aiFamiliarity } from "@/Domain/familiarity/familiarity";
import type { Fixture } from "@/types/calendarTypes";
import type { Squad } from "@/types/playerTypes";

const squad = (id: string, extra: Partial<Squad> = {}): Squad =>
  ({ id, name: id, colors: ["#000", "#fff"], money: 0, players: [], ...extra }) as Squad;

const fixture = { home: "h", away: "a", date: "2027-03-01", competition: "x", round: 1, played: false } as unknown as Fixture;

describe("match tactics carry familiarity", () => {
  test("the human side brings its stored record, the AI the implicit rule", () => {
    const home = squad("h", { styleFamiliarity: { possession: 92 } });
    const away = squad("a");
    const tactics = { formation: "4-3-3", tactical_style: "possession" as const, lineup: [] };
    const r = computeMatchSimulationLineups(fixture, home, away, "h", tactics);
    expect(r.tactics.A.familiarity?.possession).toBe(92);
    expect(r.tactics.B.familiarity).toEqual(aiFamiliarity("balanced"));
  });

  test("AI vs AI: both sides on the implicit rule", () => {
    const r = computeMatchSimulationLineups(fixture, squad("h"), squad("a"), "other", null);
    expect(r.tactics.A.familiarity).toEqual(aiFamiliarity("balanced"));
    expect(r.tactics.B.familiarity).toEqual(aiFamiliarity("balanced"));
  });
});
