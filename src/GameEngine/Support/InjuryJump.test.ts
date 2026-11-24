import { describe, expect, test } from "bun:test";
import { injuryVacancyOpen } from "@/GameEngine/Support/HighlightPlayback";
import type { GameState } from "@/GameEngine/types";

// Report b8d9fe70: a jump to the start of the lance that ends in an injury must not open the injury panel yet.
describe("injury panel after a highlights jump", () => {
  const injury = { team: "A" as const, injuredId: 7 };
  test("no vacancy yet (the lance start): nothing to answer", () => {
    expect(injuryVacancyOpen({ injuryVacancies: undefined } as unknown as GameState, injury)).toBe(false);
    expect(injuryVacancyOpen({ injuryVacancies: { A: [{ injuredId: 3 }] } } as unknown as GameState, injury)).toBe(false);
  });
  test("the frontier state holds the vacancy: the panel opens", () => {
    expect(injuryVacancyOpen({ injuryVacancies: { A: [{ injuredId: 7 }] } } as unknown as GameState, injury)).toBe(true);
  });
});
