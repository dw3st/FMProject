import { describe, expect, test } from "bun:test";

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
