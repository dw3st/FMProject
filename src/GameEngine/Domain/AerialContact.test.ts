import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { fileURLToPath } from "node:url";
import { createMatchState } from "@/GameEngine/Domain/gameState";
import {
  aerialCatchers, contactReachZ, contestantsOf, drawCrossZone, findAerialContact, fmAerialDuelScore, fmCrossZones, headerLine,
} from "@/GameEngine/Domain/AerialContact";
import { FM_AERIAL as F, FM_CROSS_ZONES } from "@/GameEngine/Configs/FmAerialConfig";
import { emptySeasonLog } from "@/types/playerTypes";
import type { Squad } from "@/types/playerTypes";
import type { Formation, GamePlayer, GameState } from "@/GameEngine/types";
import formation433Json from "@/Data/formations/4-3-3.json";
import { PITCH_LENGTH } from "@/GameEngine/Domain/pitch";
import { mulberry32 } from "@/Domain/rng";

/** Stage 10 (`aerial.md` → "Stage 10"): FM's cross zones and the contact in the air (pure). */

function loadSquad(file: string): Squad {
  const path = fileURLToPath(new URL(`../../example_data/squads/premier_league/${file}`, import.meta.url));
  const s = JSON.parse(readFileSync(path, "utf8")) as Squad;
  return { ...s, players: s.players.map(p => ({ ...p, seasonLog: { ...emptySeasonLog(), fitness: 100 } })) };
}
function baseState(): GameState {
  const f = formation433Json as Formation;
  return createMatchState(loadSquad("33.json").players, f, loadSquad("34.json").players, f);
}
const env = { rollDecel: 2, bounce: 1 };
const withStats = (p: GamePlayer, jump: number, heading = 0.5): GamePlayer => ({
  ...p, vel: { x: 0, y: 0 },
  runtimeStats: { ...p.runtimeStats, withoutBall: { ...p.runtimeStats.withoutBall, jump, heading, strength: 0.5 } },
});

describe("FM cross zones", () => {
  test("the shares are FM's: six-yard box 64 %, penalty-spot band 28 %, edge 8 %", () => {
    const share = (pre: string) => FM_CROSS_ZONES.filter(z => z.kind.startsWith(pre)).reduce((s, z) => s + z.weight, 0);
    expect(share("six")).toBeCloseTo(0.64, 6);
    expect(share("spot")).toBeCloseTo(0.28, 6);
    expect(share("edge")).toBeCloseTo(0.08, 6);
  });

  test("the near zones are on the crosser's side, depths from the goal he attacks", () => {
    const fromLow = fmCrossZones({ y: 5, attackDir: 1 });
    const near = fromLow.find(z => z.kind === "six_near")!, far = fromLow.find(z => z.kind === "six_far")!;
    expect(near.y).toBeLessThan(37);
    expect(far.y).toBeGreaterThan(37);
    expect(near.x).toBeCloseTo(PITCH_LENGTH - 3.5, 6);
    const otherWay = fmCrossZones({ y: 70, attackDir: -1 }).find(z => z.kind === "six_near")!;
    expect(otherWay.x).toBeCloseTo(3.5, 6);
    expect(otherWay.y).toBeGreaterThan(37);
  });

  test("the drawn target follows the shares", () => {
    const rng = mulberry32(7);
    let six = 0;
    for (let i = 0; i < 4000; i++) if (drawCrossZone({ y: 5, attackDir: 1 }, rng).kind.startsWith("six")) six++;
    expect(six / 4000).toBeGreaterThan(0.6);
    expect(six / 4000).toBeLessThan(0.68);
  });
});

describe("contact in the air", () => {
  test("the ball is met by the first player it reaches under the height his jump gets to", () => {
    const s = baseState();
    const passer = s.players.find(p => p.team === "A" && p.role === "LW")!;
    const cb = withStats({ ...s.players.find(p => p.team === "B" && p.role === "CB")!, x: 100, y: 20 }, 1);
    const st = withStats({ ...s.players.find(p => p.team === "A" && p.role === "ST")!, x: 108, y: 37 }, 1);
    const catchers = aerialCatchers([passer, cb, st], passer.id, () => false);
    // A ball through (100, 20) at head height, heading on toward the striker.
    const ball = { x: 96, y: 14, z: 2.4, vx: 6, vy: 9, vz: 0 };
    const r = findAerialContact(ball, env, 1, 1, catchers);
    expect(r.hit?.id).toBe(cb.id);
    expect(r.hit!.z).toBeLessThanOrEqual(contactReachZ(cb, false));
  });

  test("a ball above every reach flies over; none in the first moments of the flight", () => {
    const s = baseState();
    const passer = s.players.find(p => p.team === "A" && p.role === "LW")!;
    const cb = withStats({ ...s.players.find(p => p.team === "B" && p.role === "CB")!, x: 100, y: 20 }, 1);
    const catchers = aerialCatchers([passer, cb], passer.id, () => false);
    const high = { x: 99.5, y: 19.5, z: 4, vx: 1, vy: 1, vz: 2 };
    expect(findAerialContact(high, env, 0.1, 1, catchers).hit).toBeNull();
    const low = { x: 99.8, y: 19.8, z: 1.5, vx: 0.5, vy: 0.5, vz: 0 };
    expect(findAerialContact(low, env, 0.1, 0, catchers).hit).toBeNull();
    expect(findAerialContact(low, env, 0.1, F.CONTACT_MIN_FLIGHT_S, catchers).hit?.id).toBe(cb.id);
  });

  test("a keeper plays it with his hands only inside his own box", () => {
    const s = baseState();
    const gk = s.players.find(p => p.team === "B" && p.role === "GK")!;
    const inBox = aerialCatchers([{ ...gk, x: gk.attackDir === 1 ? 5 : PITCH_LENGTH - 5, y: 37 }], -1, () => false);
    expect(inBox).toHaveLength(1);
    expect(inBox[0]!.reachZ).toBeGreaterThan(F.HEAD_TOP_YD + F.JUMP_YD);
    const out = aerialCatchers([{ ...gk, x: PITCH_LENGTH / 2, y: 37 }], -1, () => false);
    expect(out).toHaveLength(0);
  });

  test("the contestants are those around the contact who reach its height", () => {
    const s = baseState();
    const a = withStats({ ...s.players.find(p => p.team === "A" && p.role === "ST")!, x: 105, y: 37 }, 1);
    const d = withStats({ ...s.players.find(p => p.team === "B" && p.role === "CB")!, x: 106.5, y: 37 }, 0);
    const far = withStats({ ...s.players.find(p => p.team === "B", )!, x: 80, y: 37 }, 1);
    const catchers = aerialCatchers([a, d, far], -1, () => false);
    const hit = { id: a.id, point: { x: 105.3, y: 37 }, z: 2.0, at: 0.1, ball: { x: 105.3, y: 37, z: 2, vx: 0, vy: 0, vz: 0 } };
    const ids = contestantsOf(hit, catchers).map(c => c.id).sort();
    expect(ids).toEqual([a.id, d.id].sort());
    // Above the weak jumper's reach he can't contest it.
    const higher = { ...hit, z: contactReachZ(d, false) + 0.1 };
    expect(contestantsOf(higher, catchers).map(c => c.id)).toEqual([a.id]);
  });
});

describe("FM duel score", () => {
  test("jumping weighs more than heading; standing still and goal-side add", () => {
    const s = baseState();
    const p = s.players.find(q => q.role === "CB")!;
    expect(fmAerialDuelScore(withStats(p, 1, 0), false)).toBeGreaterThan(fmAerialDuelScore(withStats(p, 0, 1), false));
    const still = withStats(p, 0.5);
    const running = { ...still, vel: { x: F.STILL_SPEED_YD, y: 0 } };
    expect(fmAerialDuelScore(still, false) - fmAerialDuelScore(running, false)).toBeCloseTo(F.DUEL_STILL, 6);
    expect(fmAerialDuelScore(still, true) - fmAerialDuelScore(still, false)).toBeCloseTo(F.DUEL_GOAL_SIDE, 6);
  });

  test("header lines", () => {
    expect(headerLine("CB")).toBe("DEF");
    expect(headerLine("RWB")).toBe("DEF");
    expect(headerLine("CDM")).toBe("MID");
    expect(headerLine("ST")).toBe("FWD");
    expect(headerLine("GK")).toBe("GK");
  });
});
