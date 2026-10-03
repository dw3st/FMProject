import { describe, expect, test } from "bun:test";
import { auditFile, auditUi, textSizePx } from "@/../scripts/ui-audit";

const rules = (src: string, debug = false) => auditFile("src/GameInterface/X.tsx", src, debug).map((f) => `${f.severity}:${f.rule}`);

describe("ui audit rules", () => {
  test("text sizes", () => {
    expect(textSizePx("text-xs")).toBe(12);
    expect(textSizePx("md:text-[10px]")).toBe(10);
    expect(textSizePx("text-[0.75rem]")).toBe(12);
    expect(textSizePx("text-sm")).toBeNull();
  });
  test("tiny text is a hard violation, debug screens are exempt", () => {
    expect(rules(`<p className="text-[10px]">x</p>`)).toContain("hard:small-text");
    expect(rules(`<p className="text-[10px]">x</p>`, true)).not.toContain("hard:small-text");
  });
  test("text-xs is fine on a label, not on body text", () => {
    expect(rules(`<p className="font-display font-bold uppercase tracking-[0.08em] text-xs">x</p>`)).toEqual([]);
    expect(rules(`<p className="text-xs text-muted-foreground">x</p>`)).toContain("hard:small-text");
  });
  test("font-mono and inline font styles", () => {
    expect(rules(`<p className="font-mono">x</p>`)).toContain("hard:font-mono");
    expect(rules(`<p style={{ fontSize: 12 }}>x</p>`)).toContain("hard:inline-font");
    expect(rules(`<p style={{ width: 12 }}>x</p>`)).toEqual([]);
  });
  test("soft rules: 13px body text, headings, raw primary buttons", () => {
    expect(rules(`<p className="text-[13px]">x</p>`)).toContain("soft:size-13");
    expect(rules(`<h2 className="text-lg">x</h2>`)).toContain("soft:heading");
    expect(rules(`<button className="bg-primary px-2">x</button>`)).toContain("soft:button");
  });
});

describe("game UI", () => {
  test("has no hard violation of the UI standard (bun run ui:audit)", () => {
    const hard = auditUi().filter((f) => f.severity === "hard");
    expect(hard.map((f) => `${f.file}:${f.line} ${f.rule} ${f.message}`)).toEqual([]);
  });
});
