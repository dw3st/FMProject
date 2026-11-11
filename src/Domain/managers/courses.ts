import { addDays } from "@/Domain/dates";
import { managerNation } from "@/Domain/national/nationalCoach";
import { LANGUAGE_GROUPS, languageOf } from "@/Domain/settling/settling";
import { nationalityFlagCode } from "@/Domain/world/nationalityFlag";
import type { ManagerRecord } from "@/types/managerTypes";

/**
 * Manager languages, coaching licences and the idol pull (9.3, `.claude/rules/game/courses.md`).
 * The manager speaks the language of his nationality; courses are bought with his own money and are
 * finished on their end date (read lazily, nothing runs in the day advance).
 */
export const COURSES = {
  LANGUAGE: { price: 150_000, days: 90 },
  LICENCE: {
    a:   { price: 100_000, days: 60, reputation: 1 },
    pro: { price: 400_000, days: 120, reputation: 2 },
  },
  /** Offers from a country whose language he does not speak weigh this much. */
  FOREIGN_LANGUAGE_WEIGHT: 0.5,
  /** Offers from the country of a club where he was an idol weigh this much. */
  IDOL_WEIGHT: 1.5,
  /** Idol: this many seasons (days) at one club, or a title there. */
  IDOL_DAYS: 4 * 365,
} as const;

export type LicenceKind = keyof typeof COURSES.LICENCE;
export const LICENCE_KINDS = Object.keys(COURSES.LICENCE) as LicenceKind[];

export type CourseKind = "language" | LicenceKind;

export interface ManagerCourse {
  kind: CourseKind;
  /** Language key (`languageOf`) for a language course. */
  language?: string;
  started: string;
  until: string;
}

export interface ManagerStudies {
  /** Languages learned on courses (keys of `languageOf`). */
  languages?: string[];
  licences?: LicenceKind[];
  course?: ManagerCourse;
}

/** Countries of the world data whose language lives under another name. */
const COUNTRY_ALIAS: Record<string, string> = { USA: "England", "United States": "England", Cyprus: "Greece", Fiji: "England" };

/** The language of a country (or nationality) as a course key. */
export function languageKey(country: string | null | undefined): string | null {
  return languageOf(country ? (COUNTRY_ALIAS[country] ?? country) : country);
}

/** BCP 47 code of a course language, for its display name (`Intl.DisplayNames`). */
export const LANGUAGE_CODE: Record<string, string> = {
  english: "en", german: "de", french: "fr", spanish: "es", portuguese: "pt", arabic: "ar", serbocroatian: "sh",
  Italy: "it", Albania: "sq", Armenia: "hy", Bulgaria: "bg", Belarus: "be", "Czech Republic": "cs", Denmark: "da",
  Finland: "fi", Georgia: "ka", Greece: "el", Hungary: "hu", Indonesia: "id", Israel: "he", Iran: "fa", Iceland: "is",
  Japan: "ja", Kazakhstan: "kk", Malta: "mt", Netherlands: "nl", Norway: "nb", Poland: "pl", Russia: "ru", Sweden: "sv",
  Slovenia: "sl", Slovakia: "sk", Turkey: "tr", Ukraine: "uk", Uzbekistan: "uz", Romania: "ro", "South Korea": "ko",
  China: "zh", "China PR": "zh", Estonia: "et", Latvia: "lv", Lithuania: "lt",
};

/** A key a language course can teach: a shared group, or a nation that speaks its own. */
export function isCourseLanguage(key: string): boolean {
  return LANGUAGE_GROUPS.includes(key) || (languageOf(key) === key && nationalityFlagCode(key) !== undefined);
}

/** The languages of a list of countries (the world's leagues), each once, in order. */
export function languagesOfCountries(countries: readonly string[]): string[] {
  const out: string[] = [];
  for (const c of countries) {
    const k = languageKey(c);
    if (k && isCourseLanguage(k) && !out.includes(k)) out.push(k);
  }
  return out;
}

/** The studies with a course that ended on or before `date` moved into what he knows. */
export function settledStudies(s: ManagerStudies | undefined, date: string): ManagerStudies {
  const out: ManagerStudies = { languages: [...(s?.languages ?? [])], licences: [...(s?.licences ?? [])] };
  const c = s?.course;
  if (!c) return out;
  if (c.until > date) return { ...out, course: c };
  if (c.kind === "language" && c.language && !out.languages!.includes(c.language)) out.languages!.push(c.language);
  if (c.kind !== "language" && !out.licences!.includes(c.kind)) out.licences!.push(c.kind);
  return out;
}

/** Every language he speaks today: his nationality's and the finished courses. */
export function spokenLanguages(nationalityIso: string | null | undefined, s: ManagerStudies | undefined, date: string): Set<string> {
  const native = languageKey(managerNation(nationalityIso));
  return new Set([...(native ? [native] : []), ...(settledStudies(s, date).languages ?? [])]);
}

/** Reputation points of the finished licences. */
export function licenceReputation(s: ManagerStudies | undefined, date: string): number {
  return (settledStudies(s, date).licences ?? []).reduce((n, k) => n + COURSES.LICENCE[k].reputation, 0);
}

export function coursePrice(kind: CourseKind): number {
  return kind === "language" ? COURSES.LANGUAGE.price : COURSES.LICENCE[kind].price;
}

export type CourseRefusal = "busy" | "known" | "needsA" | "noMoney" | "invalidCourse";

/** Why a course cannot start today, or null. */
export function courseRefusal(args: {
  kind: CourseKind; language?: string; studies: ManagerStudies | undefined; spoken: Set<string>; date: string; wallet: number;
}): CourseRefusal | null {
  const s = settledStudies(args.studies, args.date);
  if (s.course) return "busy";
  if (args.kind === "language") {
    if (!args.language) return "invalidCourse";
    if (args.spoken.has(args.language)) return "known";
  } else {
    if (s.licences!.includes(args.kind)) return "known";
    if (args.kind === "pro" && !s.licences!.includes("a")) return "needsA";
  }
  return args.wallet < coursePrice(args.kind) ? "noMoney" : null;
}

/** The studies with the course started today. */
export function startCourse(studies: ManagerStudies | undefined, kind: CourseKind, date: string, language?: string): ManagerStudies {
  const days = kind === "language" ? COURSES.LANGUAGE.days : COURSES.LICENCE[kind].days;
  const s = settledStudies(studies, date);
  return { ...s, course: { kind, ...(kind === "language" && language ? { language } : {}), started: date, until: addDays(date, days) } };
}

/** Clubs where the manager was an idol: `IDOL_DAYS` there, or a title credited during the passage. */
export function idolClubs(record: Pick<ManagerRecord, "clubs" | "titles"> | undefined, date: string): Set<string> {
  const out = new Set<string>();
  for (const p of record?.clubs ?? []) {
    const end = p.to ?? date;
    const days = (Date.parse(end) - Date.parse(p.from)) / 86_400_000;
    const titled = (record?.titles ?? []).some((t) => t.kind !== "promotion" && t.squadId === p.squadId && (!t.on || (t.on >= p.from && t.on <= end)));
    if (days >= COURSES.IDOL_DAYS || titled) out.add(p.squadId);
  }
  return out;
}

/** Offer weight of a club's country for this manager: language and idol pull. */
export function countryOfferWeight(country: string | null, spoken: Set<string>, idolCountries: Set<string>): number {
  if (!country) return 1;
  const lang = languageKey(country);
  const w = lang && !spoken.has(lang) ? COURSES.FOREIGN_LANGUAGE_WEIGHT : 1;
  return w * (idolCountries.has(country) ? COURSES.IDOL_WEIGHT : 1);
}
