import { describe, expect, test } from "bun:test";
import { buildSeasonMessage } from "@/Domain/inbox/inboxEvents";

describe("buildSeasonMessage", () => {
  test("promoted names the new league and keeps the one left", () => {
    const m = buildSeasonMessage({
      date: "2026-05-25", kind: "promoted", leagueSlug: "premier_league", leagueName: "Premier League",
      fromLeagueSlug: "championship", seasonYear: 2025,
    });
    expect(m.category).toBe("season");
    expect(m.kind).toBe("promoted");
    expect(m.subject).toBe("Promoted to Premier League");
    expect(m.leagueSlug).toBe("premier_league");
    expect(m.fromLeagueSlug).toBe("championship");
    expect(m.read).toBe(false);
    expect(m.date).toBe("2026-05-25");
    expect(m.id.startsWith("season-2026-05-25-promoted-premier_league-")).toBe(true);
  });

  test("relegated", () => {
    const m = buildSeasonMessage({
      date: "2026-05-25", kind: "relegated", leagueSlug: "championship", leagueName: "Championship",
      fromLeagueSlug: "premier_league", seasonYear: 2025,
    });
    expect(m.subject).toBe("Relegated to Championship");
    expect(m.preview).toContain("Championship");
  });

  test("champion has no fromLeagueSlug and names the season", () => {
    const m = buildSeasonMessage({
      date: "2026-05-25", kind: "champion", leagueSlug: "premier_league", leagueName: "Premier League", seasonYear: 2025,
    });
    expect(m.subject).toBe("Champion of Premier League");
    expect(m.preview).toContain("2025");
    expect("fromLeagueSlug" in m).toBe(false);
  });

  test("ids are unique", () => {
    const args = { date: "d", kind: "champion" as const, leagueSlug: "x", leagueName: "X", seasonYear: 1 };
    expect(buildSeasonMessage(args).id).not.toBe(buildSeasonMessage(args).id);
  });
});
