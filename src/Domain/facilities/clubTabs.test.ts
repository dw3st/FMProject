import { describe, expect, test } from "bun:test";
import {
  clubTodo, itemJob, jobGroup, jobKey, parseClubTab, parseJob, partsOf, TODO_MAX_IMPROVE, type TodoItemInput, type TodoQuote,
} from "@/Domain/facilities/clubTabs";
import type { FacilityItemId } from "@/types/facilityTypes";
import { ITEM_GROUP } from "@/Domain/facilities/facilityItems";

const quote = (missing: Record<string, number> = {}, small = false): TodoQuote => ({
  cost: 1000, small, build: { recipe: { beam: 4, slab: 2 }, missing, canBuild: Object.keys(missing).length === 0 },
});

const item = (id: FacilityItemId, over: Partial<TodoItemInput> = {}): TodoItemInput => ({
  id, group: ITEM_GROUP[id], level: 5, condition: 90, condemned: false, project: null,
  quotes: { repair: { "100": quote() }, rebuild: null, upgrade: quote({ beam: 2 }) },
  ...over,
});

describe("parseClubTab", () => {
  test("new and old values", () => {
    expect(parseClubTab(null)).toEqual({ tab: "overview" });
    expect(parseClubTab("facilities")).toEqual({ tab: "overview" });
    expect(parseClubTab("overview")).toEqual({ tab: "overview" });
    expect(parseClubTab("attendance")).toEqual({ tab: "stadium" });
    expect(parseClubTab("stadium")).toEqual({ tab: "stadium" });
    expect(parseClubTab("workshop")).toEqual({ tab: "works" });
    expect(parseClubTab("works")).toEqual({ tab: "works" });
    expect(parseClubTab("shop")).toEqual({ tab: "materials", part: "shop" });
    expect(parseClubTab("stock")).toEqual({ tab: "materials", part: "stock" });
    expect(parseClubTab("materials")).toEqual({ tab: "materials" });
    expect(parseClubTab("nonsense")).toEqual({ tab: "overview" });
  });
});

describe("jobs", () => {
  test("round trip and bad input", () => {
    for (const k of ["stand", "comfort", "turf", "training", "academy", "workshop", "upgrade:gym", "repair:stadiumPitch", "rebuild:pool"]) {
      expect(jobKey(parseJob(k)!)).toBe(k);
    }
    expect(parseJob("upgrade:nothing")).toBeNull();
    expect(parseJob("paint:gym")).toBeNull();
    expect(parseJob(null)).toBeNull();
  });
  test("area of a job", () => {
    expect(jobGroup({ kind: "item", mode: "upgrade", item: "gym" })).toBe("training");
    expect(jobGroup({ kind: "stand" })).toBe("stadium");
    expect(jobGroup({ kind: "turf" })).toBe("stadium");
    expect(jobGroup({ kind: "academy" })).toBe("academy");
    expect(jobGroup({ kind: "workshop" })).toBeNull();
  });
  test("item opens on the right works", () => {
    expect(itemJob(item("gym"))).toEqual({ kind: "item", mode: "upgrade", item: "gym" });
    expect(itemJob(item("gym", { condition: 50 }))).toEqual({ kind: "item", mode: "repair", item: "gym" });
    expect(itemJob(item("gym", { condemned: true, condition: 0, quotes: { repair: { "100": null }, rebuild: quote(), upgrade: null } })))
      .toEqual({ kind: "item", mode: "rebuild", item: "gym" });
  });
});

describe("clubTodo", () => {
  test("repair list: condemned first, then the lowest condition; tones", () => {
    const { repair } = clubTodo([
      item("seats", { condition: 61 }),
      item("stadiumPitch", { condition: 34 }),
      item("pool", { condemned: true, condition: 0, quotes: { repair: { "100": null }, rebuild: quote(), upgrade: null } }),
      item("gym", { condition: 95 }),
    ], []);
    expect(repair.map((r) => r.item)).toEqual(["pool", "stadiumPitch", "seats"]);
    expect(repair.map((r) => r.tone)).toEqual(["bad", "bad", "warn"]);
    expect(repair[0]!.job).toEqual({ kind: "item", mode: "rebuild", item: "pool" });
    expect(repair[1]!.job).toEqual({ kind: "item", mode: "repair", item: "stadiumPitch" });
  });
  test("quick repair only for a small one with the parts and the area free", () => {
    const small = item("stadiumPitch", { condition: 34, quotes: { repair: { "100": quote({}, true) }, rebuild: null, upgrade: null } });
    expect(clubTodo([small], []).repair[0]!.quick).toBe(true);
    expect(clubTodo([small], ["stadium"]).repair[0]!.quick).toBe(false);
    const short = item("stadiumPitch", { condition: 34, quotes: { repair: { "100": quote({ beam: 1 }, true) }, rebuild: null, upgrade: null } });
    expect(clubTodo([short], []).repair[0]!.quick).toBe(false);
    const big = item("stadiumPitch", { condition: 34, quotes: { repair: { "100": quote({}, false) }, rebuild: null, upgrade: null } });
    expect(clubTodo([big], []).repair[0]!.quick).toBe(false);
  });
  test("improve list: ready first, then fewest missing; no works, no max level, not under repair; capped", () => {
    const { improve } = clubTodo([
      item("gym", { quotes: { repair: { "100": quote() }, rebuild: null, upgrade: quote() } }),
      item("physio", { quotes: { repair: { "100": quote() }, rebuild: null, upgrade: quote({ beam: 3 }) } }),
      item("academyLodging", { quotes: { repair: { "100": quote() }, rebuild: null, upgrade: quote({ beam: 4, slab: 1 }) } }),
      item("canteen", { quotes: { repair: { "100": quote() }, rebuild: null, upgrade: quote({ beam: 1 }) } }),
      item("pool", { project: {} }),
      item("seats", { level: 10, quotes: { repair: { "100": quote() }, rebuild: null, upgrade: null } }),
      item("stadiumPitch", { condition: 30 }),
      item("trainingPitches", { quotes: { repair: { "100": quote() }, rebuild: null, upgrade: quote({ slab: 9 }) } }),
    ], []);
    expect(improve.length).toBe(TODO_MAX_IMPROVE);
    expect(improve.map((i) => i.item)).toEqual(["gym", "canteen", "physio", "academyLodging"]);
    expect(improve[0]!.ready).toBe(true);
    expect(improve[2]!.missing).toBe(3);
    expect(improve[3]!.missing).toBe(5);
  });
});

describe("partsOf", () => {
  test("have, short and ready", () => {
    const p = partsOf({ medKit: 4, furniture: 2 }, { medKit: 3 });
    expect(p.rows).toEqual([{ id: "medKit", need: 4, have: 1, short: 3 }, { id: "furniture", need: 2, have: 2, short: 0 }]);
    expect(p.ready).toBe(false);
    expect(p.short).toBe(3);
    expect(partsOf({ beam: 2 }, {}).ready).toBe(true);
  });
});
