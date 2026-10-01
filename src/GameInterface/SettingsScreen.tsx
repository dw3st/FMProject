import "flag-icons/css/flag-icons.min.css";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLanguage } from "@/i18n/LanguageProvider";
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from "@/i18n/i18n";
import { fetchCurrentUser, logout, type CurrentUser } from "@/GameInterface/AuthGate";
import { Icon } from "@/GameInterface/Icons";

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
        className="absolute top-6 right-6 w-10 h-10 bg-transparent border-0 text-muted-foreground hover:text-foreground flex items-center justify-center cursor-pointer"
      >
        <Icon name="close" size={16} />
      </button>

      <div className="w-full max-w-md">
        <h1 className="font-display font-black uppercase tracking-tight text-3xl md:text-4xl leading-none m-0 text-center mb-6">
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
              className="w-full h-10 flex items-center justify-center gap-2 rounded border border-border bg-transparent text-sm font-semibold text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <Icon name="home" size={16} />
              {t("settings.mainMenu")}
            </button>
            <p className="mt-2 text-sm text-center text-muted-foreground">
              {t("settings.mainMenuDescription")}
            </p>
          </div>
        )}

        {user && (
          <div className="mt-10 pt-6 border-t border-border flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[13px] uppercase tracking-[0.08em] text-muted-foreground font-display font-bold">{t("common.signedInAs")}</div>
              <div className="text-sm font-medium text-foreground truncate">{user.email}</div>
            </div>
            <button
              type="button"
              onClick={() => { void logout(); }}
              className="flex items-center gap-2 h-10 px-4 rounded bg-transparent border-0 text-sm text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <Icon name="log-out" size={16} />
              {t("common.signOut")}
            </button>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={onClose}
        className="absolute bottom-10 left-1/2 -translate-x-1/2 h-10 px-5 rounded bg-primary text-primary-foreground text-sm font-semibold cursor-pointer border-0"
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
      className={`w-full flex items-center justify-between gap-3 p-3 rounded-md border text-left cursor-pointer ${
        selected
          ? "border-primary ring-1 ring-primary bg-card"
          : "border-border bg-card hover:border-primary/50"
      }`}
    >
      <div className="flex items-center gap-3">
        <span className={`fi fi-${flag} text-2xl rounded-sm overflow-hidden`} aria-hidden />
        <span className={`text-base font-semibold ${selected ? "text-foreground" : "text-muted-foreground"}`}>
          {label}
        </span>
      </div>
      {selected && <Icon name="check" size={16} className="text-primary" />}
    </button>
  );
}
