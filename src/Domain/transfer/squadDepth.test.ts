import { describe, expect, test } from "bun:test";
import { humanBuyBlocked, squadDepthBlocked } from "@/Domain/transfer/transferAcceptance";
import type { RosterPlayer, Squad } from "@/types/playerTypes";

const p = (id: string, pos: string): RosterPlayer => ({ id, name: id, age: 25, positions: [pos], stats: {} } as unknown as RosterPlayer);
const squad = (players: RosterPlayer[]): Squad => ({ id: "s", name: "S", players } as unknown as Squad);

describe("squad depth on a sale", () => {
  const base = [
    ...Array.from({ length: 3 }, (_, i) => p(`g${i}`, "GK")),
    ...Array.from({ length: 8 }, (_, i) => p(`d${i}`, "Defender")),
    ...Array.from({ length: 8 }, (_, i) => p(`m${i}`, "Midfielder")),
    ...Array.from({ length: 5 }, (_, i) => p(`f${i}`, "Forward")),
  ];

  test("an academy player with a detailed position code shares the line with the others (report)", () => {
    const rw = p("rw", "RW");
    expect(humanBuyBlocked(rw, squad([...base, rw]))).toBe(false);
  });

  test("still blocked: the only player of his line, or a squad of 14", () => {
    const keeper = p("gk", "GK");
    const field = base.filter((x) => x.positions[0] !== "GK");
    expect(humanBuyBlocked(keeper, squad([...field, keeper]))).toBe(true);
    expect(squadDepthBlocked(base[0]!, squad(base.slice(0, 14)), true)).toBe(true);
  });
});
