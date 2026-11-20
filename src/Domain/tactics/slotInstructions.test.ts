import { describe, expect, test } from "bun:test";
import { parseMatchMarks, parseSlotInstructions, sanitizeSlotInstructions } from "@/Domain/tactics/slotInstructions";
import { formationForTactics } from "@/Domain/matchFormations";

const F433 = formationForTactics({ formation: "4-3-3" });
const F352 = formationForTactics({ formation: "3-5-2" });
const slotOf = (role: string) => F433.attacking.findIndex(s => s.role === role);

describe("parseSlotInstructions", () => {
  test("accepts fitting variants and pressing, cleans defaults", () => {
    const raw: unknown[] = Array(11).fill(null);
    raw[slotOf("LB")] = { variant: "fb_overlap" };
    raw[slotOf("ST")] = { press: "more" };
    raw[slotOf("CAM")] = { press: "normal", variant: "" };
    const r = parseSlotInstructions(raw, F433);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value[slotOf("LB")]).toEqual({ variant: "fb_overlap" });
    expect(r.value[slotOf("ST")]).toEqual({ press: "more" });
    expect(r.value[slotOf("CAM")] ?? null).toBeNull();
  });

  test("rejects unknown / misfit variants, bad pressing, GK pressing, bad shapes", () => {
    expect(parseSlotInstructions({}, F433).ok).toBe(false);
    expect(parseSlotInstructions([{ variant: "x" }], F433).ok).toBe(false);
    const misfit: unknown[] = []; misfit[slotOf("CB")] = { variant: "st_target" };
    expect(parseSlotInstructions(misfit, F433).ok).toBe(false);
    expect(parseSlotInstructions([null, { press: "max" }], F433).ok).toBe(false);
    expect(parseSlotInstructions([{ press: "more" }], F433).ok).toBe(false);
    expect(parseSlotInstructions([null, { foo: 1 }], F433).ok).toBe(false);
    expect(parseSlotInstructions(Array(12).fill(null), F433).ok).toBe(false);
    expect(parseSlotInstructions(null, F433)).toEqual({ ok: true, value: [] });
  });
});

describe("sanitizeSlotInstructions", () => {
  test("drops a variant the new slot role does not accept, keeps pressing", () => {
    const list = F433.attacking.map(s => (s.role === "LB" ? { variant: "fb_inverted" as const, press: "more" as const } : null));
    const out = sanitizeSlotInstructions(F352, list);
    const lbSlot = slotOf("LB");
    if (F352.attacking[lbSlot]!.role === "LB") expect(out[lbSlot]).toEqual({ variant: "fb_inverted", press: "more" });
    else expect(out[lbSlot]).toEqual({ press: "more" });
    expect(sanitizeSlotInstructions(F433, undefined)).toEqual([]);
  });
});

describe("parseMatchMarks", () => {
  const opp = new Set(["a", "b", "c", "gk"]);
  const gks = new Set(["gk"]);
  test("valid pairs", () => {
    expect(parseMatchMarks([{ slot: slotOf("CM"), targetId: "a" }], F433, opp, gks)).toEqual({ ok: true, value: [{ slot: slotOf("CM"), targetId: "a" }] });
    expect(parseMatchMarks([], F433, opp, gks)).toEqual({ ok: true, value: [] });
  });
  test("invalid pairs", () => {
    expect(parseMatchMarks([{ slot: 0, targetId: "a" }], F433, opp, gks).ok).toBe(false);
    expect(parseMatchMarks([{ slot: slotOf("CM"), targetId: "gk" }], F433, opp, gks).ok).toBe(false);
    expect(parseMatchMarks([{ slot: slotOf("CM"), targetId: "z" }], F433, opp, gks).ok).toBe(false);
    expect(parseMatchMarks([{ slot: 1, targetId: "a" }, { slot: 2, targetId: "b" }, { slot: 3, targetId: "c" }], F433, opp, gks).ok).toBe(false);
    expect(parseMatchMarks([{ slot: 1, targetId: "a" }, { slot: 1, targetId: "b" }], F433, opp, gks).ok).toBe(false);
    expect(parseMatchMarks([{ slot: 99, targetId: "a" }], F433, opp, gks).ok).toBe(false);
  });
});

describe("stage 20: duty, out-of-possession role, player levels", () => {
  test("parsed, fitted to the role, refused when they do not fit", async () => {
    const { formationForSimId } = await import("@/Domain/matchFormations");
    const f = formationForSimId("4-3-3");
    const lb = f.attacking.findIndex((s) => s.role === "LB");
    const list: unknown[] = []; list[lb] = { duty: "attack", oop: "fb_press", shooting: -1, crossing: 2 };
    const r = parseSlotInstructions(list, f);
    expect(r.ok && r.value[lb]).toEqual({ duty: "attack", oop: "fb_press", shooting: -1, crossing: 2 });
    const bad: unknown[] = []; bad[lb] = { oop: "st_press" };
    expect(parseSlotInstructions(bad, f).ok).toBe(false);
    const lvl: unknown[] = []; lvl[lb] = { dribbling: 3 };
    expect(parseSlotInstructions(lvl, f).ok).toBe(false);
    const sup: unknown[] = []; sup[lb] = { duty: "support" };
    expect(parseSlotInstructions(sup, f)).toEqual({ ok: true, value: [] });
  });
  test("the role out of possession scales the defensive weights", async () => {
    const { resolveSlotTuning } = await import("@/GameEngine/Configs/RoleVariantConfig");
    const base = resolveSlotTuning("LB", null);
    const press = resolveSlotTuning("LB", { oop: "fb_press" });
    expect(press.defensiveIntentWeights.press_holder).toBeCloseTo(base.defensiveIntentWeights.press_holder * 1.3);
    expect(resolveSlotTuning("LB", { duty: "attack" })).toBe(base);
  });
});
