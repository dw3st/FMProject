import { useTranslation } from "react-i18next";
import { MessageSquare, Target } from "lucide-react";

interface RoleFocus {
  primary: string[];
  secondary: string[];
  limited: string[];
}

interface DevelopmentExplanationProps {
  explanation: string;
  roleFocus: RoleFocus;
}

export function DevelopmentExplanation({ explanation, roleFocus }: DevelopmentExplanationProps) {
  const { t } = useTranslation();
  return (
    <div className="card-arcade rounded-xl p-5">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <MessageSquare className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-bold font-display uppercase tracking-wider m-0">
            {t("development.summaryTitle")}
          </h3>
        </div>
        <p className="text-foreground/90 leading-relaxed bg-background/30 rounded-lg p-4 border border-border/30 m-0">
          {explanation}
        </p>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-3">
          <Target className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-bold font-display uppercase tracking-wider m-0">
            {t("development.roleFocusTitle")}
          </h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-background/50 border border-border/30 rounded-lg p-3">
            <p className="text-xs text-primary uppercase tracking-wider font-bold mb-2 m-0">{t("development.roleFocusPrimary")}</p>
            <div className="flex flex-wrap gap-1.5">
              {roleFocus.primary.map((attr) => (
                <span
                  key={attr}
                  className="text-sm px-2 py-1 rounded border border-primary/40 text-primary font-medium bg-transparent"
                >
                  {attr}
                </span>
              ))}
            </div>
          </div>

          <div className="bg-background/50 border border-border/30 rounded-lg p-3">
            <p className="text-xs text-blue-400 uppercase tracking-wider font-bold mb-2 m-0">{t("development.roleFocusSecondary")}</p>
            <div className="flex flex-wrap gap-1.5">
              {roleFocus.secondary.map((attr) => (
                <span
                  key={attr}
                  className="text-sm px-2 py-1 rounded border border-blue-400/40 text-blue-400 font-medium bg-transparent"
                >
                  {attr}
                </span>
              ))}
            </div>
          </div>

          <div className="bg-background/50 border border-border/30 rounded-lg p-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-bold mb-2 m-0">{t("development.roleFocusLimited")}</p>
            <div className="flex flex-wrap gap-1.5">
              {roleFocus.limited.length === 0 ? (
                <span className="text-sm text-muted-foreground">—</span>
              ) : (
                roleFocus.limited.map((attr) => (
                  <span
                    key={attr}
                    className="text-sm px-2 py-1 rounded border border-border/50 text-muted-foreground font-medium bg-transparent"
                  >
                    {attr}
                  </span>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
