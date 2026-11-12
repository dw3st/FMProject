import { describe, expect, test } from "bun:test";
import { paidFor, playerSituation } from "@/Domain/negotiation/situation";
import type { RosterPlayer, Squad } from "@/types/playerTypes";

const STATS = (n: number) => ({ finishing: n, dribbling: n, speed: n, acceleration: n, strength: n, stamina: n, passing: n, vision: n, tackling: n, pressing: n, heading: n, jump: n, reflex: n });
const player = (id: string, level: number, extra: Partial<RosterPlayer> = {}) => ({ id, name: id, age: 26, positions: ["Midfielder"], stats: STATS(level), ...extra }) as unknown as RosterPlayer;
const squad = (players: RosterPlayer[]) => ({ id: "c", name: "C", players }) as unknown as Squad;

describe("a player's situation at his club", () => {
  const best = player("best", 8);
  const worst = player("worst", 2);
  const club = squad([best, ...Array.from({ length: 6 }, (_, i) => player(`m${i}`, 5)), worst]);

  test("the role comes from where he ranks", () => {
    expect(playerSituation(best, club, { forSale: false, loanable: false }).role).toBe("key");
    expect(playerSituation(worst, club, { forSale: false, loanable: false }).role).toBe("backup");
  });
  test("the manager's own choice wins over the suggestion", () => {
    expect(playerSituation(worst, club, { forSale: false, loanable: false, ownRole: "starter" }).role).toBe("starter");
  });
  test("lists, and a borrowed player is not lent on", () => {
    expect(playerSituation(worst, club, { forSale: true, loanable: true, requested: true })).toEqual({ role: "backup", forSale: true, loanable: true, requested: true });
    const borrowed = player("b", 4, { loan: { fromClubId: "x", fromClubName: "X", until: "2030-01-01", wageShare: 50 } });
    const s = playerSituation(borrowed, squad([borrowed]), { forSale: false, loanable: true });
    expect(s.loanable).toBe(false);
    expect(s.onLoan).toBe(true);
  });
  test("what the club paid for him: only the arrival at this club, and only when asked for", () => {
    const bought = player("p", 6, { arrival: { squadId: "c", kind: "transfer", fee: 40_000_000, on: "2033-07-10" } });
    expect(paidFor(bought, "c")).toEqual({ kind: "transfer", fee: 40_000_000, on: "2033-07-10" });
    expect(paidFor(bought, "other")).toBeNull();
    expect(paidFor(player("old", 6), "c")).toBeNull();
    expect(paidFor(player("f", 6, { arrival: { squadId: "c", kind: "free", on: "2033-07-10" } }), "c")).toEqual({ kind: "free", fee: 0, on: "2033-07-10" });
    const s = playerSituation(bought, squad([bought]), { forSale: false, loanable: false, paid: paidFor(bought, "c"), value: 52_000_000 });
    expect(s.paid?.fee).toBe(40_000_000);
    expect(s.value).toBe(52_000_000);
    expect("paid" in playerSituation(bought, squad([bought]), { forSale: false, loanable: false })).toBe(false);
  });
});
