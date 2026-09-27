import { describe, expect, test } from "bun:test";
import { groupTable } from "@/Domain/continental/groupTable";
import type { Fixture } from "@/types/calendarTypes";

const f = (home: string, away: string, h: number, a: number): Fixture => ({
  id: `${home}-${away}`,
  date: "2026-09-15",
  competition: "ucl",
  round: 1,
  home,
  away,
  played: true,
  result: { home: h, away: a },
});

describe("groupTable", () => {
  test("points and goal difference decide when no team is tied", () => {
    // Verified by hand (and cross-checked with an independent tally script):
    // a: 6 mp, 3w 2d 1l, gf5 ga3 gd+2, pts11
    // b: 6 mp, 3w 1d 2l, gf5 ga3 gd+2, pts10
    // c: 6 mp, 2w 3d 1l, gf2 ga1 gd+1, pts9
    // d: 6 mp, 0w 2d 4l, gf1 ga6 gd-5, pts2
    const fx = [
      f("a", "b", 1, 0), f("b", "a", 1, 1), f("c", "d", 0, 0), f("d", "c", 0, 0),
      f("a", "c", 0, 1), f("c", "a", 0, 0), f("b", "d", 2, 0), f("d", "b", 0, 1),
      f("a", "d", 2, 1), f("d", "a", 0, 1), f("b", "c", 1, 0), f("c", "b", 1, 0),
    ];
    const t = groupTable(["a", "b", "c", "d"], fx);
    expect(t.map((r) => r.squadId)).toEqual(["a", "b", "c", "d"]);
    expect(t[0]).toMatchObject({ squadId: "a", mp: 6, w: 3, d: 2, l: 1, gf: 5, ga: 3, gd: 2, pts: 11 });
    expect(t[1]).toMatchObject({ squadId: "b", mp: 6, w: 3, d: 1, l: 2, gf: 5, ga: 3, gd: 2, pts: 10 });
    expect(t[2]).toMatchObject({ squadId: "c", mp: 6, w: 2, d: 3, l: 1, gf: 2, ga: 1, gd: 1, pts: 9 });
    expect(t[3]).toMatchObject({ squadId: "d", mp: 6, w: 0, d: 2, l: 4, gf: 1, ga: 6, gd: -5, pts: 2 });
  });

  test("unplayed fixtures are ignored", () => {
    const t = groupTable(["a", "b"], [{ ...f("a", "b", 3, 0), played: false, result: null }]);
    expect(t.every((r) => r.pts === 0 && r.mp === 0)).toBe(true);
  });

  test("head-to-head breaks a tie on points, goal difference and goals for", () => {
    // a and b both finish pts3, gd0, gf1 overall — the h2h match (a beat b 1-0) must rank a above b.
    // c finishes with a strictly better gd (+1) so it isn't part of the tie group at all.
    // d trails on points.
    const fx = [
      f("a", "b", 1, 0), // head-to-head decider
      f("a", "c", 0, 1), // a's filler loss
      f("b", "d", 1, 0), // b's filler win
    ];
    const t = groupTable(["a", "b", "c", "d"], fx);
    expect(t.map((r) => r.squadId)).toEqual(["c", "a", "b", "d"]);
    expect(t.find((r) => r.squadId === "a")).toMatchObject({ pts: 3, gd: 0, gf: 1 });
    expect(t.find((r) => r.squadId === "b")).toMatchObject({ pts: 3, gd: 0, gf: 1 });
    expect(t.find((r) => r.squadId === "c")).toMatchObject({ pts: 3, gd: 1, gf: 1 });
  });

  test("three-way tie resolved entirely by head-to-head", () => {
    // a, b, c all finish pts6, gd0, gf2 overall. Within the trio, a beat both b and c, and b beat c —
    // a strict h2h hierarchy a > b > c. d and e trail on points (3 each) and don't enter the tie.
    const fx = [
      f("a", "b", 1, 0), f("a", "c", 1, 0), f("b", "c", 1, 0), // trio
      f("d", "a", 2, 0), f("b", "d", 1, 0), f("e", "b", 1, 0), // filler for a, b
      f("c", "d", 1, 0), f("c", "e", 1, 0),                    // filler for c
    ];
    const t = groupTable(["a", "b", "c", "d", "e"], fx);
    expect(t.map((r) => r.squadId)).toEqual(["a", "b", "c", "d", "e"]);
    for (const id of ["a", "b", "c"]) {
      expect(t.find((r) => r.squadId === id)).toMatchObject({ pts: 6, gd: 0, gf: 2 });
    }
  });

  test("three-way tie: head-to-head points alone don't resolve everyone, head-to-head goal difference does", () => {
    // a, b and c all finish pts12, gd2, gf8 overall (double round-robin trio + filler matches against
    // d/e/f). Within the trio (h2h) a beat both b and c twice (h2h pts12, clear leader), but b and c
    // split their two h2h meetings one win each — tied at h2h pts3 apiece. The tie-break is a single,
    // non-recursive pass over the h2h table: sort by h2h points, then h2h goal difference (b won 2-0,
    // lost 0-1 -> h2h gd -3; c lost 0-2, won 1-0 -> h2h gd -5), so b ranks above c on goal difference
    // without ever re-computing a head-to-head among the still-tied pair. Only after that does id
    // apply, and it isn't needed here since gd already separates b and c.
    const fx = [
      f("a", "b", 2, 0), f("b", "a", 0, 2), // a beats b home and away
      f("a", "c", 2, 0), f("c", "a", 0, 2), // a beats c home and away
      f("b", "c", 2, 0), f("c", "b", 1, 0), // b and c split — b's win is by more, c's win is by less
      f("d", "a", 6, 0),                                         // filler: a
      f("b", "d", 2, 0), f("b", "e", 2, 0), f("b", "f", 2, 1),   // filler: b
      f("c", "d", 3, 0), f("c", "e", 2, 0), f("c", "f", 2, 0),   // filler: c
    ];
    const t = groupTable(["a", "b", "c", "d", "e", "f"], fx);
    for (const id of ["a", "b", "c"]) {
      expect(t.find((r) => r.squadId === id)).toMatchObject({ pts: 12, gd: 2, gf: 8 });
    }
    expect(t.map((r) => r.squadId).filter((id) => ["a", "b", "c"].includes(id))).toEqual(["a", "b", "c"]);
  });
});
