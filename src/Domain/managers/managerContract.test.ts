import { describe, expect, test } from "bun:test";
import { renewalPending } from "@/Domain/managers/managerContract";

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
