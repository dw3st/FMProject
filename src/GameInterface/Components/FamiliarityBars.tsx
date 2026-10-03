import { useTranslation } from "react-i18next";
import { Panel } from "@/GameInterface/ui/Panel";
import { StatBar } from "@/GameInterface/ui/StatBar";
import { FAMILIARITY_KEYS, type FamiliarityKey, type FamiliarityLevels } from "@/types/familiarityTypes";
import { FAMILIARITY } from "@/Domain/familiarity/familiarityConfig";
import type { TacticalStyle } from "@/types/tacticsTypes";

/** Display name of a familiarity key: the style's own label, or the two transversal skills. */
export function familiarityKeyLabel(key: FamiliarityKey, t: (k: string) => string): string {
  return key === "high_line_trap" || key === "long_ball"
    ? t(`familiarity.keys.${key}`)
    : t(`tactics.styles.${key}.label`);
}

/** One bar per familiarity key (0..100); the style in use is highlighted. Dumb component. */
export function FamiliarityBars({
  familiarity,
  current,
}: {
  familiarity: FamiliarityLevels | undefined;
  current: TacticalStyle;
}) {
  const { t } = useTranslation();
  return (
    <Panel bordered title={t("familiarity.title")}>
      <p className="text-sm text-muted-foreground m-0 mb-4">{t("familiarity.hint")}</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">
        {FAMILIARITY_KEYS.map((key) => {
          const value = familiarity?.[key] ?? FAMILIARITY.INITIAL;
          const inUse = key === current;
          return (
            <div key={key} className="flex items-center gap-3">
              <span className={`w-40 sm:w-48 shrink-0 text-sm ${inUse ? "text-primary font-semibold" : "text-foreground"}`}>
                {familiarityKeyLabel(key, t)}
                {inUse && <span className="ml-2 text-muted-foreground font-normal">· {t("familiarity.current")}</span>}
              </span>
              <StatBar className="flex-1" value={value} max={FAMILIARITY.MAX} display={Math.round(value)} />
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
