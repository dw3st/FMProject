import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { GAME_VERSION } from "@/Domain/saveVersion";

export type SupportedLanguage = "en" | "pt-BR";

export const SUPPORTED_LANGUAGES: { code: SupportedLanguage; label: string; flag: string }[] = [
  { code: "en", label: "English", flag: "gb" },
  { code: "pt-BR", label: "Português (Brasil)", flag: "br" },
];

const STORAGE_KEY = "fmproject:lang";

function detectBrowserLanguage(): SupportedLanguage {
  if (typeof navigator === "undefined") return "en";
  const candidates = navigator.languages ?? [navigator.language];
  for (const tag of candidates) {
    const lower = tag.toLowerCase();
    if (lower.startsWith("pt")) return "pt-BR";
    if (lower.startsWith("en")) return "en";
  }
  return "en";
}

export function getStoredLanguage(): SupportedLanguage {
  if (typeof window === "undefined") return "en";
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (saved === "en" || saved === "pt-BR") return saved;
  return detectBrowserLanguage();
}

export function setStoredLanguage(lang: SupportedLanguage) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, lang);
}

let initialized = false;

export function initI18n() {
  if (initialized) return i18n;
  initialized = true;
  i18n.use(initReactI18next).init({
    // The texts come from the server, the active language only (`loadLanguage`, perf audit 4.41.29).
    resources: {},
    partialBundledLanguages: true,
    lng: getStoredLanguage(),
    fallbackLng: "en",
    interpolation: { escapeValue: false },
    returnNull: false,
  });
  return i18n;
}

const loading = new Map<SupportedLanguage, Promise<void>>();

/**
 * Fetches a language's texts once (`/assets/i18n/<version>/<lang>.json`, cached forever by the browser) and adds
 * them to i18next. Resolves even on failure (the keys then show until a reload).
 */
export function loadLanguage(lang: SupportedLanguage): Promise<void> {
  initI18n();
  if (i18n.hasResourceBundle(lang, "translation")) return Promise.resolve();
  let p = loading.get(lang);
  if (!p) {
    p = fetch(`/assets/i18n/${GAME_VERSION}/${lang}.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data) i18n.addResourceBundle(lang, "translation", data, true, true); })
      .catch(() => { loading.delete(lang); });
    loading.set(lang, p);
  }
  return p;
}

/** The page's language before the first render, then English (the fallback) in the background. */
export async function loadInitialLanguages(): Promise<void> {
  const lang = getStoredLanguage();
  await loadLanguage(lang);
  if (lang !== "en") void loadLanguage("en");
}

export default i18n;
