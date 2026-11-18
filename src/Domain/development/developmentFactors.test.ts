import { describe, expect, test } from "bun:test";
import { developmentFactors, factorPercent, growthPhase, mainAreas } from "@/Domain/development/developmentFactors";
import { staffEffectsOf } from "@/Domain/staff/staff";
import type { RosterPlayer, Squad } from "@/types/playerTypes";

const stats = {
  passing: 4, vision: 4, finishing: 6, dribbling: 5, speed: 5, acceleration: 5, tackling: 2, pressing: 3,
  stamina: 5, heading: 5, strength: 5, reflex: 1, jump: 3,
};

function player(over: Partial<RosterPlayer> = {}): RosterPlayer {
  return {
    id: "p1", name: "A", age: 20, squadId: "s", preferredFoot: "right", positions: ["Forward"],
    stats: { ...stats }, profile: {} as RosterPlayer["profile"],
    personality: { ambition: 10, loyalty: 10, professionalism: 10, temperament: 10 },
    ...over,
  } as RosterPlayer;
}

const squad = { id: "s", name: "S", players: [] } as unknown as Squad;

describe("developmentFactors", () => {
  test("phase follows the engine's age tables", () => {
    expect(growthPhase(20)).toBe("growing");
    expect(growthPhase(27)).toBe("growing");
    expect(growthPhase(29)).toBe("peak");
    expect(growthPhase(33)).toBe("declining");
  });

  test("a young striker: assistant, his areas and intensity are listed, no decline", () => {
    const f = developmentFactors(player(), squad, "normal");
    expect(f.phase).toBe("growing");
    expect(f.ageDecay).toBe(0);
    expect(f.ageGrowthShare).toBeGreaterThan(0.5);
    const ids = f.factors.map((x) => x.id);
    expect(ids).toContain("assistant");
    expect(ids).toContain("intensity");
    expect(f.factors.filter((x) => x.id === "area").map((x) => x.area)).toEqual(mainAreas(player()));
    expect(f.factors.find((x) => x.id === "assistant")!.mult).toBe(staffEffectsOf(squad).devMult);
    expect(f.factors.find((x) => x.id === "intensity")!.mult).toBe(1);
  });

  test("heavy training doubles the session DP of normal", () => {
    const f = developmentFactors(player(), squad, "heavy");
    expect(f.factors.find((x) => x.id === "intensity")!.mult).toBeCloseTo(0.25 / 0.12, 9);
    expect(f.main?.id).toBe("intensity");
  });

  test("a veteran declines: the age is the main factor, a professional slows the decline", () => {
    const vet = player({ age: 33, personality: { ambition: 10, loyalty: 10, professionalism: 20, temperament: 10 } });
    const f = developmentFactors(vet, squad, "normal");
    expect(f.phase).toBe("declining");
    expect(f.ageDecay).toBeGreaterThan(0);
    expect(f.main).toEqual({ id: "age" });
    const pro = f.factors.find((x) => x.id === "professionalismDecay")!;
    expect(pro.mult).toBeLessThan(1);
    expect(f.factors.find((x) => x.id === "trainingAge")!.mult).toBe(0);
  });

  test("low morale and the elite brake are listed only when they move the DP", () => {
    const neutral = developmentFactors(player(), squad, "normal").factors.map((x) => x.id);
    expect(neutral).not.toContain("morale");
    expect(neutral).not.toContain("eliteBrake");
    const unhappy = developmentFactors(player({ morale: 10 }), squad, "normal").factors.find((x) => x.id === "morale");
    expect(unhappy!.mult).toBeLessThan(1);
    const star = { ...stats, finishing: 9.5, dribbling: 9.5, speed: 9.5, acceleration: 9.5, strength: 9, heading: 9, passing: 9, vision: 9 };
    const brake = developmentFactors(player({ stats: star }), squad, "normal").factors.find((x) => x.id === "eliteBrake");
    expect(brake!.mult).toBeLessThan(1);
  });

  test("factorPercent", () => {
    expect(factorPercent(1.08)).toBe(8);
    expect(factorPercent(0.9)).toBe(-10);
    expect(factorPercent(1)).toBe(0);
  });
});
