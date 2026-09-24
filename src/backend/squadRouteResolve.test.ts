import { describe, expect, test } from "bun:test";
import { buildSquadIndex } from "@/backend/squadIndex";
import { isSquadInSave, resolveSquadRoute } from "@/backend/squadRouteResolve";
import type { SquadFile } from "@/backend/dal/ISaveDAL";
import type { Squad } from "@/types/playerTypes";

function file(leagueSlug: string, stem: string, id: string, slug?: string): SquadFile {
  const squad = { id, name: `N_${id}`, colors: ["#111", "#222"], slug, players: [] } as unknown as Squad;
  return { leagueSlug, clubSlug: stem, squad };
}

// Manchester United (33) has moved from premier_league to championship in this save.
const index = buildSquadIndex([
  file("premier_league", "40", "40", "liverpool"),
  file("championship", "33", "33", "manchester_united"),
]);

describe("resolveSquadRoute", () => {
  test("resolves inside the given league by id, stem or slug", () => {
    expect(resolveSquadRoute(index, "premier_league", "40")).toEqual({ leagueSlug: "premier_league", stem: "40" });
    expect(resolveSquadRoute(index, "premier_league", "liverpool")).toEqual({ leagueSlug: "premier_league", stem: "40" });
  });

  test("falls back to the squadId when the league does not match (club moved)", () => {
    expect(resolveSquadRoute(index, "premier_league", "33")).toEqual({ leagueSlug: "championship", stem: "33" });
  });

  test("a slug outside its current league does not fall back (only ids are global)", () => {
    expect(resolveSquadRoute(index, "premier_league", "manchester_united")).toBeNull();
  });

  test("unknown club → null", () => {
    expect(resolveSquadRoute(index, "premier_league", "999")).toBeNull();
  });
});

describe("isSquadInSave", () => {
  test("skips a catalogue file whose id lives in another league of the save", () => {
    expect(isSquadInSave(index, "premier_league", "33", "33")).toBe(true);
  });

  test("skips a catalogue file already present at the same path", () => {
    expect(isSquadInSave(index, "premier_league", "40", "40")).toBe(true);
  });

  test("imports a squad the save does not have anywhere", () => {
    expect(isSquadInSave(index, "premier_league", "50", "50")).toBe(false);
  });
});
