import { AlertTriangle, CheckCircle2 as CheckCircle } from "lucide-react";
import { useTranslation } from "react-i18next";

interface DevelopmentWarningsProps {
  /** Stable warning codes; translated via `warnings.development.<code>`. */
  warnings: string[];
}

const KNOWN_CODES = new Set(["ageDecline", "reduceLoad", "lowMorale", "poorFitness", "noMatchTime"]);

export function DevelopmentWarnings({ warnings }: DevelopmentWarningsProps) {
  const { t } = useTranslation();

  if (warnings.length === 0) {
    return (
      <div className="card-arcade rounded-xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <CheckCircle className="w-5 h-5 text-green-400" />
          <h3 className="text-lg font-bold font-display uppercase tracking-wider m-0">
            {t("development.statusTitle")}
          </h3>
        </div>
        <div className="bg-background/50 border border-border/30 rounded-lg p-4">
          <p className="text-green-400 font-medium m-0">{t("development.noConcerns")}</p>
          <p className="text-sm text-muted-foreground mt-1 m-0">{t("development.progressingExpected")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card-arcade rounded-xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="w-5 h-5 text-yellow-400" />
        <h3 className="text-lg font-bold font-display uppercase tracking-wider m-0">
          {t("development.warningsTitle")}
        </h3>
      </div>
      <div className="space-y-2">
        {warnings.map((warning, idx) => {
          const text = KNOWN_CODES.has(warning) ? t(`warnings.development.${warning}`) : warning;
          return (
            <div
              key={idx}
              className="bg-background/50 border border-border/30 rounded-lg p-3 flex items-start gap-3"
            >
              <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
              <p className="text-sm text-foreground font-medium m-0">{text}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
