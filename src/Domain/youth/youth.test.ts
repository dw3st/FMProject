import { describe, expect, test } from "bun:test";
import { developYouthSeason, generateIntake, intakeSize, lineAverage, potentialBand, processYouthRollover } from "@/Domain/youth/youth";
import { roleOf } from "@/Domain/contracts/freeAgents";
import { overallAvg } from "@/Domain/playerRating";
import type { RosterPlayer, Squad } from "@/types/playerTypes";
import { initialFacilities } from "@/Domain/facilities/facilities";

function mk(i: number, pos: string, level: number): RosterPlayer {
  const v = Math.round(level * 10) / 10;
  return {
    id: `p${i}`, name: `Player ${i} Silva`, age: 26, squadId: "s1", preferredFoot: "right", positions: [pos],
    stats: {
      passing: v, vision: v, finishing: v, dribbling: v, speed: v, acceleration: v, tackling: v,
      pressing: v, stamina: v, heading: v, strength: v, reflex: pos === "GK" ? v : 0, jump: pos === "GK" ? v : 0,
    },
    profile: { summary: "", archetype: "" },
  };
}

function squad(extra: Partial<Squad> = {}, n = 24): Squad {
  const pos = ["GK", "GK", "GK", "CB", "CB", "CB", "CB", "LB", "RB", "CB", "CM", "CM", "CM", "CDM", "CAM", "LM", "RM", "CM", "ST", "ST", "ST", "LW", "RW", "ST"];
  return {
    id: "s1", name: "S", colors: ["#000", "#fff"], money: 0, country: "England",
    players: pos.slice(0, n).map((p, i) => mk(i, p, 6)),
    finances: { broadcasting: 50e6, commercial: 50e6, total: 100e6, budget: 0, followers: 1e6 },
    ...extra,
  } as Squad;
}

describe("youth intake", () => {
  const base = { saveId: "save1", squad: squad(), year: 2027, nextSeasonEnd: "2028-05-31" };

  test("deterministic per save+club+year, 3-5 players of 16-17", () => {
    const a = generateIntake(base);
    const b = generateIntake(base);
    expect(a).toEqual(b);
    expect(a.length).toBe(intakeSize("save1", "s1", 2027));
    expect(a.length).toBeGreaterThanOrEqual(3);
    expect(a.length).toBeLessThanOrEqual(5);
    for (const p of a) {
      expect(p.age).toBeGreaterThanOrEqual(16);
      expect(p.age).toBeLessThanOrEqual(17);
      expect(p.contract?.wage).toBeGreaterThan(0);
      for (const v of Object.values(p.stats)) expect(Math.abs(v * 10 - Math.round(v * 10))).toBeLessThan(1e-9);
    }
    expect(new Set(a.map((p) => p.id)).size).toBe(a.length);
    expect(generateIntake({ ...base, year: 2028 })[0]!.id).not.toBe(a[0]!.id);
  });

  test("academy level (facilities): quality ±0.15/level, up to 6 players at level 5", () => {
    const withAcademy = (level: number) => {
      const sq = squad();
      return squad({ facilities: { ...initialFacilities(sq, 1), academy: level } });
    };
    const meanLevel = (sq: Squad) => {
      const all: number[] = [];
      for (let y = 0; y < 80; y++) for (const p of generateIntake({ ...base, squad: sq, year: 4000 + y })) all.push(overallAvg(p));
      return { mean: all.reduce((a, b) => a + b, 0) / all.length, sizes: all.length };
    };
    const lo = meanLevel(withAcademy(1));
    const hi = meanLevel(withAcademy(5));
    expect(hi.mean - lo.mean).toBeGreaterThan(0.35);
    expect(hi.mean - lo.mean).toBeLessThan(0.85);
    const sizes = Array.from({ length: 200 }, (_, y) => generateIntake({ ...base, squad: withAcademy(5), year: 5000 + y }).length);
    expect(Math.max(...sizes)).toBe(6);
    expect(Math.min(...sizes)).toBe(3);
  });

  test("level sits about 1.8 under the line average", () => {
    const diffs: number[] = [];
    for (let y = 0; y < 60; y++) {
      for (const p of generateIntake({ ...base, year: 3000 + y })) {
        diffs.push(lineAverage(base.squad, roleOf(p)) - overallAvg(p));
      }
    }
    const mean = diffs.reduce((s, d) => s + d, 0) / diffs.length;
    expect(mean).toBeGreaterThan(1.3);
    expect(mean).toBeLessThan(2.1);
  });

  test("a good assistant raises the level", () => {
    let lo = 0, hi = 0, n = 0;
    for (let y = 0; y < 60; y++) {
      const a = generateIntake({ ...base, year: 4000 + y, assistantRating: 1 });
      const b = generateIntake({ ...base, year: 4000 + y, assistantRating: 10 });
      lo += a.reduce((s, p) => s + overallAvg(p), 0) / a.length;
      hi += b.reduce((s, p) => s + overallAvg(p), 0) / b.length;
      n++;
    }
    expect(hi / n).toBeGreaterThan(lo / n + 0.3);
  });

  test("rare prospects are about 5% and stand out", () => {
    let total = 0, wonder = 0;
    for (let y = 0; y < 400; y++) {
      for (const p of generateIntake({ ...base, year: 5000 + y })) {
        total++;
        if (p.profile.archetype === "Wonderkid") wonder++;
      }
    }
    expect(wonder / total).toBeGreaterThan(0.025);
    expect(wonder / total).toBeLessThan(0.09);
  });

  test("respects role minimums with a thin squad", () => {
    const thin = squad({ players: squad().players.filter((p) => roleOf(p) !== "GK") });
    const intake = generateIntake({ ...base, squad: thin });
    expect(roleOf(intake[0]!)).toBe("GK");
  });

  test("potential band is above the current level and shrinks with age", () => {
    const young = generateIntake(base)[0]!;
    const [lo, hi] = potentialBand(young);
    expect(lo).toBeGreaterThan(overallAvg(young));
    expect(hi).toBeGreaterThan(lo);
    const older = { ...young, age: 22 };
    expect(potentialBand(older)[1] - overallAvg(older)).toBeLessThan(hi - overallAvg(young));
  });

  test("a season of academy training grows the player and ages them", () => {
    const young = generateIntake(base)[0]!;
    const next = developYouthSeason(young, 1);
    expect(next.age).toBe(young.age + 1);
    expect(overallAvg(next)).toBeGreaterThan(overallAvg(young));
    expect(overallAvg(next) - overallAvg(young)).toBeLessThan(2.5);
  });
});

describe("youth rollover", () => {
  const args = { saveId: "save1", year: 2027, nextSeasonEnd: "2028-05-31" };

  test("reborn academy players are not auto-released at 19, only at 23", () => {
    const s = squad();
    const base = generateIntake({ ...args, squad: s, year: 2025 })[0]!;
    const r19 = { ...base, age: 18, reborn: { fromId: "x" } };
    const r22 = { ...base, id: "r22", age: 22, reborn: { fromId: "x" } };
    const res = processYouthRollover({ ...args, squad: { ...s, youth: [r19, r22] }, isHuman: true });
    expect(res.autoReleased.map((p) => p.id)).toEqual(["r22"]);
    expect(res.squad.youth!.some((p) => p.id === r19.id)).toBe(true);
  });

  test("human: intake goes to squad.youth, 19-year-olds are released, squad untouched", () => {
    const s = squad();
    const old = { ...generateIntake({ ...args, squad: s, year: 2025 })[0]!, age: 18 };
    const res = processYouthRollover({ ...args, squad: { ...s, youth: [old] }, isHuman: true });
    expect(res.autoReleased.map((p) => p.id)).toEqual([old.id]);
    expect(res.squad.players.length).toBe(s.players.length);
    expect(res.squad.youth!.length).toBe(res.intake.length);
    expect(res.squad.youth!.length).toBeGreaterThanOrEqual(3);
  });

  test("AI: promotes 1-2 within 30 and discards the rest", () => {
    const s = squad();
    const res = processYouthRollover({ ...args, squad: s, isHuman: false });
    expect(res.promoted.length).toBeGreaterThanOrEqual(1);
    expect(res.promoted.length).toBeLessThanOrEqual(2);
    expect(res.squad.players.length).toBe(s.players.length + res.promoted.length);
    expect(res.squad.youth).toBeUndefined();
  });

  test("AI: full squad promotes nobody", () => {
    const full = squad({}, 24);
    const bigger = { ...full, players: [...full.players, ...Array.from({ length: 6 }, (_, i) => mk(100 + i, "CM", 6))] };
    expect(bigger.players.length).toBe(30);
    const res = processYouthRollover({ ...args, squad: bigger, isHuman: false });
    expect(res.promoted.length).toBe(0);
    expect(res.squad.players.length).toBe(30);
  });
});
