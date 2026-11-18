import { describe, expect, test } from "bun:test";
import { leagueNationality, withDefaultNationality } from "@/Domain/world/defaultNationality";

describe("default nationality", () => {
  test("league country spellings", () => {
    expect(leagueNationality("Brazil")).toBe("Brazil");
    expect(leagueNationality("USA")).toBe("United States");
    expect(leagueNationality("Turkey")).toBe("Türkiye");
    expect(leagueNationality(undefined)).toBeNull();
  });
  test("only the missing ones are filled", () => {
    const s: { players: { nationality?: string }[]; youth: { nationality?: string }[] } = { players: [{ nationality: "Japan" }, {}], youth: [{}] };
    const out = withDefaultNationality(s, "Brazil");
    expect(out.players.map((p) => p.nationality)).toEqual(["Japan", "Brazil"]);
    expect(out.youth![0]!.nationality).toBe("Brazil");
    const full = { players: [{ nationality: "Japan" }] };
    expect(withDefaultNationality(full, "Brazil")).toBe(full);
  });
});
