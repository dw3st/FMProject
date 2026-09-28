import { describe, expect, test } from "bun:test";
import { shouldShowChangelogNotice } from "@/GameInterface/changelog/changelogNotice";

describe("shouldShowChangelogNotice", () => {
  test("first visit (no stored value) does not show the notice", () => {
    expect(shouldShowChangelogNotice(null, "1.4.0")).toBe(false);
  });

  test("stored version equal to current does not show the notice", () => {
    expect(shouldShowChangelogNotice("1.4.0", "1.4.0")).toBe(false);
  });

  test("older stored version shows the notice", () => {
    expect(shouldShowChangelogNotice("1.3.0", "1.4.0")).toBe(true);
    expect(shouldShowChangelogNotice("1.0.0", "1.4.0")).toBe(true);
  });
});
