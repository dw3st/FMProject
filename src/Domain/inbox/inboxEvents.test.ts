import { describe, expect, test } from "bun:test";
import { buildBoardMessage, buildContinentalMessage, buildCupMessage, buildInjuryMessage, buildSeasonMessage } from "@/Domain/inbox/inboxEvents";

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

describe("buildContinentalMessage", () => {
  test("qualified names the competition", () => {
    const m = buildContinentalMessage({
      date: "2027-08-15", kind: "qualified", competition: "ucl", competitionName: "Champions League", stage: "group",
    });
    expect(m.category).toBe("continental");
    expect(m.kind).toBe("qualified");
    expect(m.subject).toBe("Qualified for the Champions League");
    expect(m.preview).toBe("The club qualified for the Champions League.");
    expect(m.competition).toBe("ucl");
    expect(m.competitionName).toBe("Champions League");
    expect(m.stage).toBe("group");
    expect(m.read).toBe(false);
    expect("group" in m).toBe(false);
  });

  test("group carries the letter and the group-mates in the preview", () => {
    const m = buildContinentalMessage({
      date: "2027-08-15", kind: "group", competition: "ucl", competitionName: "Champions League", stage: "group",
      group: "C", opponentNames: ["Real Madrid", "Bayern Munich", "Ajax"],
    });
    expect(m.subject).toBe("Champions League group draw");
    expect(m.preview).toBe("Group C: Real Madrid, Bayern Munich, Ajax.");
    expect(m.group).toBe("C");
    expect(m.opponentNames).toEqual(["Real Madrid", "Bayern Munich", "Ajax"]);
  });

  test("draw carries the opponent, first-leg date and venue", () => {
    const m = buildContinentalMessage({
      date: "2028-02-10", kind: "draw", competition: "ucl", competitionName: "Champions League", stage: "r16",
      opponentName: "Real Madrid", firstLegDate: "2028-02-18", venue: "home",
    });
    expect(m.subject).toBe("Champions League draw");
    expect(m.preview).toBe("Next: Real Madrid (home) on 2028-02-18.");
    expect(m.stage).toBe("r16");
    expect(m.opponentName).toBe("Real Madrid");
    expect(m.firstLegDate).toBe("2028-02-18");
    expect(m.venue).toBe("home");
  });

  test("eliminated names the opponent when there is one", () => {
    const m = buildContinentalMessage({
      date: "2028-03-10", kind: "eliminated", competition: "ucl", competitionName: "Champions League", stage: "r16",
      opponentName: "Real Madrid",
    });
    expect(m.subject).toBe("Out of the Champions League");
    expect(m.preview).toBe("Knocked out by Real Madrid.");
    expect("firstLegDate" in m).toBe(false);
    expect("venue" in m).toBe(false);
  });

  test("eliminated has no opponent for a group-stage 3rd/4th finish", () => {
    const m = buildContinentalMessage({
      date: "2027-12-15", kind: "eliminated", competition: "uel", competitionName: "Europa League", stage: "group",
    });
    expect(m.preview).toBe("Eliminated from the Europa League group stage.");
    expect("opponentName" in m).toBe(false);
  });

  test("champion has no opponent", () => {
    const m = buildContinentalMessage({
      date: "2028-05-25", kind: "champion", competition: "lib", competitionName: "Copa Libertadores", stage: "final",
    });
    expect(m.subject).toBe("Copa Libertadores champions!");
    expect(m.preview).toBe("The club won the Copa Libertadores.");
    expect("opponentName" in m).toBe(false);
  });

  test("ids are unique", () => {
    const args = {
      date: "d", kind: "champion" as const, competition: "sud" as const, competitionName: "Copa Sudamericana", stage: "final" as const,
    };
    expect(buildContinentalMessage(args).id).not.toBe(buildContinentalMessage(args).id);
  });
});

describe("buildInjuryMessage — suspended", () => {
  test("carries the matches to serve", () => {
    const m = buildInjuryMessage({ date: "2027-03-10", kind: "suspended", playerId: "p1", playerName: "Silva", matches: 1 });
    expect(m.category).toBe("injury");
    expect(m.kind).toBe("suspended");
    expect(m.matches).toBe(1);
    expect(m.subject).toContain("Silva");
  });
});

describe("buildBoardMessage", () => {
  test("objective message carries the objective and an English fallback subject", () => {
    const objective = { kind: "top_half" as const, target: 10, leagueSlug: "premier_league", leagueSize: 20, season: "2026-27" };
    const m = buildBoardMessage({ date: "2026-08-15", kind: "objective", objective, leagueName: "Premier League" });
    expect(m).toMatchObject({ category: "board", kind: "objective", objective, read: false, date: "2026-08-15" });
    expect(m.subject.length).toBeGreaterThan(0);
  });
  test("ultimatum, bonus and sacked keep their numbers", () => {
    expect(buildBoardMessage({ date: "d", kind: "ultimatum", ultimatum: { matches: 5, points: 7 }, board: 24 }).ultimatum).toEqual({ matches: 5, points: 7 });
    expect(buildBoardMessage({ date: "d", kind: "bonus", bonus: 2_000_000 }).bonus).toBe(2_000_000);
    expect(buildBoardMessage({ date: "d", kind: "sacked", reason: "ultimatum" }).reason).toBe("ultimatum");
  });
});
