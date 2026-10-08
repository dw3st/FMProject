import { describe, expect, test } from "bun:test";
import {
  applyCorrection, formatLike, locatePlayers, parseCorrections, OVERALL_TOLERANCE, type AttrWeights,
} from "@/../scripts/curated/corrections";
import { computeOverallAvg } from "@/Domain/playerRating";
import { preferredRole } from "@/Domain/positions/positionAptitude";
import ROLES from "@/Data/roles.json";
import type { PlayerStatsRecord, RosterPlayer } from "@/types/playerTypes";

const W = ROLES as AttrWeights;

function iago(): RosterPlayer {
  return {
    id: "es_252800", name: "Iago", age: 29, squadId: "126", preferredFoot: "left", positions: ["Defender"],
    stats: {
      passing: 5, vision: 3, finishing: 0, dribbling: 3, speed: 4, acceleration: 4, tackling: 5,
      pressing: 3, stamina: 5, heading: 3, strength: 5, reflex: 1, jump: 0,
    } as PlayerStatsRecord,
    profile: { archetype: "Ball-playing defender", summary: "" } as RosterPlayer["profile"],
    overallAvg: 4.2,
  };
}

describe("parseCorrections", () => {
  test("accepts position and overall", () => {
    expect(parseCorrections({ a: { name: "A", naturalPosition: "RB", overall: 5.5 } }))
      .toEqual({ a: { name: "A", naturalPosition: "RB", overall: 5.5 } });
  });
  test("rejects unknown positions, fields, bad overalls and empty entries", () => {
    expect(() => parseCorrections({ a: { naturalPosition: "XX" } })).toThrow();
    expect(() => parseCorrections({ a: { naturalPosition: "RB", rating: 5 } })).toThrow();
    expect(() => parseCorrections({ a: { overall: 12 } })).toThrow();
    expect(() => parseCorrections({ a: { name: "only a name" } })).toThrow();
    expect(() => parseCorrections([])).toThrow();
  });
});

describe("locatePlayers", () => {
  const squads = new Map([["x.json", [{ id: "a" }, { id: "b" }]], ["y.json", [{ id: "c" }, { id: "b" }]]]);
  test("finds the file and index", () => {
    expect(locatePlayers(squads, ["a", "c"]).get("c")).toEqual({ file: "y.json", index: 0 });
  });
  test("throws on a missing or duplicated id", () => {
    expect(() => locatePlayers(squads, ["zz"])).toThrow(/not found/);
    expect(() => locatePlayers(squads, ["b"])).toThrow(/2 squads/);
  });
});

describe("applyCorrection", () => {
  test("fixes the natural position (foot rule overridden) and drops the overall cache", () => {
    const p = iago();
    expect(preferredRole(p)).not.toBe("RB");
    const r = applyCorrection(p, { naturalPosition: "RB" }, W);
    expect(r.changed).toBe(true);
    expect(r.player.naturalPosition).toBe("RB");
    expect(r.player.overallAvg).toBeUndefined();
    expect(r.after.position).toBe("RB");
    expect(r.player.stats).toEqual(p.stats);
    expect(p.naturalPosition).toBeUndefined(); // input untouched
  });

  test("a position outside the main line throws", () => {
    expect(() => applyCorrection(iago(), { naturalPosition: "CAM" }, W)).toThrow(/not a Defender position/);
  });

  test("rescales to the overall on the fixed position", () => {
    const r = applyCorrection(iago(), { naturalPosition: "RB", overall: 5.6 }, W);
    expect(Math.abs(computeOverallAvg(r.player) - 5.6)).toBeLessThanOrEqual(OVERALL_TOLERANCE);
    for (const v of Object.values(r.player.stats)) {
      expect(Math.abs(v * 10 - Math.round(v * 10))).toBeLessThan(1e-9);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(10);
    }
    expect(r.after.overall).toBeCloseTo(computeOverallAvg(r.player), 10);
  });

  test("idempotent: applying the result again changes nothing", () => {
    const c = { naturalPosition: "RB" as const, overall: 5.6 };
    const once = applyCorrection(iago(), c, W).player;
    const twice = applyCorrection(once, c, W);
    expect(twice.changed).toBe(false);
    expect(twice.player).toBe(once);
  });
});

describe("formatLike", () => {
  test("keeps compact, indented and trailing-newline formats", () => {
    expect(formatLike('{"a":1}', { a: 2 })).toBe('{"a":2}');
    expect(formatLike('{\n  "a": 1\n}\n', { a: 2 })).toBe('{\n  "a": 2\n}\n');
    expect(formatLike('{\n\t"a": 1\n}', { a: 2 })).toBe('{\n\t"a": 2\n}');
  });
  test("keeps the format of a top-level array (leagueData.json), CRLF included", () => {
    expect(formatLike('[\r\n  {\r\n    "a": 1\r\n  }\r\n]\r\n', [{ a: 2 }])).toBe('[\r\n  {\r\n    "a": 2\r\n  }\r\n]\r\n');
    expect(formatLike('[{"a":1}]', [{ a: 2 }])).toBe('[{"a":2}]');
  });
});
