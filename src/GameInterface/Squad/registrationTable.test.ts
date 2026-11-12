import { describe, expect, test } from "bun:test";
import { anyMark, registrationTableRows, toggledIds } from "@/GameInterface/Squad/registrationTable";
import type { RegistrationCompView, RegistrationRowView } from "@/types/registrationTypes";

const row = (id: string, over: Partial<RegistrationRowView> = {}): RegistrationRowView => ({
  id, name: id, age: 25, nationality: null, role: "CM", overall: 5, registered: true, foreign: false, greenCard: false,
  foreignBasis: null, clubTrained: false, nationTrained: false, free: false, canAdd: false, ...over,
});
const comp = (slug: string, rows: RegistrationRowView[]): RegistrationCompView => ({
  slug, kind: "league", season: "2026-27", rule: { maxList: 25 } as RegistrationCompView["rule"],
  status: { open: true } as RegistrationCompView["status"], manual: false, exception: false,
  counts: { counted: 0, max: 25, foreign: 0, maxForeign: null, formed: 0, minFormed: 0, lostSlots: 0, free: 0 }, rows,
});

describe("registrationTableRows", () => {
  test("joins the competitions by player, in the order of the first one", () => {
    const rows = registrationTableRows([
      comp("league", [row("a"), row("b", { registered: false })]),
      comp("ucl", [row("b"), row("a", { registered: false }), row("c")]),
    ]);
    expect(rows.map((r) => r.base.id)).toEqual(["a", "b", "c"]);
    expect(rows[0]!.marks.league!.registered).toBe(true);
    expect(rows[0]!.marks.ucl!.registered).toBe(false);
    expect(rows[2]!.marks.league).toBeUndefined();
  });

  test("no competitions, no rows", () => {
    expect(registrationTableRows([])).toEqual([]);
  });
});

describe("toggledIds", () => {
  const c = comp("league", [row("a"), row("b", { registered: false }), row("kid", { free: true })]);
  test("ticking adds the player, never the free ones", () => {
    expect(toggledIds(c, "b", true)).toEqual(["a", "b"]);
  });
  test("unticking removes him", () => {
    expect(toggledIds(c, "a", false)).toEqual([]);
  });
  test("ticking a registered player does not repeat him", () => {
    expect(toggledIds(c, "a", true)).toEqual(["a"]);
  });
});

describe("anyMark", () => {
  test("finds the competition where the test holds", () => {
    const [r] = registrationTableRows([comp("league", [row("a")]), comp("ucl", [row("a", { foreign: true })])]);
    expect(anyMark(r!, (m) => m.foreign)?.foreign).toBe(true);
    expect(anyMark(r!, (m) => m.greenCard)).toBeNull();
  });
});
