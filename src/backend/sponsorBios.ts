import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * The sponsors' short texts (12.1, `.claude/rules/game/sponsors.md` → "Página do patrocinador"): world data read once
 * per process from `src/Data/sponsorBios.json` (the committed copy in `src/example_data` when the runtime one is
 * missing), shape `{ "<companyId>": { "pt": "...", "en": "..." } }`. No file, or a company without an entry = no bio.
 */
const FILES = ["../Data/sponsorBios.json", "../example_data/sponsorBios.json"].map((p) => fileURLToPath(new URL(p, import.meta.url)));

export type SponsorBios = Record<string, { pt?: string; en?: string }>;

/** The entries of a parsed file that have some text (anything else dropped); empty when it is not an object. */
export function parseSponsorBios(raw: unknown): SponsorBios {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: SponsorBios = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const v = value as Record<string, unknown>;
    const pt = typeof v.pt === "string" && v.pt.trim() ? v.pt.trim() : undefined;
    const en = typeof v.en === "string" && v.en.trim() ? v.en.trim() : undefined;
    if (pt || en) out[id] = { ...(pt ? { pt } : {}), ...(en ? { en } : {}) };
  }
  return out;
}

let bios: SponsorBios | null = null;

export function sponsorBios(): SponsorBios {
  if (bios) return bios;
  for (const file of FILES) {
    try {
      const parsed = parseSponsorBios(JSON.parse(readFileSync(file, "utf8")));
      if (Object.keys(parsed).length > 0) return (bios = parsed);
    } catch { /* next file */ }
  }
  return (bios = {});
}

/** Language of the texts for a `lang` query: Portuguese for `pt-BR` / `pt`, English for anything else. */
export function bioLanguage(lang: string | null | undefined): "pt" | "en" {
  return typeof lang === "string" && lang.toLowerCase().startsWith("pt") ? "pt" : "en";
}

/** The company's text in that language (the other language never stands in); null when it has none. */
export function sponsorBioOf(companyId: string, lang: string | null | undefined, from: SponsorBios = sponsorBios()): string | null {
  return from[companyId]?.[bioLanguage(lang)] ?? null;
}
