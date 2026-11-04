import { describe, expect, test } from "bun:test";
import { answerRenewalProposal, MANAGER_CONTRACT, renewalLimits, type ManagerRenewalOffer } from "@/Domain/managers/managerContract";

const offer: ManagerRenewalOffer = { offeredOn: "2030-05-01", expires: "2030-09-01", wage: 10_000, seasons: 2 };

describe("renewal negotiation", () => {
  test("the limits follow the board", () => {
    const args = { currentWage: 10_000, reputationWage: 12_000 };
    expect(renewalLimits({ board: 80, ...args })).toEqual({ wage: 15_000, seasons: 3 });
    expect(renewalLimits({ board: 60, ...args })).toEqual({ wage: 13_200, seasons: 2 });
    expect(renewalLimits({ board: 45, ...args })).toEqual({ wage: 10_500, seasons: 1 });
  });

  test("within the limits it is agreed, asking for less too", () => {
    const limits = { wage: 13_200, seasons: 2 };
    expect(answerRenewalProposal(offer, { wage: 13_200, seasons: 2 }, limits)).toEqual({ kind: "agreed", wage: 13_200, seasons: 2 });
    expect(answerRenewalProposal(offer, { wage: 8_000, seasons: 1 }, limits)).toEqual({ kind: "agreed", wage: 8_000, seasons: 1 });
  });

  test("above them the board answers with its maximum, then the offer is final", () => {
    const limits = { wage: 13_200, seasons: 2 };
    const first = answerRenewalProposal(offer, { wage: 20_000, seasons: 3 }, limits);
    expect(first.kind).toBe("countered");
    if (first.kind !== "countered") return;
    expect(first.offer).toMatchObject({ wage: 13_200, seasons: 2, rounds: 1 });
    const last = { ...offer, rounds: MANAGER_CONTRACT.COUNTER_ROUNDS };
    expect(answerRenewalProposal(last, { wage: 20_000, seasons: 3 }, limits)).toEqual({ kind: "noRounds" });
    // A signed proposal within the limits still works with no rounds left.
    expect(answerRenewalProposal(last, { wage: 13_000, seasons: 2 }, limits).kind).toBe("agreed");
  });

  test("the board never goes below what it already offered", () => {
    const low = { wage: 9_000, seasons: 1 };
    const out = answerRenewalProposal(offer, { wage: 20_000, seasons: 3 }, low);
    expect(out.kind).toBe("countered");
    if (out.kind === "countered") expect(out.offer).toMatchObject({ wage: 10_000, seasons: 2 });
    expect(answerRenewalProposal(offer, { wage: 10_000, seasons: 2 }, low).kind).toBe("agreed");
  });

  test("invalid proposals", () => {
    const limits = { wage: 13_200, seasons: 2 };
    for (const p of [{ wage: 0, seasons: 1 }, { wage: 1.5, seasons: 1 }, { wage: "9", seasons: 1 }, { wage: 9_000, seasons: 0 }, { wage: 9_000, seasons: 4 }]) {
      expect(answerRenewalProposal(offer, p, limits)).toEqual({ kind: "invalid" });
    }
  });
});
