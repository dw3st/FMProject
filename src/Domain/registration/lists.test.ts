import { describe, expect, test } from "bun:test";
import { aiRefresh, automaticList, ensureList, humanDay, manualList, type CompInfo } from "@/Domain/registration/lists";
import { REGISTRATION_RULES as R } from "@/Domain/registration/registrationConfig";
import type { RosterPlayer, Squad } from "@/types/playerTypes";

const LINES = ["GK", "CB", "CM", "ST"];
const mk = (id: string, ovr: number, nationality = "England", age = 26): RosterPlayer =>
  ({ id, name: id, age, squadId: "c1", preferredFoot: "right", positions: [LINES[Number(id.replace(/\D/g, "")) % 4]!], overallAvg: ovr, nationality, stats: {} as never, profile: {} as never });
const squadOf = (n: number): Squad =>
  ({ id: "c1", name: "c1", colors: ["#000", "#fff"], money: 0, players: Array.from({ length: n }, (_, i) => mk(`p${i}`, 7 - i * 0.05)) });
const info = (open: boolean, extra: Partial<CompInfo> = {}): CompInfo => ({
  slug: "premier_league", kind: "league", season: "2026-27", rule: R.premier_league!,
  ctx: { seasonStartYear: 2026, countryOfLeague: () => "England", country: "England", squadId: "c1" },
  status: open ? { open: true, until: "2026-08-31" } : { open: false, opensOn: "2027-01-01" },
  ...extra,
});
const D = "2026-08-10";

describe("lists", () => {
  test("first list even when closed; stale list rebuilt; current list frozen when closed", () => {
    const s = squadOf(28);
    const a = ensureList(s, info(false), D);
    expect(a.changed).toBe(true);
    expect(a.squad.registrations!.premier_league!.ids.length).toBe(25);
    expect(a.notices.map((n) => n.kind)).toEqual(["auto_list"]);
    // a new signing with the deadline closed stays out
    const signed = { ...a.squad, players: [...a.squad.players, mk("star", 9)] };
    expect(ensureList(signed, info(false), D).changed).toBe(false);
    expect(aiRefresh(signed, info(false), D).changed).toBe(false);
    // stale season → rebuilt
    expect(ensureList(signed, info(false, { season: "2027-28" }), D).changed).toBe(true);
  });
  test("AI refresh with the deadline open rebuilds only when the squad changed", () => {
    const s = ensureList(squadOf(28), info(true), D).squad;
    expect(aiRefresh(s, info(true), D).changed).toBe(false);
    const signed = { ...s, players: [...s.players, mk("star", 9)] };
    const r = aiRefresh(signed, info(true), D);
    expect(r.changed).toBe(true);
    expect(r.squad.registrations!.premier_league!.ids).toContain("star");
  });
  test("human, automatic mode: rebuilt, the one left out is told once", () => {
    const s = ensureList(squadOf(28), info(true), D).squad;
    const signed = { ...s, players: [...s.players, mk("star", 9), mk("bad", 1)] };
    const r = humanDay(signed, info(true), D);
    expect(r.squad.registrations!.premier_league!.ids).toContain("star");
    expect(r.notices).toEqual([{ kind: "not_fit", competition: "premier_league", season: "2026-27", playerIds: ["p24", "bad"] }]); // p24 lost his place to the star
    expect(humanDay(r.squad, info(true), D).notices).toEqual([]);
  });
  test("human, manual mode: arrival that fits is added, removed by hand never comes back", () => {
    const base = ensureList(squadOf(20), info(true), D).squad;
    const ids = base.registrations!.premier_league!.ids.filter((id) => id !== "p0");
    const manual = { ...base, registrations: { premier_league: manualList(base, info(true), ids, D) } };
    expect(manual.registrations.premier_league.out).toEqual(["p0"]);
    const signed = { ...manual, players: [...manual.players, mk("new", 5)] };
    const r = humanDay(signed, info(true), D);
    const list = r.squad.registrations!.premier_league!;
    expect(list.manual).toBe(true);
    expect(list.ids).toContain("new");
    expect(list.ids).not.toContain("p0");
    expect(r.notices).toEqual([]);
    expect(automaticList(r.squad, info(true), D).manual).toBeUndefined();
  });
  test("human, deadline closed: waiting notice with the opening date", () => {
    const s = ensureList(squadOf(20), info(false), D).squad;
    const signed = { ...s, players: [...s.players, mk("new", 9)] };
    const r = humanDay(signed, info(false), D);
    expect(r.notices).toEqual([{ kind: "waiting", competition: "premier_league", season: "2026-27", playerIds: ["new"], opensOn: "2027-01-01" }]);
    expect(r.squad.registrations!.premier_league!.ids).not.toContain("new");
    // opens: enters by itself
    const open = humanDay(r.squad, info(true), "2027-01-01");
    expect(open.squad.registrations!.premier_league!.ids).toContain("new");
  });
  test("closing notice three days before the deadline", () => {
    const s = ensureList(squadOf(20), info(true), D).squad;
    const r = humanDay(s, info(true), "2026-08-28");
    expect(r.notices.map((n) => n.kind)).toEqual(["closing"]);
    expect(r.notices[0]!.counts!.counted).toBe(20);
  });
});
