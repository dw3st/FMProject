import { describe, expect, test } from "bun:test";
import type { RosterPlayer } from "@/types/playerTypes";
import { applyLineupPreset, buildLineupPreset, parseLineupPresets, type PresetReplacement } from "@/Domain/tactics/lineupPresets";
import { formationForTactics } from "@/Domain/matchFormations";
import { CUSTOM_FORMATION_ID, snapToZones } from "@/Domain/formation/zones";

const DATE = "2027-03-10";

function player(id: string, position: string, level = 6): RosterPlayer {
  const stats = Object.fromEntries(
    ["passing", "vision", "finishing", "dribbling", "speed", "acceleration", "tackling", "pressing",
      "stamina", "heading", "strength", "reflex", "jump"].map((k) => [k, level]),
  ) as unknown as RosterPlayer["stats"];
  return {
    id, name: `Player ${id}`, positions: [position], age: 26, squadId: "s1", preferredFoot: "right",
    stats, profile: { summary: "", archetype: "test" },
  };
}

const f433 = formationForTactics({ formation: "4-3-3" });
const roles = f433.attacking.map((s) => s.role);
/** Starters: one per 4-3-3 slot (ids s0..s10), plus a bench covering every line. */
const starters = roles.map((role, i) => player(`s${i}`, role, 7));
const bench = [
  player("bGK", "GK", 5), player("bCB", "CB", 5), player("bLB", "LB", 5), player("bCM", "CM", 5),
  player("bST", "ST", 5), player("bRW", "RW", 4),
];
const squad = [...starters, ...bench];
const xi = starters.map((p) => p.id);

describe("buildLineupPreset", () => {
  test("keeps formation, XI (padded to 11) and sanitized instructions", () => {
    const lb = roles.indexOf("LB");
    const instructions = Array(11).fill(null);
    instructions[lb] = { variant: "fb_inverted" };
    instructions[0] = { variant: "st_target" }; // GK slot: dropped
    const preset = buildLineupPreset({ formation: "4-3-3", lineup: xi.slice(0, 9), slotInstructions: instructions }, DATE);
    expect(preset.formation).toBe("4-3-3");
    expect(preset.lineup).toHaveLength(11);
    expect(preset.lineup[10]).toBe("");
    expect(preset.slotInstructions?.[lb]).toEqual({ variant: "fb_inverted" });
    expect(preset.slotInstructions?.[0] ?? null).toBeNull();
    expect(preset.customFormation).toBeUndefined();
    expect(preset.savedOn).toBe(DATE);
  });

  test("carries the free formation", () => {
    const custom = { slots: snapToZones(f433.attacking) };
    const preset = buildLineupPreset({ formation: CUSTOM_FORMATION_ID, customFormation: custom, lineup: xi }, DATE);
    expect(preset.customFormation).toEqual(custom);
    // A ready-made formation never keeps a stale free formation.
    expect(buildLineupPreset({ formation: "4-4-2", customFormation: custom, lineup: xi }, DATE).customFormation).toBeUndefined();
  });
});

describe("parseLineupPresets", () => {
  const good = buildLineupPreset({ formation: "4-3-3", lineup: xi }, DATE);

  test("accepts valid presets and null slots", () => {
    const r = parseLineupPresets({ A: good, B: null });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ A: good });
    expect(parseLineupPresets(null)).toEqual({ ok: true, value: {} });
  });

  test("rejects bad shapes", () => {
    expect(parseLineupPresets([]).ok).toBe(false);
    expect(parseLineupPresets({ D: good }).ok).toBe(false);
    expect(parseLineupPresets({ A: { ...good, formation: "9-0-1" } }).ok).toBe(false);
    expect(parseLineupPresets({ A: { ...good, lineup: [...xi, "extra"] } }).ok).toBe(false);
    expect(parseLineupPresets({ A: { ...good, lineup: [1, 2] } }).ok).toBe(false);
    expect(parseLineupPresets({ A: { ...good, lineup: ["s1", "s1"] } }).ok).toBe(false);
    expect(parseLineupPresets({ A: { ...good, savedOn: "ontem" } }).ok).toBe(false);
    expect(parseLineupPresets({ A: { ...good, savedOn: "2027-02-30" } }).ok).toBe(false);
    expect(parseLineupPresets({ A: { ...good, lineup: ["x".repeat(65)] } }).ok).toBe(false);
    expect(parseLineupPresets({ A: { ...good, extra: 1 } }).ok).toBe(false);
    expect(parseLineupPresets({ A: { ...good, formation: CUSTOM_FORMATION_ID } }).ok).toBe(false);
    expect(parseLineupPresets({ A: { ...good, slotInstructions: [{ variant: "nope" }] } }).ok).toBe(false);
  });

  test("validates the free formation and instructions against the preset's own formation", () => {
    const custom = { slots: snapToZones(f433.attacking) };
    const r = parseLineupPresets({ C: { formation: CUSTOM_FORMATION_ID, customFormation: custom, lineup: xi, savedOn: DATE } });
    expect(r.ok).toBe(true);
    const st = roles.indexOf("ST");
    const list = Array(11).fill(null);
    list[st] = { variant: "fb_inverted" }; // a full-back variant on the striker slot
    expect(parseLineupPresets({ A: { ...good, slotInstructions: list } }).ok).toBe(false);
  });
});

describe("applyLineupPreset", () => {
  test("a fit XI comes back unchanged", () => {
    const preset = buildLineupPreset({ formation: "4-3-3", lineup: xi }, DATE);
    const applied = applyLineupPreset(preset, squad, DATE);
    expect(applied.lineup).toEqual(xi);
    expect(applied.replaced).toEqual([]);
  });

  test("injured, suspended and departed starters are replaced from the same line", () => {
    const st = roles.indexOf("ST");
    const cb = roles.indexOf("CB");
    const gk = roles.indexOf("GK");
    const injured = { ...starters[st]!, injury: { severity: "light" as const, returnDate: "2027-03-20" } };
    const suspended = { ...starters[cb]!, suspension: { matches: 1 } };
    const today = squad
      .filter((p) => p.id !== `s${gk}`) // the goalkeeper left the club
      .map((p) => (p.id === injured.id ? injured : p.id === suspended.id ? suspended : p));
    const applied = applyLineupPreset(buildLineupPreset({ formation: "4-3-3", lineup: xi }, DATE), today, DATE);

    expect(applied.lineup[gk]).toBe("bGK");
    expect(applied.lineup[st]).toBe("bST");
    expect(applied.lineup[cb]).toBe("bCB");
    const expected: PresetReplacement[] = [
      { out: `s${gk}`, in: "bGK", slot: gk, reason: "left" },
      { out: `s${cb}`, in: "bCB", slot: cb, reason: "suspended" },
      { out: `s${st}`, in: "bST", slot: st, reason: "injured" },
    ];
    expect(applied.replaced).toEqual(expected.sort((a, b) => a.slot - b.slot));
    expect(new Set(applied.lineup).size).toBe(11);
  });

  test("brings back formation, free formation and instructions", () => {
    const custom = { slots: snapToZones(f433.attacking) };
    const lb = roles.indexOf("LB");
    const list = Array(11).fill(null);
    list[lb] = { press: "more" };
    const preset = buildLineupPreset({ formation: CUSTOM_FORMATION_ID, customFormation: custom, lineup: xi, slotInstructions: list }, DATE);
    const applied = applyLineupPreset(preset, squad, DATE);
    expect(applied.formation).toBe(CUSTOM_FORMATION_ID);
    expect(applied.customFormation).toEqual(custom);
    expect(applied.slotInstructions.filter(Boolean)).toEqual([{ press: "more" }]);
  });

  test("an empty slot of the preset is filled without a notice", () => {
    const st = roles.indexOf("ST");
    const lineup = [...xi];
    lineup[st] = "";
    const applied = applyLineupPreset(buildLineupPreset({ formation: "4-3-3", lineup }, DATE), squad, DATE);
    expect(applied.lineup[st]).toBe(`s${st}`); // the best available striker (benched in the preset)
    expect(applied.replaced).toEqual([]);
  });

  test("a starter loaned out (no longer in the squad) is replaced as having left", () => {
    const lb = roles.indexOf("LB");
    // Uniform test stats make every defender's natural slot CB, so keep the bench CB out of it.
    const today = squad.filter((p) => p.id !== `s${lb}` && p.id !== "bCB");
    const applied = applyLineupPreset(buildLineupPreset({ formation: "4-3-3", lineup: xi }, DATE), today, DATE);
    expect(applied.lineup[lb]).toBe("bLB");
    expect(applied.replaced).toEqual([{ out: `s${lb}`, in: "bLB", slot: lb, reason: "left" }]);
  });

  test("an injured starter with nobody to replace him stays and is reported with no replacement", () => {
    const gk = roles.indexOf("GK");
    const injuredGk = { ...starters[gk]!, injury: { severity: "medium" as const, returnDate: "2027-04-01" } };
    // Only the starting XI: no bench at all.
    const today = starters.map((p) => (p.id === injuredGk.id ? injuredGk : p));
    const applied = applyLineupPreset(buildLineupPreset({ formation: "4-3-3", lineup: xi }, DATE), today, DATE);
    expect(applied.lineup[gk]).toBe(injuredGk.id);
    expect(applied.replaced).toEqual([{ out: injuredGk.id, in: "", slot: gk, reason: "injured" }]);
  });
});
