import { useTranslation } from "react-i18next";
import type { PlayerAvailability } from "@/types/scoutingTypes";

const TONE: Record<keyof PlayerAvailability, string> = {
  sale: "border-primary/50 text-primary",
  loan: "border-chart-2/50 text-chart-2",
  preContract: "border-chart-4/50 text-chart-4",
  free: "border-star-green/50 text-star-green",
};
const ORDER: (keyof PlayerAvailability)[] = ["free", "sale", "loan", "preContract"];

/** What can be tried with a player today (tester report, 9.8): small labels under his name. */
export function AvailabilityChips({ value, inline = false }: { value: PlayerAvailability | undefined; inline?: boolean }) {
  const { t } = useTranslation();
  const keys = ORDER.filter((k) => value?.[k]);
  if (keys.length === 0) return null;
  return (
    <span className={inline ? "flex shrink-0 gap-1" : "flex flex-wrap gap-1 mt-1"}>
      {keys.map((k) => (
        <span key={k} title={t(`scout.availability.${k}Hint`)} className={`rounded border px-1.5 py-0.5 text-sm font-semibold leading-none ${TONE[k]}`}>
          {t(`scout.availability.${k}`)}
        </span>
      ))}
    </span>
  );
}
