import { describe, expect, test } from "bun:test";
import { pruneTransferLog, seasonTransfers, withDirection } from "@/Domain/transfer/transferView";
import type { StoredTransferRecord } from "@/types/transferTypes";

const rec = (id: string, date: string, from: string, to: string): StoredTransferRecord => ({
  id, date, playerId: id, playerName: id, playerPosition: "CB", playerAge: 25,
  fromSquadId: from, fromSquadName: from, toSquadId: to, toSquadName: to, fee: 1, status: "accepted", reason: "x",
});

describe("transfer log view", () => {
  test("direction is computed for the asking seat's club", () => {
    expect(withDirection(rec("a", "2027-01-01", "x", "me"), "me").direction).toBe("in");
    expect(withDirection(rec("b", "2027-01-01", "me", "x"), "me").direction).toBe("out");
    expect(withDirection(rec("c", "2027-01-01", "x", "y"), "me").direction).toBe("in");
  });
  test("the screen shows the seat's season; the rollover prunes what no running season still covers", () => {
    const log = [rec("old", "2026-05-01", "x", "y"), rec("new", "2026-09-01", "x", "y")];
    expect(seasonTransfers(log, "2026-08-15").map((r) => r.id)).toEqual(["new"]);
    expect(pruneTransferLog(log, ["2026-08-15", "2027-02-05"]).map((r) => r.id)).toEqual(["new"]);
    expect(pruneTransferLog(log, []).map((r) => r.id)).toEqual(["old", "new"]);
  });
});
