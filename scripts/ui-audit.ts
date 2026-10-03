/**
 * UI audit: checks the game screens against `.claude/rules/ui-standard.md` (typography, sizes,
 * tables, tabs, buttons).
 *
 *   bun run ui:audit            # per-file report; exits 1 on a hard violation
 *   bun run ui:audit --hard     # hard violations only
 *   bun run ui:audit --json     # machine-readable findings
 *
 * Hard rules (fail the audit and `scripts/ui-audit.test.ts`):
 *   - `small-text`   readable text below 13px (`text-[Npx]` with N < 13, rem equivalents, and
 *                    `text-xs` / `text-[12px]` outside a label: font-display + uppercase);
 *   - `font-mono`    `font-mono` outside the debug screens;
 *   - `inline-font`  font styles inline (`style={{ fontSize | fontFamily | fontWeight |
 *                    letterSpacing | lineHeight }}`, or an SVG `fontSize`/`fontFamily` attribute).
 *
 * Soft rules (reported, never fail): arbitrary sizes other than the 13px label/table-head size,
 * headings that don't use the title classes, `<table>`s that don't use the Leagues table style,
 * hand-made tab bars, and decorative button styles (glow, gradient, scale).
 *
 * Justified exceptions to a hard rule go in `ALLOWLIST` with a reason.
 */
import ts from "typescript";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

export type Severity = "hard" | "soft";

export interface Finding {
  file: string;
  line: number;
  rule: string;
  severity: Severity;
  message: string;
  snippet: string;
}

/** Folders that hold the game UI. */
export const UI_ROOTS = ["src/GameInterface", "src/pages"];

/** Debug-only surfaces (`/test`, `/lab`, debug panels): free to use mono and tiny text. */
export const DEBUG_FILES = [
  "src/GameInterface/TestScreen.tsx",
  "src/GameInterface/DebugPanel.tsx",
  "src/GameInterface/CrowdHeatmapPanel.tsx",
  "src/GameInterface/EnergyPanel.tsx",
  "src/GameInterface/QuickSimPanel.tsx",
  "src/GameInterface/SimulationScreen.tsx",
];

/** Justified exceptions to a hard rule: file + rule + a substring of the offending source line. */
export const ALLOWLIST: { file: string; rule: string; match: string; reason: string }[] = [
  {
    file: "src/GameInterface/Dashboard/PlayerCard.tsx",
    rule: "inline-font",
    match: "fontSize={fs}",
    reason: "SVG rating hexagon: size in viewBox units, scales with the drawing (not CSS text)",
  },
  {
    file: "src/GameInterface/Components/PositionPitch.tsx",
    rule: "inline-font",
    match: 'fontSize="3.4"',
    reason: "SVG mini pitch: position labels in viewBox units, scale with the drawing",
  },
];

const TITLE_SCREEN = ["font-display", "font-black", "uppercase", "text-3xl"];
const TITLE_SECTION = ["font-display", "font-black", "uppercase"];
const LABEL = ["font-display", "uppercase"];
/** The one arbitrary size the standard uses (labels, table heads, segmented tabs). */
const ALLOWED_ARBITRARY = new Set(["13px"]);
const FONT_STYLE_KEYS = new Set(["fontSize", "fontFamily", "fontWeight", "letterSpacing", "lineHeight"]);
const DECORATIVE = /^(glow-|bg-gradient|bg-linear|from-|via-|scale-|hover:scale-|active:scale-|drop-shadow-)/;

function norm(p: string): string {
  return p.split(sep).join("/");
}

function listFiles(dir: string): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listFiles(full));
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

/** Strip responsive/state variants: `md:text-xs` → `text-xs`. */
function base(token: string): string {
  const i = token.lastIndexOf(":");
  return i >= 0 ? token.slice(i + 1) : token;
}

/** Pixel size of a text-size token, or null when it is not one. */
export function textSizePx(token: string): number | null {
  const t = base(token);
  if (t === "text-xs") return 12;
  const m = /^text-\[(\d*\.?\d+)(px|rem)\]$/.exec(t);
  if (!m) return null;
  const v = Number(m[1]);
  return m[2] === "rem" ? v * 16 : v;
}

function hasAll(text: string, words: string[]): boolean {
  const tokens = new Set(text.split(/[\s`"'{}$()?:]+/).map(base));
  return words.every((w) => tokens.has(w));
}

/** Text used to decide whether a class literal belongs to a label: its nearest owner. */
function contextOf(node: ts.Node, sf: ts.SourceFile): string {
  let cur: ts.Node | undefined = node.parent;
  while (cur) {
    if (
      ts.isJsxAttribute(cur) ||
      ts.isVariableDeclaration(cur) ||
      ts.isPropertyAssignment(cur) ||
      ts.isReturnStatement(cur)
    ) {
      return cur.getText(sf);
    }
    if (ts.isJsxOpeningElement(cur) || ts.isJsxSelfClosingElement(cur) || ts.isBlock(cur)) break;
    cur = cur.parent;
  }
  return node.getText(sf);
}

/** A JSX child expression that renders a formatted number. */
const NUMBER_EXPR = /\.toFixed\(|format(Currency|Euros|Fee|TransferFee|Wage|BudgetShort|Money)\(|\.toLocaleString\(/;

function classOf(el: ts.JsxOpeningElement | ts.JsxSelfClosingElement, sf: ts.SourceFile): string {
  return el.attributes.properties
    .filter((a): a is ts.JsxAttribute => ts.isJsxAttribute(a) && a.name.getText(sf) === "className")
    .map((a) => a.initializer?.getText(sf) ?? "")
    .join(" ");
}

function containsJsx(node: ts.Node): boolean {
  if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) return true;
  return ts.forEachChild(node, (c) => (containsJsx(c) ? true : undefined)) ?? false;
}

/** Tag name of the JSX element whose attributes contain this node ("" when none). */
function enclosingTag(node: ts.Node, sf: ts.SourceFile): string {
  let cur: ts.Node | undefined = node.parent;
  while (cur) {
    if (ts.isJsxOpeningElement(cur) || ts.isJsxSelfClosingElement(cur)) return cur.tagName.getText(sf);
    if (ts.isBlock(cur) || ts.isSourceFile(cur)) return "";
    cur = cur.parent;
  }
  return "";
}

function literalText(node: ts.Node): string | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) return node.text;
  return null;
}

export function auditFile(path: string, source: string, debug: boolean): Finding[] {
  const sf = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const lines = source.split("\n");
  const findings: Finding[] = [];
  const add = (node: ts.Node, rule: string, severity: Severity, message: string) => {
    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
    findings.push({ file: path, line, rule, severity, message, snippet: (lines[line - 1] ?? "").trim().slice(0, 160) });
  };
  const usesTableStyle = /TABLE_STYLE|TABLE_CELL|StatsTable|DataTable/.test(source);
  const isUiKit = path.includes("/ui/");

  const visit = (node: ts.Node) => {
    const text = literalText(node);
    if (text != null && /\b(text-|font-|uppercase|glow-|scale-|bg-gradient)/.test(text)) {
      const tokens = text.split(/\s+/).filter(Boolean);
      for (const tok of tokens) {
        const b = base(tok);
        const px = textSizePx(tok);
        if (px != null && !debug) {
          if (px < 12) {
            add(node, "small-text", "hard", `${b} (${px}px) is below the 13px minimum`);
          } else if (px < 13) {
            if (!hasAll(contextOf(node, sf), LABEL)) {
              add(node, "small-text", "hard", `${b} (12px) on non-label text; use text-[13px]/text-sm, or the label style`);
            }
          }
        }
        if (px === 13 && !debug && !isUiKit && !hasAll(contextOf(node, sf), LABEL)) {
          add(node, "size-13", "soft", "13px on non-label text; table, badge and button text is text-sm (14px)");
        }
        if (!debug && /^text-\[/.test(b)) {
          const m = /^text-\[(.+)\]$/.exec(b);
          if (m && !ALLOWED_ARBITRARY.has(m[1]!) && (px == null || px >= 12)) {
            add(node, "arbitrary-size", "soft", `arbitrary size ${b}; prefer the scale (text-sm/base/lg/xl…)`);
          }
        }
        if (b === "uppercase" && !debug && !isUiKit) {
          const ctx = contextOf(node, sf);
          const tag = enclosingTag(node, sf);
          if (!hasAll(ctx, ["font-display"]) && !/^h[1-3]$/.test(tag) && !ctx.includes("[font:inherit]")) {
            add(node, "label-font", "soft", "uppercase text in the body font; labels use font-display (label style)");
          }
        }
        const bigText = /^text-(2xl|3xl|4xl|5xl|6xl|7xl)$/.test(b);
        if (bigText && !debug && !isUiKit && !path.endsWith("Wordmark.tsx") && !/^h[1-3]$/.test(enclosingTag(node, sf))) {
          const ctx = contextOf(node, sf);
          // Flag icons (`fi fi-xx`) are sized with text-*: not text.
          if (!hasAll(ctx, ["font-display"]) && !/\bfi fi-/.test(ctx)) {
            add(node, "display-font", "soft", `${b} in the body font; big numbers and titles use font-display`);
          }
        }
        if (b === "font-mono" && !debug) add(node, "font-mono", "hard", "font-mono outside the debug screens");
        if (!debug && DECORATIVE.test(tok)) add(node, "decorative", "soft", `decorative style ${tok} (no glow, gradient or scale)`);
        if (b === "font-wordmark" && !path.endsWith("Wordmark.tsx")) {
          add(node, "wordmark", "soft", "font-wordmark outside Wordmark; use <Wordmark size=lg|sm>");
        }
      }
    }

    // Inline font styles: style={{ fontSize: … }} and SVG font attributes.
    if (ts.isJsxAttribute(node) && !debug) {
      const name = node.name.getText(sf);
      if (name === "style" && node.initializer && ts.isJsxExpression(node.initializer)) {
        const expr = node.initializer.expression;
        if (expr && ts.isObjectLiteralExpression(expr)) {
          for (const p of expr.properties) {
            const key = p.name?.getText(sf).replace(/["']/g, "");
            if (key && FONT_STYLE_KEYS.has(key)) add(node, "inline-font", "hard", `inline style ${key}; use Tailwind font classes`);
          }
        }
      }
      if (name === "fontSize" || name === "fontFamily") add(node, "inline-font", "hard", `SVG ${name} attribute`);
    }

    // Headings.
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && !debug && !isUiKit) {
      const tag = node.tagName.getText(sf);
      const cls = classOf(node, sf);
      if (tag === "h1" && !hasAll(cls, TITLE_SCREEN) && !cls.includes("hClass")) {
        add(node, "heading", "soft", "<h1> without the screen-title classes; use <ScreenTitle>");
      }
      if ((tag === "h2" || tag === "h3") && !hasAll(cls, TITLE_SECTION) && !hasAll(cls, LABEL)) {
        add(node, "heading", "soft", `<${tag}> without the section-title (or label) classes; use <SectionTitle>`);
      }
      // A filled primary button (a plain class string, not the selected state of a chip/toggle).
      if (tag === "button" && !cls.includes("?") && /(^|[\s"`])bg-primary([\s"`]|$)/.test(cls)) {
        const missing = ["h-10", "font-semibold", "text-sm"].filter((c) => !hasAll(cls, [c]));
        if (missing.length > 0) add(node, "button", "soft", `raw primary button without ${missing.join(", ")}; use <Button>`);
      }
      if (tag === "table" && !usesTableStyle) {
        add(node, "table", "soft", "<table> without TABLE_STYLE/StatsTable/DataTable");
      }
      if (!isUiKit) {
        const role = node.attributes.properties.find(
          (a): a is ts.JsxAttribute => ts.isJsxAttribute(a) && a.name.getText(sf) === "role",
        );
        if (role?.initializer?.getText(sf) === '"tablist"') {
          add(node, "tabs", "soft", "hand-made tab bar; use <SegmentedTabs> (or <Tabs>)");
        }
      }
    }
    // Numbers (money, ratings, decimals) shown without tabular-nums on the element or an ancestor.
    if (ts.isJsxElement(node) && !debug && !isUiKit) {
      const own = node.children.some(
        (c) =>
          ts.isJsxExpression(c) &&
          c.expression != null &&
          !containsJsx(c.expression) &&
          NUMBER_EXPR.test(c.expression.getText(sf)),
      );
      if (own) {
        let tabular = false;
        for (let cur: ts.Node | undefined = node; cur && !tabular; cur = cur.parent) {
          if (ts.isJsxElement(cur)) tabular = /tabular-nums|TABLE_STYLE.(number|key)/.test(classOf(cur.openingElement, sf));
          if (ts.isFunctionLike(cur)) break;
        }
        if (!tabular) add(node, "tabular", "soft", "number without tabular-nums");
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return findings;
}

function allowed(f: Finding): boolean {
  return ALLOWLIST.some((a) => a.file === f.file && a.rule === f.rule && f.snippet.includes(a.match));
}

export function auditUi(root = process.cwd()): Finding[] {
  const out: Finding[] = [];
  for (const dir of UI_ROOTS) {
    for (const full of listFiles(join(root, dir))) {
      const rel = norm(relative(root, full));
      const debug = DEBUG_FILES.includes(rel);
      out.push(...auditFile(rel, readFileSync(full, "utf8"), debug).filter((f) => !(f.severity === "hard" && allowed(f))));
    }
  }
  return out;
}

if (import.meta.main) {
  const args = new Set(process.argv.slice(2));
  const all = auditUi();
  const shown = args.has("--hard") ? all.filter((f) => f.severity === "hard") : all;
  if (args.has("--json")) {
    console.log(JSON.stringify(shown, null, 2));
  } else {
    const byFile = new Map<string, Finding[]>();
    for (const f of shown) byFile.set(f.file, [...(byFile.get(f.file) ?? []), f]);
    for (const [file, fs] of [...byFile].sort((a, b) => b[1].length - a[1].length)) {
      console.log(`\n${file}  (${fs.length})`);
      for (const f of fs.sort((a, b) => a.line - b.line)) {
        console.log(`  ${f.severity === "hard" ? "HARD" : "soft"} ${String(f.line).padStart(4)}  ${f.rule.padEnd(14)} ${f.message}`);
      }
    }
  }
  const hard = all.filter((f) => f.severity === "hard").length;
  const byRule = new Map<string, number>();
  for (const f of all) byRule.set(f.rule, (byRule.get(f.rule) ?? 0) + 1);
  console.log(`\n${all.length} findings — hard ${hard}, soft ${all.length - hard}`);
  console.log([...byRule].map(([r, n]) => `${r} ${n}`).join(" · "));
  process.exit(hard > 0 ? 1 : 0);
}
