import { describe, expect, test } from "bun:test";
import { resolvePlayerSquadId } from "@/Domain/advanceDay/financial";

const standings = [
  { squadId: "130", slug: "gremio", name: "Gremio" },
  { squadId: "135", slug: "cruzeiro", name: "Cruzeiro" },
];

const idToClubSlug = new Map(standings.map((r) => [r.squadId, r.slug!]));

describe("resolvePlayerSquadId", () => {
  test("matches meta clubId when it is the numeric squadId", () => {
    expect(resolvePlayerSquadId(standings, idToClubSlug, "135")).toBe("135");
  });

  test("matches meta clubId when it is the standings text slug", () => {
    expect(resolvePlayerSquadId(standings, idToClubSlug, "cruzeiro")).toBe("135");
  });

  test("matches via idToClubSlug map (legacy)", () => {
    expect(resolvePlayerSquadId(standings, idToClubSlug, "gremio")).toBe("130");
  });

  test("works when idToClubSlug is undefined but squadId matches", () => {
    expect(resolvePlayerSquadId(standings, undefined, "135")).toBe("135");
  });
});
