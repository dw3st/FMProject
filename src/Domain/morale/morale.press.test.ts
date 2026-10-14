import { describe, expect, test } from "bun:test";
import { afterPressAnswer } from "@/Domain/morale/morale";
import type { Squad } from "@/types/playerTypes";

const squad = (morales: number[]) =>
  ({ id: "s", players: morales.map((m, i) => ({ id: `p${i}`, name: `P${i}`, morale: m, personality: { ambition: 10, loyalty: 10, professionalism: 10, temperament: 10 } })) }) as unknown as Squad;

describe("afterPressAnswer", () => {
  test("elenco inteiro", () => {
    const out = afterPressAnswer(squad([60, 70]), "all", 2);
    expect(out.players[0]!.morale).toBeCloseTo(62, 0);
    expect(out.players[1]!.morale).toBeCloseTo(72, 0);
  });
  test("um jogador só", () => {
    const out = afterPressAnswer(squad([60, 70]), "p1", -4);
    expect(out.players[0]!.morale).toBe(60);
    expect(out.players[1]!.morale).toBeCloseTo(66, 0);
  });
  test("jogador fora do elenco ou delta 0: mesmo objeto", () => {
    const s = squad([60]);
    expect(afterPressAnswer(s, "nope", 4)).toBe(s);
    expect(afterPressAnswer(s, "all", 0)).toBe(s);
  });
});
