import { describe, expect, test } from "bun:test";
import type { LedgerEntry } from "@/Domain/finance/ledger";
import { buildSeasonSummary, continentalRun, cupRun, entriesAtClub, type SeasonSummaryInput } from "@/Domain/season/seasonSummary";
import type { ClubSeasonRow } from "@/types/clubHistoryTypes";
import type { PlayerHistoryRow } from "@/types/playerTypes";

const entry = (date: string, kind: LedgerEntry["kind"], amount: number, ref?: LedgerEntry["ref"]): LedgerEntry =>
  ({ date, kind, amount, label: kind, ref });

const row: ClubSeasonRow = {
  season: "2027", league: "brazil_serie_a", tier: 1, position: 2, played: 38, won: 24, drawn: 8, lost: 6,
  gf: 71, ga: 34, points: 80, titles: ["cup:cup_brazil"], topScorer: { playerId: "p9", name: "J. Calleri", goals: 22 },
};

const hist = (apps: number, goals: number, assists: number, avgRating: number | null, extra: Partial<PlayerHistoryRow> = {}): PlayerHistoryRow => ({
  season: "2027", squadId: "club", clubName: "Club", league: "brazil_serie_a", apps, goals, assists, avgRating,
  cupApps: 0, cupGoals: 0, contApps: 0, contGoals: 0, yellowCards: 0, redCards: 0, injuries: 0, daysInjured: 0, titles: [], ...extra,
});

function input(over: Partial<SeasonSummaryInput> = {}): SeasonSummaryInput {
  return {
    year: 2027, season: "2027", club: { id: "club", name: "Club" }, league: "brazil_serie_a", row, teams: 20,
    entries: [], players: [], attendance: [], seasonEnd: "2027-12-05", ...over,
  };
}

describe("cup and continental runs", () => {
  test("a cup stage won means the club reached the next one", () => {
    const e = [entry("2027-03-01", "prize", 10, { competition: "cup_brazil", stage: "r32" }), entry("2027-04-01", "prize", 10, { competition: "cup_brazil", stage: "r16" })];
    expect(cupRun(e, [])).toEqual({ competition: "cup_brazil", stage: "qf" });
  });
  test("runner-up, champion by the prize and champion by the title", () => {
    expect(cupRun([entry("2027-11-01", "prize", 10, { competition: "cup_brazil", stage: "runner_up" })], [])?.stage).toBe("runner_up");
    expect(cupRun([entry("2027-11-01", "prize", 10, { competition: "cup_brazil", stage: "final" })], [])?.stage).toBe("champion");
    expect(cupRun([], ["cup:cup_brazil"])).toEqual({ competition: "cup_brazil", stage: "champion" });
  });
  test("no cup prize: nothing to show", () => {
    expect(cupRun([entry("2027-03-01", "prize", 10, { competition: "brazil_serie_a", position: 2 })], [])).toBeUndefined();
  });
  test("continental: group only, a knockout stage reached, a lost final, the title", () => {
    const group = [entry("2027-03-01", "prize", 3, { competition: "lib", stage: "participation" }), entry("2027-03-08", "prize", 1, { competition: "lib", stage: "group_win" })];
    expect(continentalRun(group, [])).toEqual({ competition: "lib", stage: "group" });
    expect(continentalRun([...group, entry("2027-08-01", "prize", 2, { competition: "lib", stage: "sf" })], [])?.stage).toBe("sf");
    expect(continentalRun([...group, entry("2027-10-01", "prize", 2, { competition: "lib", stage: "final" })], [])?.stage).toBe("runner_up");
    expect(continentalRun([...group, entry("2027-11-01", "prize", 2, { competition: "lib", stage: "title" })], [])?.stage).toBe("champion");
    expect(continentalRun([], [])).toBeUndefined();
  });
});

describe("buildSeasonSummary", () => {
  test("the table line, the titles and the objective of that season", () => {
    const s = buildSeasonSummary(input({ last: { year: 2027, clubId: "club", target: 4, met: true } }));
    expect(s.table).toEqual({ position: 2, teams: 20, played: 38, won: 24, drawn: 8, lost: 6, gf: 71, ga: 34, points: 80 });
    expect(s.titles).toEqual(["cup:cup_brazil"]);
    expect(s.cup?.stage).toBe("champion");
    expect(s.objective).toEqual({ target: 4, met: true });
  });

  test("an objective of another season or another club is left out; a promotion is not a trophy", () => {
    const promoted = { ...row, titles: ["promotion:brazil_serie_b"], move: "promoted" as const };
    const s = buildSeasonSummary(input({ row: promoted, last: { year: 2026, clubId: "club", target: 4, met: true } }));
    expect(s.objective).toBeUndefined();
    expect(s.titles).toEqual([]);
    expect(s.move).toBe("promoted");
    expect(buildSeasonSummary(input({ last: { year: 2027, clubId: "other", target: 4, met: true } })).objective).toBeUndefined();
  });

  test("money: a bank loan is not income, a club change is neither", () => {
    const entries = [
      entry("2027-02-08", "broadcasting", 100), entry("2027-02-08", "wages", -40), entry("2027-02-10", "gate", 20),
      entry("2027-03-01", "prize", 15, { competition: "cup_brazil", stage: "r16" }), entry("2027-03-02", "loan_in", 50),
      entry("2027-03-09", "loan_payment", -5), entry("2027-03-09", "operational", -10),
    ];
    const s = buildSeasonSummary(input({ entries }));
    expect(s.money).toEqual({ income: 135, expenses: 55, net: 80, prizes: 15, gate: 20, wages: 40 });
  });

  test("a season with a club change counts from the arrival", () => {
    const entries = [
      entry("2027-02-08", "broadcasting", 100), entry("2027-05-01", "club_change", -100, { stage: "leave" }),
      entry("2027-05-01", "club_change", 30, { stage: "arrive" }), entry("2027-05-03", "gate", 7),
    ];
    expect(entriesAtClub(entries).map((e) => e.kind)).toEqual(["gate"]);
    expect(buildSeasonSummary(input({ entries })).money.income).toBe(7);
  });

  test("market: fee signings from the ledger, free arrivals from the squad, the biggest deals", () => {
    const entries = [
      entry("2027-01-10", "transfer_out", -32, { playerId: "p1", playerName: "T. Almada", clubName: "Atlanta" }),
      entry("2027-01-12", "transfer_out", -4, { playerId: "p2", playerName: "Small Buy" }),
      entry("2027-01-15", "transfer_out", -2, { stage: "signing_bonus" }),
      entry("2027-07-02", "transfer_in", 24, { playerId: "p7", playerName: "Pablo Maia" }),
      entry("2027-07-02", "transfer_out", -3, { stage: "sell_on", playerName: "Pablo Maia" }),
      entry("2027-07-05", "transfer_in", 1, { stage: "loan_fee" }),
    ];
    const players = [
      { id: "p1", name: "T. Almada", arrival: { squadId: "club", kind: "transfer" as const, fee: 32, on: "2027-01-10" } },
      { id: "p3", name: "Free Agent", arrival: { squadId: "club", kind: "free" as const, on: "2027-02-01" } },
      { id: "p4", name: "Academy Kid", arrival: { squadId: "club", kind: "academy" as const, on: "2027-03-01" } },
      { id: "p5", name: "Old Signing", arrival: { squadId: "club", kind: "transfer" as const, on: "2025-01-01" } },
      { id: "p6", name: "Next Season", arrival: { squadId: "club", kind: "pre_contract" as const, on: "2027-12-06" } },
    ];
    const m = buildSeasonSummary(input({ entries, players })).market;
    expect(m.signings).toBe(3);
    expect(m.spent).toBe(38);
    expect(m.sales).toBe(1);
    expect(m.received).toBe(22);
    expect(m.biggestBuy).toEqual({ name: "T. Almada", fee: 32 });
    expect(m.biggestSale).toEqual({ name: "Pablo Maia", fee: 24 });
  });

  test("highlights: the club's top scorer who left wins over today's squad; rating needs enough games", () => {
    const players = [
      { id: "a", name: "Striker", nationality: "Brazil", history: [hist(30, 15, 4, 6.9)] },
      { id: "b", name: "Winger", history: [hist(34, 6, 14, 7.1), hist(10, 9, 9, 8, { season: "2026" })] },
      { id: "c", name: "Cameo", history: [hist(3, 0, 0, 8.9)] },
      { id: "d", name: "Keeper", history: [hist(20, 0, 0, 7.42, { partial: true }), hist(18, 0, 0, 7.42)] },
      { id: "e", name: "Elsewhere", history: [hist(40, 30, 20, 9, { squadId: "other" })] },
    ];
    const h = buildSeasonSummary(input({ players })).highlights;
    expect(h.find((x) => x.kind === "scorer")).toEqual({ kind: "scorer", playerId: "p9", name: "J. Calleri", nationality: undefined, value: 22 });
    expect(h.find((x) => x.kind === "assists")).toMatchObject({ playerId: "b", value: 14 });
    expect(h.find((x) => x.kind === "rating")).toMatchObject({ playerId: "d", value: 7.42 });
    expect(h.find((x) => x.kind === "apps")).toMatchObject({ playerId: "d", value: 38 });

    const noRecord = buildSeasonSummary(input({ players, row: { ...row, topScorer: undefined } })).highlights;
    expect(noRecord.find((x) => x.kind === "scorer")).toMatchObject({ playerId: "a", nationality: "Brazil", value: 15 });
  });

  test("crowd: the home games of the season only", () => {
    const att = (date: string, attendance: number) => ({ date, competition: "brazil_serie_a", opponentId: "x", attendance, capacity: 60000, demand: 60000 });
    const s = buildSeasonSummary(input({
      entries: [entry("2027-02-01", "broadcasting", 1)],
      attendance: [att("2026-11-01", 10000), att("2027-02-10", 40000), att("2027-06-10", 50000), att("2027-12-20", 20000)],
    }));
    expect(s.crowd).toEqual({ average: 45000, games: 2, best: 50000 });
    expect(buildSeasonSummary(input()).crowd).toBeUndefined();
  });

  test("a club without a row of the season still gets a summary", () => {
    const s = buildSeasonSummary(input({ row: null }));
    expect(s.table).toBeNull();
    expect(s.league).toBe("brazil_serie_a");
    expect(s.highlights).toEqual([]);
  });
});
