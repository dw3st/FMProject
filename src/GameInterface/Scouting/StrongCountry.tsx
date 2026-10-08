import { useTranslation } from "react-i18next";
import { Flag } from "@/GameInterface/Components/Flag";
import { nationalityFlagCode } from "@/Domain/world/nationalityFlag";
import { nationalityDisplayName } from "@/Domain/world/labels";

/** A scout's strongest country: flag, name and the knowledge ("England · 90"). */
export function StrongCountry({ country, k }: { country: string; k: number }) {
  const { t, i18n } = useTranslation();
  const name = nationalityDisplayName(country, i18n.language, t);
  return (
    <span className="inline-flex items-center gap-2 text-sm tabular-nums min-w-0" title={t("scoutCountries.strongTitle", { country: name, k })}>
      <Flag code={nationalityFlagCode(country) ?? ""} />
      <span className="truncate">{name} · {k}</span>
    </span>
  );
}
