import { describe, expect, test } from "bun:test";
import { COND_EFFECT_CAP, fitConditionalEffects, fitEffects, levelOf, type ValuedPlayer } from "@/../scripts/transfermarkt/level";

function mk(league: string, age: number, line: ValuedPlayer["line"], value: number, id = `${league}${age}${line}${value}`): ValuedPlayer {
  return { id, league, age, line, value };
}

test("age effect: a 20-year-old worth the same as a 27-year-old ranks lower", () => {
  const players: ValuedPlayer[] = [];
  for (let i = 0; i < 30; i++) {
    players.push(mk("L", 20, "Midfielder", 4e6, `y${i}`));
    players.push(mk("L", 27, "Midfielder", 2e6, `o${i}`));
  }
  const fx = fitEffects(players);
  expect(fx.age.get(20)!).toBeGreaterThan(0);
  expect(levelOf(mk("L", 20, "Midfielder", 3e6), fx)).toBeLessThan(levelOf(mk("L", 27, "Midfielder", 3e6), fx));
});

test("line effect: goalkeepers valued lower are not punished", () => {
  const players: ValuedPlayer[] = [];
  for (let i = 0; i < 30; i++) {
    players.push(mk("L", 27, "GK", 1e6, `g${i}`));
    players.push(mk("L", 27, "Midfielder", 3e6, `m${i}`));
  }
  const fx = fitEffects(players);
  expect(levelOf(mk("L", 27, "GK", 1e6), fx)).toBeCloseTo(levelOf(mk("L", 27, "Midfielder", 3e6), fx), 5);
});

test("27 and Midfielder are the references (effect 0)", () => {
  const fx = fitEffects([mk("L", 27, "Midfielder", 1e6), mk("L", 27, "Midfielder", 2e6)]);
  expect(fx.age.get(27) ?? 0).toBe(0);
  expect(fx.line.Midfielder).toBe(0);
});

describe("fitConditionalEffects", () => {
  // Deterministic spread of levels; value = e^(league + 1.5·overall + premium).
  const gen = (league: string, base: number, age: number, line: ValuedPlayer["line"], premium: number, overallShift = 0) =>
    Array.from({ length: 40 }, (_, i) => {
      const overall = 3 + (i % 10) * 0.3 + overallShift;
      return { id: `${league}-${age}-${line}-${i}`, league, age, line, overall, value: Math.exp(base + 1.5 * overall + premium) };
    });

  test("youths of the same level worth 2× get an effect ≈ log 2; league offsets don't leak", () => {
    const players = [
      ...gen("A", 10, 27, "Midfielder", 0), ...gen("A", 10, 19, "Midfielder", Math.log(2)),
      ...gen("B", 13, 27, "Midfielder", 0), ...gen("B", 13, 19, "Midfielder", Math.log(2)),
    ];
    const fx = fitConditionalEffects(players);
    expect(fx.age.get(19)!).toBeCloseTo(Math.log(2), 6);
    expect(fx.slope).toBeCloseTo(1.5, 6);
    expect(fx.age.get(27)).toBe(0);
  });

  test("a weaker band whose value is proportional to its level gets no effect", () => {
    const players = [...gen("A", 10, 27, "Midfielder", 0), ...gen("A", 10, 36, "Midfielder", 0, -1.5)];
    const fx = fitConditionalEffects(players);
    expect(fx.age.get(35)!).toBeCloseTo(0, 6);
    expect(fx.age.get(40)!).toBeCloseTo(0, 6); // ≥ 35 share one band
  });

  test("line premium at equal level, and effects are capped", () => {
    const players = [...gen("A", 10, 27, "Midfielder", 0), ...gen("A", 10, 27, "GK", -0.7), ...gen("A", 10, 17, "Midfielder", 3)];
    const fx = fitConditionalEffects(players);
    expect(fx.line.GK).toBeCloseTo(-0.7, 6);
    expect(fx.age.get(16)!).toBe(COND_EFFECT_CAP);
    expect(levelOf({ id: "g", league: "A", age: 27, line: "GK", value: Math.exp(10 + 4.5 - 0.7) }, fx))
      .toBeCloseTo(levelOf({ id: "m", league: "A", age: 27, line: "Midfielder", value: Math.exp(10 + 4.5) }, fx), 6);
  });
});
