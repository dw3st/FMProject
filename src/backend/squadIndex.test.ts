import { describe, expect, test } from "bun:test";
import { buildSquadIndex } from "@/backend/squadIndex";
import type { SquadFile } from "@/backend/dal/ISaveDAL";
import type { Squad } from "@/types/playerTypes";

function file(leagueSlug: string, stem: string, id: string, slug?: string): SquadFile {
  const squad = { id, name: `N_${id}`, colors: ["#111", "#222"], slug, players: [] } as unknown as Squad;
  return { leagueSlug, clubSlug: stem, squad };
}

const files: SquadFile[] = [
  file("premier_league", "40", "40", "liverpool"),
  file("premier_league", "33", "33", "manchester_united"),
  file("la_liga", "541", "541", "real_madrid"),
  file("of_x", "of_club", "of_club", "of_club"),
];

describe("buildSquadIndex", () => {
  test("byId returns the entry with league and stem", () => {
    const idx = buildSquadIndex(files);
    expect(idx.byId("33")).toEqual({
      squadId: "33",
      leagueSlug: "premier_league",
      stem: "33",
      slug: "manchester_united",
      name: "N_33",
      colors: ["#111", "#222"],
    });
    expect(idx.byId("nope")).toBeUndefined();
  });

  test("slug defaults to the id when the squad has none", () => {
    const idx = buildSquadIndex([file("lg", "7", "7")]);
    expect(idx.byId("7")?.slug).toBe("7");
  });

  test("inLeague is sorted by squadId and does not leak across leagues", () => {
    const idx = buildSquadIndex(files);
    expect(idx.inLeague("premier_league")).toEqual([
      { squadId: "33", name: "N_33", colors: ["#111", "#222"], slug: "manchester_united" },
      { squadId: "40", name: "N_40", colors: ["#111", "#222"], slug: "liverpool" },
    ]);
    expect(idx.inLeague("la_liga").map((t) => t.squadId)).toEqual(["541"]);
    expect(idx.inLeague("serie_a")).toEqual([]);
  });

  test("resolve by id, stem and slug; null when the club is in another league", () => {
    const idx = buildSquadIndex(files);
    expect(idx.resolve("premier_league", "33")).toBe("33");
    expect(idx.resolve("premier_league", "manchester_united")).toBe("33");
    expect(idx.resolve("of_x", "of_club")).toBe("of_club");
    expect(idx.resolve("la_liga", "manchester_united")).toBeNull();
    expect(idx.resolve("la_liga", "33")).toBeNull();
    expect(idx.resolve("nowhere", "33")).toBeNull();
  });

  test("a stem different from the id still resolves", () => {
    const idx = buildSquadIndex([file("lg", "legacy_stem", "99", "club99")]);
    expect(idx.resolve("lg", "99")).toBe("legacy_stem");
    expect(idx.resolve("lg", "legacy_stem")).toBe("legacy_stem");
    expect(idx.resolve("lg", "club99")).toBe("legacy_stem");
  });

  test("strict mode throws on a duplicate squadId", () => {
    expect(() => buildSquadIndex([file("a", "33", "33"), file("b", "33", "33")], { strict: true })).toThrow(
      /duplicate squadId 33/,
    );
  });

  test("lenient (default) keeps one copy per id and reports the duplicates", () => {
    const idx = buildSquadIndex([file("b", "33", "33"), file("a", "33", "33"), file("a", "40", "40")]);
    // Neither copy is preferred → the first in sorted file-key order ("a/33").
    expect(idx.byId("33")).toMatchObject({ leagueSlug: "a", stem: "33" });
    expect(idx.inLeague("a").map((t) => t.squadId)).toEqual(["33", "40"]);
    expect(idx.inLeague("b")).toEqual([]);
    expect(idx.resolve("b", "33")).toBeNull();
    expect(idx.duplicates()).toEqual([
      { squadId: "33", kept: { leagueSlug: "a", stem: "33" }, dropped: [{ leagueSlug: "b", stem: "33" }] },
    ]);
    expect(buildSquadIndex(files).duplicates()).toEqual([]);
  });

  test("lenient prefers the copy whose folder matches its stored leagueSlug", () => {
    const stray = file("a", "33", "33");
    stray.squad = { ...stray.squad, leagueSlug: "b" }; // a copy of b/33 dropped into a/
    const home = file("b", "33", "33");
    home.squad = { ...home.squad, leagueSlug: "b" };
    expect(buildSquadIndex([stray, home]).byId("33")?.leagueSlug).toBe("b");
  });

  test("lenient prefers the higher membershipRev over folder match and file order", () => {
    const stale = file("a", "33", "33");
    stale.squad = { ...stale.squad, leagueSlug: "a" };
    const moved = file("b", "33", "33");
    moved.squad = { ...moved.squad, leagueSlug: "b", membershipRev: 1 };
    const idx = buildSquadIndex([stale, moved]);
    expect(idx.byId("33")?.leagueSlug).toBe("b");
    expect(idx.duplicates()[0]!.dropped).toEqual([{ leagueSlug: "a", stem: "33" }]);
  });

  test("leagues() is sorted", () => {
    expect(buildSquadIndex(files).leagues()).toEqual(["la_liga", "of_x", "premier_league"]);
  });
});
