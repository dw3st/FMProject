import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "@/i18n/locales/en.json";
import ptBR from "@/i18n/locales/pt-BR.json";

export type SupportedLanguage = "en" | "pt-BR";

export const SUPPORTED_LANGUAGES: { code: SupportedLanguage; label: string; flag: string }[] = [
  { code: "en", label: "English", flag: "gb" },
  { code: "pt-BR", label: "Português (Brasil)", flag: "br" },
];

const STORAGE_KEY = "touchlines:lang";

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
    resources: {
      en: { translation: en },
      "pt-BR": { translation: ptBR },
    },
    lng: getStoredLanguage(),
    fallbackLng: "en",
    interpolation: { escapeValue: false },
    returnNull: false,
  });
  return i18n;
}

export default i18n;
