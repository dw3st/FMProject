import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { LeagueData, LeagueTeam } from "@/types/playerTypes";
import type { CountryEntry } from "@/types/worldTypes";
import { createGameSave } from "@/GameInterface/gameSession";
import { capture } from "@/analytics";
import { PreSeasonLoadingScreen } from "@/GameInterface/PreSeasonLoadingScreen";
import { ClubLogo, squadLogoUrl } from "@/GameInterface/Components/ClubLogo";
import { Modal } from "@/GameInterface/Components/Modal";
import { Wordmark } from "@/GameInterface/Components/Wordmark";
import { Button } from "@/GameInterface/ui/Button";
import { Notice } from "@/GameInterface/ui/Notice";
import { Tabs } from "@/GameInterface/ui/Tabs";
import { Icon } from "@/GameInterface/Icons";
import {
  continentI18nKey,
  countryDisplayName,
  groupCountriesByContinent,
  leaguesOfCountry,
  matchesCountryQuery,
} from "@/Domain/world/labels";
import countriesRaw from "@/Data/countries.json";
import databasesRaw from "@/Data/databases.json";
import {
  MANAGER_BACKGROUNDS,
  MANAGER_NATIONALITIES,
  type ManagerBackground,
} from "@/Data/managerBackgrounds";

type DatabaseEntry = {
  id:        string;
  name:      string;
  version:   string;
  startDate: string;
  playable:  boolean;
};

type ClubProfile = {
  attack:     number;
  midfield:   number;
  defense:    number;
  reputation: number;
};

type Nationality = (typeof MANAGER_NATIONALITIES)[number];

type ManagerData = {
  name:        string;
  background:  ManagerBackground | null;
  nationality: Nationality | null;
};

const database = (databasesRaw as DatabaseEntry[]).find((d) => d.playable) ?? null;
const countries: CountryEntry[] = Object.values(countriesRaw as Record<string, CountryEntry>);

const isManagerValid = (m: ManagerData) =>
  m.name.trim().length >= 2 && !!m.background && !!m.nationality;

export function NewGameWizard() {
  const { t, i18n } = useTranslation();
  const [manager, setManager] = useState<ManagerData>({ name: "", background: null, nationality: null });
  const [managerOpen, setManagerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [countriesOpen, setCountriesOpen] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState<CountryEntry | null>(null);
  const [leagues, setLeagues] = useState<LeagueData[]>([]);
  const [selectedLeagueSlug, setSelectedLeagueSlug] = useState<string>("");
  const [selectedTeam, setSelectedTeam] = useState<LeagueTeam | null>(null);
  const [clubProfile, setClubProfile] = useState<ClubProfile | null>(null);
  const [starting, setStarting] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/leagues")
      .then((r) => r.json())
      .then((data: LeagueData[]) => setLeagues(data))
      .catch(() => {});
  }, []);

  // Reset team / profile when country changes.
  useEffect(() => {
    setSelectedTeam(null);
    setClubProfile(null);
    if (selectedCountry) {
      setSelectedLeagueSlug(leaguesOfCountry(leagues, selectedCountry.name)[0]?.slug ?? "");
    }
  }, [selectedCountry, leagues]);

  // Fetch profile (squad level) for the selected club.
  useEffect(() => {
    if (!selectedTeam || !selectedLeagueSlug) {
      setClubProfile(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/club-profile/${selectedLeagueSlug}/${selectedTeam.squadId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: ClubProfile | null) => {
        if (!cancelled) setClubProfile(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [selectedTeam, selectedLeagueSlug]);

  const displayName = (c: CountryEntry) => countryDisplayName(c, i18n.language, t);
  const filteredCountries = countries.filter((c) => {
    const continentName = t(`newGame.continents.${continentI18nKey(c.continent ?? "Other")}`, {
      defaultValue: c.continent ?? "Other",
    });
    return matchesCountryQuery(searchQuery, [displayName(c), c.name, continentName]);
  });
  const groups = groupCountriesByContinent(filteredCountries, displayName);

  const countryLeagues = selectedCountry ? leaguesOfCountry(leagues, selectedCountry.name) : [];
  const activeLeague = countryLeagues.find((l) => l.slug === selectedLeagueSlug);
  const teams = activeLeague?.standings ?? [];
  const managerValid = isManagerValid(manager);
  const canStart = !!selectedTeam && managerValid && !starting;

  async function handleStartCareer() {
    if (!database || !managerValid || !selectedTeam || !activeLeague || !manager.background || !manager.nationality || starting) {
      return;
    }
    setStarting(true);
    setStartError(null);
    try {
      const session = await createGameSave({
        leagueSlug: activeLeague.slug,
        leagueName: activeLeague.name,
        clubId:     selectedTeam.squadId,
        clubName:   selectedTeam.name,
        clubColors: selectedTeam.colors,
        database: {
          id:        database.id,
          name:      database.name,
          version:   database.version,
          startDate: database.startDate,
        },
        manager: {
          name:           manager.name.trim(),
          nationalityIso: manager.nationality.id,
          backgroundId:   manager.background.id,
        },
      });

      capture("career_started", {
        league: activeLeague.slug,
        club: selectedTeam.name,
        database: database.id,
      });

      // Catch up leagues that kicked off before the player's season begins.
      // Best-effort: a failure here shouldn't block the user from playing.
      setStarting(false);
      setPreparing(true);
      try {
        await fetch(`/api/saves/${session.saveId}/presimulate`, { method: "POST" });
      } catch {
        /* proceed anyway — standings just won't be pre-populated */
      }

      window.location.href = "/dashboard";
    } catch (err) {
      setStarting(false);
      setPreparing(false);
      setStartError(err instanceof Error ? err.message : "Failed to create save");
    }
  }

  if (preparing) return <PreSeasonLoadingScreen />;

  const countryList = (
    <>
      <div className="relative mb-3">
        <Icon name="search" size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t("newGame.searchTerritory")}
          aria-label={t("newGame.searchTerritory")}
          className="w-full bg-transparent border border-border rounded pl-8 pr-2 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
        />
      </div>
      <div className="flex-1 overflow-y-auto min-h-0">
        {groups.map((group) => (
          <div key={group.continent} className="mb-4">
            <h3 className="text-xs text-muted-foreground mb-1 m-0 font-normal">
              {t(`newGame.continents.${continentI18nKey(group.continent)}`, { defaultValue: group.continent })}
            </h3>
            <ul className="list-none p-0 m-0">
              {group.countries.map((country) => {
                const selected = selectedCountry?.slug === country.slug;
                return (
                  <li key={country.slug}>
                    <button
                      type="button"
                      disabled={!country.playable}
                      title={!country.playable ? t("common.comingSoon") : undefined}
                      onClick={() => {
                        setSelectedCountry(country);
                        setCountriesOpen(false);
                      }}
                      className={`w-full flex items-center gap-2 py-1.5 text-left text-sm bg-transparent border-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                        selected ? "text-primary" : "text-foreground hover:text-primary"
                      }`}
                    >
                      <span className={`fi fi-${country.flag} w-5 h-3.5 rounded-sm bg-cover bg-center shrink-0`} />
                      <span className="truncate">{displayName(country)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </>
  );

  return (
    <div className="h-screen flex flex-col md:flex-row bg-background text-foreground">
      <aside className="md:w-60 shrink-0 md:border-r border-b md:border-b-0 border-border p-4 flex flex-col min-h-0 md:h-full">
        <Wordmark size="sm" className="mb-4 block" />
        <button
          type="button"
          onClick={() => setCountriesOpen((o) => !o)}
          aria-expanded={countriesOpen}
          className="md:hidden flex items-center justify-between w-full py-2 text-sm bg-transparent border-0 text-foreground cursor-pointer"
        >
          <span>{selectedCountry ? displayName(selectedCountry) : t("newGame.selectTerritory")}</span>
          <Icon name={countriesOpen ? "chevron-up" : "chevron-down"} size={16} />
        </button>
        <div className={`${countriesOpen ? "flex" : "hidden"} md:flex flex-col flex-1 min-h-0 max-h-[50vh] md:max-h-none`}>
          {countryList}
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-h-0 min-w-0">
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          {!selectedCountry ? (
            <p className="text-muted-foreground text-sm">{t("newGame.selectTerritoryDetail")}</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Tabs
                  tabs={countryLeagues.map((l) => ({ key: l.slug, label: l.name }))}
                  active={selectedLeagueSlug}
                  onChange={(slug) => {
                    setSelectedLeagueSlug(slug);
                    setSelectedTeam(null);
                  }}
                  className="whitespace-nowrap mb-2"
                />
              </div>
              {countryLeagues.length === 0 ? (
                <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
              ) : (
                <ul className="list-none p-0 m-0">
                  {teams.map((club) => {
                    const selected = selectedTeam?.squadId === club.squadId;
                    const level =
                      selected && clubProfile
                        ? Math.round((clubProfile.attack + clubProfile.midfield + clubProfile.defense) / 3)
                        : null;
                    return (
                      <li key={club.squadId} className="border-t border-border first:border-t-0">
                        <button
                          type="button"
                          onClick={() => setSelectedTeam(club)}
                          aria-pressed={selected}
                          className={`w-full flex items-center gap-3 py-2 px-2 text-left border-0 cursor-pointer ${
                            selected ? "bg-primary/10" : "bg-transparent hover:bg-foreground/5"
                          }`}
                        >
                          <ClubLogo
                            logoUrl={squadLogoUrl(club.squadId)}
                            primaryColor={club.colors[0]}
                            secondaryColor={club.colors[1]}
                            className="w-6 h-6 rounded-full shrink-0"
                          />
                          <span className={`flex-1 truncate text-sm ${selected ? "text-primary" : ""}`}>{club.name}</span>
                          {level !== null && clubProfile && (
                            <span className="text-xs text-muted-foreground">
                              {t("newGame.squadRating")} {level} ·{" "}
                              {t(`newGame.reputationLevel.${clubProfile.reputation}`, { defaultValue: "" })}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </div>

        {startError && (
          <Notice kind="error" className="mx-4 md:mx-6 mb-2">
            {startError}
          </Notice>
        )}

        <footer className="border-t border-border p-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex-1 min-w-0 text-sm text-muted-foreground flex items-center gap-2">
            <span className="truncate">
              {manager.nationality && managerValid
                ? t("newGame.managerLine", {
                    name: manager.name.trim(),
                    country: t(`newGame.nationalities.${manager.nationality.id}`, {
                      defaultValue: manager.nationality.name,
                    }),
                  })
                : t("newGame.managerEmpty")}
            </span>
            <button
              type="button"
              onClick={() => setManagerOpen(true)}
              className="text-primary bg-transparent border-0 cursor-pointer text-sm p-0 hover:underline"
            >
              {managerValid ? t("newGame.edit") : t("newGame.define")}
            </button>
          </div>
          <Button
            variant="ghost"
            onClick={() => {
              window.location.href = "/start";
            }}
          >
            {t("common.cancel")}
          </Button>
          <Button onClick={handleStartCareer} disabled={!canStart}>
            {starting
              ? t("newGame.creatingSeave")
              : selectedTeam
                ? t("newGame.startWith", { club: selectedTeam.name })
                : t("newGame.startCareer")}
          </Button>
        </footer>
      </main>

      <ManagerModal
        open={managerOpen}
        initial={manager}
        onClose={() => setManagerOpen(false)}
        onSave={(m) => {
          setManager(m);
          setManagerOpen(false);
        }}
      />
    </div>
  );
}

function ManagerModal({
  open,
  initial,
  onClose,
  onSave,
}: {
  open:    boolean;
  initial: ManagerData;
  onClose: () => void;
  onSave:  (m: ManagerData) => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<ManagerData>(initial);

  useEffect(() => {
    if (open) setDraft(initial);
  }, [open, initial]);

  const label = "block text-xs text-muted-foreground mb-2";

  return (
    <Modal open={open} onClose={onClose} size="lg">
      <div className="p-6">
        <h2 className="text-lg font-semibold m-0 mb-5">{t("newGame.createManagerTitle")}</h2>

        <label className={label} htmlFor="manager-name">
          {t("newGame.managerName")}
        </label>
        <input
          id="manager-name"
          type="text"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          placeholder={t("newGame.enterName")}
          className="w-full mb-5 bg-transparent border border-border rounded px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-primary"
        />

        <span className={label}>{t("newGame.nationality")}</span>
        <div className="flex flex-wrap gap-2 mb-5">
          {MANAGER_NATIONALITIES.map((nat) => {
            const on = draft.nationality?.id === nat.id;
            return (
              <button
                key={nat.id}
                type="button"
                aria-pressed={on}
                onClick={() => setDraft({ ...draft, nationality: nat })}
                className={`flex items-center gap-2 px-3 py-1.5 rounded border text-sm bg-transparent cursor-pointer ${
                  on ? "border-primary text-primary" : "border-border text-foreground hover:border-primary/50"
                }`}
              >
                <span className={`fi fi-${nat.flag} w-5 h-3.5 rounded-sm bg-cover bg-center`} />
                {t(`newGame.nationalities.${nat.id}`, { defaultValue: nat.name })}
              </button>
            );
          })}
        </div>

        <span className={label}>{t("newGame.careerBackground")}</span>
        <ul className="list-none p-0 m-0 mb-6">
          {MANAGER_BACKGROUNDS.map((bg) => {
            const on = draft.background?.id === bg.id;
            return (
              <li key={bg.id} className="border-t border-border first:border-t-0">
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => setDraft({ ...draft, background: bg })}
                  className={`w-full text-left py-2 px-2 border-0 cursor-pointer ${
                    on ? "bg-primary/10" : "bg-transparent hover:bg-foreground/5"
                  }`}
                >
                  <span className={`block text-sm ${on ? "text-primary" : ""}`}>
                    {t(`newGame.backgrounds.${bg.id}.name`, { defaultValue: bg.name })}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {t(`newGame.backgrounds.${bg.id}.description`, { defaultValue: bg.description })}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => onSave({ ...draft, name: draft.name.trim() })} disabled={!isManagerValid(draft)}>
            {t("common.save")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
