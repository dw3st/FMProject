import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";

/**
 * Full-screen loader shown after a save is created while the early-starting
 * leagues are caught up (their fixtures are simulated before the player's
 * season begins). Presentational only — the caller drives the async work.
 */
export function PreSeasonLoadingScreen() {
  const { t } = useTranslation();
  return (
    <div className="fixed inset-0 z-[200] bg-background flex flex-col items-center justify-center px-6 text-center">
      <Loader2 className="w-12 h-12 text-primary animate-spin mb-8" />
      <h1 className="text-2xl md:text-3xl font-black font-display uppercase tracking-tight text-foreground mb-3">
        {t("newGame.preparingTitle")}
      </h1>
      <p className="text-sm text-muted-foreground max-w-md">
        {t("newGame.preparingSubtitle")}
      </p>
    </div>
  );
}
