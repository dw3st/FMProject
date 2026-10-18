import { describe, expect, test } from "bun:test";
import { quickSimMatch } from "@/Domain/advanceDay/quickSim";
import { mulberry32 } from "@/Domain/rng";
import type { RosterPlayer, Squad } from "@/types/playerTypes";
import { emptySeasonLog } from "@/types/playerTypes";

const ROLES = ["GK", "LB", "CB", "CB", "RB", "CDM", "CM", "CM", "LW", "ST", "RW"];

function makeSquad(id: string, level: number): Squad {
  const players: RosterPlayer[] = ROLES.map((role, i) => ({
    id: `${id}-p${i}`,
    name: `${id} ${role} ${i}`,
    age: 25,
    squadId: id,
    preferredFoot: "right",
    positions: [role],
    stats: {
      passing: level, vision: level, finishing: level, dribbling: level,
      speed: level, acceleration: level, tackling: level, pressing: level,
      stamina: level, heading: level, strength: level, reflex: level, jump: level,
    },
    profile: { summary: "", archetype: "" },
    seasonLog: emptySeasonLog(),
  }));
  return { id, name: id, colors: ["#000", "#fff"], money: 0, players };
}

const home = makeSquad("h", 5);
const away = makeSquad("a", 5);
const lineupOf = (s: Squad) => s.players.map((p) => p.id);
const base = (i: number) => ({
  fixtureId: `f${i}`, home, away, homeLineup: lineupOf(home), awayLineup: lineupOf(away),
});

describe("weather in the quickSim", () => {
  test("neutral weather draws the identical match", () => {
    for (let i = 0; i < 50; i++) {
      const a = quickSimMatch(base(i), mulberry32(i));
      const b = quickSimMatch({ ...base(i), weather: "cloudy" }, mulberry32(i));
      // durationMs is wall-clock time, not part of the draw.
      expect({ ...b.recording, durationMs: 0 }).toEqual({ ...a.recording, durationMs: 0 });
    }
  });
  test("heat leaves less energy, cold more injuries (paired)", () => {
    let eBase = 0, eHot = 0, iBase = 0, iCold = 0;
    for (let i = 0; i < 400; i++) {
      const b = quickSimMatch(base(i), mulberry32(i)).recording;
      const hot = quickSimMatch({ ...base(i), weather: "hot" }, mulberry32(i)).recording;
      const cold = quickSimMatch({ ...base(i), weather: "cold" }, mulberry32(i)).recording;
      eBase += Object.values(b.playerEnergy).reduce((s, v) => s + v, 0);
      eHot += Object.values(hot.playerEnergy).reduce((s, v) => s + v, 0);
      iBase += b.injuries?.length ?? 0;
      iCold += cold.injuries?.length ?? 0;
    }
    expect(eHot).toBeLessThan(eBase);
    expect(iCold).toBeGreaterThanOrEqual(iBase);
  });
});
