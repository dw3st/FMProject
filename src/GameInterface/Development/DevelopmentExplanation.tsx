import { useTranslation } from "react-i18next";
import { Icon } from "@/GameInterface/Icons";

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
    <div className="card-arcade rounded-md p-5">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Icon name="message-square" className="w-5 h-5 text-primary" />
          <h3 className="font-display font-black uppercase text-xl leading-none m-0">
            {t("development.summaryTitle")}
          </h3>
        </div>
        <p className="text-foreground/90 leading-relaxed bg-background/30 rounded-lg p-4 border border-border/30 m-0">
          {explanation}
        </p>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-3">
          <Icon name="target" className="w-5 h-5 text-primary" />
          <h3 className="font-display font-black uppercase text-xl leading-none m-0">
            {t("development.roleFocusTitle")}
          </h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-background/50 border border-border/30 rounded-lg p-3">
            <p className="text-[13px] text-primary uppercase tracking-[0.08em] font-bold mb-2 m-0 font-display">{t("development.roleFocusPrimary")}</p>
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
            <p className="text-[13px] text-chart-3 uppercase tracking-[0.08em] font-bold mb-2 m-0 font-display">{t("development.roleFocusSecondary")}</p>
            <div className="flex flex-wrap gap-1.5">
              {roleFocus.secondary.map((attr) => (
                <span
                  key={attr}
                  className="text-sm px-2 py-1 rounded border border-chart-3/40 text-chart-3 font-medium bg-transparent"
                >
                  {attr}
                </span>
              ))}
            </div>
          </div>

          <div className="bg-background/50 border border-border/30 rounded-lg p-3">
            <p className="text-[13px] text-muted-foreground uppercase tracking-[0.08em] font-bold mb-2 m-0 font-display">{t("development.roleFocusLimited")}</p>
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
