import { describe, expect, test } from "bun:test";
import { compensationFee, contractDay, reanchorContract, renewedContract, severancePay, renewalPending } from "@/Domain/managers/managerContract";

describe("renewalPending", () => {
  test("an offer waits for an answer until it expires", () => {
    const offer = { expires: "2027-06-30" };
    expect(renewalPending(offer, "2027-05-01")).toBe(true);
    expect(renewalPending(offer, "2027-06-30")).toBe(true);
    expect(renewalPending(offer, "2027-07-01")).toBe(false);
    expect(renewalPending(undefined, "2027-05-01")).toBe(false);
    expect(renewalPending(offer, undefined)).toBe(false);
  });
});

describe("a contract with no end (president)", () => {
  const c = { squadId: "x", wage: 10000, signed: "2027-01-01" };
  test("no compensation, no severance", () => {
    expect(compensationFee(c, "2027-03-01")).toBe(0);
    expect(severancePay(c, "2027-03-01")).toBe(0);
  });
  test("no renewal offer, no ending notice, no re-anchor", () => {
    const r = contractDay({
      date: "2027-05-20", contract: c, notices: [], board: 90, seasonEnd: "2027-05-25",
      played: 38, totalRounds: 38, reputationWage: 20000,
    });
    expect(r.renewal).toBeUndefined();
    expect(r.message).toBeUndefined();
    expect(reanchorContract(c, "2027-05-25", "2028-05-25")).toBe(c);
    expect(renewedContract(c, { wage: 12000, seasons: 2 }, "2027-05-20").until).toBeUndefined();
  });
});
