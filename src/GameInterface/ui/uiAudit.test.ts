import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { auditFile, auditScreens, auditUi, textSizePx } from "@/../scripts/ui-audit";

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
  test("text-xs is too small even on a label; the 13px label is fine", () => {
    expect(rules(`<p className="font-display font-bold uppercase tracking-[0.08em] text-xs">x</p>`)).toContain("hard:small-text");
    expect(rules(`<p className="text-xs text-muted-foreground">x</p>`)).toContain("hard:small-text");
    expect(rules(`<p className="font-display font-bold uppercase tracking-[0.08em] text-[13px]">x</p>`)).toEqual([]);
  });
  test("font-mono and inline font styles", () => {
    expect(rules(`<p className="font-mono">x</p>`)).toContain("hard:font-mono");
    expect(rules(`<p style={{ fontSize: 12 }}>x</p>`)).toContain("hard:inline-font");
    expect(rules(`<p style={{ width: 12 }}>x</p>`)).toEqual([]);
  });
  test("a hand-rolled option chip is a hard violation", () => {
    const chip = `<button className={\`rounded-lg border px-2.5 py-1.5 \${on ? "border-primary bg-primary/15 text-primary" : "border-border"}\`}>x</button>`;
    expect(rules(chip)).toContain("hard:chip");
    const row = `<button className={\`text-left p-4 border \${on ? "border-primary" : "border-border"}\`}>x</button>`;
    expect(rules(row)).not.toContain("hard:chip");
  });
  test("soft rules: 13px body text, headings, raw primary buttons", () => {
    expect(rules(`<p className="text-[13px]">x</p>`)).toContain("soft:size-13");
    expect(rules(`<h2 className="text-lg">x</h2>`)).toContain("soft:heading");
    expect(rules(`<button className="bg-primary px-2">x</button>`)).toContain("soft:button");
  });
  test("soft rules: coloured text-link buttons and tiny icons in icon-only buttons", () => {
    expect(rules(`<button className="h-10 border-0 bg-transparent px-1 text-sm text-primary">Continue</button>`)).toContain(
      "soft:text-button",
    );
    expect(rules(`<button className="bg-transparent text-muted-foreground hover:text-primary">x</button>`)).not.toContain(
      "soft:text-button",
    );
    expect(rules(`<button aria-label="x"><Icon name="close" size={14} /></button>`)).toContain("soft:icon-size");
    expect(rules(`<button aria-label="x"><Icon name="close" size={16} /></button>`)).not.toContain("soft:icon-size");
  });
});

describe("screen titles have the accent part", () => {
  const H1 = `className="font-display font-black uppercase tracking-tight text-3xl md:text-4xl leading-none m-0"`;
  test("ScreenTitle needs accent=", () => {
    expect(rules(`<ScreenTitle>Painel</ScreenTitle>`)).toContain("hard:title-accent");
    expect(rules(`<ScreenTitle accent="Painel">Seu</ScreenTitle>`)).not.toContain("hard:title-accent");
  });
  test("a raw screen-title h1 needs TitleParts or a text-primary span", () => {
    expect(rules(`<h1 ${H1}>{t("x")}</h1>`)).toContain("hard:title-accent");
    expect(rules(`<h1 ${H1}><TitleParts accent="B">A</TitleParts></h1>`)).not.toContain("hard:title-accent");
    expect(rules(`<h1 ${H1}>A <span className="text-primary">B</span></h1>`)).not.toContain("hard:title-accent");
  });
  test("entry screens keep one-part titles", () => {
    const f = auditFile("src/GameInterface/NewGameWizard.tsx", `<ScreenTitle>Crie seu técnico</ScreenTitle>`, false);
    expect(f.map((x) => x.rule)).not.toContain("title-accent");
  });
});

describe("in-game screens use ScreenContainer", () => {
  function fixture(entry: string, screen: string) {
    const root = mkdtempSync(join(tmpdir(), "ui-audit-"));
    mkdirSync(join(root, "src/pages/foo"), { recursive: true });
    mkdirSync(join(root, "src/GameInterface"), { recursive: true });
    writeFileSync(join(root, "src/pages/foo/entry.tsx"), entry);
    writeFileSync(join(root, "src/GameInterface/FooScreen.tsx"), screen);
    try {
      return auditScreens(root).map((f) => `${f.severity}:${f.rule}`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
  const entry = `import { Layout } from "@/GameInterface/Components/Layout";
import { FooScreen } from "@/GameInterface/FooScreen";
const P = () => <Layout><FooScreen /></Layout>;`;
  test("a Layout screen without ScreenContainer is a hard violation", () => {
    expect(fixture(entry, `export function FooScreen() { return <main className="px-6 py-5">x</main>; }`)).toContain(
      "hard:screen-container",
    );
  });
  test("a screen using ScreenContainer passes; an ad-hoc max-w mx-auto wrapper is flagged", () => {
    expect(fixture(entry, `export function FooScreen() { return <ScreenContainer>x</ScreenContainer>; }`)).toEqual([]);
    expect(
      fixture(entry, `export function FooScreen() { return <ScreenContainer><div className="max-w-6xl mx-auto">x</div></ScreenContainer>; }`),
    ).toEqual(["soft:screen-width"]);
  });
  test("an entry that wraps the screen in ScreenContainer passes; screens outside Layout are ignored", () => {
    const wrapped = entry.replace("<FooScreen />", "<ScreenContainer><FooScreen /></ScreenContainer>");
    expect(fixture(wrapped, `export function FooScreen() { return <div>x</div>; }`)).toEqual([]);
    const noLayout = `import { FooScreen } from "@/GameInterface/FooScreen";
createPage(FooScreen);`;
    expect(fixture(noLayout, `export function FooScreen() { return <div>x</div>; }`)).toEqual([]);
  });
});

describe("game UI", () => {
  test("has no hard violation of the UI standard (bun run ui:audit)", () => {
    const hard = auditUi().filter((f) => f.severity === "hard");
    expect(hard.map((f) => `${f.file}:${f.line} ${f.rule} ${f.message}`)).toEqual([]);
  });
});
