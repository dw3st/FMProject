import { describe, expect, test } from "bun:test";
import type { PlayerStatsRecord, RosterPlayer } from "@/types/playerTypes";
import { emptySeasonLog } from "@/types/playerTypes";
import { teamStrength } from "@/Domain/advanceDay/quickSim";
import { createMatchState, performSubstitution } from "@/GameEngine/Domain/gameState";
import formation433Json from "@/Data/formations/4-3-3.json";
import type { Formation } from "@/GameEngine/types";
import { teamLineup } from "@/GameEngine/Domain/TeamLineup";
import { aptitudeFor, scaleStats } from "@/Domain/positions/positionAptitude";
import { POSITION_PENALTY } from "@/Domain/positions/positionConfig";

const DEF_STATS = {
  passing: 5, vision: 5, finishing: 2, dribbling: 3, speed: 6, acceleration: 6, tackling: 9,
  pressing: 8, stamina: 7, heading: 9, strength: 9, reflex: 0, jump: 0,
} as PlayerStatsRecord;

function mk(id: string, positions: string[], stats: PlayerStatsRecord): RosterPlayer {
  return {
    id, name: id, age: 25, squadId: "s", preferredFoot: "right", positions, stats,
    profile: { summary: "", archetype: "" }, seasonLog: { ...emptySeasonLog(), fitness: 100 },
  };
}

describe("out-of-position penalty", () => {
  test("quickSim: a defender in the ST slot rates below the same player at CB", () => {
    const d = mk("d", ["Defender"], DEF_STATS);
    expect(aptitudeFor(d, "ST")).not.toBe("natural");
    const k = POSITION_PENALTY[aptitudeFor(d, "ST")];
    expect(k).toBeLessThan(1);
    // Attack of the lone ST = mean(ATTACK_KEYS) * fitnessFactor * k + floor; scaling by k shows in the ratio.
    const flat = { ...d, stats: Object.fromEntries(Object.keys(d.stats).map((key) => [key, 5])) as unknown as PlayerStatsRecord, positions: ["Forward"] };
    const natural = teamStrength([flat], ["ST"]).attack;
    const penalised = teamStrength([{ ...flat, positions: ["Defender"] }], ["ST"]).attack;
    expect(penalised).toBeLessThan(natural);
  });

  test("engine: slot stats are scaled by the aptitude factor; substitutes are re-fielded", () => {
    const squad = (prefix: string) => [
      mk(`${prefix}gk`, ["GK"], { ...DEF_STATS, reflex: 8, jump: 8 } as PlayerStatsRecord),
      ...Array.from({ length: 10 }, (_, i) => mk(`${prefix}${i}`, ["Defender"], DEF_STATS)),
      mk(`${prefix}bench`, ["Defender"], DEF_STATS),
    ];
    const state = createMatchState(squad("a"), formation433Json as Formation, squad("b"), formation433Json as Formation);
    const st = state.players.find((p) => p.team === "A" && p.role === "ST")!;
    const roster = squad("a").find((p) => p.id === st.rosterId)!;
    const k = POSITION_PENALTY[aptitudeFor(roster, "ST")];
    expect(k).toBeLessThan(1);
    // Starter: stats built from the (buffed) attributes scaled by the slot's factor.
    expect(st.baseStats).toEqual(teamLineup(scaleStats(st.fit!.stats, k), "ST"));
    expect(st.baseStats.withBall.shootAccuracy).toBeLessThan(teamLineup(st.fit!.stats, "ST").withBall.shootAccuracy);
    // Substitute: re-fielded in the slot's role with the same rule.
    const next = performSubstitution(state, "A", st.id, state.benchA[0]!.id);
    const sub = next.players.find((p) => p.rosterId === "abench")!;
    const subK = POSITION_PENALTY[aptitudeFor(squad("a").find((p) => p.id === "abench")!, "ST")];
    expect(sub.baseStats).toEqual(teamLineup(scaleStats(sub.fit!.stats, subK), "ST"));
  });
});
