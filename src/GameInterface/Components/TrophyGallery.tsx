import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import countriesRaw from "@/Data/countries.json";
import { countriesWithTitles, trophyGallery } from "@/Domain/managers/trophyGallery";
import { competitionName, countryDisplayName } from "@/Domain/world/labels";
import { SelectCombobox } from "@/GameInterface/Components/SelectCombobox";
import { TrophyShelf } from "@/GameInterface/Components/TrophyShelf";
import { SectionTitle } from "@/GameInterface/ui/SectionTitle";
import type { ManagerRecord } from "@/types/managerTypes";
import type { LeagueData } from "@/types/playerTypes";
import type { CountryEntry } from "@/types/worldTypes";

const COUNTRY_BY_NAME = new Map(Object.values(countriesRaw as Record<string, CountryEntry>).map((c) => [c.name, c]));

/**
 * Trophy gallery of a country (tester report b920ecec): every division, the national cup and the continental cups,
 * the ones the manager won in colour with the count, the others grey. Opens on the country of his current club,
 * else the one where he won the most.
 */
export function TrophyGallery({ titles, leagues, homeLeague }: {
  titles: ManagerRecord["titles"];
  leagues: LeagueData[];
  homeLeague: string | null;
}) {
  const { t, i18n } = useTranslation();
  const won = useMemo(() => countriesWithTitles(leagues, titles), [leagues, titles]);
  const home = homeLeague ? leagues.find((l) => l.slug === homeLeague)?.country ?? null : null;
  const [picked, setPicked] = useState<string | null>(null);
  const country = picked ?? home ?? won[0] ?? null;

  const options = useMemo(() => {
    const name = (c: string) => {
      const entry = COUNTRY_BY_NAME.get(c);
      return entry ? countryDisplayName(entry, i18n.language, t) : c;
    };
    const all = [...new Set(leagues.map((l) => l.country))];
    const wonSet = new Set(won);
    const rest = all.filter((c) => !wonSet.has(c)).sort((a, b) => name(a).localeCompare(name(b), i18n.language));
    return [
      ...won.map((c) => ({ value: c, label: name(c), group: t("trophyGallery.withTitles") })),
      ...rest.map((c) => ({ value: c, label: name(c), group: t("trophyGallery.others") })),
    ];
  }, [leagues, won, i18n.language, t]);

  if (!country || leagues.length === 0) return null;
  const items = trophyGallery(country, COUNTRY_BY_NAME.get(country)?.continent ?? null, leagues, titles);
  const total = items.reduce((n, it) => n + it.count, 0);

  return (
    <section className="rounded-md border border-border bg-card p-5 flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <SectionTitle>{t("trophyGallery.title")}</SectionTitle>
          <p className="text-sm text-muted-foreground m-0 tabular-nums">{t("trophyGallery.summary", { count: total })}</p>
        </div>
        <SelectCombobox<string> className="w-64" label={t("trophyGallery.country")} value={country} onChange={setPicked} options={options} />
      </div>
      <TrophyShelf
        items={items.map((it) => ({ key: it.slug, kind: it.kind, count: it.count, label: competitionName(it.slug, leagues, i18n.language) }))}
      />
    </section>
  );
}
