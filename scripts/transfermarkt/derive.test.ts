import { expect, test } from "bun:test";
import { buildDerived, type LeaguePlayer } from "@/../scripts/transfermarkt/derive";

const m = (value: number | null, extra: Partial<NonNullable<LeaguePlayer["match"]>> = {}) => ({
  tmId: "t", value, position: null, birthDate: null, heightCm: null, ...extra,
});
const base = { squadId: "s1", league: "L", age: 27, line: "Midfielder" as const };

test("a covered league is reordered by value and keeps its overall multiset", () => {
  const r = buildDerived([
    { ...base, id: "a", overall: 5.0, match: m(50e6) },
    { ...base, id: "b", overall: 6.5, match: m(1e6) },
    { ...base, id: "c", overall: 5.8, match: m(10e6) },
  ]);
  expect(r.players.a!.targetOverall).toBe(6.5);
  expect(r.players.c!.targetOverall).toBe(5.8);
  expect(r.players.b!.targetOverall).toBe(5);
  expect(r.leagues.L).toEqual({ players: 3, matched: 3, valued: 3, coverage: 1, reordered: true });
});

test("below the coverage minimum no overall changes, positions still come through", () => {
  const r = buildDerived([
    { ...base, id: "a", overall: 5.0, match: m(50e6, { position: "RB", birthDate: "2001-03-04", heightCm: 184 }) },
    { ...base, id: "b", overall: 6.5 },
    { ...base, id: "c", overall: 5.8 },
  ]);
  expect(r.leagues.L!.reordered).toBe(false);
  expect(r.players.a).toEqual({ naturalPosition: "RB", birthDate: "2001-03-04", heightCm: 184 });
  expect(r.players.b).toBeUndefined();
});

test("unmatched youth above the club's matched median is capped; bad dates and heights are dropped", () => {
  const r = buildDerived([
    { ...base, id: "a", overall: 5.0, match: m(50e6, { birthDate: "04/03/2001", heightCm: 18 }) },
    { ...base, id: "b", overall: 6.0, match: m(10e6) },
    { ...base, id: "c", overall: 5.5, match: m(5e6) },
    { ...base, id: "kid", age: 19, overall: 7.0 },
  ], 0.5);
  expect(r.players.kid!.targetOverall).toBe(5.5);
  expect(r.players.a).toEqual({ targetOverall: 6 });
});

test("nationality only when given", () => {
  const r = buildDerived([{ ...base, id: "a", overall: 5, match: m(null, { nationality: "Cameroon" }) }]);
  expect(r.players.a).toEqual({ nationality: "Cameroon" });
  expect(r.leagues.L!.valued).toBe(0);
});
