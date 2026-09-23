import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  Check,
  Globe,
  Shield,
  Search,
  Star,
  TrendingUp,
  Lock,
  Database,
  Calendar,
  User,
  Trophy,
  MapPin,
  UserRound,
  Sparkles,
  Heart,
  BarChart3,
  Plus,
} from "lucide-react";
import type { LeagueData, LeagueTeam } from "@/types/playerTypes";
import type { CountryEntry } from "@/types/worldTypes";
import { createGameSave } from "@/GameInterface/gameSession";
import { capture } from "@/analytics";
import { PreSeasonLoadingScreen } from "@/GameInterface/PreSeasonLoadingScreen";
import { ClubLogo, squadLogoUrl } from "@/GameInterface/Components/ClubLogo";
import { Icon } from "@/GameInterface/Icons";
import { SelectCombobox } from "@/GameInterface/Components/SelectCombobox";
import {
  continentI18nKey,
  countryDisplayName,
  groupCountriesByContinent,
  matchesCountryQuery,
  sortLeaguesForCountry,
} from "@/Domain/world/labels";
import countriesRaw from "@/Data/countries.json";
import databasesRaw from "@/Data/databases.json";
import {
  MANAGER_BACKGROUNDS,
  MANAGER_NATIONALITIES,
  type ManagerBackground,
} from "@/Data/managerBackgrounds";

type DatabaseEntry = {
  id:                string;
  name:              string;
  description:       string;
  creator:           string;
  creatorType:       "official" | "community";
  startDate:         string;
  countries:         number;
  playableCountries: number;
  leagues:           number;
  playableLeagues:   number;
  players:           number;
  lastUpdated:       string;
  version:           string;
  isRecommended:     boolean;
  playable:          boolean;
};

type ClubProfile = {
  squadId:         string;
  slug:            string;
  name:            string;
  colors:          [string, string];
  founded:         number | null;
  stadium:         string | null;
  city:            string | null;
  attack:          number;
  midfield:        number;
  defense:         number;
  reputation:      number;
  reputationLabel: string;
  keyPlayers: Array<{
    id:       string;
    name:     string;
    position: string;
    age:      number;
    ovr:      number;
  }>;
};

type Nationality = (typeof MANAGER_NATIONALITIES)[number];

type ManagerData = {
  name:        string;
  background:  ManagerBackground | null;
  nationality: Nationality | null;
};

const databases = databasesRaw as DatabaseEntry[];
const countries: CountryEntry[] = Object.values(
  countriesRaw as Record<string, CountryEntry>,
);

// Steps labels will be set by component using t()
const steps = [
  { id: "database", icon: Database },
  { id: "manager",  icon: UserRound },
  { id: "country",  icon: Globe },
  { id: "club",     icon: Shield },
  { id: "confirm",  icon: Check },
] as const;

const stripHtml = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

const PRIMARY_BUTTON =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground font-bold uppercase tracking-wider transition-all hover:scale-[1.02] active:scale-[0.98] glow-primary border-0 cursor-pointer disabled:opacity-25 disabled:pointer-events-none";

const OUTLINE_BUTTON =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-border/60 bg-transparent text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all font-bold uppercase tracking-wider cursor-pointer";

export function NewGameWizard() {
  const { t, i18n } = useTranslation();
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedDatabase, setSelectedDatabase] = useState<DatabaseEntry | null>(
    databases.find((d) => d.playable) ?? null,
  );
  const [manager, setManager] = useState<ManagerData>({
    name: "",
    background: null,
    nationality: null,
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCountry, setSelectedCountry] = useState<CountryEntry | null>(null);
  const [leagues, setLeagues] = useState<LeagueData[]>([]);
  const [selectedLeagueSlug, setSelectedLeagueSlug] = useState<string>("");
  const [selectedTeam, setSelectedTeam] = useState<LeagueTeam | null>(null);
  const [clubProfile, setClubProfile] = useState<ClubProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  // Load leagues once on mount.
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
      const cl = leagues.filter((l) => l.country === selectedCountry.name);
      setSelectedLeagueSlug(cl[0]?.slug ?? "");
    }
  }, [selectedCountry, leagues]);

  // Fetch profile for the selected club.
  useEffect(() => {
    if (!selectedTeam || !selectedLeagueSlug) {
      setClubProfile(null);
      return;
    }
    let cancelled = false;
    setProfileLoading(true);
    fetch(`/api/club-profile/${selectedLeagueSlug}/${selectedTeam.squadId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: ClubProfile | null) => {
        if (!cancelled) setClubProfile(data);
      })
      .finally(() => {
        if (!cancelled) setProfileLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedTeam, selectedLeagueSlug]);

  const filteredCountries = countries.filter((c) => {
    const displayName = countryDisplayName(c, i18n.language, t);
    const continentName = t(`newGame.continents.${continentI18nKey(c.continent ?? "Other")}`, {
      defaultValue: c.continent ?? "Other",
    });
    return matchesCountryQuery(searchQuery, [displayName, c.name, continentName]);
  });

  const countryLeagues = selectedCountry
    ? leagues.filter((l) => l.country === selectedCountry.name)
    : [];
  const activeLeague = countryLeagues.find((l) => l.slug === selectedLeagueSlug);
  const teams = activeLeague?.standings ?? [];

  const isManagerValid =
    manager.name.trim().length >= 2 && !!manager.background && !!manager.nationality;

  const canAdvance =
    (currentStep === 0 && selectedDatabase !== null && selectedDatabase.playable) ||
    (currentStep === 1 && isManagerValid) ||
    (currentStep === 2 && selectedCountry !== null) ||
    (currentStep === 3 && selectedTeam !== null) ||
    currentStep === 4;

  async function handleStartCareer() {
    if (
      !selectedDatabase ||
      !isManagerValid ||
      !selectedCountry ||
      !selectedTeam ||
      !activeLeague ||
      !manager.background ||
      !manager.nationality ||
      starting
    ) {
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
        budget:     0,
        database: {
          id:        selectedDatabase.id,
          name:      selectedDatabase.name,
          version:   selectedDatabase.version,
          startDate: selectedDatabase.startDate,
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
        database: selectedDatabase.id,
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

  function handleNext() {
    if (!canAdvance) return;
    if (currentStep === 4) {
      handleStartCareer();
      return;
    }
    setCurrentStep(currentStep + 1);
  }

  function handleBack() {
    if (currentStep === 0) {
      window.location.href = "/start";
      return;
    }
    setCurrentStep(currentStep - 1);
  }

  function footerSelectionLabel(): string {
    const countryName = selectedCountry
      ? t(`newGame.countries.${selectedCountry.slug}.name`, { defaultValue: selectedCountry.name })
      : "";
    if (currentStep === 4 && selectedTeam) {
      return `${selectedTeam.name} • ${countryName}`;
    }
    if (selectedTeam && currentStep >= 3) return selectedTeam.name;
    if (selectedCountry && currentStep >= 2) return countryName;
    if (manager.name && currentStep >= 1) return manager.name;
    if (selectedDatabase) return t(`newGame.databases.${selectedDatabase.id}.name`, { defaultValue: selectedDatabase.name });
    return t("newGame.noSelection") ?? "No selection";
  }

  if (preparing) return <PreSeasonLoadingScreen />;

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left Sidebar */}
      <div className="w-64 border-r border-border/30 bg-card/30 flex flex-col">
        <div className="p-6 border-b border-border/30">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
            {t("newGame.phase01")}
          </p>
          <h2 className="text-xl font-black font-display text-primary uppercase">
            {t("newGame.matchPrep")}
          </h2>
        </div>

        <nav className="flex-1 p-4">
          <ul className="space-y-1 list-none p-0 m-0">
            {steps.map((step, index) => {
              const Icon = step.icon;
              const isActive    = index === currentStep;
              const isCompleted = index <  currentStep;
              const isDisabled  = index >  currentStep;
              const stepLabel = [
                t("newGame.selectDatabase"),
                t("newGame.createManager"),
                t("newGame.selectTerritory"),
                t("newGame.chooseClub"),
                t("newGame.confirmStart"),
              ][index];

              return (
                <li key={step.id}>
                  <button
                    disabled={isDisabled}
                    onClick={() => !isDisabled && setCurrentStep(index)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all text-left bg-transparent border-0 cursor-pointer ${
                      isActive
                        ? "bg-primary/10 text-primary border-l-2 border-primary"
                        : isCompleted
                          ? "text-foreground hover:bg-card/50"
                          : "text-muted-foreground"
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                        isActive
                          ? "bg-primary text-primary-foreground"
                          : isCompleted
                            ? "bg-primary/20 text-primary"
                            : "bg-muted/30 text-muted-foreground"
                      }`}
                    >
                      {isCompleted ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                    </div>
                    <span className="font-semibold text-sm">{stepLabel}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="p-4 border-t border-border/30">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-card/50">
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
              A+
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase">{t("newGame.userRank")}</p>
              <p className="font-bold text-sm">{t("newGame.eliteTactician")}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        <header className="h-14 border-b border-border/30 flex items-center justify-between px-6">
          <span className="font-black font-display text-lg italic">{t("common.touchlines").split(" ")[0]}<span className="text-primary">{t("common.touchlines").split(" ")[1]}</span></span>
          <span className="text-xs text-muted-foreground uppercase tracking-wider">
            {t("newGame.step", { current: currentStep + 1, total: steps.length })}
          </span>
        </header>

        <div className="flex-1 overflow-auto">
          {currentStep === 0 && (
            <DatabaseSelector
              databases={databases}
              selected={selectedDatabase}
              onSelect={setSelectedDatabase}
            />
          )}

          {currentStep === 1 && (
            <ManagerCreator manager={manager} onUpdate={setManager} />
          )}

          {currentStep === 2 && (
            <CountrySelector
              countries={filteredCountries}
              leagues={leagues}
              selected={selectedCountry}
              onSelect={setSelectedCountry}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
            />
          )}

          {currentStep === 3 && selectedCountry && (
            <ClubSelector
              country={selectedCountry}
              leagues={countryLeagues}
              selectedLeagueSlug={selectedLeagueSlug}
              onSelectLeague={(slug) => {
                setSelectedLeagueSlug(slug);
                setSelectedTeam(null);
              }}
              teams={teams}
              selectedTeam={selectedTeam}
              onSelectTeam={setSelectedTeam}
              profile={clubProfile}
              profileLoading={profileLoading}
              activeLeague={activeLeague ?? null}
            />
          )}

          {currentStep === 4 && selectedCountry && selectedTeam && selectedDatabase && (
            <ConfirmSelection
              database={selectedDatabase}
              manager={manager}
              country={selectedCountry}
              team={selectedTeam}
              activeLeague={activeLeague ?? null}
              profile={clubProfile}
            />
          )}
        </div>

        {startError && (
          <div className="mx-6 mb-3 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {startError}
          </div>
        )}

        <footer className="h-20 border-t border-border/30 flex items-center justify-between px-6 bg-card/30">
          <button onClick={handleBack} className={`${OUTLINE_BUTTON} h-10 px-5 text-xs`}>
            <ArrowLeft className="w-4 h-4" />
            {t("common.back")}
          </button>

          <div className="text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">
              {t("newGame.currently")}
            </p>
            <p className="text-sm font-semibold text-primary">{footerSelectionLabel()}</p>
          </div>

          <button
            onClick={handleNext}
            disabled={!canAdvance || starting}
            className={`${PRIMARY_BUTTON} h-10 px-6 text-xs min-w-[200px]`}
          >
            {currentStep === 4 ? (starting ? t("newGame.creatingSeave") : t("newGame.startCareer")) : t("newGame.confirmSelection")}
            <Check className="w-4 h-4" />
          </button>
        </footer>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Database step
// ──────────────────────────────────────────────────────────────────────────────

function DatabaseSelector({
  databases,
  selected,
  onSelect,
}: {
  databases: DatabaseEntry[];
  selected:  DatabaseEntry | null;
  onSelect: (db: DatabaseEntry) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="p-8 flex gap-8">
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-2">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          <span className="text-xs font-semibold uppercase tracking-wider text-primary">
            {t("newGame.dataSourceTerminal")}
          </span>
        </div>

        <h1 className="text-4xl lg:text-5xl font-black font-display uppercase mb-4">
          {t("newGame.selectDatabaseTitle")} <span className="text-primary glow-text">{t("common.database")}</span>
        </h1>

        <p className="text-muted-foreground mb-8 max-w-xl">
          {t("newGame.databaseDescription")}
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl">
          {databases.filter((db) => db.playable).map((db) => {
            const isSelected = selected?.id === db.id;
            const locked     = !db.playable;
            return (
              <button
                key={db.id}
                onClick={() => !locked && onSelect(db)}
                disabled={locked}
                className={`relative p-5 rounded-xl border-2 transition-all text-left bg-card/50 cursor-pointer ${
                  isSelected
                    ? "border-primary bg-primary/10"
                    : locked
                      ? "border-border/30 opacity-50 cursor-not-allowed"
                      : "border-border/50 hover:border-primary/50 hover:bg-card"
                }`}
              >
                {db.isRecommended && (
                  <span className="absolute -top-2 right-4 px-2 py-0.5 text-[10px] font-bold uppercase bg-primary text-primary-foreground rounded">
                    {t("newGame.recommended")}
                  </span>
                )}
                {locked && (
                  <span className="absolute top-3 right-3 flex items-center gap-1 text-[9px] font-black uppercase tracking-widest bg-black/70 text-muted-foreground px-2 py-0.5 rounded-full border border-border/30">
                    <Lock className="w-2.5 h-2.5" />
                    {t("newGame.soon")}
                  </span>
                )}

                <div className="flex items-start gap-3 mb-3">
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      db.creatorType === "official"
                        ? "bg-primary/20 text-primary"
                        : "bg-blue-500/20 text-blue-400"
                    }`}
                  >
                    <Database className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className={`font-bold truncate ${isSelected ? "text-primary" : ""}`}>
                      {t(`newGame.databases.${db.id}.name`, { defaultValue: db.name })}
                    </h3>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <User className="w-3 h-3" />
                      <span
                        className={
                          db.creatorType === "official" ? "text-primary" : "text-blue-400"
                        }
                      >
                        {t(`newGame.databases.${db.id}.creator`, { defaultValue: db.creator })}
                      </span>
                      {db.creatorType === "official" && (
                        <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase bg-primary/20 text-primary rounded">
                          {t("newGame.official")}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground mb-4 line-clamp-2">
                  {t(`newGame.databases.${db.id}.description`, { defaultValue: db.description })}
                </p>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <Stat label={t("newGame.countriesStat")} value={`${db.playableCountries}/${db.countries}`} />
                  <Stat label={t("newGame.leagues")}   value={`${db.playableLeagues}/${db.leagues}`} />
                  <Stat label={t("newGame.players")}   value={`${(db.players / 1000).toFixed(1)}K`} />
                </div>
              </button>
            );
          })}

          <ComingSoonTile icon={Database} label={t("newGame.moreDatabasesSoon")} soonLabel={t("newGame.soon")} />
          <ComingSoonTile icon={Plus}     label={t("newGame.createDatabase")}    soonLabel={t("newGame.soon")} />
        </div>
      </div>

      {/* Detail panel */}
      <div className="w-80 flex-shrink-0">
        {selected ? (
          <div className="sticky top-8 card-arcade rounded-xl overflow-hidden border-glow">
            <div className="p-5 border-b border-border/30 bg-gradient-to-r from-primary/10 to-transparent">
              <div className="flex items-center gap-3">
                <div
                  className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                    selected.creatorType === "official"
                      ? "bg-primary/20 text-primary"
                      : "bg-blue-500/20 text-blue-400"
                  }`}
                >
                  <Database className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-black font-display uppercase">{t(`newGame.databases.${selected.id}.name`, { defaultValue: selected.name })}</h3>
                  <p className="text-xs text-muted-foreground">v{selected.version}</p>
                </div>
              </div>
            </div>

            <div className="p-5 space-y-4">
              <DetailRow icon={Calendar} label={t("newGame.startDate")}    value={selected.startDate} />
              <DetailRow icon={User}     label={t("newGame.creator")}      value={t(`newGame.databases.${selected.id}.creator`, { defaultValue: selected.creator })} />
              <DetailRow icon={Trophy}   label={t("newGame.lastUpdated")}  value={selected.lastUpdated} />
            </div>

            <div className="p-5 border-t border-border/30">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-primary mb-3">
                {t("newGame.databaseContents")}
              </h4>
              <div className="space-y-2">
                <Row label={t("newGame.totalCountries")}     value={selected.countries.toString()} />
                <Row label={t("newGame.playableCountries")}  value={selected.playableCountries.toString()} primary />
                <Row label={t("newGame.totalLeagues")}       value={selected.leagues.toString()} />
                <Row label={t("newGame.playableLeagues")}    value={selected.playableLeagues.toString()} primary />
                <Row label={t("newGame.totalPlayers")}       value={selected.players.toLocaleString()} />
              </div>
            </div>
          </div>
        ) : (
          <div className="sticky top-8 card-arcade rounded-xl p-8 text-center">
            <Database className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-muted-foreground text-sm">{t("newGame.selectDatabaseDetail")}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Manager step
// ──────────────────────────────────────────────────────────────────────────────

const ICON_MAP = {
  trophy:   Trophy,
  sparkles: Sparkles,
  globe:    Globe,
  heart:    Heart,
  chart:    BarChart3,
} as const;

function ManagerCreator({
  manager,
  onUpdate,
}: {
  manager:  ManagerData;
  onUpdate: (m: ManagerData) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="p-8 flex gap-8">
      <div className="flex-1 max-w-3xl">
        <div className="flex items-center gap-2 mb-2">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          <span className="text-xs font-semibold uppercase tracking-wider text-primary">
            {t("newGame.identityConfiguration")}
          </span>
        </div>

        <h1 className="text-4xl lg:text-5xl font-black font-display uppercase mb-4">
          {t("newGame.createManagerTitle")} <span className="text-primary glow-text">{t("common.manager")}</span>
        </h1>

        <p className="text-muted-foreground mb-8 max-w-xl">
          {t("newGame.managerDescription")}
        </p>

        {/* Name */}
        <div className="mb-8">
          <label className="block text-xs font-semibold uppercase tracking-wider text-primary mb-3">
            {t("newGame.managerName")}
          </label>
          <input
            type="text"
            value={manager.name}
            onChange={(e) => onUpdate({ ...manager, name: e.target.value })}
            placeholder={t("newGame.enterName")}
            className="w-full max-w-md bg-card/50 border border-border/50 rounded-xl px-5 py-4 text-lg font-semibold placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
          />
        </div>

        {/* Nationality */}
        <div className="mb-8">
          <label className="block text-xs font-semibold uppercase tracking-wider text-primary mb-3">
            {t("newGame.nationality")}
          </label>
          <div className="flex flex-wrap gap-2">
            {MANAGER_NATIONALITIES.map((nat) => {
              const isSelected = manager.nationality?.id === nat.id;
              return (
                <button
                  key={nat.id}
                  onClick={() => onUpdate({ ...manager, nationality: nat })}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 bg-card/50 transition-all cursor-pointer ${
                    isSelected
                      ? "border-primary bg-primary/10"
                      : "border-border/50 hover:border-primary/50"
                  }`}
                >
                  <span
                    className={`fi fi-${nat.flag}`}
                    style={{
                      width: "1.25rem",
                      height: "0.875rem",
                      borderRadius: "2px",
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                    }}
                  />
                  <span
                    className={`text-sm font-semibold ${isSelected ? "text-primary" : ""}`}
                  >
                    {t(`newGame.nationalities.${nat.id}`, { defaultValue: nat.name })}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Background */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-primary mb-3">
            {t("newGame.careerBackground")}
          </label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {MANAGER_BACKGROUNDS.map((bg) => {
              const Icon       = ICON_MAP[bg.icon];
              const isSelected = manager.background?.id === bg.id;
              return (
                <button
                  key={bg.id}
                  onClick={() => onUpdate({ ...manager, background: bg })}
                  className={`p-5 rounded-xl border-2 text-left transition-all bg-card/50 cursor-pointer ${
                    isSelected
                      ? "border-primary bg-primary/10"
                      : "border-border/50 hover:border-primary/50"
                  }`}
                >
                  <div className="flex items-start gap-3 mb-3">
                    <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        isSelected
                          ? "bg-primary text-primary-foreground"
                          : "bg-primary/10 text-primary"
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <h3 className={`font-bold ${isSelected ? "text-primary" : ""}`}>
                        {t(`newGame.backgrounds.${bg.id}.name`, { defaultValue: bg.name })}
                      </h3>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3 line-clamp-2">
                    {t(`newGame.backgrounds.${bg.id}.description`, { defaultValue: bg.description })}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {bg.bonuses.map((bonus, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 text-[10px] font-semibold uppercase rounded bg-background/50 text-muted-foreground"
                      >
                        {t(`newGame.backgrounds.${bg.id}.bonuses.${i}`, { defaultValue: bonus })}
                      </span>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Preview panel */}
      <div className="w-80 flex-shrink-0">
        <div className="sticky top-8 card-arcade rounded-xl overflow-hidden border-glow">
          <div className="p-6 border-b border-border/30 bg-gradient-to-br from-primary/20 to-transparent flex flex-col items-center">
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-primary to-primary/50 flex items-center justify-center mb-4">
              {manager.name ? (
                <span className="text-3xl font-black text-primary-foreground">
                  {manager.name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .toUpperCase()
                    .slice(0, 2)}
                </span>
              ) : (
                <UserRound className="w-12 h-12 text-primary-foreground/50" />
              )}
            </div>
            <h3 className="font-black font-display text-xl uppercase text-center">
              {manager.name || t("newGame.yourName")}
            </h3>
            {manager.nationality && (
              <div className="flex items-center gap-2 mt-2">
                <span
                  className={`fi fi-${manager.nationality.flag}`}
                  style={{ width: "1.25rem", height: "0.75rem", borderRadius: "2px" }}
                />
                <span className="text-xs text-muted-foreground">
                  {t(`newGame.nationalities.${manager.nationality.id}`, { defaultValue: manager.nationality.name })}
                </span>
              </div>
            )}
          </div>

          {manager.background ? (
            <div className="p-5">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-primary mb-3">
                {t("newGame.background")}
              </h4>
              <p className="font-bold mb-2">{t(`newGame.backgrounds.${manager.background.id}.name`, { defaultValue: manager.background.name })}</p>
              <p className="text-xs text-muted-foreground leading-relaxed mb-4">
                {t(`newGame.backgrounds.${manager.background.id}.description`, { defaultValue: manager.background.description })}
              </p>

              <h4 className="text-xs font-semibold uppercase tracking-wider text-primary mb-2">
                {t("newGame.startingBonuses")}
              </h4>
              <ul className="space-y-1 list-none p-0 m-0">
                {manager.background!.bonuses.map((bonus, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    <Check className="w-3 h-3 text-primary" />
                    <span>{t(`newGame.backgrounds.${manager.background!.id}.bonuses.${i}`, { defaultValue: bonus })}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="p-8 text-center">
              <UserRound className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-muted-foreground text-sm">
                {t("newGame.selectBackgroundDetail")}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Country step
// ──────────────────────────────────────────────────────────────────────────────

function CountrySelector({
  countries,
  leagues,
  selected,
  onSelect,
  searchQuery,
  onSearchChange,
}: {
  countries:   CountryEntry[];
  leagues:     LeagueData[];
  selected:    CountryEntry | null;
  onSelect:   (c: CountryEntry) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const displayName = (country: CountryEntry) => countryDisplayName(country, i18n.language, t);
  const headlineFor = (country: CountryEntry): string => {
    const key = `newGame.countries.${country.slug}.headline`;
    const hasCurated = !!i18n.getResource(i18n.language, "translation", key);
    if (hasCurated) return t(key, { defaultValue: country.headline });
    if (i18n.language !== "en") return t("newGame.genericHeadline", { country: displayName(country) });
    return country.headline;
  };
  const teamsForCountry = (country: CountryEntry) =>
    leagues
      .filter((l) => l.country === country.name)
      .reduce((acc, l) => acc + l.standings.length, 0);
  const divisionsForCountry = (country: CountryEntry) =>
    leagues.filter((l) => l.country === country.name).length;

  const stats = selected
    ? {
        teams:     teamsForCountry(selected),
        divisions: divisionsForCountry(selected),
      }
    : null;

  const groups = groupCountriesByContinent(countries, displayName);

  return (
    <div className="p-8 flex gap-8">
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-2">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          <span className="text-xs font-semibold uppercase tracking-wider text-primary">
            {t("newGame.regionalSelection")}
          </span>
        </div>

        <h1 className="text-4xl lg:text-5xl font-black font-display uppercase mb-4">
          {t("newGame.chooseTerritory")} <span className="text-primary glow-text">{t("common.territory")}</span>
        </h1>

        <p className="text-muted-foreground mb-8 max-w-xl">
          {t("newGame.territoryDescription")}
        </p>

        <div className="relative mb-8 max-w-2xl">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t("newGame.searchTerritory")}
            className="w-full bg-card/50 border border-border/50 rounded-xl pl-12 pr-4 py-3 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
          />
        </div>

        <div className="space-y-8 max-w-3xl">
          {groups.map((group) => (
            <div key={group.continent}>
              <div className="flex items-center gap-2 mb-3">
                <Icon name="globe" size={11} className="text-white/30" strokeWidth={2} />
                <h3 className="text-[11px] font-black uppercase tracking-widest text-white/40">
                  {t(`newGame.continents.${continentI18nKey(group.continent)}`, { defaultValue: group.continent })}
                </h3>
                <span className="text-[11px] font-semibold text-white/25">
                  {t("newGame.countriesCount", { count: group.countries.length })}
                </span>
              </div>

              <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {group.countries.map((country) => {
                  const isSelected = selected?.slug === country.slug;
                  return (
                    <button
                      key={country.slug}
                      onClick={() => country.playable && onSelect(country)}
                      disabled={!country.playable}
                      title={!country.playable ? t("newGame.soon") : undefined}
                      className={`relative p-3 rounded-lg border-2 transition-all text-center bg-card/50 cursor-pointer ${
                        isSelected
                          ? "border-primary bg-primary/10"
                          : country.playable
                            ? "border-border/50 hover:border-primary/50 hover:bg-card"
                            : "border-border/30 bg-card/20 opacity-50 cursor-not-allowed"
                      }`}
                    >
                      {isSelected && (
                        <span className="absolute -top-2 left-1/2 -translate-x-1/2 px-1.5 py-0.5 text-[9px] font-bold uppercase bg-primary text-primary-foreground rounded">
                          {t("common.active")}
                        </span>
                      )}
                      {!country.playable && (
                        <Lock className="absolute top-2 right-2 w-3.5 h-3.5 text-muted-foreground" />
                      )}

                      <div className="w-12 h-8 rounded overflow-hidden mx-auto mb-2 border border-border/30 shadow">
                        <span
                          className={`fi fi-${country.flag}`}
                          style={{
                            display: "block",
                            width: "100%",
                            height: "100%",
                            backgroundSize: "cover",
                            backgroundPosition: "center",
                          }}
                        />
                      </div>

                      <div className="flex items-center justify-center gap-1">
                        {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
                        <span
                          className={`font-bold uppercase text-xs truncate ${
                            isSelected ? "text-primary" : ""
                          }`}
                        >
                          {displayName(country)}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="w-80 flex-shrink-0">
        {selected ? (
          <div className="sticky top-8 card-arcade rounded-xl overflow-hidden border-glow">
            <div className="p-5 border-b border-border/30 bg-gradient-to-r from-primary/10 to-transparent">
              <div className="flex items-center gap-4">
                <div className="w-14 h-10 rounded-lg overflow-hidden border border-border/30">
                  <span
                    className={`fi fi-${selected.flag}`}
                    style={{
                      display: "block",
                      width: "100%",
                      height: "100%",
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                    }}
                  />
                </div>
                <div>
                  <h3 className="font-black font-display uppercase text-lg">
                    {displayName(selected)}
                  </h3>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">
                    {t("newGame.territoryProfile")}
                  </p>
                </div>
              </div>
            </div>

            <div className="p-5 border-b border-border/30">
              <div className="grid grid-cols-2 gap-4 text-center">
                <div>
                  <p className="text-2xl font-black text-primary">{stats?.teams ?? 0}</p>
                  <p className="text-[10px] text-muted-foreground uppercase">{t("newGame.teams")}</p>
                </div>
                <div>
                  <p className="text-2xl font-black text-primary">
                    {stats?.divisions ?? 0}
                  </p>
                  <p className="text-[10px] text-muted-foreground uppercase">{t("newGame.divisions")}</p>
                </div>
              </div>
            </div>

            <div className="p-5">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-primary mb-3 flex items-center gap-2">
                <TrendingUp className="w-3 h-3" />
                {t("newGame.theSpirit")}
              </h4>
              <p className="text-sm text-muted-foreground leading-relaxed italic">
                "{stripHtml(headlineFor(selected))}"
              </p>
            </div>
          </div>
        ) : (
          <div className="sticky top-8 card-arcade rounded-xl p-8 text-center">
            <Globe className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-muted-foreground text-sm">
              {t("newGame.selectTerritoryDetail")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Club step
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Average squad strength computed from whatever the club row already carries — never fetched
 * per club. `LeagueData.standings` currently has no player data (see `LeagueTeam` in
 * playerTypes.ts), so this resolves to `null` today and the club card shows only the name.
 */
function averageSquadStrength(club: LeagueTeam): number | null {
  const players = (club as LeagueTeam & { players?: Array<{ ovr?: number }> }).players;
  if (!players || players.length === 0) return null;
  const total = players.reduce((sum, p) => sum + (p.ovr ?? 0), 0);
  return Math.round(total / players.length);
}

function ClubSelector({
  country,
  leagues,
  selectedLeagueSlug,
  onSelectLeague,
  teams,
  selectedTeam,
  onSelectTeam,
  profile,
  profileLoading,
  activeLeague,
}: {
  country:            CountryEntry;
  leagues:            LeagueData[];
  selectedLeagueSlug: string;
  onSelectLeague:    (slug: string) => void;
  teams:              LeagueTeam[];
  selectedTeam:       LeagueTeam | null;
  onSelectTeam:      (team: LeagueTeam) => void;
  profile:            ClubProfile | null;
  profileLoading:     boolean;
  activeLeague:       LeagueData | null;
}) {
  const { t } = useTranslation();
  const countryLeagues = sortLeaguesForCountry(leagues, country.name);
  return (
    <div className="p-8 flex gap-8">
      {/* Left: list */}
      <div className="w-72 flex-shrink-0">
        <div className="flex items-center gap-2 mb-2">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          <span className="text-xs font-semibold uppercase tracking-wider text-primary">
            {t("newGame.selectionPhase")}
          </span>
        </div>

        <h1 className="text-3xl font-black font-display uppercase mb-4 text-primary">
          {t(`newGame.countries.${country.slug}.name`, { defaultValue: country.name })}
        </h1>

        {countryLeagues.length > 1 && (
          countryLeagues.length <= 3 ? (
            <div className="flex gap-1 p-1 bg-card/50 rounded-lg border border-border/40 mb-4">
              {countryLeagues.map((l) => (
                <button
                  key={l.slug}
                  onClick={() => onSelectLeague(l.slug)}
                  title={l.name}
                  className={`flex-1 min-w-0 truncate px-2 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wide transition-all cursor-pointer border-0 ${
                    l.slug === selectedLeagueSlug
                      ? "bg-primary text-primary-foreground glow-primary-sm"
                      : "text-muted-foreground hover:text-foreground bg-transparent"
                  }`}
                >
                  {l.name}
                </button>
              ))}
            </div>
          ) : (
            <div className="mb-4">
              <SelectCombobox
                label={t("newGame.division")}
                value={selectedLeagueSlug}
                onChange={onSelectLeague}
                options={countryLeagues.map((l) => ({ value: l.slug, label: l.name }))}
              />
            </div>
          )
        )}

        <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
          {teams.map((club) => {
            const isSelected = selectedTeam?.squadId === club.squadId;
            const avgStrength = averageSquadStrength(club);
            return (
              <button
                key={club.squadId}
                onClick={() => onSelectTeam(club)}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left bg-card/30 cursor-pointer ${
                  isSelected
                    ? "border-primary bg-primary/10"
                    : "border-border/30 hover:border-border/60 hover:bg-card/50"
                }`}
              >
                <ClubLogo
                  logoUrl={squadLogoUrl(club.squadId, selectedLeagueSlug, club.slug)}
                  primaryColor={club.colors[0]}
                  secondaryColor={club.colors[1]}
                  className="w-10 h-10 rounded-lg shrink-0 border border-border/60 bg-card/80"
                />
                <div className="flex-1 min-w-0">
                  <p
                    className={`font-bold text-sm truncate ${
                      isSelected ? "text-primary" : ""
                    }`}
                  >
                    {club.name}
                  </p>
                  {avgStrength !== null && (
                    <p className="text-[10px] text-muted-foreground uppercase">
                      {t("newGame.squadRating")} {avgStrength}
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right: detail */}
      <div className="flex-1">
        {!selectedTeam ? (
          <div className="h-full flex items-center justify-center card-arcade rounded-xl">
            <div className="text-center p-12">
              <Shield className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-muted-foreground">{t("newGame.selectClubDetail")}</p>
            </div>
          </div>
        ) : (
          <div className="card-arcade rounded-xl overflow-hidden border-glow">
            <div className="grid grid-cols-1 lg:grid-cols-5">
              {/* Left side: club info */}
              <div className="lg:col-span-3 p-6 border-r border-border/30">
                <div className="flex items-start gap-4 mb-6">
                  <ClubLogo
                    logoUrl={squadLogoUrl(
                      selectedTeam.squadId,
                      selectedLeagueSlug,
                      selectedTeam.slug,
                    )}
                    primaryColor={selectedTeam.colors[0]}
                    secondaryColor={selectedTeam.colors[1]}
                    className="w-16 h-16 rounded-xl shrink-0 shadow-lg bg-card/60 border border-border/30"
                    imgClassName="w-full h-full object-contain p-2"
                  />
                  <div>
                    <h2 className="text-2xl font-black font-display uppercase">
                      {selectedTeam.name}
                    </h2>
                    <p className="text-sm text-muted-foreground uppercase tracking-wider">
                      {profile?.founded ? t("newGame.established", { year: profile.founded }) : t("newGame.establishedUnknown")}
                      {profile?.stadium ? ` • ${profile.stadium}` : ""}
                    </p>
                  </div>
                </div>

                <div className="mb-6">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-primary mb-2 pb-2 border-b border-border/30">
                    {t("newGame.clubProfile")}
                  </h3>
                  {profileLoading ? (
                    <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
                  ) : profile ? (
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <ProfileField label={t("newGame.city")}     value={profile.city ?? "—"} />
                      <ProfileField label={t("newGame.stadium")}  value={profile.stadium ?? "—"} />
                      <ProfileField label={t("newGame.founded")}  value={profile.founded?.toString() ?? "—"} />
                      <ProfileField
                        label={t("newGame.league")}
                        value={activeLeague?.name ?? "—"}
                      />
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">{t("newGame.noProfileData")}</p>
                  )}
                </div>

                {profile && (
                  <div className="flex gap-6 pt-4 border-t border-border/30">
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase mb-1">
                        {t("newGame.squadRating")}
                      </p>
                      <p className="text-2xl font-black">
                        {Math.round((profile.attack + profile.midfield + profile.defense) / 3)}
                      </p>
                      <div className="w-16 h-1 bg-primary rounded-full mt-1" />
                    </div>
                    <div className="border-l border-border/30 pl-6">
                      <p className="text-[10px] text-muted-foreground uppercase mb-1">
                        {t("newGame.reputation")}
                      </p>
                      <div className="flex gap-0.5 mb-1">
                        {[...Array(5)].map((_, i) => (
                          <Star
                            key={i}
                            className={`w-4 h-4 ${
                              i < profile.reputation
                                ? "text-yellow-400 fill-yellow-400"
                                : "text-muted-foreground/30"
                            }`}
                          />
                        ))}
                      </div>
                      <p className="text-xs font-semibold uppercase text-primary">
                        {t(`newGame.reputationLevel.${profile.reputation}`, { defaultValue: profile.reputationLabel })}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Right side: stats */}
              <div className="lg:col-span-2 p-6 bg-card/30">
                <div className="mb-6">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-primary mb-4 pb-2 border-b border-border/30">
                    {t("newGame.squadStrength")}
                  </h3>
                  <div className="space-y-4">
                    {profile ? (
                      [
                        { label: t("newGame.attack"),   value: profile.attack },
                        { label: t("newGame.midfield"), value: profile.midfield },
                        { label: t("newGame.defense"),  value: profile.defense },
                      ].map((stat) => (
                        <div key={stat.label}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-semibold uppercase">
                              {stat.label}
                            </span>
                            <span className="text-xs font-bold text-primary">
                              {stat.value}
                            </span>
                          </div>
                          <div className="w-full h-1.5 bg-muted/30 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-primary to-primary/70 rounded-full transition-all duration-500"
                              style={{ width: `${stat.value}%` }}
                            />
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-muted-foreground">—</p>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-primary mb-4 pb-2 border-b border-border/30">
                    {t("newGame.keyPlayers")}
                  </h3>
                  {profile?.keyPlayers.length ? (
                    <div className="space-y-2">
                      {profile.keyPlayers.map((player) => (
                        <div
                          key={player.id}
                          className="flex items-center gap-3 p-3 rounded-lg bg-background/50 border border-border/20"
                        >
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-muted/50 to-muted/20 flex items-center justify-center text-[10px] font-bold">
                            {player.name
                              .split(" ")
                              .map((n) => n[0])
                              .join("")
                              .slice(0, 2)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-sm truncate">{player.name}</p>
                            <p className="text-[10px] text-primary uppercase">
                              {player.position} • {t("newGame.age")} {player.age}
                            </p>
                          </div>
                          <span className="text-sm font-bold text-primary">
                            {player.ovr} {t("newGame.ovr")}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">{t("newGame.noData")}</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Confirm step
// ──────────────────────────────────────────────────────────────────────────────

function ConfirmSelection({
  database,
  manager,
  country,
  team,
  activeLeague,
  profile,
}: {
  database:     DatabaseEntry;
  manager:      ManagerData;
  country:      CountryEntry;
  team:         LeagueTeam;
  activeLeague: LeagueData | null;
  profile:      ClubProfile | null;
}) {
  const { t } = useTranslation();
  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="text-center mb-8">
        <div className="flex items-center justify-center gap-2 mb-2">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          <span className="text-xs font-semibold uppercase tracking-wider text-primary">
            {t("newGame.finalConfirmation")}
          </span>
        </div>

        <h1 className="text-4xl font-black font-display uppercase mb-4">
          {t("newGame.readyToBegin")} <span className="text-primary glow-text">{t("newGame.begin")}</span>
        </h1>
        <p className="text-muted-foreground">
          {t("newGame.reviewSelectionsBeforeStart")}
        </p>
      </div>

      {/* Top row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="card-arcade rounded-xl p-4 flex items-center gap-4">
          <div
            className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              database.creatorType === "official"
                ? "bg-primary/20 text-primary"
                : "bg-blue-500/20 text-blue-400"
            }`}
          >
            <Database className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <p className="text-xs text-muted-foreground uppercase">{t("newGame.database")}</p>
            <p className="font-semibold">{database.name}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground uppercase">{t("newGame.startDate")}</p>
            <p className="font-semibold text-primary">{database.startDate}</p>
          </div>
        </div>

        <div className="card-arcade rounded-xl p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-primary/50 flex items-center justify-center">
            {manager.name ? (
              <span className="text-sm font-black text-primary-foreground">
                {manager.name
                  .split(" ")
                  .map((n) => n[0])
                  .join("")
                  .toUpperCase()
                  .slice(0, 2)}
              </span>
            ) : (
              <UserRound className="w-5 h-5 text-primary-foreground/50" />
            )}
          </div>
          <div className="flex-1">
            <p className="text-xs text-muted-foreground uppercase">{t("newGame.manager")}</p>
            <p className="font-semibold">{manager.name}</p>
          </div>
          <div className="flex items-center gap-3">
            {manager.nationality && (
              <span
                className={`fi fi-${manager.nationality.flag}`}
                style={{ width: "1.5rem", height: "1rem", borderRadius: "2px" }}
              />
            )}
            {manager.background && (
              <span className="px-2 py-1 text-[10px] font-bold uppercase bg-primary/20 text-primary rounded">
                {t(`newGame.backgrounds.${manager.background.id}.name`, { defaultValue: manager.background.name })}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Big card */}
      <div className="card-arcade rounded-2xl p-8 border-glow">
        <div className="flex items-center gap-6 mb-8">
          <ClubLogo
            logoUrl={
              activeLeague
                ? squadLogoUrl(team.squadId, activeLeague.slug, team.slug)
                : undefined
            }
            primaryColor={team.colors[0]}
            secondaryColor={team.colors[1]}
            className="w-20 h-20 rounded-xl shrink-0 bg-card/60 border border-border/30"
            imgClassName="w-full h-full object-contain p-2"
          />
          <div>
            <h2 className="text-3xl font-black font-display uppercase text-primary">
              {team.name}
            </h2>
            <p className="text-muted-foreground flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              {profile?.city ?? country.name}, {country.name}
              {profile?.founded ? ` • ${t("newGame.est")} ${profile.founded}` : ""}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-6 mb-8">
          <div className="text-center p-4 rounded-xl bg-card/50">
            <p className="text-3xl font-black text-primary">
              {activeLeague?.season ?? "—"}
            </p>
            <p className="text-xs text-muted-foreground uppercase mt-1">{t("newGame.leagueSeason")}</p>
          </div>
          <div className="text-center p-4 rounded-xl bg-card/50">
            <div className="flex justify-center gap-0.5 mb-1">
              {[...Array(5)].map((_, i) => (
                <Star
                  key={i}
                  className={`w-5 h-5 ${
                    profile && i < profile.reputation
                      ? "text-yellow-400 fill-yellow-400"
                      : "text-muted-foreground/30"
                  }`}
                />
              ))}
            </div>
            <p className="text-xs text-muted-foreground uppercase mt-1">
              {profile
                ? t(`newGame.reputationLevel.${profile.reputation}`, { defaultValue: profile.reputationLabel })
                : t("newGame.reputation")}
            </p>
          </div>
          <div className="text-center p-4 rounded-xl bg-card/50">
            <p className="text-3xl font-black text-primary">
              {profile
                ? Math.round((profile.attack + profile.midfield + profile.defense) / 3)
                : "—"}
            </p>
            <p className="text-xs text-muted-foreground uppercase mt-1">{t("newGame.squadRating")}</p>
          </div>
        </div>

        <div className="border-t border-border/30 pt-6">
          <p className="text-sm text-muted-foreground leading-relaxed text-center italic">
            "{stripHtml(country.headline)}"
          </p>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Small helpers
// ──────────────────────────────────────────────────────────────────────────────

function ComingSoonTile({
  icon: Icon,
  label,
  soonLabel,
}: {
  icon: typeof Database;
  label: string;
  soonLabel: string;
}) {
  return (
    <div className="relative p-5 rounded-xl border-2 border-dashed border-border/40 bg-card/20 flex flex-col items-center justify-center text-center min-h-[180px] opacity-60">
      <Icon className="w-8 h-8 text-muted-foreground/40 mb-3" />
      <p className="text-sm font-semibold text-muted-foreground">{label}</p>
      <span className="mt-2 flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-muted-foreground/70">
        <Lock className="w-2.5 h-2.5" />
        {soonLabel}
      </span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-2 rounded-lg bg-background/50">
      <p className="text-sm font-bold">{value}</p>
      <p className="text-[9px] text-muted-foreground uppercase">{label}</p>
    </div>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Calendar;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <Icon className="w-4 h-4 text-primary" />
      <div>
        <p className="text-xs text-muted-foreground uppercase">{label}</p>
        <p className="font-semibold text-sm">{value}</p>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  primary,
}: {
  label: string;
  value: string;
  primary?: boolean;
}) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-semibold ${primary ? "text-primary" : ""}`}>{value}</span>
    </div>
  );
}

function ProfileField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}

