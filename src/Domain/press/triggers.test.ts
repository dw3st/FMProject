import { describe, expect, test } from "bun:test";
import { pickTrigger, preMatchTriggers, postMatchTriggers, isRunIn, nextWinless } from "@/Domain/press/triggers";

describe("pré-jogo", () => {
  test("clássico, mata-mata, ultimato", () => {
    expect(preMatchTriggers({ derby: true, knockout: false, runIn: false, ultimatum: false })).toEqual(["derby"]);
    expect(preMatchTriggers({ derby: true, knockout: true, runIn: true, ultimatum: true }).sort())
      .toEqual(["derby", "knockout", "run_in", "ultimatum"]);
  });
});

describe("pós-jogo", () => {
  test("goleada sofrida e zebra", () => {
    expect(postMatchTriggers({ goalsFor: 0, goalsAgainst: 3, eliminated: false, title: false, expectation: 0.6, winless: 1 }))
      .toEqual(expect.arrayContaining(["heavy_defeat", "upset_loss"]));
    expect(postMatchTriggers({ goalsFor: 2, goalsAgainst: 1, eliminated: false, title: false, expectation: -0.5, winless: 0 }))
      .toEqual(["upset_win"]);
  });
  test("sequência sem vitória só no múltiplo de 5", () => {
    const base = { goalsFor: 1, goalsAgainst: 1, eliminated: false, title: false, expectation: 0 };
    expect(postMatchTriggers({ ...base, winless: 4 })).toEqual([]);
    expect(postMatchTriggers({ ...base, winless: 5 })).toEqual(["winless"]);
    expect(postMatchTriggers({ ...base, winless: 10 })).toEqual(["winless"]);
  });
  test("título e eliminação", () => {
    expect(postMatchTriggers({ goalsFor: 1, goalsAgainst: 0, eliminated: false, title: true, expectation: 0, winless: 0 })).toEqual(["title"]);
    expect(postMatchTriggers({ goalsFor: 0, goalsAgainst: 1, eliminated: true, title: false, expectation: 0, winless: 1 })).toEqual(["eliminated"]);
  });
  test("nextWinless", () => {
    expect(nextWinless(3, "D")).toBe(4);
    expect(nextWinless(3, "W")).toBe(0);
  });
});

describe("reta final", () => {
  const table = [30, 29, 27, 20, 18, 17, 10, 9].map((points, i) => ({ squadId: `c${i}`, points }));
  test("perto do título", () => {
    expect(isRunIn({ table, myId: "c1", roundsLeft: 3, boundaries: [1] })).toBe(true);
  });
  test("longe de toda fronteira", () => {
    expect(isRunIn({ table, myId: "c3", roundsLeft: 3, boundaries: [1, 6] })).toBe(false);
  });
  test("perto do rebaixamento (fronteira 6: 6º fica, 7º cai)", () => {
    expect(isRunIn({ table, myId: "c6", roundsLeft: 2, boundaries: [6] })).toBe(false); // 10 × 17 = 7 pontos
    expect(isRunIn({ table, myId: "c5", roundsLeft: 2, boundaries: [6] })).toBe(false); // ele está dentro e 17 × 10
    const tight = table.map((r) => (r.squadId === "c6" ? { ...r, points: 15 } : r));
    expect(isRunIn({ table: tight, myId: "c6", roundsLeft: 2, boundaries: [6] })).toBe(true);
  });
  test("fora das últimas rodadas", () => {
    expect(isRunIn({ table, myId: "c1", roundsLeft: 4, boundaries: [1] })).toBe(false);
  });
});

describe("pickTrigger", () => {
  test("prioridade", () => {
    expect(pickTrigger(["derby", "heavy_defeat", "knockout"], { today: "2027-03-10" })).toBe("knockout");
  });
  test("limite de 7 dias, título fura", () => {
    const st = { today: "2027-03-10", lastDate: "2027-03-05" };
    expect(pickTrigger(["derby"], st)).toBeNull();
    expect(pickTrigger(["title", "derby"], st)).toBe("title");
    expect(pickTrigger(["derby"], { today: "2027-03-12", lastDate: "2027-03-05" })).toBe("derby");
  });
  test("pendente bloqueia, salvo título", () => {
    expect(pickTrigger(["derby"], { today: "2027-03-20", pending: true })).toBeNull();
    expect(pickTrigger(["title"], { today: "2027-03-20", pending: true })).toBe("title");
  });
  test("vazio", () => expect(pickTrigger([], { today: "2027-03-20" })).toBeNull());
});
