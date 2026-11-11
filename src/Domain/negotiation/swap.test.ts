import { describe, expect, test } from "bun:test";
import { SWAP, swapRefusal, swapValue } from "@/Domain/negotiation/swap";
import { playerMarketValue } from "@/Domain/negotiation/askingPrice";
import { roundFeeDown } from "@/Domain/negotiation/negotiation";
import type { RosterPlayer, Squad } from "@/types/playerTypes";

const p = (id: string, pos = "Forward", extra: Partial<RosterPlayer> = {}) => ({
  id, name: id, age: 26, positions: [pos], nationality: "Brazil",
  stats: { finishing: 6, dribbling: 6, passing: 6, vision: 6, tackling: 3, pressing: 4, speed: 6, acceleration: 6, strength: 6, stamina: 6, heading: 5, reflex: 1, jump: 1 },
  ...extra,
}) as unknown as RosterPlayer;

describe("swap (9.4)", () => {
  test("value: full with a need in his line, 20% less without", () => {
    const s = p("s");
    expect(swapValue(s, [{ position: "Forward" } as never])).toBe(roundFeeDown(playerMarketValue(s)));
    expect(swapValue(s, [])).toBe(roundFeeDown(playerMarketValue(s) * SWAP.UNNEEDED_DISCOUNT));
  });

  test("refusals", () => {
    const seller = { id: "x", players: [p("t")], finances: { broadcasting: 50_000_000, commercial: 20_000_000, budget: 0, followers: 1_000_000 } } as unknown as Squad;
    const target = seller.players[0]!;
    const base = { target, seller, cash: 0, value: 1_000_000, sellerBudget: 0 };
    expect(swapRefusal({ ...base, swap: undefined })).toBe("swapInvalid");
    expect(swapRefusal({ ...base, swap: p("l", "Forward", { loan: {} as never }) })).toBe("swapOnLoan");
    expect(swapRefusal({ ...base, swap: p("s"), cash: -2_000_000 })).toBe("invalidCash");
    expect(swapRefusal({ ...base, swap: p("s"), cash: -500_000 })).toBe("swapBudget");
    expect(swapRefusal({ ...base, swap: p("s") })).toBeNull();
  });
});
