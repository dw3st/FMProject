import { describe, expect, test } from "bun:test";
import { playerSituation } from "@/Domain/negotiation/situation";
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
});
