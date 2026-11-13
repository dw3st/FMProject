import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { SponsorCompany, SponsorSize } from "@/types/sponsorTypes";

/**
 * The sponsors' catalog (`.claude/rules/game/sponsors.md`): invented companies, world data read once per process from
 * `src/Data/sponsors.json` (the committed copy in `src/example_data` when the runtime one is missing). No file at all
 * (tests, an old checkout) = a short built-in list, so a club always gets offers.
 */
const FILES = ["../Data/sponsors.json", "../example_data/sponsors.json"].map((p) => fileURLToPath(new URL(p, import.meta.url)));

const SIZES: readonly SponsorSize[] = ["local", "national", "global"];
const HEX = /^#[0-9a-fA-F]{6}$/;

/** Generic invented companies: `national` without a country fits a club of any country. */
const BUILT_IN: SponsorCompany[] = ([
  ["nortia", "Nortia", "bank", "global", "#12355b", "#ffffff"],
  ["veltro", "Veltro", "airline", "global", "#b3261e", "#ffffff"],
  ["kandor", "Kandor", "technology", "global", "#111827", "#f9fafb"],
  ["solvane", "Solvane", "energy", "global", "#0f766e", "#ffffff"],
  ["brisal", "Brisal", "drinks", "national", "#f59e0b", "#1f2937"],
  ["monteva", "Monteva", "insurance", "national", "#1d4ed8", "#ffffff"],
  ["quorra", "Quorra", "telecom", "national", "#7c3aed", "#ffffff"],
  ["altamar", "Altamar", "retail", "national", "#dc2626", "#fff7ed"],
  ["ferrovia", "Ferrovia Sul", "logistics", "national", "#374151", "#fbbf24"],
  ["lumio", "Lumio", "electronics", "national", "#0ea5e9", "#0b1220"],
  ["pradoverde", "Prado Verde", "food", "national", "#15803d", "#ffffff"],
  ["tecnoval", "Tecnoval", "construction", "national", "#92400e", "#fef3c7"],
  ["casabela", "Casa Bela", "furniture", "national", "#be185d", "#ffffff"],
  ["rotamax", "Rotamax", "cars", "national", "#0f172a", "#e2e8f0"],
  ["vivafit", "Vivafit", "health", "national", "#059669", "#ecfdf5"],
  ["ouronegro", "Ouro Negro Cafés", "food", "national", "#3f2a1d", "#fde68a"],
] as const).map(([id, name, sector, size, bg, fg]) => ({ id: `builtin_${id}`, name, sector, size, colors: [bg, fg] }));

function parseCompany(raw: unknown): SponsorCompany | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  if (typeof c.id !== "string" || !c.id || typeof c.name !== "string" || !c.name.trim()) return null;
  if (!SIZES.includes(c.size as SponsorSize)) return null;
  const colors = Array.isArray(c.colors) && c.colors.length === 2 && c.colors.every((x) => typeof x === "string" && HEX.test(x))
    ? [c.colors[0] as string, c.colors[1] as string] as [string, string]
    : ["#1f2937", "#ffffff"] as [string, string];
  return {
    id: c.id, name: c.name, sector: typeof c.sector === "string" ? c.sector : "", size: c.size as SponsorSize, colors,
    ...(typeof c.country === "string" && c.country ? { country: c.country } : {}),
    ...(c.funny === true ? { funny: true as const } : {}),
  };
}

/** The companies of a parsed file (bad entries and repeated ids dropped); empty when it is not a list. */
export function parseSponsorCatalog(raw: unknown): SponsorCompany[] {
  const list = Array.isArray(raw) ? raw : Array.isArray((raw as { companies?: unknown } | null)?.companies) ? (raw as { companies: unknown[] }).companies : [];
  const seen = new Set<string>();
  const out: SponsorCompany[] = [];
  for (const item of list) {
    const c = parseCompany(item);
    if (!c || seen.has(c.id)) continue;
    seen.add(c.id);
    out.push(c);
  }
  return out;
}

let catalog: SponsorCompany[] | null = null;

export function sponsorCatalog(): readonly SponsorCompany[] {
  if (catalog) return catalog;
  for (const file of FILES) {
    try {
      const parsed = parseSponsorCatalog(JSON.parse(readFileSync(file, "utf8")));
      if (parsed.length > 0) return (catalog = parsed);
    } catch { /* next file */ }
  }
  return (catalog = BUILT_IN);
}

/** The built-in list (tests). */
export function builtInSponsorCatalog(): readonly SponsorCompany[] {
  return BUILT_IN;
}
