import { Fragment, useMemo, useRef, useState } from "react";
import { Combobox, ComboboxInput, ComboboxOption, ComboboxOptions } from "@headlessui/react";
import { useTranslation } from "react-i18next";
import countriesRaw from "@/Data/countries.json";
import { ClubLogo, squadLogoUrl } from "@/GameInterface/Components/ClubLogo";
import { Flag } from "@/GameInterface/Components/Flag";
import { formSelectBoxClass } from "@/GameInterface/Components/SelectListbox";
import { Icon } from "@/GameInterface/Icons";
import { searchClubs, type ClubEntry } from "@/Domain/world/clubSearch";
import { competitionName, countryDisplayName } from "@/Domain/world/labels";
import type { LeagueData } from "@/types/playerTypes";
import type { CountryEntry } from "@/types/worldTypes";

const COUNTRY_BY_NAME = new Map(Object.values(countriesRaw as Record<string, CountryEntry>).map((c) => [c.name, c]));

/**
 * "Search team" field of the Leagues screen: the clubs of the open league's country when empty, the whole world when
 * typing, grouped by country. The club list is only fetched when the field gets the focus.
 */
export function ClubSearch({ saveId, leagues, homeCountry, onPick, className }: {
  saveId: string;
  leagues: LeagueData[];
  homeCountry: string;
  onPick: (club: ClubEntry) => void;
  className?: string;
}) {
  const { t, i18n } = useTranslation();
  const [query, setQuery] = useState("");
  const [clubs, setClubs] = useState<ClubEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const requested = useRef(false);

  function load() {
    if (requested.current) return;
    requested.current = true;
    setFailed(false);
    fetch(`/api/saves/${saveId}/clubs`)
      .then((r) => (r.ok ? (r.json() as Promise<{ clubs: ClubEntry[] }>) : Promise.reject(new Error(String(r.status)))))
      .then((d) => setClubs(d.clubs))
      .catch(() => { requested.current = false; setFailed(true); });
  }

  const groups = useMemo(() => {
    const countryOf = new Map(leagues.map((l) => [l.slug, l.country ?? ""]));
    return searchClubs(clubs ?? [], query, homeCountry, (league) => countryOf.get(league) ?? "");
  }, [clubs, query, homeCountry, leagues]);

  const countryLabel = (name: string) => {
    const entry = COUNTRY_BY_NAME.get(name);
    return entry ? countryDisplayName(entry, i18n.language, (k, o) => t(k, o)) : name;
  };

  return (
    <div className={className}>
      <span id="league-club-search" className="block text-[13px] text-muted-foreground mb-2 font-bold uppercase tracking-[0.08em] font-display">
        {t("leagues.clubSearch.label")}
      </span>
      <Combobox<ClubEntry | null>
        value={null}
        immediate
        onChange={(club) => {
          if (!club) return;
          setQuery("");
          onPick(club);
        }}
        onClose={() => setQuery("")}
      >
        <div className="relative">
          <div className={`flex items-center gap-2 ${formSelectBoxClass} cursor-text pl-2.5`}>
            <Icon name="search" className="w-4 h-4 text-primary shrink-0" aria-hidden />
            <ComboboxInput<ClubEntry | null>
              aria-labelledby="league-club-search"
              className="flex-1 min-w-0 bg-transparent border-0 p-0 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-0"
              displayValue={() => query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={load}
              placeholder={t("leagues.clubSearch.placeholder")}
              autoComplete="off"
            />
          </div>
          <ComboboxOptions className="absolute z-50 mt-1 w-full max-h-80 overflow-auto rounded-lg bg-card border border-border py-1 text-sm focus:outline-none empty:invisible">
            {groups.length === 0 && (
              <div className="px-3 py-2.5 text-sm text-muted-foreground text-center">
                {failed ? t("warnings.errors.loadFailed") : clubs === null ? t("common.loading") : t("leagues.clubSearch.none")}
              </div>
            )}
            {groups.map((group) => {
              const entry = COUNTRY_BY_NAME.get(group.country);
              return (
                <Fragment key={group.country}>
                  <div className="flex items-center gap-2 px-3 pt-3 pb-1 font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground">
                    {entry?.iso2 && <Flag code={entry.iso2} />}
                    <span className="truncate">{countryLabel(group.country)}</span>
                  </div>
                  {group.clubs.map((club) => (
                    <ComboboxOption
                      key={club.id}
                      value={club}
                      className="flex items-center gap-2.5 px-3 py-1.5 cursor-pointer transition-colors data-[focus]:bg-primary/10"
                    >
                      <ClubLogo logoUrl={squadLogoUrl(club.id)} className="w-8 h-8 shrink-0" imgClassName="w-full h-full object-contain" />
                      <span className="font-semibold text-foreground truncate">{club.name}</span>
                      <span className="ml-auto text-muted-foreground truncate">{competitionName(club.league, leagues, i18n.language)}</span>
                    </ComboboxOption>
                  ))}
                </Fragment>
              );
            })}
          </ComboboxOptions>
        </div>
      </Combobox>
    </div>
  );
}
