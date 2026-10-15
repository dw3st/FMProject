import { describe, expect, test } from "bun:test";
import { computeSeatedMatchLineups } from "@/Domain/advanceDay/matchSimulationLineups";
import { aiFamiliarity } from "@/Domain/familiarity/familiarity";
import { formationForSimId } from "@/Domain/matchFormations";
import type { Fixture } from "@/types/calendarTypes";
import type { Squad } from "@/types/playerTypes";

const squad = (id: string, extra: Partial<Squad> = {}): Squad =>
  ({ id, name: id, colors: ["#000", "#fff"], money: 0, players: [], ...extra }) as Squad;
const fixture = { home: "h", away: "a", date: "2027-03-01", competition: "x", round: 1, played: false } as unknown as Fixture;

describe("lineups with seats on either side", () => {
  test("two seats meet: each side plays its own tactics and familiarity, no AI formation", () => {
    const r = computeSeatedMatchLineups(fixture, squad("h", { styleFamiliarity: { possession: 92 } }), squad("a", { styleFamiliarity: { direct_play: 81 } }), {
      home: { tactics: { formation: "4-3-3", tactical_style: "possession", lineup: [] } },
      away: { tactics: { formation: "4-4-2", tactical_style: "direct_play", lineup: [] } },
    });
    expect(r.tactics.A.style).toBe("possession");
    expect(r.tactics.B.style).toBe("direct_play");
    expect(r.tactics.A.familiarity?.possession).toBe(92);
    expect(r.tactics.B.familiarity?.direct_play).toBe(81);
    expect(r.awayFormation).toEqual(formationForSimId("4-4-2"));
    expect(r.aiFormations).toEqual({});
  });

  test("one seat: the same as the single-human lineups; no seat: both sides on the AI rule", () => {
    const one = computeSeatedMatchLineups(fixture, squad("h"), squad("a"), {
      away: { tactics: { formation: "4-4-2", tactical_style: "possession", lineup: [] } },
    });
    expect(one.tactics.B.style).toBe("possession");
    expect(one.tactics.A.familiarity).toEqual(aiFamiliarity("balanced"));
    const none = computeSeatedMatchLineups(fixture, squad("h"), squad("a"), {});
    expect(none.tactics.A.familiarity).toEqual(aiFamiliarity("balanced"));
    expect(none.tactics.B.familiarity).toEqual(aiFamiliarity("balanced"));
  });
});
