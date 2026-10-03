import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { LeagueData, LeagueTeam } from "@/types/playerTypes";
import type { CountryEntry } from "@/types/worldTypes";
import { createGameSave } from "@/GameInterface/gameSession";
import { capture } from "@/analytics";
import { PreSeasonLoadingScreen } from "@/GameInterface/PreSeasonLoadingScreen";
import { ClubLogo, squadLogoUrl } from "@/GameInterface/Components/ClubLogo";
import { formatEuros } from "@/GameInterface/Components/ClubFinancesTable";
import { PitchBackdrop } from "@/GameInterface/Components/PitchBackdrop";
import { Wordmark } from "@/GameInterface/Components/Wordmark";
import { Button } from "@/GameInterface/ui/Button";
import { ChoiceCard } from "@/GameInterface/ui/ChoiceCard";
import { Chip } from "@/GameInterface/ui/Chip";
import { Label } from "@/GameInterface/ui/Label";
import { Notice } from "@/GameInterface/ui/Notice";
import { ScreenTitle } from "@/GameInterface/ui/ScreenTitle";
import { SectionTitle } from "@/GameInterface/ui/SectionTitle";
import { StatBar } from "@/GameInterface/ui/StatBar";
import { Tabs } from "@/GameInterface/ui/Tabs";
import { TextField } from "@/GameInterface/ui/TextField";
import { Icon } from "@/GameInterface/Icons";
import { getDetailedPositionColor } from "@/GameInterface/positionHelpers";
import { WorldMap } from "@/GameInterface/NewGame/WorldMap";
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

/** `GET /api/club-profile/:league/:club` — all values come from the club's squad file. */
type ClubProfile = {
  squadId:       string;
  founded:       number | null;
  stadium:       string | null;
  city:          string | null;
  attack:        number;
  midfield:      number;
  defense:       number;
  reputation:    number;
  annualRevenue: number;
  weeklyWages:   number;
  keyPlayers: Array<{ id: string; name: string; position: string; age: number; ovr: number }>;
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
  const [step, setStep] = useState<"manager" | "club">("manager");
  const [searchQuery, setSearchQuery] = useState("");
  const [countriesOpen, setCountriesOpen] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState<CountryEntry | null>(null);
  const [leagues, setLeagues] = useState<LeagueData[]>([]);
  const [selectedLeagueSlug, setSelectedLeagueSlug] = useState<string>("");
  const [selectedTeam, setSelectedTeam] = useState<LeagueTeam | null>(null);
  const [profiles, setProfiles] = useState<Record<string, ClubProfile>>({});
  const [starting, setStarting] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/leagues")
      .then((r) => r.json())
      .then((data: LeagueData[]) => setLeagues(data))
      .catch(() => {});
  }, []);

  // Reset team when country changes.
  useEffect(() => {
    setSelectedTeam(null);
    if (selectedCountry) {
      setSelectedLeagueSlug(leaguesOfCountry(leagues, selectedCountry.name)[0]?.slug ?? "");
    }
  }, [selectedCountry, leagues]);

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
  const selectedProfile = selectedTeam ? (profiles[selectedTeam.squadId] ?? null) : null;

  // Profiles of the visible division: reputation stars in the list, the full profile on the right.
  useEffect(() => {
    if (!selectedLeagueSlug) return;
    let cancelled = false;
    for (const club of teams) {
      if (profiles[club.squadId]) continue;
      fetch(`/api/club-profile/${selectedLeagueSlug}/${club.squadId}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data: ClubProfile | null) => {
          if (!cancelled && data) setProfiles((prev) => ({ ...prev, [club.squadId]: data }));
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLeagueSlug, activeLeague]);

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

  if (step === "manager") {
    return (
      <div className="flex min-h-screen flex-col items-center bg-background px-6 pt-8 text-foreground">
        <Wordmark size="lg" className="mb-6 block text-center" />
        <div className="relative flex w-full flex-1 items-center justify-center overflow-hidden pb-8">
          <PitchBackdrop players={false} />
          <div className="relative w-full max-w-[1000px] rounded-lg border border-border bg-background/90 p-6 md:p-8">
            <ManagerForm
              initial={manager}
              onCancel={() => {
                window.location.href = "/start";
              }}
              onSubmit={(m) => {
                setManager(m);
                setStep("club");
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  const countryList = (
    <>
      <div className="relative mb-3">
        <Icon name="search" size={16} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t("newGame.searchTerritory")}
          aria-label={t("newGame.searchTerritory")}
          className="w-full h-10 bg-transparent border border-border rounded pl-9 pr-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
        />
      </div>
      <div className="flex-1 overflow-y-auto min-h-0">
        {groups.map((group) => (
          <div key={group.continent} className="mb-4">
            <p className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground mb-1 mt-0">
              {t(`newGame.continents.${continentI18nKey(group.continent)}`, { defaultValue: group.continent })}
            </p>
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
                      className={`w-full h-8 flex items-center gap-2 text-left text-sm bg-transparent border-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                        selected ? "text-primary" : "text-foreground hover:text-primary"
                      }`}
                    >
                      <span className={`fi fi-${country.flag} w-5 h-5 rounded-sm bg-cover bg-center shrink-0`} />
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
    <div className="min-h-screen flex flex-col items-center bg-background px-4 py-6 text-foreground">
      <Wordmark size="lg" className="mb-6 block text-center" />
      <div className="flex w-full max-w-[1200px] flex-1 flex-col md:flex-row min-h-0 md:h-[calc(100vh-9rem)] overflow-hidden rounded-lg border border-border bg-background/90">
      <aside className="md:w-56 shrink-0 md:border-r border-b md:border-b-0 border-border p-4 flex flex-col min-h-0 md:h-full">
        <button
          type="button"
          onClick={() => setCountriesOpen((o) => !o)}
          aria-expanded={countriesOpen}
          className="md:hidden flex items-center justify-between w-full h-10 text-sm bg-transparent border-0 text-foreground cursor-pointer"
        >
          <span>{selectedCountry ? displayName(selectedCountry) : t("newGame.selectTerritory")}</span>
          <Icon name={countriesOpen ? "chevron-up" : "chevron-down"} size={16} />
        </button>
        <div className={`${countriesOpen ? "flex" : "hidden"} md:flex flex-col flex-1 min-h-0 max-h-[50vh] md:max-h-none`}>
          {countryList}
        </div>
      </aside>

      <main className="flex-1 flex flex-col md:flex-row min-h-0 min-w-0">
        <section className="flex-1 min-w-0 overflow-y-auto px-6 py-5">
          <p className="text-sm text-muted-foreground m-0 mb-1">{t("newGame.stepOf", { n: 2 })}</p>
          <ScreenTitle>{t("newGame.chooseClubTitle")}</ScreenTitle>
          {!selectedCountry ? (
            <>
              <p className="text-sm text-muted-foreground mt-6 xl:hidden">{t("newGame.selectTerritoryDetail")}</p>
              <div className="hidden xl:block mt-6">
                <WorldMap
                  countries={countries}
                  selectedSlug={null}
                  displayName={displayName}
                  onSelect={setSelectedCountry}
                />
              </div>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setSelectedCountry(null)}
                className="hidden xl:inline-flex items-center gap-1.5 mt-3 h-8 text-sm bg-transparent border-0 p-0 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <Icon name="chevron-left" size={16} />
                {t("newGame.showMap")}
              </button>
              <div className="overflow-x-auto mt-4">
                <Tabs
                  tabs={countryLeagues.map((l) => ({ key: l.slug, label: l.name }))}
                  active={selectedLeagueSlug}
                  onChange={(slug) => {
                    setSelectedLeagueSlug(slug);
                    setSelectedTeam(null);
                  }}
                  className="whitespace-nowrap"
                />
              </div>
              {countryLeagues.length === 0 ? (
                <p className="text-sm text-muted-foreground mt-4">{t("common.loading")}</p>
              ) : (
                <ul className="list-none p-0 m-0 mt-2">
                  {teams.map((club) => {
                    const selected = selectedTeam?.squadId === club.squadId;
                    const profile = profiles[club.squadId];
                    return (
                      <li key={club.squadId}>
                        <button
                          type="button"
                          onClick={() => setSelectedTeam(club)}
                          aria-pressed={selected}
                          className={`w-full flex items-center gap-3 min-h-12 px-2 py-2 text-left border-0 border-t border-border cursor-pointer ${
                            selected ? "bg-primary/10" : "bg-transparent hover:bg-foreground/5"
                          }`}
                        >
                          <ClubLogo
                            logoUrl={squadLogoUrl(club.squadId)}
                            primaryColor={club.colors[0]}
                            secondaryColor={club.colors[1]}
                            className="w-8 h-8 rounded-full shrink-0"
                          />
                          <span className={`flex-1 truncate text-base ${selected ? "text-primary" : ""}`}>{club.name}</span>
                          {profile && <ReputationStars value={profile.reputation} />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </section>

        <aside className="md:w-80 shrink-0 md:border-l border-t md:border-t-0 border-border px-6 py-5 flex flex-col md:overflow-y-auto">
          {selectedTeam ? (
            <ClubProfilePanel club={selectedTeam} profile={selectedProfile} />
          ) : (
            <p className="text-sm text-muted-foreground m-0">{t("newGame.selectClubDetail")}</p>
          )}

          <div className="mt-auto pt-6">
            {startError && (
              <Notice kind="error" className="mb-3">
                {startError}
              </Notice>
            )}
            <p className="text-sm text-muted-foreground m-0 mb-3 truncate">
              {manager.nationality && managerValid
                ? t("newGame.managerLine", {
                    name: manager.name.trim(),
                    country: t(`newGame.nationalities.${manager.nationality.id}`, {
                      defaultValue: manager.nationality.name,
                    }),
                  })
                : t("newGame.managerEmpty")}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="secondary" className="px-3" onClick={() => setStep("manager")}>
                {t("newGame.back")}
              </Button>
              <Button className="flex-1" onClick={handleStartCareer} disabled={!canStart}>
                {starting
                  ? t("newGame.creatingSeave")
                  : selectedTeam
                    ? t("newGame.startWith", { club: selectedTeam.name })
                    : t("newGame.startCareer")}
              </Button>
            </div>
          </div>
        </aside>
      </main>
      </div>
    </div>
  );
}

function ReputationStars({ value }: { value: number }) {
  const { t } = useTranslation();
  return (
    <span
      className="flex items-center gap-0.5 shrink-0"
      role="img"
      aria-label={`${t("newGame.reputation")}: ${t(`newGame.reputationLevel.${value}`, { defaultValue: String(value) })}`}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <Icon
          key={n}
          name={n <= value ? "star-filled" : "star"}
          size={16}
          className={n <= value ? "text-chart-4" : "text-muted-foreground/50"}
        />
      ))}
    </span>
  );
}

function ClubProfilePanel({ club, profile }: { club: LeagueTeam; profile: ClubProfile | null }) {
  const { t, i18n } = useTranslation();
  const score = (v: number) => (v / 10).toLocaleString(i18n.language, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const place = [profile?.city, profile?.stadium, profile?.founded].filter((v) => v != null && v !== "").join(" · ");

  return (
    <div>
      <div className="flex items-center gap-3">
        <ClubLogo
          logoUrl={squadLogoUrl(club.squadId)}
          primaryColor={club.colors[0]}
          secondaryColor={club.colors[1]}
          className="w-16 h-16 rounded-full shrink-0"
        />
        <div className="min-w-0">
          <h2 className="font-display font-black uppercase text-2xl leading-none m-0">{club.name}</h2>
          {place && <p className="text-sm text-muted-foreground mt-1 mb-0">{place}</p>}
        </div>
      </div>

      {!profile ? (
        <p className="text-sm text-muted-foreground mt-6">{t("common.loading")}</p>
      ) : (
        <>
          <SectionLabel>{t("newGame.squadLabel")}</SectionLabel>
          <div className="flex flex-col gap-2">
            <StatBar label={t("newGame.attack")} value={profile.attack} max={100} display={score(profile.attack)} />
            <StatBar label={t("newGame.midfield")} value={profile.midfield} max={100} display={score(profile.midfield)} />
            <StatBar label={t("newGame.defense")} value={profile.defense} max={100} display={score(profile.defense)} />
          </div>

          <SectionLabel>{t("newGame.keyPlayers")}</SectionLabel>
          <ul className="list-none p-0 m-0 flex flex-col gap-1.5">
            {profile.keyPlayers.slice(0, 3).map((p) => (
              <li key={p.id} className="flex items-baseline gap-2 text-sm">
                <span className="flex-1 truncate">{p.name}</span>
                <span className={`${getDetailedPositionColor(p.position)} w-10 text-right`}>{p.position}</span>
                <span className="w-9 text-right tabular-nums text-muted-foreground">{score(p.ovr)}</span>
              </li>
            ))}
          </ul>

          <SectionLabel>{t("newGame.finances")}</SectionLabel>
          <dl className="m-0 flex flex-col gap-1 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{t("newGame.annualRevenue")}</dt>
              <dd className="m-0 tabular-nums">{formatEuros(profile.annualRevenue)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{t("newGame.weeklyWages")}</dt>
              <dd className="m-0 tabular-nums">
                {formatEuros(profile.weeklyWages)}
                {t("newGame.perWeek")}
              </dd>
            </div>
          </dl>
        </>
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: string }) {
  return <p className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground mt-6 mb-2">{children}</p>;
}

function ManagerForm({
  initial,
  onCancel,
  onSubmit,
}: {
  initial:  ManagerData;
  onCancel: () => void;
  onSubmit: (m: ManagerData) => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<ManagerData>(initial);

  useEffect(() => {
    setDraft(initial);
  }, [initial]);

  return (
    <div>
      <p className="text-sm text-muted-foreground m-0 mb-1">{t("newGame.stepOf", { n: 1 })}</p>
      <ScreenTitle subtitle={t("newGame.managerSubtitle")}>{t("newGame.createManagerTitle")}</ScreenTitle>

      <div className="grid gap-8 mt-8 md:grid-cols-[1fr_1.4fr]">
        <div>
          <TextField
            id="manager-name"
            label={t("newGame.managerName")}
            type="text"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder={t("newGame.enterName")}
          />

          <Label className="mt-6 mb-2">{t("newGame.nationality")}</Label>
          <div className="flex flex-wrap gap-2">
            {MANAGER_NATIONALITIES.map((nat) => (
              <Chip
                key={nat.id}
                selected={draft.nationality?.id === nat.id}
                onClick={() => setDraft({ ...draft, nationality: nat })}
              >
                <span className={`fi fi-${nat.flag} w-5 h-3.5 rounded-sm bg-cover bg-center`} />
                {t(`newGame.nationalities.${nat.id}`, { defaultValue: nat.name })}
              </Chip>
            ))}
          </div>
        </div>

        <div>
          <Label className="mb-2">{t("newGame.careerBackground")}</Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {MANAGER_BACKGROUNDS.map((bg) => (
              <ChoiceCard
                key={bg.id}
                selected={draft.background?.id === bg.id}
                onSelect={() => setDraft({ ...draft, background: bg })}
                title={t(`newGame.backgrounds.${bg.id}.name`, { defaultValue: bg.name })}
                description={
                  <span className="line-clamp-2">
                    {t(`newGame.backgrounds.${bg.id}.description`, { defaultValue: bg.description })}
                  </span>
                }
              />
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-4 mt-8">
        <Button variant="secondary" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button onClick={() => onSubmit({ ...draft, name: draft.name.trim() })} disabled={!isManagerValid(draft)}>
          {t("newGame.chooseClub")}
        </Button>
      </div>
    </div>
  );
}
