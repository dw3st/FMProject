import { describe, expect, test } from "bun:test";
import { afterOfficialGame, languageOf, newSettling, SETTLING, settled, settlingMult, withNewcomers, withSettlingExecution } from "@/Domain/settling/settling";
import type { RosterPlayer, Squad } from "@/types/playerTypes";

const p = (id: string, nationality?: string): RosterPlayer => ({ id, nationality }) as unknown as RosterPlayer;

describe("settling", () => {
  test("a settled player plays as always", () => {
    expect(settlingMult(p("a"))).toBe(1);
    const stats = { passing: 5 };
    expect(withSettlingExecution(stats, 1)).toBe(stats);
  });
  test("the penalty closes linearly and goes away with the last game", () => {
    let x: RosterPlayer = { ...p("a"), settling: { games: 0, need: 2 } };
    expect(settlingMult(x)).toBeCloseTo(1 - SETTLING.PENALTY);
    x = afterOfficialGame(x);
    expect(settlingMult(x)).toBeCloseTo(1 - SETTLING.PENALTY / 2);
    x = afterOfficialGame(x);
    expect(x.settling).toBeUndefined();
    expect(settlingMult(x)).toBe(1);
  });
  test("someone who speaks his language shortens it, himself excluded", () => {
    const squad = [p("a", "Argentina"), p("b", "Spain"), p("c", "France")];
    expect(newSettling(p("a", "Argentina"), squad).need).toBe(SETTLING.GAMES);
    expect(newSettling(p("a", "Argentina"), [...squad, p("d", "Uruguay")]).need).toBe(SETTLING.GAMES_WITH_LANGUAGE);
  });
  test("languages: groups, a nation of its own, no nationality", () => {
    expect(languageOf("Brazil")).toBe(languageOf("Portugal"));
    expect(languageOf("Japan")).toBe("Japan");
    expect(languageOf(undefined)).toBeNull();
    expect(newSettling(p("a"), [p("b"), p("c")]).need).toBe(SETTLING.GAMES);
  });
  test("settled() and the lab's newcomers", () => {
    expect(settled({ ...p("a"), settling: { games: 1, need: 15 } }).settling).toBeUndefined();
    const squad = { players: [p("a"), p("b"), p("c")] } as unknown as Squad;
    expect(withNewcomers(squad, ["a", "b", "c"], undefined)).toBe(squad);
    expect(withNewcomers(squad, ["c", "a"], 1).players.filter((x) => x.settling).map((x) => x.id)).toEqual(["c"]);
  });
});
