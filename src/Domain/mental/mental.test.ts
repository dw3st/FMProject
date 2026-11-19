import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "fs";
import { fileURLToPath } from "url";
import {
  MENTAL_KEYS, consistencyOf, deriveMental, experienceOf, hasMental, mentalStatsFor, statsWithMental,
  withMentalAttributes,
} from "@/Domain/mental/mental";
import { generatePersonality, mentalShiftOf } from "@/Domain/personality/personality";
import { MAIN_ROLE_TO_SPECIFICS, computeOverallAvg, weightedScore } from "@/Domain/playerRating";
import { positionAptitudes } from "@/Domain/positions/positionAptitude";
import { playerMarketValue } from "@/Domain/negotiation/askingPrice";
import type { PlayerStatsRecord, RosterPlayer, Squad } from "@/types/playerTypes";

const NEUTRAL = { prof: 0, temp: 0, amb: 0 };
const base = {
  passing: 4.2, vision: 3.1, finishing: 2.5, dribbling: 3.8, speed: 5, acceleration: 5.2, tackling: 2,
  pressing: 3.4, stamina: 5, heading: 2.2, strength: 4, reflex: 0.4, jump: 0.8,
};

function strip(stats: PlayerStatsRecord): PlayerStatsRecord {
  const out = { ...stats } as Record<string, number>;
  for (const k of MENTAL_KEYS) delete out[k];
  return out as unknown as PlayerStatsRecord;
}

describe("deriveMental", () => {
  test("deterministic by id, one decimal in 0..10", () => {
    const a = deriveMental(base, 24, "p1", NEUTRAL);
    expect(deriveMental(base, 24, "p1", NEUTRAL)).toEqual(a);
    for (const k of MENTAL_KEYS) {
      expect(a[k]).toBeGreaterThanOrEqual(0);
      expect(a[k]).toBeLessThanOrEqual(6.5);
      expect(Math.round(a[k] * 10) / 10).toBe(a[k]);
    }
    expect(deriveMental(base, 24, "p2", NEUTRAL)).not.toEqual(a);
  });

  test("experience and the attributes behind each key push it up", () => {
    const young = deriveMental(base, 18, "p1", NEUTRAL);
    const old = deriveMental(base, 31, "p1", NEUTRAL);
    expect(old.decisions).toBeGreaterThan(young.decisions);
    expect(old.anticipation).toBeGreaterThan(young.anticipation);
    expect(deriveMental({ ...base, dribbling: 6.5 }, 24, "p1", NEUTRAL).flair).toBeGreaterThan(deriveMental(base, 24, "p1", NEUTRAL).flair);
    expect(experienceOf(18)).toBe(0);
    expect(experienceOf(30)).toBe(1);
  });

  test("personality shifts: hot head less composed, ambitious more flair", () => {
    const calm = deriveMental(base, 24, "p1", { ...NEUTRAL, temp: -1 });
    const hot = deriveMental(base, 24, "p1", { ...NEUTRAL, temp: 1 });
    expect(calm.composure).toBeGreaterThan(hot.composure);
    expect(deriveMental(base, 24, "p1", { ...NEUTRAL, amb: 1 }).flair).toBeGreaterThan(deriveMental(base, 24, "p1", { ...NEUTRAL, amb: -1 }).flair);
    expect(consistencyOf(30, { prof: 1, temp: -1, amb: 0 })).toBeGreaterThan(consistencyOf(18, { prof: -1, temp: 1, amb: 0 }));
  });
});

describe("withMentalAttributes", () => {
  const p = { id: "x9", age: 27, stats: base as unknown as PlayerStatsRecord };
  test("fills only the missing keys, by the derivation", () => {
    const filled = withMentalAttributes(p);
    expect(hasMental(filled.stats)).toBe(true);
    const d = deriveMental(base, 27, "x9", mentalShiftOf(generatePersonality("x9")));
    for (const k of MENTAL_KEYS) expect(filled.stats[k]).toBe(d[k]);
    const partial = withMentalAttributes({ ...p, stats: { ...base, flair: 9.9 } as unknown as PlayerStatsRecord });
    expect(partial.stats.flair).toBe(9.9);
    expect(partial.stats.decisions).toBe(d.decisions);
  });

  test("a player who has the keys is the same object", () => {
    const full = { ...p, stats: mentalStatsFor(base, 27, "x9") };
    expect(withMentalAttributes(full)).toBe(full);
    expect(statsWithMental(full.stats, 27, "x9", NEUTRAL)).toBe(full.stats);
  });
});

// Proof of phase 1: overall, positions, aptitude and market value bit-identical with or without the mental keys,
// over real squads of the base world.
describe("overall identity on real squads", () => {
  const root = fileURLToPath(new URL("../../example_data/squads", import.meta.url));
  const files: string[] = [];
  for (const league of ["premier_league", "brazil_serie_a", "la_liga", "of_championship", "of_kenyan_premier_division"]) {
    for (const f of readdirSync(`${root}/${league}`).slice(0, 6)) files.push(`${root}/${league}/${f}`);
  }
  test(`${files.length} squads`, () => {
    let n = 0;
    for (const f of files) {
      const squad = JSON.parse(readFileSync(f, "utf-8")) as Squad;
      for (const raw of squad.players) {
        const { overallAvg: _c, ...rest } = raw;
        const without: RosterPlayer = { ...rest, stats: strip(raw.stats) };
        const withM: RosterPlayer = { ...rest, stats: withMentalAttributes(without).stats };
        expect(hasMental(withM.stats)).toBe(true);
        expect(computeOverallAvg(withM)).toBe(computeOverallAvg(without));
        for (const roles of Object.values(MAIN_ROLE_TO_SPECIFICS)) {
          for (const r of roles) expect(weightedScore(withM.stats, r)).toBe(weightedScore(without.stats, r));
        }
        expect(positionAptitudes(withM)).toEqual(positionAptitudes(without));
        expect(playerMarketValue({ ...withM })).toBe(playerMarketValue({ ...without }));
        n++;
      }
    }
    expect(n).toBeGreaterThan(500);
  });
});

