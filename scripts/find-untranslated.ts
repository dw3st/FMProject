/**
 * i18n Lint — find UI strings that have no proper translation.
 *
 * Two independent checks (both run by default):
 *
 *   HARDCODED  Literal user-facing text that never goes through `t(...)`:
 *                1. JSX text nodes        <span>Collapse</span>
 *                2. User-facing attrs     title="Load"  placeholder="Min"  aria-label / alt / label
 *
 *   MISSING    `t("some.key")` calls whose key is absent from a locale file
 *              (src/i18n/locales/*.json) — i.e. used in code but never defined.
 *
 * HARDCODED is heuristic (no AST): it masks comments first (keeping offsets so
 * line numbers stay accurate), then matches text that looks like prose rather
 * than code/identifiers. Anything in `{t(...)}` / `{expression}` is ignored.
 * MISSING is exact: it compares static t() keys against the flattened JSON.
 * Dynamic keys (`t(`foo.${x}`)`) can't be resolved statically and are counted,
 * not flagged. Add `// i18n-ignore` on a line to silence a HARDCODED finding.
 *
 * Usage:
 *   bun scripts/find-untranslated.ts                 # both checks, default roots
 *   bun scripts/find-untranslated.ts --hardcoded     # only hardcoded text
 *   bun scripts/find-untranslated.ts --missing       # only missing t() keys
 *   bun scripts/find-untranslated.ts src/GameInterface/Scout
 *   bun scripts/find-untranslated.ts --all           # include dev/debug screens
 *   bun scripts/find-untranslated.ts --json
 *
 * Exit code: 1 if any findings (so it can gate CI), 0 otherwise.
 */

import { Glob } from "bun";

const HARDCODED_ROOTS = ["src/GameInterface", "src/GraficsEngine"];
const KEY_ROOTS = ["src"]; // t() can live anywhere in the source tree
const LOCALES: Record<string, string> = {
  en: "src/i18n/locales/en.json",
  "pt-BR": "src/i18n/locales/pt-BR.json",
};

// Dev-only / debug surfaces that are intentionally not translated.
const EXCLUDE = [
  /\/TestScreen\.tsx$/,
  /\/DebugPanel\.tsx$/,
  /\/lab\//,
  /\.test\.tsx?$/,
];

// User-facing attributes whose literal string value should be translated.
const TEXT_ATTRS = ["title", "placeholder", "aria-label", "alt", "label", "tooltip"];

// Bare tokens that are never translated (brand, separators, etc.).
const ALLOW = new Set(["futsim", "fut", "sim", "fmproject", "vs", "ok"]);

// i18next plural suffixes — `t("k", {count})` resolves to `k_one`/`k_other`/…
const PLURAL_SUFFIXES = ["_zero", "_one", "_two", "_few", "_many", "_other"];

interface Hardcoded { file: string; line: number; kind: string; text: string; }
interface MissingKey { file: string; line: number; key: string; missingIn: string[]; }

/** Replace comments with same-length whitespace so match offsets map to real lines. */
function maskComments(src: string): string {
  let out = "";
  const n = src.length;
  type Mode = "code" | "line" | "block" | "sq" | "dq" | "tpl";
  let mode: Mode = "code";
  for (let i = 0; i < n; i++) {
    const c = src[i]!;
    const c2 = src[i + 1];
    if (mode === "code") {
      if (c === "/" && c2 === "/") { out += "  "; i++; mode = "line"; continue; }
      if (c === "/" && c2 === "*") { out += "  "; i++; mode = "block"; continue; }
      if (c === "'") { mode = "sq"; out += c; continue; }
      if (c === '"') { mode = "dq"; out += c; continue; }
      if (c === "`") { mode = "tpl"; out += c; continue; }
      out += c;
      continue;
    }
    if (mode === "line") {
      if (c === "\n") { mode = "code"; out += c; continue; }
      out += c === "\t" ? "\t" : " ";
      continue;
    }
    if (mode === "block") {
      if (c === "*" && c2 === "/") { out += "  "; i++; mode = "code"; continue; }
      out += c === "\n" ? "\n" : c === "\t" ? "\t" : " ";
      continue;
    }
    // string literal: copy verbatim, respect escapes
    if (c === "\\") { out += c + (c2 ?? ""); i++; continue; }
    out += c;
    if ((mode === "sq" && c === "'") || (mode === "dq" && c === '"') || (mode === "tpl" && c === "`")) {
      mode = "code";
    }
  }
  return out;
}

function lineIndex(src: string): number[] {
  const offsets = [0];
  for (let i = 0; i < src.length; i++) if (src[i] === "\n") offsets.push(i + 1);
  return offsets;
}

function lineAt(offsets: number[], pos: number): number {
  let lo = 0, hi = offsets.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (offsets[mid]! <= pos) lo = mid; else hi = mid - 1;
  }
  return lo + 1;
}

/** Strip JSX `{expr}` segments and decode the handful of entities we use. */
function cleanText(raw: string): string {
  let s = raw;
  for (let i = 0; i < 3; i++) s = s.replace(/\{[^{}]*\}/g, " ");
  s = s.replace(/&nbsp;|&#\d+;|&amp;|&ndash;|&mdash;|&hellip;/g, " ");
  return s.replace(/\s+/g, " ").trim();
}

/** True when the text is code/identifier/className/etc., not prose to translate. */
function looksUntranslatable(text: string): boolean {
  if (!/[A-Za-z]{2,}/.test(text)) return true;          // needs real letters
  if (ALLOW.has(text.toLowerCase())) return true;
  if (/^[a-z][A-Za-z0-9]*$/.test(text)) return true;     // camelCase identifier
  if (/[a-z][a-z0-9]*[A-Z]/.test(text)) return true;     // internal camelCase → identifier
  if (/[/\\@]/.test(text) && !/\s/.test(text)) return true; // path / url / handle
  if (/[(){};=]|=>|&&|\|\||===|!==/.test(text)) return true; // leftover code
  if (/\b(const|let|var|function|return|import|export|interface|extends|implements)\b/.test(text)) return true; // TS keyword
  return false;
}

function scanHardcoded(file: string, src: string): Hardcoded[] {
  const masked = maskComments(src);
  const offsets = lineIndex(masked);
  const ignored = new Set<number>();
  src.split("\n").forEach((ln, i) => { if (ln.includes("i18n-ignore")) ignored.add(i + 1); });

  const found: Hardcoded[] = [];
  const push = (pos: number, kind: string, text: string) => {
    const line = lineAt(offsets, pos);
    if (!ignored.has(line)) found.push({ file, line, kind, text });
  };

  // 1. JSX text nodes: `>` ends a tag, `<` starts the next one.
  const jsxRe = /(?<=[\w"'}\/\-])>([^<]*)<(?=[\/A-Za-z])/g;
  for (const m of masked.matchAll(jsxRe)) {
    const text = cleanText(m[1] ?? "");
    if (text && !looksUntranslatable(text)) push(m.index! + 1, "jsx", text);
  }

  // 2. User-facing attribute string literals.
  const attrRe = new RegExp(`\\b(${TEXT_ATTRS.join("|")})\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "g");
  for (const m of masked.matchAll(attrRe)) {
    const text = (m[2] ?? m[3] ?? "").trim();
    if (text && !looksUntranslatable(text)) push(m.index!, `attr ${m[1]}`, text);
  }

  return found.sort((a, b) => a.line - b.line);
}

/** Collect static t("...") keys (and count dynamic ones we can't resolve). */
function scanKeys(file: string, src: string): { used: { key: string; line: number }[]; dynamic: number } {
  const masked = maskComments(src);
  const offsets = lineIndex(masked);
  const used: { key: string; line: number }[] = [];
  let dynamic = 0;

  // Matches t("key") / t('key') / t(`key`), with optional leading dot (i18n.t).
  const re = /(?<![A-Za-z0-9_$])t\(\s*(["'`])((?:\\.|(?!\1).)*)\1/g;
  for (const m of masked.matchAll(re)) {
    const rawKey = m[2] ?? "";
    if (m[1] === "`" && rawKey.includes("${")) { dynamic++; continue; } // computed at runtime
    if (!rawKey || /[${}]/.test(rawKey)) { dynamic++; continue; }
    const key = rawKey.includes(":") ? rawKey.slice(rawKey.indexOf(":") + 1) : rawKey;
    used.push({ key, line: lineAt(offsets, m.index!) });
  }
  return { used, dynamic };
}

function flatten(obj: unknown, prefix = "", out: Set<string> = new Set()): Set<string> {
  if (obj && typeof obj === "object" && !Array.isArray(obj)) {
    for (const [k, v] of Object.entries(obj)) {
      flatten(v, prefix ? `${prefix}.${k}` : k, out);
    }
  } else if (prefix) {
    out.add(prefix);
  }
  return out;
}

function keyExists(key: string, leaves: Set<string>): boolean {
  if (leaves.has(key)) return true;
  if (PLURAL_SUFFIXES.some((s) => leaves.has(key + s))) return true;
  for (const leaf of leaves) if (leaf.startsWith(key + ".")) return true; // key is an object node
  return false;
}

async function collectFiles(roots: string[], includeAll: boolean, exts: string[]): Promise<string[]> {
  const glob = new Glob(`**/*.{${exts.join(",")}}`);
  const files = new Set<string>();
  for (const root of roots) {
    let exists = true;
    try { await Bun.file(root).exists(); } catch { exists = false; }
    if (!exists) continue;
    for await (const rel of glob.scan({ cwd: root })) {
      const path = `${root}/${rel}`;
      if (includeAll || !EXCLUDE.some((re) => re.test(path))) files.add(path);
    }
  }
  return [...files].sort();
}

async function loadLocales(): Promise<Record<string, Set<string>>> {
  const result: Record<string, Set<string>> = {};
  for (const [name, path] of Object.entries(LOCALES)) {
    try {
      result[name] = flatten(await Bun.file(path).json());
    } catch {
      console.error(`! could not read locale ${name} at ${path}`);
      result[name] = new Set();
    }
  }
  return result;
}

async function main() {
  const argv = process.argv.slice(2);
  const asJson = argv.includes("--json");
  const includeAll = argv.includes("--all");
  const onlyHardcoded = argv.includes("--hardcoded");
  const onlyMissing = argv.includes("--missing");
  const runHardcoded = !onlyMissing;
  const runMissing = !onlyHardcoded;
  const roots = argv.filter((a) => !a.startsWith("--"));

  // ---- HARDCODED ----
  const hardcoded: Hardcoded[] = [];
  let hardcodedScanned = 0;
  if (runHardcoded) {
    const files = await collectFiles(roots.length ? roots : HARDCODED_ROOTS, includeAll, ["tsx"]);
    hardcodedScanned = files.length;
    for (const file of files) hardcoded.push(...scanHardcoded(file, await Bun.file(file).text()));
  }

  // ---- MISSING KEYS ----
  const missing: MissingKey[] = [];
  let dynamicTotal = 0;
  let usedCount = 0;
  if (runMissing) {
    const locales = await loadLocales();
    const localeNames = Object.keys(locales);
    const files = await collectFiles(roots.length ? roots : KEY_ROOTS, includeAll, ["ts", "tsx"]);
    for (const file of files) {
      const { used, dynamic } = scanKeys(file, await Bun.file(file).text());
      dynamicTotal += dynamic;
      usedCount += used.length;
      for (const { key, line } of used) {
        const missingIn = localeNames.filter((n) => !keyExists(key, locales[n]!));
        if (missingIn.length) missing.push({ file, line, key, missingIn });
      }
    }
    missing.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  }

  if (asJson) {
    console.log(JSON.stringify({ hardcoded, missingKeys: missing, dynamicKeys: dynamicTotal }, null, 2));
    process.exit(hardcoded.length + missing.length ? 1 : 0);
  }

  if (runHardcoded) {
    console.log("\n══ HARDCODED TEXT (no t()) ══");
    let lastFile = "";
    for (const f of hardcoded) {
      if (f.file !== lastFile) { console.log(`\n${f.file}`); lastFile = f.file; }
      console.log(`  ${String(f.line).padStart(4)}  ${f.kind.padEnd(16)} ${JSON.stringify(f.text)}`);
    }
    const files = new Set(hardcoded.map((f) => f.file)).size;
    console.log(hardcoded.length
      ? `\n  → ${hardcoded.length} hardcoded string(s) in ${files} file(s) (scanned ${hardcodedScanned}).`
      : `\n  → none (scanned ${hardcodedScanned}).`);
  }

  if (runMissing) {
    console.log("\n══ MISSING t() KEYS (used in code, absent from a locale) ══");
    let lastFile = "";
    for (const m of missing) {
      if (m.file !== lastFile) { console.log(`\n${m.file}`); lastFile = m.file; }
      console.log(`  ${String(m.line).padStart(4)}  missing in ${m.missingIn.join(", ").padEnd(12)} ${JSON.stringify(m.key)}`);
    }
    console.log(missing.length
      ? `\n  → ${missing.length} missing key usage(s) (${usedCount} t() calls checked, ${dynamicTotal} dynamic skipped).`
      : `\n  → none (${usedCount} t() calls checked, ${dynamicTotal} dynamic skipped).`);
  }

  process.exit(hardcoded.length + missing.length ? 1 : 0);
}

await main();
