import { describe, expect, test } from "bun:test";
import { buildCupMessage, buildSeasonMessage } from "@/Domain/inbox/inboxEvents";

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

describe("buildCupMessage", () => {
  test("draw carries tieDate and venue", () => {
    const m = buildCupMessage({
      date: "2026-09-26", kind: "draw", cupSlug: "cup_england", cupName: "FA Cup", stage: "r16",
      opponentName: "Arsenal", tieDate: "2026-10-01", venue: "home",
    });
    expect(m.category).toBe("cup");
    expect(m.kind).toBe("draw");
    expect(m.subject).toBe("FA Cup draw");
    expect(m.preview).toBe("Next: Arsenal (home) on 2026-10-01.");
    expect(m.cupSlug).toBe("cup_england");
    expect(m.stage).toBe("r16");
    expect(m.tieDate).toBe("2026-10-01");
    expect(m.venue).toBe("home");
    expect(m.read).toBe(false);
    expect(m.date).toBe("2026-09-26");
  });

  test("eliminated names the opponent and has no tieDate", () => {
    const m = buildCupMessage({
      date: "2026-10-01", kind: "eliminated", cupSlug: "cup_england", cupName: "FA Cup", stage: "r16",
      opponentName: "Arsenal",
    });
    expect(m.subject).toBe("Out of the FA Cup");
    expect(m.preview).toBe("Knocked out by Arsenal.");
    expect("tieDate" in m).toBe(false);
    expect("venue" in m).toBe(false);
  });

  test("champion has no opponent", () => {
    const m = buildCupMessage({
      date: "2027-05-10", kind: "champion", cupSlug: "cup_england", cupName: "FA Cup", stage: "final",
    });
    expect(m.subject).toBe("FA Cup winners!");
    expect(m.preview).toBe("The club won the FA Cup.");
    expect("opponentName" in m).toBe(false);
  });

  test("ids are unique", () => {
    const args = { date: "d", kind: "champion" as const, cupSlug: "cup_england", cupName: "FA Cup", stage: "final" };
    expect(buildCupMessage(args).id).not.toBe(buildCupMessage(args).id);
  });
});
