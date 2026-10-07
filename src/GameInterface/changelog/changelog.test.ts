import { describe, expect, test } from "bun:test";
import { changelog, CURRENT_VERSION, upcoming, type ChangelogEntry } from "@/GameInterface/changelog/changelog";
import PKG from "@/../package.json";

function versionTuple(version: string): number[] {
  const parts = version.split(".").map((p) => Number(p));
  expect(parts.every((n) => Number.isFinite(n))).toBe(true);
  return parts;
}

function compareVersions(a: string, b: string): number {
  const ta = versionTuple(a);
  const tb = versionTuple(b);
  const len = Math.max(ta.length, tb.length);
  for (let i = 0; i < len; i++) {
    const av = ta[i] ?? 0;
    const bv = tb[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

describe("changelog data", () => {
  test("is not empty", () => {
    expect(changelog.length).toBeGreaterThan(0);
  });

  test("package.json version equals CURRENT_VERSION", () => {
    expect(PKG.version).toBe(CURRENT_VERSION);
  });

  test("CURRENT_VERSION equals the first entry's version", () => {
    expect(CURRENT_VERSION).toBe(changelog[0]!.version);
  });

  test("versions are strictly descending (newest first)", () => {
    for (let i = 1; i < changelog.length; i++) {
      const prev = changelog[i - 1]!;
      const curr = changelog[i]!;
      expect(compareVersions(curr.version, prev.version)).toBeLessThan(0);
    }
  });

  test("versions are unique", () => {
    const versions = changelog.map((e) => e.version);
    expect(new Set(versions).size).toBe(versions.length);
  });

  test("every entry has a valid ISO date", () => {
    for (const entry of changelog) {
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(new Date(entry.date + "T00:00:00Z").getTime())).toBe(false);
    }
  });

  test("every entry has at least one item", () => {
    for (const entry of changelog) {
      expect(entry.items.length).toBeGreaterThan(0);
    }
  });

  function expectNonEmptyText(entries: ChangelogEntry[]) {
    for (const entry of entries) {
      for (const item of entry.items) {
        expect(item.pt.trim().length).toBeGreaterThan(0);
        expect(item.en.trim().length).toBeGreaterThan(0);
      }
      for (const fix of entry.fixes ?? []) {
        expect(fix.pt.trim().length).toBeGreaterThan(0);
        expect(fix.en.trim().length).toBeGreaterThan(0);
      }
    }
  }

  test("every item and fix has non-empty pt and en text", () => {
    expectNonEmptyText(changelog);
  });

  test("upcoming items are present and have non-empty pt and en text", () => {
    expect(upcoming.length).toBeGreaterThan(0);
    for (const item of upcoming) {
      expect(item.pt.trim().length).toBeGreaterThan(0);
      expect(item.en.trim().length).toBeGreaterThan(0);
    }
  });
});
