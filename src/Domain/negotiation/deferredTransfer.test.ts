import { describe, expect, test } from "bun:test";
import {
  committedElsewhere, DEFERRED_TRANSFER, deferredRefusal, dueDeferred, markDeferred, pendingDeferred, withPendingArrivals,
} from "@/Domain/negotiation/deferredTransfer";
import type { RosterPlayer, Squad } from "@/types/playerTypes";
import type { DeferredTransfer } from "@/types/transferMarketTypes";

const deal = (playerId: string, toClubId = "h", joinsOn = "2027-01-01"): DeferredTransfer => ({
  playerId, playerName: playerId, fromClubId: "ai", fromClubName: "AI", toClubId, fee: 1_000_000, wage: 1000, years: 2,
  agreedOn: "2026-10-10", joinsOn,
});
const squad = (ids: string[]): Squad => ({ id: "ai", players: ids.map((id) => ({ id }) as RosterPlayer) }) as Squad;

describe("deferred transfers (pure)", () => {
  test("pending and due", () => {
    const list = [deal("a"), deal("b", "other"), deal("c", "h", "2027-02-01")];
    expect(pendingDeferred(list, "h").map((d) => d.playerId)).toEqual(["a", "c"]);
    expect(dueDeferred(list, "2027-01-01").map((d) => d.playerId)).toEqual(["a", "b"]);
    expect(dueDeferred(undefined, "2027-01-01")).toEqual([]);
  });

  test("refusals: no next window, already coming, the limit", () => {
    expect(deferredRefusal({ pending: [], playerId: "x", joinsOn: undefined })).toBe("noWindow");
    expect(deferredRefusal({ pending: [deal("x")], playerId: "x", joinsOn: "2027-01-01" })).toBe("alreadyDeferred");
    const full = Array.from({ length: DEFERRED_TRANSFER.MAX_PENDING }, (_, i) => deal(`p${i}`));
    expect(deferredRefusal({ pending: full, playerId: "x", joinsOn: "2027-01-01" })).toBe("deferredLimit");
    expect(deferredRefusal({ pending: full.slice(1), playerId: "x", joinsOn: "2027-01-01" })).toBeNull();
  });

  test("pending arrivals count in the squad, once", () => {
    const s = withPendingArrivals(squad(["a", "b"]), [deal("b"), deal("c")]);
    expect(s.players.map((p) => p.id)).toEqual(["a", "b", "c"]);
    const same = squad(["a"]);
    expect(withPendingArrivals(same, [])).toBe(same);
  });

  test("marking the player on the seller and the commitment", () => {
    const marked = markDeferred(squad(["a", "b"]), "a", "h");
    expect(marked.players[0]!.deferredTo).toBe("h");
    expect(marked.players[1]!.deferredTo).toBeUndefined();
    expect(committedElsewhere(marked.players[0]!, "h")).toBe(false);
    expect(committedElsewhere(marked.players[0]!, "other")).toBe(true);
    expect("deferredTo" in markDeferred(marked, "a", null).players[0]!).toBe(false);
  });
});
