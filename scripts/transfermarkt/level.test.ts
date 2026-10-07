import { expect, test } from "bun:test";
import { fitEffects, levelOf, type ValuedPlayer } from "@/../scripts/transfermarkt/level";

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
