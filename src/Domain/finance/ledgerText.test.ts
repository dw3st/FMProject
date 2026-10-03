import { describe, expect, test } from "bun:test";
import { describeLedgerEntry } from "@/Domain/finance/ledgerText";

describe("describeLedgerEntry", () => {
  test("fixed kinds need no ref", () => {
    expect(describeLedgerEntry({ kind: "wages" })).toEqual({ key: "wages" });
    expect(describeLedgerEntry({ kind: "broadcasting" })).toEqual({ key: "broadcasting" });
  });
  test("gate and transfers use the ref", () => {
    expect(describeLedgerEntry({ kind: "gate", ref: { competition: "ucl" } })).toEqual({ key: "gate", competition: "ucl" });
    expect(describeLedgerEntry({ kind: "gate" })).toBeNull();
    expect(describeLedgerEntry({ kind: "transfer_out", ref: { clubName: "Roma" } })).toEqual({ key: "transferOut", club: "Roma" });
    expect(describeLedgerEntry({ kind: "transfer_in", ref: { opponentId: "x" } })).toBeNull();
  });
  test("league prize by position", () => {
    expect(describeLedgerEntry({ kind: "prize", ref: { competition: "premier_league", position: 3 } }))
      .toEqual({ key: "leaguePrize", competition: "premier_league", position: 3 });
  });
  test("cup prizes", () => {
    expect(describeLedgerEntry({ kind: "prize", ref: { competition: "cup_england", stage: "qf" } }))
      .toEqual({ key: "cupStage", competition: "cup_england", stage: "qf", stageScope: "cup" });
    expect(describeLedgerEntry({ kind: "prize", ref: { competition: "cup_england", stage: "runner_up" } }))
      .toEqual({ key: "cupRunnerUp", competition: "cup_england" });
  });
  test("continental prizes", () => {
    expect(describeLedgerEntry({ kind: "prize", ref: { competition: "ucl", stage: "participation" } })?.key).toBe("contParticipation");
    expect(describeLedgerEntry({ kind: "prize", ref: { competition: "ucl", stage: "group_win" } })?.key).toBe("contGroupWin");
    expect(describeLedgerEntry({ kind: "prize", ref: { competition: "ucl", stage: "title" } })?.key).toBe("contTitle");
    expect(describeLedgerEntry({ kind: "prize", ref: { competition: "lib", stage: "sf" } }))
      .toEqual({ key: "contStage", competition: "lib", stage: "sf", stageScope: "continental" });
  });
  test("board bonus", () => {
    expect(describeLedgerEntry({ kind: "prize", ref: { stage: "board_bonus" } })).toEqual({ key: "boardBonus" });
  });
  test("prize without data falls back", () => {
    expect(describeLedgerEntry({ kind: "prize" })).toBeNull();
  });
});
