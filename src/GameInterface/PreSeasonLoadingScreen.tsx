import { useTranslation } from "react-i18next";
import { Icon } from "@/GameInterface/Icons";
import { Wordmark } from "@/GameInterface/Components/Wordmark";

/**
 * Full-screen loader shown after a save is created while the early-starting
 * leagues are caught up (their fixtures are simulated before the player's
 * season begins). Presentational only — the caller drives the async work.
 */
export function PreSeasonLoadingScreen() {
  const { t } = useTranslation();
  return (
    <div className="fixed inset-0 z-[200] bg-background flex flex-col items-center justify-center px-6 text-center">
      <Wordmark size="lg" className="mb-10" />
      <Icon name="loader2" size={32} className="text-primary animate-spin mb-6" />
      <h1 className="font-display font-black uppercase tracking-tight text-3xl md:text-4xl leading-none text-foreground mb-3">
        {t("newGame.preparingTitle")}
      </h1>
      <p className="text-sm text-muted-foreground max-w-md">
        {t("newGame.preparingSubtitle")}
      </p>
    </div>
  );
}
