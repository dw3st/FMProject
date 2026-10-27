import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { applyTeamTacticsConfig } from "@/GameEngine/Configs/DefenseConfig";
import { applyTeamAttackConfig } from "@/GameEngine/Configs/AttackConfig";
import { matchMoraleOf, setTeamMoraleOverride } from "@/GameEngine/Configs/MoraleConfig";
import { applyTeamInstructions, createMatchState, setManMarksBySlot } from "@/GameEngine/Domain/gameState";
import type { GameState } from "@/GameEngine/types";
import { variantsForRole } from "@/GameEngine/Configs/RoleVariantConfig";
import { MORALE } from "@/Domain/morale/moraleConfig";
import { pitchInjury } from "@/Domain/facilities/turf";
import { autoFillLineupWithFitness } from "@/Domain/lineupHelpers";
import { isUnavailable } from "@/Domain/discipline/discipline";
import { staffEffectsOf } from "@/Domain/staff/staff";
import { formationForSimId } from "@/Domain/matchFormations";
import { mulberry32 } from "@/Domain/rng";
import { aiFamiliarity, squadFamiliarityLevels } from "@/Domain/familiarity/familiarity";
import { getFormationSlots, type FormationShape } from "@/types/formationSlots";
import type { Squad } from "@/types/playerTypes";
import type { SlotInstruction } from "@/types/tacticsTypes";
import { buildLiveMatchState, eligibleLivePlayers, type LiveMatchInput } from "@/Domain/match/liveMatchSetup";

const squad = (id: string): Squad =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../../Data/squads/premier_league/${id}.json`, import.meta.url)), "utf-8"));

const realRandom = Math.random;
afterEach(() => { Math.random = realRandom; });
const seeded = <T>(seed: number, fn: () => T): T => {
  Math.random = mulberry32(seed);
  try { return fn(); } finally { Math.random = realRandom; }
};

const DATE = "2027-03-10";
const formation = formationForSimId("4-3-3");
const slots = getFormationSlots(formation as unknown as FormationShape, "attacking");

/** One instruction on every slot whose role has a variant (the GK keeps none). */
const instructions: (SlotInstruction | null)[] = slots.map((s) => {
  const v = variantsForRole(s.role);
  return v.length ? { variant: v[0], press: "more" } : null;
});

const home = squad("33");
const away = squad("34");
const tacticsA = { style: "balanced" as const, mentality: "balanced" as const, familiarity: squadFamiliarityLevels(home, "balanced") };
const tacticsB = { style: "balanced" as const, mentality: "balanced" as const, familiarity: aiFamiliarity("balanced") };
const playersA = eligibleLivePlayers(home.players, DATE, null);
const playersB = eligibleLivePlayers(away.players, DATE, null);
const lineupA = autoFillLineupWithFitness(slots, playersA, DATE);
const lineupBAuto = autoFillLineupWithFitness(slots, playersB, DATE);
const marks = [{ slot: 5, targetRosterId: lineupBAuto[9]! }];
const takers = { corners: [lineupA[7]!], penalties: [lineupA[10]!] };
const pitch = { condition: 30, turf: "synthetic" as const };
const referee = { id: "ref_x", name: "Ref", country: "England", strictness: 0.4, quality: 70, var: true };

/** The construction `MatchScreen` did inline before `buildLiveMatchState` (the user is A, B the AI). */
function oldConstruction(): GameState {
  applyTeamTacticsConfig("A", tacticsA.style, tacticsA.mentality, undefined, tacticsA.familiarity);
  applyTeamAttackConfig("A", tacticsA.style, tacticsA.mentality, undefined, tacticsA.familiarity);
  applyTeamTacticsConfig("B", tacticsB.style, tacticsB.mentality, undefined, tacticsB.familiarity);
  applyTeamAttackConfig("B", tacticsB.style, tacticsB.mentality, undefined, tacticsB.familiarity);
  const myEligible = home.players.filter((p) => !isUnavailable(p, DATE));
  const opp = away.players.filter((p) => !isUnavailable(p, DATE));
  setTeamMoraleOverride("A", undefined);
  setTeamMoraleOverride("B", undefined);
  const oppLineup = autoFillLineupWithFitness(slots, opp, DATE);
  const pitchMult = pitchInjury(pitch.condition, pitch.turf);
  const fresh: GameState = {
    ...createMatchState(myEligible, formation, opp, formation, lineupA, oppLineup, {
      A: staffEffectsOf(home).injuryMult * pitchMult,
      B: staffEffectsOf(away).injuryMult * pitchMult,
    }),
    knockout: true,
    weather: "rain",
    referee,
    manualInjurySubs: { A: true },
    setPieceTakers: { A: takers },
    managerDiscipline: { A: 15 },
    aggregate: { A: 1, B: 2 },
  };
  return setManMarksBySlot(applyTeamInstructions(fresh, "A", instructions), "A", marks);
}

function soloInput(): LiveMatchInput {
  return {
    A: {
      players: playersA, formation, lineup: lineupA, tactics: tacticsA,
      staffInjuryMult: staffEffectsOf(home).injuryMult, morale: "own", human: true,
      slotInstructions: instructions, marks, setPieceTakers: takers, managerBanned: false, managerDiscipline: 15,
    },
    B: {
      players: playersB, formation, tactics: tacticsB,
      staffInjuryMult: staffEffectsOf(away).injuryMult, morale: "own", human: false,
    },
    date: DATE, knockout: true, aggregate: { A: 1, B: 2 }, pitch, weather: "rain", referee,
  };
}

describe("buildLiveMatchState", () => {
  test("solo match: identical to the old MatchScreen construction", () => {
    const before = seeded(42, oldConstruction);
    const after = seeded(42, () => buildLiveMatchState(soloInput()));
    const view = (s: GameState) => s.players.map((p) => ({
      id: p.id, rosterId: p.rosterId, team: p.team, x: p.x, y: p.y, slot: p.slotIndex, role: p.role,
      instruction: p.instruction, manMark: p.manMarkTargetId,
    }));
    expect(view(after)).toEqual(view(before));
    expect(after.autoSubs).toEqual(before.autoSubs);
    expect(after.manualInjurySubs).toEqual({ A: true });
    expect(after.setPieceTakers).toEqual(before.setPieceTakers);
    expect(after.slotInstructions).toEqual(before.slotInstructions);
    expect(after.manMarks).toEqual(before.manMarks);
    expect(after).toEqual(before);
  });

  test("a banned manager: the assistant makes every change", () => {
    const input = soloInput();
    input.A.managerBanned = true;
    const s = buildLiveMatchState(input);
    expect(s.autoSubs).toEqual({ A: true });
    expect(s.manualInjurySubs).toBeUndefined();
  });

  test("both sides human: B gets manual injury subs, its instructions, marking and takers", () => {
    const input = soloInput();
    const lineupB = lineupBAuto;
    input.B = {
      ...input.B, lineup: lineupB, human: true, slotInstructions: instructions,
      marks: [{ slot: 6, targetRosterId: lineupA[9]! }], setPieceTakers: { freeKicks: [lineupB[8]!] }, managerDiscipline: 5,
    };
    const s = buildLiveMatchState(input);
    expect(s.manualInjurySubs).toEqual({ A: true, B: true });
    expect(s.slotInstructions?.B).toEqual(instructions);
    expect(s.setPieceTakers?.B).toEqual({ freeKicks: [lineupB[8]!] });
    expect(s.managerDiscipline).toEqual({ A: 15, B: 5 });
    const withVariant = instructions.findIndex((i) => i !== null);
    const bPlayer = s.players.find((p) => p.team === "B" && p.slotIndex === withVariant)!;
    expect(bPlayer.instruction?.variant).toBe(instructions[withVariant]!.variant);
    const marker = s.players.find((p) => p.team === "B" && p.slotIndex === 6)!;
    const target = s.players.find((p) => p.rosterId === lineupA[9])!;
    expect(marker.manMarkTargetId).toBe(target.id);
  });

  test("a side with no own squad: neutral morale and no injury multiplier", () => {
    const input = soloInput();
    delete input.B.staffInjuryMult;
    input.B.morale = "neutral";
    const s = buildLiveMatchState(input);
    expect(s.players.some((p) => p.team === "B")).toBe(true);
    expect(matchMoraleOf("B", 90)).toBe(MORALE.NEUTRAL);
    expect(matchMoraleOf("A", 90)).toBe(90);
    setTeamMoraleOverride("B", undefined);
  });
});
