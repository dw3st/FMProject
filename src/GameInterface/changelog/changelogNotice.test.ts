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
  test("an old name of the same release is already seen", () => {
    expect(shouldShowChangelogNotice("4.48", "8.8")).toBe(false);
    expect(shouldShowChangelogNotice("4.47.23", "8.8")).toBe(true);
  });
});
