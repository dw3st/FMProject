import { describe, expect, test } from "bun:test";
import { applyPressEffect, initialBoardState } from "@/Domain/boardFans/boardFans";

describe("applyPressEffect", () => {
  test("move os dois medidores pelo mesmo amortecimento dos eventos", () => {
    const s = initialBoardState("2027-02-05", null); // 60/60
    const n = applyPressEffect(s, -2, 3);
    expect(n.board).toBe(58);
    expect(n.fans).toBe(63);
  });
  test("zero não muda nada", () => {
    const s = initialBoardState("2027-02-05", null);
    expect(applyPressEffect(s, 0, 0)).toEqual(s);
  });
  test("acima de 60 o ganho é amortecido", () => {
    const s = { ...initialBoardState("2027-02-05", null), fans: 90 };
    expect(applyPressEffect(s, 0, 5).fans).toBeLessThan(95);
  });
});
