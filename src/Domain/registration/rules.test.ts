import { describe, expect, test } from "bun:test";
import {
  autoRegister, canAdd, countsOf, limitForeignPool, matchdayPool, registeredSet, rosterSig, ruleFor, validateList, type RegCtx,
} from "@/Domain/registration/rules";
import { REGISTRATION_RULES as R } from "@/Domain/registration/registrationConfig";
import type { RosterPlayer, Squad } from "@/types/playerTypes";
import type { FormationSlot } from "@/types/formationSlots";

const LINES = ["GK", "CB", "CM", "ST"];
const mk = (id: string, ovr: number, o: Partial<RosterPlayer> = {}): RosterPlayer =>
  ({
    id, name: id, age: 26, squadId: "c1", preferredFoot: "right", positions: ["CM"], overallAvg: ovr,
    stats: { finishing: 5, passing: 5, dribbling: 5, tackling: 5, pressing: 5, vision: 5, speed: 5, acceleration: 5, strength: 5, stamina: 5, heading: 5, jump: 5, reflex: 5 } as never,
    profile: {} as never, ...o,
  });
const ctxOf = (country: string): RegCtx => ({ seasonStartYear: 2027, countryOfLeague: () => country, country, squadId: "c1" });

describe("ruleFor", () => {
  test("lookup order", () => {
    expect(ruleFor("ucl", "premier_league", "England", "Europe").id).toBe("uefa");
    expect(ruleFor("lib", "brazil_serie_a", "Brazil", "South America").id).toBe("conmebol");
    expect(ruleFor("cup_england", "of_championship", "England", "Europe").id).toBe("premier_league");
    expect(ruleFor("la_liga", "la_liga", "Spain", "Europe").id).toBe("la_liga");
    expect(ruleFor("of_eredivisie", "of_eredivisie", "Netherlands", "Europe").id).toBe("europe");
    expect(ruleFor("of_j_league", "of_j_league", "Japan", "Asia").id).toBe("asia");
    expect(ruleFor("x", "x", "Atlantis", undefined).id).toBe("europe");
  });
});

describe("autoRegister", () => {
  test("Premier: formed shortage reduces the list, U21 free", () => {
    const players: RosterPlayer[] = [];
    for (let i = 0; i < 4; i++) players.push(mk(`e${i}`, 7 - i * 0.01, { nationality: "England", positions: [LINES[i]!] }));
    players.push(mk("y0", 4, { nationality: "France", age: 20 }), mk("y1", 4.1, { nationality: "France", age: 19 }));
    for (let i = 0; i < 24; i++) players.push(mk(`f${String(i).padStart(2, "0")}`, 6 - i * 0.05, { nationality: "France", positions: [LINES[i % 4]!] }));
    const ctx = ctxOf("England");
    const { ids, exception } = autoRegister(players, R.premier_league!, ctx);
    expect(exception).toBe(false);
    const c = countsOf(ids, players, R.premier_league!, ctx);
    expect(c).toEqual({ counted: 21, max: 25, foreign: 19, maxForeign: null, formed: 4, minFormed: 8, lostSlots: 4, free: 2 });
    for (let i = 17; i < 24; i++) expect(ids).not.toContain(`f${String(i).padStart(2, "0")}`);
    expect(validateList(ids, players, R.premier_league!, ctx)).toEqual([]);
  });
  test("La Liga: 3 non-EU, ibero and acp exempt", () => {
    const players = [
      ...Array.from({ length: 6 }, (_, i) => mk(`jp${i}`, 8 - i * 0.1, { nationality: "Japan" })),
      mk("br", 5, { nationality: "Brazil" }), mk("sn", 5, { nationality: "Senegal" }),
      ...Array.from({ length: 16 }, (_, i) => mk(`es${i}`, 4, { nationality: "Spain", positions: [LINES[i % 4]!] })),
    ];
    const { ids } = autoRegister(players, R.la_liga!, ctxOf("Spain"));
    expect(ids.filter((id) => id.startsWith("jp"))).toEqual(["jp0", "jp1", "jp2"]);
    expect(ids).toContain("br");
    expect(ids).toContain("sn");
  });
  test("line minimums reach below the cut", () => {
    const players = [
      ...Array.from({ length: 24 }, (_, i) => mk(`o${String(i).padStart(2, "0")}`, 7 - i * 0.01, { nationality: "England", positions: [LINES[1 + (i % 3)]!] })),
      mk("gk1", 3, { nationality: "England", positions: ["GK"] }), mk("gk2", 2.9, { nationality: "England", positions: ["GK"] }),
      mk("gk3", 2.8, { nationality: "England", positions: ["GK"] }),
    ];
    const { ids } = autoRegister(players, R.premier_league!, ctxOf("England"));
    expect(ids).toContain("gk1");
    expect(ids).toContain("gk2");
    expect(ids).not.toContain("gk3");
    expect(ids.length).toBe(25);
  });
  test("floor of 18 ignores the limits", () => {
    const players = [
      ...Array.from({ length: 15 }, (_, i) => mk(`f${i}`, 6, { nationality: "Japan", positions: [LINES[i % 4]!] })),
      ...Array.from({ length: 5 }, (_, i) => mk(`d${i}`, 5, { nationality: "Fiji", positions: [LINES[i % 4]!] })),
    ];
    const r = autoRegister(players, R.oceania!, ctxOf("Fiji"));
    expect(r.ids.length).toBe(18);
    expect(r.exception).toBe(true);
    expect(validateList(r.ids, players, R.oceania!, ctxOf("Fiji"), true)).toEqual([]);
    expect(validateList(r.ids, players, R.oceania!, ctxOf("Fiji"))).toEqual([{ kind: "foreign" }]);
  });
  test("deterministic, ties by id", () => {
    const players = Array.from({ length: 30 }, (_, i) => mk(`p${29 - i}`, 5, { nationality: "England", positions: [LINES[i % 4]!] }));
    const a = autoRegister(players, R.premier_league!, ctxOf("England"));
    const b = autoRegister([...players].reverse(), R.premier_league!, ctxOf("England"));
    expect(a).toEqual(b);
  });
});

describe("validate and canAdd", () => {
  const ctx = ctxOf("England");
  test("violations", () => {
    const eng = Array.from({ length: 26 }, (_, i) => mk(`e${i}`, 5, { nationality: "England" }));
    expect(validateList(eng.map((p) => p.id), eng, R.premier_league!, ctx)).toEqual([{ kind: "listFull" }]);
    const fr = Array.from({ length: 18 }, (_, i) => mk(`f${i}`, 5, { nationality: "France" }));
    expect(validateList(fr.map((p) => p.id), fr, R.premier_league!, ctx)).toEqual([{ kind: "formed" }]);
    const jp = Array.from({ length: 4 }, (_, i) => mk(`j${i}`, 5, { nationality: "Japan" }));
    expect(validateList(jp.map((p) => p.id), jp, R.la_liga!, ctxOf("Spain"))).toEqual([{ kind: "foreign" }]);
  });
  test("canAdd reasons", () => {
    const eng = Array.from({ length: 25 }, (_, i) => mk(`e${i}`, 5, { nationality: "England" }));
    const extra = mk("x", 5, { nationality: "England" });
    expect(canAdd(eng.map((p) => p.id), extra, [...eng, extra], R.premier_league!, ctx)).toEqual({ ok: false, reason: "listFull" });
    expect(canAdd(eng.slice(0, 24).map((p) => p.id), extra, [...eng, extra], R.premier_league!, ctx)).toEqual({ ok: true });
    const young = mk("y", 5, { age: 19, nationality: "France" });
    expect(canAdd(eng.map((p) => p.id), young, [...eng, young], R.premier_league!, ctx)).toEqual({ ok: true });
    const fr = Array.from({ length: 17 }, (_, i) => mk(`f${i}`, 5, { nationality: "France" }));
    const f18 = mk("f18", 5, { nationality: "France" });
    expect(canAdd(fr.map((p) => p.id), f18, [...fr, f18], R.premier_league!, ctx)).toEqual({ ok: false, reason: "formed" });
    const jp = Array.from({ length: 3 }, (_, i) => mk(`j${i}`, 5, { nationality: "Japan" }));
    const j4 = mk("j4", 5, { nationality: "Japan" });
    expect(canAdd(jp.map((p) => p.id), j4, [...jp, j4], R.la_liga!, ctxOf("Spain"))).toEqual({ ok: false, reason: "foreign" });
  });
  test("registeredSet: list ids still in the squad plus free players", () => {
    const players = [mk("a", 5), mk("b", 5), mk("y", 5, { age: 19 })];
    const squad = { id: "c1", name: "", colors: ["#000", "#fff"], money: 0, players } as Squad;
    expect(registeredSet(squad, "premier_league", R.premier_league!, ctx)).toBeNull();
    const withList = { ...squad, registrations: { premier_league: { season: "2027-28", ids: ["a", "gone"], updatedOn: "", sig: "" } } };
    expect([...registeredSet(withList, "premier_league", R.premier_league!, ctx)!].sort()).toEqual(["a", "y"]);
    expect(registeredSet(withList, "premier_league", R.premier_league!, ctx, "2026-27")).toBeNull();
    expect(rosterSig(players)).toBe(rosterSig([...players].reverse()));
  });
});

describe("per-match foreign limit (Brazil)", () => {
  const slots: FormationSlot[] = ["GK", "CB", "CB", "CB", "CB", "CM", "CM", "CM", "ST", "ST", "ST"].map((role) => ({ role, x: 0, y: 0 }) as FormationSlot);
  const xi = slots.map((s, i) => mk(`x${i}`, 7, { nationality: i < 10 ? "Argentina" : "Brazil", positions: [s.role] }));
  const benchDom = slots.map((s, i) => mk(`b${i}`, 5, { nationality: "Brazil", positions: [s.role] }));
  const benchFor = [mk("bf0", 6.5, { nationality: "Uruguay" })];
  const players = [...xi, ...benchDom, ...benchFor];
  test("extra foreigners leave the XI and the bench", () => {
    const r = matchdayPool(slots, xi.map((p) => p.id), players, R.brazil!, "Brazil");
    expect(r.replaced.length).toBe(1);
    expect(r.replaced[0]!.reason).toBe("foreignLimit");
    expect(r.replaced[0]!.in.startsWith("b")).toBe(true);
    const xiSet = new Set(r.lineup);
    const foreign = [...r.lineup, ...r.bench.map((p) => p.id)].filter((id) => players.find((p) => p.id === id)!.nationality !== "Brazil");
    expect(foreign.length).toBe(9);
    expect(r.bench.some((p) => xiSet.has(p.id))).toBe(false);
    expect(r.bench.some((p) => p.id === "bf0")).toBe(false);
  });
  test("within the limit: same lineup", () => {
    const lineup = xi.map((p) => p.id);
    const r = matchdayPool(slots, lineup, players.slice(5), R.brazil!, "Brazil");
    expect(r.lineup).toBe(lineup);
    expect(r.replaced).toEqual([]);
    expect(matchdayPool(slots, lineup, players, R.premier_league!, "England").lineup).toBe(lineup);
  });
  test("AI pool keeps the best foreigners that fit", () => {
    const pool = limitForeignPool(players, R.brazil!, "Brazil");
    expect(pool.filter((p) => p.nationality !== "Brazil").length).toBe(9);
    expect(pool.some((p) => p.id === "bf0")).toBe(false);
  });
});
