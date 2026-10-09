import { countryKey } from "@/Domain/cups/cupIds";
import type { YouthCompAge } from "@/types/youthCompTypes";

/** `u21_` / `u19_` + `countryKey(country)` (same normalisation as the cup). */
export function youthCompSlugOf(country: string, age: YouthCompAge): string {
  return `${age}_${countryKey(country)}`;
}

export function isYouthCompSlug(slug: string): boolean {
  return slug.startsWith("u21_") || slug.startsWith("u19_");
}

export function youthCompAgeOf(slug: string): YouthCompAge | null {
  if (slug.startsWith("u21_")) return "u21";
  if (slug.startsWith("u19_")) return "u19";
  return null;
}
