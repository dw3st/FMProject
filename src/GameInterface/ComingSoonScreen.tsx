import { useTranslation } from "react-i18next";
import { PageHeadline } from "@/GameInterface/Components/PageHeadline";
import { Icon } from "@/GameInterface/Icons";
import { ScreenContainer } from "@/GameInterface/ui/ScreenContainer";

const getPageMeta = (t: any): Record<string, { title: string; description: string }> => ({
  tactics:   { title: t("comingSoon.tactics"), description: t("comingSoon.tacticsDesc") },
  formation: { title: t("comingSoon.formation"), description: t("comingSoon.formationDesc") },
  finances:  { title: t("comingSoon.finances"), description: t("comingSoon.financesDesc") },
  stats:     { title: t("comingSoon.stats"), description: t("comingSoon.statsDesc") },
});

export function ComingSoonScreen() {
  const { t } = useTranslation();
  const PAGE_META = getPageMeta(t);
  const slug = window.location.pathname.replace("/", "") || "unknown";
  const meta = PAGE_META[slug] ?? { title: slug.charAt(0).toUpperCase() + slug.slice(1), description: t("comingSoon.underDevelopment") };

  return (
    <ScreenContainer>
        <PageHeadline backHref="/dashboard" backLabel="Back to Dashboard" accent={t("screenTitles.comingSoon.accent")}>
          {meta.title}
        </PageHeadline>

        <div className="relative flex justify-center w-full">
          <div className="relative inline-flex items-center justify-center">
          <div className="absolute w-32 h-32 rounded-full bg-primary/10 animate-pulse" />
          <div className="relative w-24 h-24 rounded-md card-arcade flex items-center justify-center">
            <Icon name="construction" className="w-10 h-10 text-primary" />
          </div>
          </div>
        </div>

        <div className="text-center space-y-3">
          <p className="text-sm text-muted-foreground leading-relaxed m-0">
            {meta.description}
          </p>
        </div>

        <div className="card-arcade rounded-md p-6 space-y-4 text-center">
          <p className="text-lg font-bold text-primary uppercase tracking-[0.08em] m-0 font-display">
            {t("comingSoon.comingSoon")}
          </p>
          <p className="text-sm text-muted-foreground m-0">
            {t("comingSoon.stillBeingBuilt")}
          </p>
          <div className="flex justify-center gap-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-2.5 h-2.5 rounded-full bg-primary/60"
                style={{
                  animation: `pulse 1.5s ease-in-out ${i * 0.3}s infinite`,
                }}
              />
            ))}
          </div>
        </div>
    </ScreenContainer>
  );
}
