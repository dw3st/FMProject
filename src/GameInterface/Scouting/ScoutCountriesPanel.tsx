import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { WorldMap } from "@/GameInterface/NewGame/WorldMap";
import { Flag } from "@/GameInterface/Components/Flag";
import { SectionTitle } from "@/GameInterface/ui/SectionTitle";
import { KnowledgeBar } from "@/GameInterface/Scouting/KnowledgeBar";
import { countryDisplayName } from "@/Domain/world/labels";
import { getScoutCountries, type ScoutCountriesData, type ScoutCountryView } from "@/GameInterface/Scouting/scoutingApi";
import type { CountryEntry } from "@/types/worldTypes";

const BAND_FILL: Record<ScoutCountryView["band"], string> = {
  full: "fill-primary",
  moderate: "fill-primary/45",
  none: "fill-secondary",
};
const BAND_SWATCH: Record<ScoutCountryView["band"], string> = {
  full: "bg-primary",
  moderate: "bg-primary/45",
  none: "bg-secondary",
};

const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

const asEntry = (c: ScoutCountryView): CountryEntry => ({
  slug: c.slug, name: c.name, flag: c.flag, iso2: c.iso2, playable: true, headline: "",
});

/**
 * What a scout knows of every country (`.claude/rules/game/scouting.md` → "Conhecimento por país"):
 * the new-game world map coloured by band (from `xl`) and the list of the countries he knows.
 */
export function ScoutCountriesPanel({ saveId, memberId }: { saveId: string; memberId: string }) {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState<ScoutCountriesData | null>(null);
  const [error, setError] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setData(null);
    setError(false);
    getScoutCountries(saveId, memberId)
      .then((d) => { if (alive) setData(d); })
      .catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, [saveId, memberId]);

  const bySlug = useMemo(() => new Map((data?.countries ?? []).map((c) => [c.slug, c])), [data]);
  const name = (c: ScoutCountryView | CountryEntry) => countryDisplayName(asEntryOf(c), i18n.language, t);
  const known = useMemo(
    () => (data?.countries ?? []).filter((c) => c.k > 0).sort((a, b) => b.k - a.k || a.name.localeCompare(b.name)),
    [data],
  );

  if (error) return <p className="text-sm text-muted-foreground m-0">{t("warnings.errors.loadFailed")}</p>;
  if (!data) return <p className="text-sm text-muted-foreground m-0">{t("common.loading")}</p>;
  const native = data.countries.find((c) => c.native);

  return (
    <div className="flex flex-col gap-3">
      <SectionTitle>{t("scoutCountries.title")}</SectionTitle>
      <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
        {(["full", "moderate", "none"] as const).map((band) => (
          <span key={band} className="inline-flex items-center gap-2">
            <span className={`inline-block w-3 h-3 rounded-sm ${BAND_SWATCH[band]}`} aria-hidden />
            {t(`scoutCountries.legend.${band}`)}
          </span>
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="hidden xl:block">
          <WorldMap
            countries={data.countries.map(asEntry)}
            selectedSlug={null}
            hoveredSlug={hovered}
            onHover={(c) => setHovered(c?.slug ?? null)}
            displayName={name}
            fillClassFor={(c) => BAND_FILL[bySlug.get(c.slug)?.band ?? "none"]}
            captionFor={(c) => `${name(c)} · ${bySlug.get(c.slug)?.k ?? 0}`}
            hint={t("scoutCountries.hint")}
            outlinedSlug={native?.slug ?? null}
          />
        </div>
        <ul className="m-0 p-0 list-none flex flex-col divide-y divide-border/50 max-h-96 overflow-y-auto pr-1">
          {known.map((c) => (
            <li
              key={c.slug}
              className={`flex items-center gap-3 py-2 ${hovered === c.slug ? "bg-secondary/30" : ""}`}
              onMouseEnter={() => setHovered(c.slug)}
              onMouseLeave={() => setHovered(null)}
            >
              <Flag code={c.flag} />
              <div className="min-w-0 flex-1">
                <span className="block text-sm font-semibold truncate">{name(c)}</span>
                {(c.native || c.last) && (
                  <span className="block text-sm text-muted-foreground truncate">
                    {c.native ? t("scoutCountries.native") : t("scoutCountries.lastMission", { date: dmy(c.last!) })}
                  </span>
                )}
              </div>
              <KnowledgeBar value={c.k} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function asEntryOf(c: ScoutCountryView | CountryEntry): CountryEntry {
  return "band" in c ? asEntry(c) : c;
}
