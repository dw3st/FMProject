import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import i18n, { initI18n, getStoredLanguage, loadLanguage, setStoredLanguage, type SupportedLanguage } from "@/i18n/i18n";

initI18n();

interface LanguageContextValue {
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => void;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<SupportedLanguage>(() => getStoredLanguage());

  useEffect(() => {
    if (i18n.language !== language) {
      void loadLanguage(language).then(() => i18n.changeLanguage(language));
    }
    // #154: the page language follows the player's (screen readers, hyphenation, the browser's translate offer).
    if (typeof document !== "undefined") document.documentElement.lang = language;
  }, [language]);

  const setLanguage = useCallback((lang: SupportedLanguage) => {
    setStoredLanguage(lang);
    void loadLanguage(lang).then(() => {
      setLanguageState(lang);
      void i18n.changeLanguage(lang);
    });
  }, []);

  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used inside <LanguageProvider>");
  return ctx;
}
