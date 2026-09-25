import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { isTesterEmail, parseTesterEmails } from "@/backend/auth/testers";

const savedEnv: { REPORT_TESTERS?: string } = {};

beforeEach(() => {
  savedEnv.REPORT_TESTERS = process.env.REPORT_TESTERS;
});

afterEach(() => {
  if (savedEnv.REPORT_TESTERS === undefined) delete process.env.REPORT_TESTERS;
  else process.env.REPORT_TESTERS = savedEnv.REPORT_TESTERS;
});

describe("parseTesterEmails", () => {
  test("undefined/empty input yields an empty set", () => {
    expect(parseTesterEmails(undefined)).toEqual(new Set());
    expect(parseTesterEmails("")).toEqual(new Set());
    expect(parseTesterEmails("   ")).toEqual(new Set());
  });

  test("splits on commas, trims, and lowercases", () => {
    expect(parseTesterEmails(" Dev@Localhost.com , Second@Example.com ")).toEqual(
      new Set(["dev@localhost.com", "second@example.com"]),
    );
  });

  test("ignores empty entries from stray commas", () => {
    expect(parseTesterEmails("a@example.com,,b@example.com,")).toEqual(
      new Set(["a@example.com", "b@example.com"]),
    );
  });
});

describe("isTesterEmail", () => {
  test("false when REPORT_TESTERS is unset", () => {
    delete process.env.REPORT_TESTERS;
    expect(isTesterEmail("dev@localhost")).toBe(false);
  });

  test("true for a listed email, case-insensitive", () => {
    process.env.REPORT_TESTERS = "dev@localhost,Someone@Example.com";
    expect(isTesterEmail("dev@localhost")).toBe(true);
    expect(isTesterEmail("DEV@LOCALHOST")).toBe(true);
    expect(isTesterEmail("someone@example.com")).toBe(true);
  });

  test("false for an email not in the list", () => {
    process.env.REPORT_TESTERS = "dev@localhost";
    expect(isTesterEmail("other@example.com")).toBe(false);
  });

  test("trims whitespace on the email being checked", () => {
    process.env.REPORT_TESTERS = "dev@localhost";
    expect(isTesterEmail("  dev@localhost  ")).toBe(true);
  });
});
