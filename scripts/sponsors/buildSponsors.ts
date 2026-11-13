/**
 * Builds the invented sponsor catalog: `bun scripts/sponsors/buildSponsors.ts [--review <file.txt>]`.
 * Reads the hand-written catalog (`catalog.ts`), checks every rule (blocklist of real brands, unique
 * names, name length, sectors, minimums per country, size shares), gives each company a stable id and
 * a deterministic colour pair, and writes `src/example_data/sponsors.json`. No `Math.random`.
 * `--review` also writes the plain-text list for the product owner (Portuguese).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mulberry32, seedFrom } from "@/Domain/rng";
import { BRAND_BLOCKLIST } from "@/../scripts/sponsors/blocklist";
import { COUNTRY_SPONSORS, GLOBAL_SPONSORS } from "@/../scripts/sponsors/catalog";
import {
  SECTOR_LABEL_PT,
  SIZE_LABEL_PT,
  SPONSOR_SECTORS,
  type SponsorEntry,
  type SponsorSector,
  type SponsorSize,
} from "@/../scripts/sponsors/sectors";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const SPONSORS_FILE = join(ROOT, "src", "example_data", "sponsors.json");
export const LEAGUE_DATA_FILE = join(ROOT, "src", "example_data", "leagueData.json");

export const SPONSOR_RULES = {
  NAME_MAX: 22,
  MIN_TOTAL: 900,
  MAX_TOTAL: 1100,
  MIN_LOCAL_PER_COUNTRY: 6,
  MIN_NATIONAL_PER_COUNTRY: 3,
  SHARE: { local: 0.64, national: 0.3, global: 0.06 } as Record<SponsorSize, number>,
  SHARE_TOLERANCE: 0.05,
  FUNNY_MIN: 0.08,
  FUNNY_MAX: 0.16,
  MIN_CONTRAST: 4.5,
} as const;

/** `[background, text]` pairs, every one with a WCAG contrast of 4.5 or more (checked by the build). */
export const SPONSOR_PALETTE: readonly [string, string][] = [
  ["#0B3D91", "#FFFFFF"], ["#B71C1C", "#FFFFFF"], ["#1B5E20", "#FFFFFF"], ["#111111", "#FFD400"],
  ["#FFD400", "#111111"], ["#4A148C", "#FFFFFF"], ["#FF6D00", "#111111"], ["#006064", "#FFFFFF"],
  ["#FFFFFF", "#0B3D91"], ["#FFFFFF", "#B71C1C"], ["#F5F5F5", "#1B5E20"], ["#263238", "#80DEEA"],
  ["#3E2723", "#FFE0B2"], ["#880E4F", "#FFFFFF"], ["#01579B", "#FFEB3B"], ["#33691E", "#FFF9C4"],
  ["#000000", "#FFFFFF"], ["#FFFFFF", "#000000"], ["#1A237E", "#FFC107"], ["#C62828", "#FFEB3B"],
  ["#00695C", "#FFFFFF"], ["#F9A825", "#1A237E"], ["#212121", "#FF8A65"], ["#ECEFF1", "#4A148C"],
  ["#004D40", "#A7FFEB"], ["#311B92", "#FFD180"], ["#BF360C", "#FFFFFF"], ["#FFF3E0", "#BF360C"],
  ["#0D47A1", "#B3E5FC"], ["#37474F", "#FFFFFF"], ["#E8F5E9", "#1B5E20"], ["#FCE4EC", "#880E4F"],
];

const SPECIAL_LETTERS: Record<string, string> = {
  ł: "l", ø: "o", đ: "d", ı: "i", ß: "ss", æ: "ae", þ: "th", ð: "d", œ: "oe", ħ: "h",
};

/** Lower case, no accents, anything that is not a letter or a digit becomes one space. */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[łøđıßæþðœħ]/g, c => SPECIAL_LETTERS[c] ?? c)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** The blocklisted brand the name contains as a whole word or phrase, or null. */
export function blockedBrandIn(name: string): string | null {
  const padded = ` ${normalizeName(name)} `;
  for (const brand of BRAND_BLOCKLIST) {
    if (padded.includes(` ${normalizeName(brand)} `)) return brand;
  }
  return null;
}

function luminance(hex: string): number {
  const channel = (i: number) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** WCAG contrast ratio of two `#RRGGBB` colours. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function leagueCountries(): string[] {
  const data = JSON.parse(readFileSync(LEAGUE_DATA_FILE, "utf8")) as { country: string }[];
  return [...new Set(data.map(l => l.country))].sort((a, b) => a.localeCompare(b));
}

const SIZE_OF: Record<string, SponsorSize> = { L: "local", N: "national", G: "global" };

interface RawLine {
  size: SponsorSize;
  sector: SponsorSector;
  name: string;
  funny: boolean;
  country?: string;
}

function parseBlock(block: string, country: string | undefined, errors: string[]): RawLine[] {
  const out: RawLine[] = [];
  for (const raw of block.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const m = /^([LNG]) ([a-z_]+) (.+?)( !)?$/.exec(line);
    if (!m) {
      errors.push(`unreadable line: "${line}"`);
      continue;
    }
    const size = SIZE_OF[m[1]!]!;
    const sector = m[2] as SponsorSector;
    if (!SPONSOR_SECTORS.includes(sector)) errors.push(`unknown sector "${m[2]}": "${line}"`);
    if (country === undefined && size !== "global") errors.push(`global block with a ${size} line: "${line}"`);
    if (country !== undefined && size === "global") errors.push(`global line under ${country}: "${line}"`);
    out.push({ size, sector, name: m[3]!.trim(), funny: m[4] !== undefined, country });
  }
  return out;
}

export function buildCatalog(countries: readonly string[]): SponsorEntry[] {
  const errors: string[] = [];
  for (const [bg, text] of SPONSOR_PALETTE) {
    if (contrastRatio(bg, text) < SPONSOR_RULES.MIN_CONTRAST) errors.push(`low contrast pair ${bg} / ${text}`);
  }

  const lines = parseBlock(GLOBAL_SPONSORS, undefined, errors);
  for (const country of Object.keys(COUNTRY_SPONSORS)) {
    if (!countries.includes(country)) errors.push(`country not in leagueData: ${country}`);
  }
  for (const country of countries) {
    const block = COUNTRY_SPONSORS[country];
    if (block === undefined) {
      errors.push(`country without sponsors: ${country}`);
      continue;
    }
    const own = parseBlock(block, country, errors);
    const local = own.filter(l => l.size === "local").length;
    const national = own.filter(l => l.size === "national").length;
    if (local < SPONSOR_RULES.MIN_LOCAL_PER_COUNTRY) errors.push(`${country}: only ${local} local`);
    if (national < SPONSOR_RULES.MIN_NATIONAL_PER_COUNTRY) errors.push(`${country}: only ${national} national`);
    lines.push(...own);
  }

  const seenNames = new Map<string, string>();
  const seenIds = new Set<string>();
  const entries: SponsorEntry[] = [];
  for (const line of lines) {
    const key = normalizeName(line.name);
    if (line.name.length > SPONSOR_RULES.NAME_MAX) errors.push(`name over ${SPONSOR_RULES.NAME_MAX}: "${line.name}" (${line.name.length})`);
    if (/[™®©]/.test(line.name)) errors.push(`trademark symbol: "${line.name}"`);
    const blocked = blockedBrandIn(line.name);
    if (blocked) errors.push(`real brand "${blocked}" in "${line.name}"`);
    const twin = seenNames.get(key);
    if (twin !== undefined) errors.push(`duplicate name: "${line.name}" and "${twin}"`);
    seenNames.set(key, line.name);

    const id = `sp_${key.replace(/ /g, "_")}`;
    if (seenIds.has(id)) errors.push(`duplicate id: ${id}`);
    seenIds.add(id);

    const pick = Math.floor(mulberry32(seedFrom(`sponsor-colors:${id}`))() * SPONSOR_PALETTE.length);
    const [bg, text] = SPONSOR_PALETTE[pick]!;
    const entry: SponsorEntry = { id, name: line.name, sector: line.sector, size: line.size, colors: [bg, text] };
    if (line.country !== undefined) entry.country = line.country;
    if (line.funny) entry.funny = true;
    // key order of the file: id, name, sector, size, country, funny, colors
    entries.push({
      id: entry.id,
      name: entry.name,
      sector: entry.sector,
      size: entry.size,
      ...(entry.country !== undefined ? { country: entry.country } : {}),
      ...(entry.funny ? { funny: true as const } : {}),
      colors: entry.colors,
    });
  }

  const total = entries.length;
  if (total < SPONSOR_RULES.MIN_TOTAL || total > SPONSOR_RULES.MAX_TOTAL) errors.push(`total ${total} out of range`);
  for (const size of ["local", "national", "global"] as const) {
    const share = entries.filter(e => e.size === size).length / Math.max(1, total);
    if (Math.abs(share - SPONSOR_RULES.SHARE[size]) > SPONSOR_RULES.SHARE_TOLERANCE) {
      errors.push(`${size} share ${(share * 100).toFixed(1)}% off target`);
    }
  }
  const funny = entries.filter(e => e.funny).length / Math.max(1, total);
  if (funny < SPONSOR_RULES.FUNNY_MIN || funny > SPONSOR_RULES.FUNNY_MAX) {
    errors.push(`funny share ${(funny * 100).toFixed(1)}% out of range`);
  }

  if (errors.length > 0) throw new Error(`sponsor catalog has ${errors.length} problem(s):\n- ${errors.join("\n- ")}`);
  return entries;
}

function countBy<T>(xs: readonly T[], key: (x: T) => string): [string, number][] {
  const m = new Map<string, number>();
  for (const x of xs) m.set(key(x), (m.get(key(x)) ?? 0) + 1);
  return [...m.entries()];
}

export function reviewText(entries: readonly SponsorEntry[]): string {
  const out: string[] = [];
  const line = (e: SponsorEntry) =>
    `${e.name} — ${SECTOR_LABEL_PT[e.sector]} — ${SIZE_LABEL_PT[e.size]}${e.funny ? " — [engraçada]" : ""}`;
  const funny = entries.filter(e => e.funny).length;
  out.push("PATROCINADORES INVENTADOS — LISTA PARA REVISÃO");
  out.push("");
  out.push(`Total: ${entries.length} empresas`);
  out.push(`Engraçadas: ${funny} (${((funny / entries.length) * 100).toFixed(1)}%)`);
  out.push("");
  out.push("POR TAMANHO");
  for (const size of ["global", "national", "local"] as const) {
    const n = entries.filter(e => e.size === size).length;
    out.push(`  ${SIZE_LABEL_PT[size]}: ${n} (${((n / entries.length) * 100).toFixed(1)}%)`);
  }
  out.push("");
  out.push("POR RAMO");
  for (const [sector, n] of countBy(entries, e => e.sector).sort((a, b) => b[1] - a[1])) {
    out.push(`  ${SECTOR_LABEL_PT[sector as SponsorSector]}: ${n}`);
  }
  out.push("");
  out.push("POR PAÍS (nacionais + locais)");
  const withCountry = entries.filter(e => e.country !== undefined);
  const countries = [...new Set(withCountry.map(e => e.country!))].sort((a, b) => a.localeCompare(b));
  for (const country of countries) {
    const own = withCountry.filter(e => e.country === country);
    const nat = own.filter(e => e.size === "national").length;
    out.push(`  ${country}: ${own.length} (${nat} nacionais, ${own.length - nat} locais)`);
  }
  out.push("");
  out.push("=".repeat(60));
  out.push(`GLOBAIS (${entries.filter(e => e.size === "global").length})`);
  out.push("=".repeat(60));
  for (const e of entries.filter(x => x.size === "global")) out.push(line(e));
  for (const country of countries) {
    const own = withCountry.filter(e => e.country === country);
    out.push("");
    out.push("=".repeat(60));
    out.push(`${country.toUpperCase()} (${own.length})`);
    out.push("=".repeat(60));
    for (const e of own.filter(x => x.size === "national")) out.push(line(e));
    for (const e of own.filter(x => x.size === "local")) out.push(line(e));
  }
  out.push("");
  return out.join("\n");
}

if (import.meta.main) {
  const entries = buildCatalog(leagueCountries());
  writeFileSync(SPONSORS_FILE, `${JSON.stringify(entries, null, 2)}\n`);
  const funny = entries.filter(e => e.funny).length;
  console.log(`sponsors: ${entries.length} -> ${SPONSORS_FILE}`);
  for (const [size, n] of countBy(entries, e => e.size)) {
    console.log(`  ${size}: ${n} (${((n / entries.length) * 100).toFixed(1)}%)`);
  }
  console.log(`  funny: ${funny} (${((funny / entries.length) * 100).toFixed(1)}%)`);
  console.log(`  countries: ${new Set(entries.map(e => e.country).filter(Boolean)).size}`);
  const at = process.argv.indexOf("--review");
  const reviewFile = at >= 0 ? process.argv[at + 1] : undefined;
  if (reviewFile) {
    mkdirSync(dirname(reviewFile), { recursive: true });
    writeFileSync(reviewFile, reviewText(entries), "utf8");
    console.log(`review list -> ${reviewFile}`);
  }
}
