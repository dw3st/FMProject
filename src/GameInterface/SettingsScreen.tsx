import "flag-icons/css/flag-icons.min.css";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { X, Check, LogOut, Home } from "lucide-react";
import { useLanguage } from "@/i18n/LanguageProvider";
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from "@/i18n/i18n";
import { fetchCurrentUser, logout, type CurrentUser } from "@/GameInterface/AuthGate";

interface SettingsOverlayProps {
  open: boolean;
  onClose: () => void;
  /** When provided, shows a "Main Menu" action that returns to the save-selection screen. */
  onExitToMenu?: () => void;
}

export function SettingsOverlay({ open, onClose, onExitToMenu }: SettingsOverlayProps) {
  const { t } = useTranslation();
  const { language, setLanguage } = useLanguage();
  const [user, setUser] = useState<CurrentUser | null>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    fetchCurrentUser().then(setUser);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] bg-background flex flex-col items-center justify-center px-6">
      <button
        type="button"
        onClick={onClose}
        aria-label={t("common.close")}
        className="absolute top-6 right-6 w-10 h-10 rounded-full border border-border bg-card/50 text-muted-foreground hover:text-foreground hover:bg-card transition-colors flex items-center justify-center cursor-pointer"
      >
        <X className="w-5 h-5" />
      </button>

      <div className="w-full max-w-md">
        <h1 className="text-2xl font-black font-display tracking-tight text-foreground text-center mb-2">
          {t("settings.language")}
        </h1>
        <p className="text-sm text-muted-foreground text-center mb-10">
          {t("settings.languageDescription")}
        </p>

        <div className="space-y-3">
          {SUPPORTED_LANGUAGES.map((lang) => (
            <LanguageOption
              key={lang.code}
              code={lang.code}
              label={lang.label}
              flag={lang.flag}
              selected={language === lang.code}
              onSelect={() => setLanguage(lang.code)}
            />
          ))}
        </div>

        {onExitToMenu && (
          <div className="mt-10 pt-6 border-t border-border">
            <button
              type="button"
              onClick={onExitToMenu}
              className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-lg border border-border bg-card/40 text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-card transition-colors cursor-pointer"
            >
              <Home className="w-4 h-4" />
              {t("settings.mainMenu")}
            </button>
            <p className="mt-2 text-xs text-center text-muted-foreground">
              {t("settings.mainMenuDescription")}
            </p>
          </div>
        )}

        {user && (
          <div className="mt-10 pt-6 border-t border-border flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("common.signedInAs")}</div>
              <div className="text-sm font-medium text-foreground truncate">{user.email}</div>
            </div>
            <button
              type="button"
              onClick={() => { void logout(); }}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-card/40 text-sm text-muted-foreground hover:text-foreground hover:bg-card transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              {t("common.signOut")}
            </button>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={onClose}
        className="absolute bottom-10 left-1/2 -translate-x-1/2 px-10 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-bold uppercase tracking-wider glow-primary hover:scale-[1.02] active:scale-[0.98] transition-transform cursor-pointer border-0"
      >
        {t("common.save")}
      </button>
    </div>
  );
}

interface LanguageOptionProps {
  code: SupportedLanguage;
  label: string;
  flag: string;
  selected: boolean;
  onSelect: () => void;
}

function LanguageOption({ label, flag, selected, onSelect }: LanguageOptionProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full flex items-center justify-between gap-3 px-5 py-4 rounded-lg border transition-all text-left cursor-pointer ${
        selected
          ? "border-primary/60 bg-primary/10"
          : "border-border bg-card/40 hover:bg-card hover:border-primary/30"
      }`}
    >
      <div className="flex items-center gap-3">
        <span className={`fi fi-${flag} text-2xl rounded-sm overflow-hidden`} aria-hidden />
        <span className={`text-base font-semibold ${selected ? "text-foreground" : "text-muted-foreground"}`}>
          {label}
        </span>
      </div>
      {selected && <Check className="w-5 h-5 text-primary" />}
    </button>
  );
}
