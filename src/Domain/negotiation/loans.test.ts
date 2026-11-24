import { describe, expect, test } from "bun:test";
import { contractCoveringLoan } from "@/Domain/negotiation/loans";

describe("two-season loans (12.32)", () => {
  test("ends a season later; the request field accepts only 1 or 2", async () => {
    const { loanUntil, parseLoanSeasons } = await import("@/Domain/negotiation/loans");
    expect(loanUntil("2027-08-20", "2028-05-20", 2)).toBe("2029-05-20");
    expect(loanUntil("2027-08-20", "2028-05-20")).toBe("2028-05-20");
    expect(parseLoanSeasons(undefined)).toBe(1);
    expect(parseLoanSeasons(2)).toBe(2);
    expect(parseLoanSeasons(3)).toBeNull();
  });
});

describe("contractCoveringLoan (report 98afd1e0)", () => {
  test("a contract ending before the loan moves by whole seasons", () => {
    expect(contractCoveringLoan({ until: "2029-05-17", wage: 5000 }, "2029-11-23")).toEqual({ until: "2030-05-17", wage: 5000 });
    expect(contractCoveringLoan({ until: "2029-05-17", wage: 5000 }, "2030-11-23")?.until).toBe("2031-05-17");
  });
  test("a contract that covers the loan stays", () => {
    const c = { until: "2031-05-17", wage: 5000 };
    expect(contractCoveringLoan(c, "2029-11-23")).toBe(c);
    expect(contractCoveringLoan(undefined, "2029-11-23")).toBeUndefined();
  });
});
