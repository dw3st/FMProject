import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { LeagueData, LeagueTeam } from "@/types/playerTypes";
import type { CountryEntry } from "@/types/worldTypes";
import { createGameSave, loadGameSave } from "@/GameInterface/gameSession";
import { worldApi } from "@/GameInterface/World/worldApi";
import { WORLD } from "@/Domain/multiplayer/worldConfig";
import { PUBLIC_WORLD } from "@/Domain/multiplayer/publicWorldConfig";
import { capture } from "@/analytics";
import { PreSeasonLoadingScreen } from "@/GameInterface/PreSeasonLoadingScreen";
import { ClubLogo, squadLogoUrl } from "@/GameInterface/Components/ClubLogo";
import { Flag } from "@/GameInterface/Components/Flag";
import { formatEurosDetailed } from "@/Domain/money";
import { PitchBackdrop } from "@/GameInterface/Components/PitchBackdrop";
import { Wordmark } from "@/GameInterface/Components/Wordmark";
import { Button } from "@/GameInterface/ui/Button";
import { ChoiceCard } from "@/GameInterface/ui/ChoiceCard";
import { Label } from "@/GameInterface/ui/Label";
import { OptionChips } from "@/GameInterface/ui/OptionChips";
import { Notice } from "@/GameInterface/ui/Notice";
import { ScreenTitle } from "@/GameInterface/ui/ScreenTitle";
import { SectionTitle } from "@/GameInterface/ui/SectionTitle";
import { StatBar } from "@/GameInterface/ui/StatBar";
import { SegmentedTabs } from "@/GameInterface/ui/SegmentedTabs";
import { TextField } from "@/GameInterface/ui/TextField";
import { Icon } from "@/GameInterface/Icons";
import { getDetailedPositionColor } from "@/GameInterface/positionHelpers";
import { WorldMap } from "@/GameInterface/NewGame/WorldMap";
import { ManagerAvatarEditor } from "@/GameInterface/NewGame/ManagerAvatarEditor";
import { FaceImage, playerInitials } from "@/GameInterface/Components/PlayerFace";
import { managerAvatarUrl } from "@/Domain/faces/faceUrl";
import { managerFaceCountry, randomFaceSeed, type ManagerFace } from "@/Domain/faces/managerFace";
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
  /** The board may sack the manager (`.claude/rules/game/board-fans.md`); pre-selected yes. */
  sackingEnabled: boolean;
  /** Avatar (Etapa 31b): seed + picked traits, saved in the save meta. */
  face: ManagerFace;
};

const database = (databasesRaw as DatabaseEntry[]).find((d) => d.playable) ?? null;
const countries: CountryEntry[] = Object.values(countriesRaw as Record<string, CountryEntry>);

/**
 * Free-text fields of the wizard never show the browser's own autofill / history popup (issue
 * #66: it pops up in the browser's font over the manager name). `autoComplete="off"` covers the
 * history list; the neutral `name`s plus the password-manager opt-outs keep Chrome's name/address
 * heuristics and LastPass/1Password/Dashlane from attaching to them.
 */
const NO_AUTOFILL = {
  autoComplete: "off",
  autoCorrect: "off",
  spellCheck: false,
  "data-form-type": "other",
  "data-lpignore": "true",
  "data-1p-ignore": "true",
} as const;

const isManagerValid = (m: ManagerData) =>
  m.name.trim().length >= 2 && !!m.background && !!m.nationality;

/**
 * Joining a world (`/join/:code` for a league of friends, or the public world from the mode step): the same wizard,
 * without the mode step, human clubs disabled.
 */
export interface JoinContext {
  /** Absent (or "friends") = a league of friends joined by its invite code; "public" = the server's world. */
  kind?: "friends" | "public";
  code: string;
  worldName: string;
  takenClubs: string[];
  leagueSlug?: string;
  leagueName?: string;
  /** Only these leagues (and their countries) are offered (the public world). */
  allowedLeagues?: readonly string[];
  /** Called after a 409 clubTaken: the page rereads the world and passes the new `takenClubs`. */
  onClubTaken?: () => void;
}

/** `/new-game?mode=public` opens the wizard with the public world picked. */
function initialPlayMode(): "solo" | "multi" | "public" {
  if (typeof window === "undefined") return "solo";
  return new URLSearchParams(window.location.search).get("mode") === "public" ? "public" : "solo";
}

export function NewGameWizard({ join: friendsJoin }: { join?: JoinContext }) {
  const { t, i18n } = useTranslation();
  /** Set when the public world is picked in the mode step (and the manager has no seat there yet). */
  const [publicJoin, setPublicJoin] = useState<JoinContext | null>(null);
  const join = friendsJoin ?? publicJoin ?? undefined;
  const [modeError, setModeError] = useState<string | null>(null);
  const [modeBusy, setModeBusy] = useState(false);
  const [manager, setManager] = useState<ManagerData>(() => ({
    name: "", background: null, nationality: null, sackingEnabled: true, face: { seed: randomFaceSeed() },
  }));
  const [step, setStep] = useState<"mode" | "manager" | "club">(join ? "manager" : "mode");
  /** Solo career, a world of friends (multiplayer part 2) or the public world (part 5b). */
  const [playMode, setPlayMode] = useState<"solo" | "multi" | "public">(initialPlayMode);
  /** Came from "Join" on the start screen: the public world is already chosen, so the mode step is skipped. */
  const [fromPublicLink] = useState(() => !friendsJoin && initialPlayMode() === "public");
  const taken = useMemo(() => new Set(join?.takenClubs ?? []), [join?.takenClubs]);
  const [searchQuery, setSearchQuery] = useState("");
  const [countriesOpen, setCountriesOpen] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState<CountryEntry | null>(null);
  const [leagues, setLeagues] = useState<LeagueData[]>([]);
  const [selectedLeagueSlug, setSelectedLeagueSlug] = useState<string>("");
  const allowedLeagues = join?.allowedLeagues;
  const allowedLeagueSet = useMemo(() => (allowedLeagues ? new Set(allowedLeagues) : null), [allowedLeagues]);
  const offeredLeagues = useMemo(
    () => (allowedLeagueSet ? leagues.filter((l) => allowedLeagueSet.has(l.slug)) : leagues),
    [allowedLeagueSet, leagues],
  );
  const allowedCountries = useMemo(
    () => (allowedLeagueSet ? new Set(offeredLeagues.map((l) => l.country)) : null),
    [allowedLeagueSet, offeredLeagues],
  );
  const listCountries = allowedCountries ? countries.filter((c) => allowedCountries.has(c.name)) : countries;
  const mapCountries = useMemo(
    () => (allowedCountries ? countries.map((c) => ({ ...c, playable: c.playable && allowedCountries.has(c.name) })) : countries),
    [allowedCountries],
  );
  const [selectedTeam, setSelectedTeam] = useState<LeagueTeam | null>(null);
  const [profiles, setProfiles] = useState<Record<string, ClubProfile>>({});
  const [starting, setStarting] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  /** Country highlighted in both the list and the map; `from` says which side the pointer is on. */
  const [hovered, setHovered] = useState<{ slug: string; from: "list" | "map" } | null>(null);
  const countryListRef = useRef<HTMLDivElement>(null);

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
      setSelectedLeagueSlug(leaguesOfCountry(offeredLeagues, selectedCountry.name)[0]?.slug ?? "");
    }
  }, [selectedCountry, offeredLeagues]);

  // Joining: start on the world's league (applied once; the picker stays free afterwards).
  const joinLeagueSlug = join?.leagueSlug;
  const appliedJoinLeague = useRef(false);
  const [pendingJoinLeague, setPendingJoinLeague] = useState(false);
  useEffect(() => {
    if (!joinLeagueSlug || appliedJoinLeague.current) return;
    const league = leagues.find((l) => l.slug === joinLeagueSlug);
    if (!league) return;
    const country = countries.find((c) => c.name === league.country);
    if (!country) { appliedJoinLeague.current = true; return; }
    appliedJoinLeague.current = true;
    setSelectedCountry(country);
    setPendingJoinLeague(true);
  }, [joinLeagueSlug, leagues]);
  // Runs after the country-change reset above, which picks the country's first league.
  useEffect(() => {
    if (!pendingJoinLeague || !selectedCountry || !joinLeagueSlug) return;
    setSelectedLeagueSlug(joinLeagueSlug);
    setPendingJoinLeague(false);
  }, [pendingJoinLeague, selectedCountry, joinLeagueSlug]);

  const displayName = (c: CountryEntry) => countryDisplayName(c, i18n.language, t);
  const filteredCountries = listCountries.filter((c) => {
    const continentName = t(`newGame.continents.${continentI18nKey(c.continent ?? "Other")}`, {
      defaultValue: c.continent ?? "Other",
    });
    return matchesCountryQuery(searchQuery, [displayName(c), c.name, continentName]);
  });
  const groups = groupCountriesByContinent(filteredCountries, displayName);

  const countryLeagues = selectedCountry ? leaguesOfCountry(offeredLeagues, selectedCountry.name) : [];
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

  // Hovering a country on the map brings its row into view in the list. Only the list scrolls
  // (never `scrollIntoView`, which also moves the page), smoothly unless reduced motion is on.
  useEffect(() => {
    if (hovered?.from !== "map") return;
    const list = countryListRef.current;
    const row = list?.querySelector<HTMLElement>(`[data-country-slug="${hovered.slug}"]`);
    if (!list || !row) return;
    const listRect = list.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    const margin = 8;
    let delta = 0;
    if (rowRect.top < listRect.top) delta = rowRect.top - listRect.top - margin;
    else if (rowRect.bottom > listRect.bottom) delta = rowRect.bottom - listRect.bottom + margin;
    if (delta === 0) return;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    list.scrollBy({ top: delta, behavior: reduceMotion ? "auto" : "smooth" });
  }, [hovered]);

  const hoverFromList = (slug: string) => setHovered({ slug, from: "list" });
  const leaveFromList = (slug: string) =>
    setHovered((h) => (h?.slug === slug && h.from === "list" ? null : h));

  async function handleStartCareer() {
    if (!database || !managerValid || !selectedTeam || !activeLeague || !manager.background || !manager.nationality || starting) {
      return;
    }
    setStarting(true);
    setStartError(null);
    if (join) {
      const body = {
        clubId: selectedTeam.squadId,
        manager: {
          name: manager.name.trim(),
          nationalityIso: manager.nationality.id,
          backgroundId: manager.background.id,
          face: manager.face,
        },
        sackingEnabled: manager.sackingEnabled,
      };
      const r = join.kind === "public" ? await worldApi.joinPublic(body) : await worldApi.join({ code: join.code, ...body });
      if (!r.ok) {
        setStarting(false);
        setStartError(t(`world.errors.${r.error}`));
        if (r.error === "clubTaken") {
          setSelectedTeam(null);
          join.onClubTaken?.();
        }
        return;
      }
      try {
        await loadGameSave(r.data.saveId);
      } catch {
        // The world screen reloads the session itself.
        window.location.href = r.data.phase === "running" ? "/dashboard" : "/world";
        return;
      }
      window.location.href = r.data.phase === "lobby" ? "/world" : "/dashboard";
      return;
    }
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
          face:           manager.face,
        },
        sackingEnabled: manager.sackingEnabled,
        mode: playMode === "multi" ? "multi" : "solo",
      });

      capture("career_started", {
        league: activeLeague.slug,
        club: selectedTeam.name,
        database: database.id,
      });

      // A world of friends waits in the lobby: the owner starts it from the league screen.
      if (playMode === "multi") {
        window.location.href = "/world";
        return;
      }

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

  /** Leaves the mode step; the public world first asks whether the manager already has a seat there. */
  async function continueFromMode() {
    if (playMode !== "public") {
      setStep("manager");
      return;
    }
    setModeBusy(true);
    setModeError(null);
    const r = await worldApi.publicInfo();
    if (!r.ok) {
      setModeBusy(false);
      setModeError(t(`world.errors.${r.error}`));
      return;
    }
    if (r.data.joined) {
      try {
        await loadGameSave(r.data.saveId);
        window.location.href = "/dashboard";
      } catch {
        setModeBusy(false);
        setModeError(t("world.errors.generic"));
      }
      return;
    }
    setModeBusy(false);
    setPublicJoin({
      kind: "public",
      code: "",
      worldName: t("world.public.name"),
      takenClubs: r.data.takenClubs,
      allowedLeagues: PUBLIC_WORLD.LEAGUES,
      onClubTaken: () => {
        void worldApi.publicInfo().then((again) => {
          if (again.ok) setPublicJoin((cur) => (cur ? { ...cur, takenClubs: again.data.takenClubs } : cur));
        });
      },
    });
    setStep("manager");
  }

  useEffect(() => {
    if (fromPublicLink) void continueFromMode();
    // Once, on mount: the link already picked the public world.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (preparing) return <PreSeasonLoadingScreen />;

  if (step === "mode" && fromPublicLink && !modeError) {
    return <WizardFrame backdrop><div className="flex-1" /></WizardFrame>;
  }

  if (step === "mode") {
    return (
      <WizardFrame backdrop>
        <div className="flex-1 min-h-0 md:overflow-y-auto">
          <div className="flex min-h-full flex-col">
            <div className="m-auto w-full max-w-[720px] p-6 md:p-8">
              <ScreenTitle subtitle={t("newGame.mode.subtitle")}>{t("newGame.mode.title")}</ScreenTitle>
              <div className="grid gap-3 mt-8 sm:grid-cols-3">
                <ChoiceCard
                  title={t("newGame.mode.solo")}
                  description={t("newGame.mode.soloDetail")}
                  selected={playMode === "solo"}
                  onSelect={() => setPlayMode("solo")}
                />
                <ChoiceCard
                  title={t("newGame.mode.multi")}
                  description={t("newGame.mode.multiDetail", { max: WORLD.MAX_MEMBERS })}
                  selected={playMode === "multi"}
                  onSelect={() => setPlayMode("multi")}
                />
                <ChoiceCard
                  title={t("newGame.mode.public")}
                  description={t("newGame.mode.publicDetail", { max: PUBLIC_WORLD.MAX_MEMBERS })}
                  selected={playMode === "public"}
                  onSelect={() => setPlayMode("public")}
                />
              </div>
              {modeError && <p role="alert" className="text-sm text-destructive mt-4">{modeError}</p>}
              <div className="flex items-center gap-2 mt-8">
                <Button variant="secondary" className="px-3" onClick={() => { window.location.href = "/start"; }}>
                  {t("newGame.back")}
                </Button>
                <Button className="flex-1" disabled={modeBusy} onClick={() => void continueFromMode()}>{t("newGame.mode.next")}</Button>
              </div>
            </div>
          </div>
        </div>
      </WizardFrame>
    );
  }

  if (step === "manager") {
    return (
      <WizardFrame backdrop>
        {/* Same card as the club step; the form keeps its reading width and scrolls inside. */}
        <div className="flex-1 min-h-0 md:overflow-y-auto">
          <div className="flex min-h-full flex-col">
            <div className="m-auto w-full max-w-[1000px] p-6 md:p-8">
              <ManagerForm
                initial={manager}
                onCancel={() => {
                  if (friendsJoin) window.location.href = `/join/${friendsJoin.code}`;
                  else if (fromPublicLink) window.location.href = "/start";
                  else {
                    setPublicJoin(null);
                    setStep("mode");
                  }
                }}
                onSubmit={(m) => {
                  setManager(m);
                  setStep("club");
                }}
              />
            </div>
          </div>
        </div>
      </WizardFrame>
    );
  }

  const countryList = (
    <>
      <Label htmlFor="new-game-country-search" className="mb-2">{t("newGame.countryLabel")}</Label>
      <div className="relative mb-4">
        <Icon name="search" size={16} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          id="new-game-country-search"
          type="text"
          {...NO_AUTOFILL}
          name="fmp-territory"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t("newGame.searchTerritory")}
          aria-label={t("newGame.searchTerritory")}
          className="w-full h-10 bg-transparent border border-border rounded pl-9 pr-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
        />
      </div>
      <div ref={countryListRef} className="flex-1 overflow-y-auto min-h-0">
        {groups.map((group) => (
          <div key={group.continent} className="mb-4">
            <p className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground mb-1 mt-0 px-2">
              {t(`newGame.continents.${continentI18nKey(group.continent)}`, { defaultValue: group.continent })}
            </p>
            <ul className="list-none p-0 m-0">
              {group.countries.map((country) => {
                const selected = selectedCountry?.slug === country.slug;
                const lit = hovered?.slug === country.slug;
                return (
                  <li key={country.slug}>
                    <button
                      type="button"
                      data-country-slug={country.slug}
                      onMouseEnter={() => hoverFromList(country.slug)}
                      onMouseLeave={() => leaveFromList(country.slug)}
                      onFocus={() => hoverFromList(country.slug)}
                      onBlur={() => leaveFromList(country.slug)}
                      disabled={!country.playable}
                      title={!country.playable ? t("common.comingSoon") : undefined}
                      onClick={() => {
                        setSelectedCountry(country);
                        setCountriesOpen(false);
                      }}
                      aria-pressed={selected}
                      className={`w-full h-8 flex items-center gap-2 px-2 rounded text-left text-sm border-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                        selected
                          ? "bg-primary/10 text-primary"
                          : lit
                            ? "bg-foreground/10 text-foreground"
                            : "bg-transparent text-foreground hover:bg-foreground/5"
                      }`}
                    >
                      <Flag code={country.flag} />
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
    <WizardFrame>
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
        <section className="flex-1 min-w-0 min-h-0 flex flex-col px-6 pt-5 md:pb-0 pb-5">
          <p className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground m-0 mb-2">{t("newGame.stepOf", { n: 2 })}</p>
          <ScreenTitle subtitle={join ? (join.leagueName ? t("world.join.clubSubtitle", { world: join.worldName, league: join.leagueName }) : t("world.join.clubSubtitleNoLeague", { world: join.worldName })) : undefined}>{t("newGame.chooseClubTitle")}</ScreenTitle>
          {!selectedCountry ? (
            <div className="flex-1 min-h-0 overflow-y-auto pb-5">
              <p className="text-sm text-muted-foreground mt-6 xl:hidden">{t("newGame.selectTerritoryDetail")}</p>
              <div className="hidden xl:block mt-6">
                <WorldMap
                  countries={mapCountries}
                  selectedSlug={null}
                  displayName={displayName}
                  onSelect={setSelectedCountry}
                  hoveredSlug={hovered?.slug ?? null}
                  onHover={(c) => setHovered(c ? { slug: c.slug, from: "map" } : null)}
                />
              </div>
            </div>
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
              <div className="overflow-x-auto mt-4 shrink-0">
                <SegmentedTabs
                  tabs={countryLeagues.map((l) => ({ key: l.slug, label: l.name }))}
                  active={selectedLeagueSlug}
                  onChange={(slug) => {
                    setSelectedLeagueSlug(slug);
                    setSelectedTeam(null);
                  }}
                  className="whitespace-nowrap [&>button]:shrink-0"
                />
              </div>
              {countryLeagues.length === 0 ? (
                <p className="text-sm text-muted-foreground mt-4">{t("common.loading")}</p>
              ) : (
                <ul className="list-none p-0 m-0 mt-2 flex-1 min-h-0 md:overflow-y-auto pb-5">
                  {teams.map((club) => {
                    const selected = selectedTeam?.squadId === club.squadId;
                    const profile = profiles[club.squadId];
                    const humanClub = taken.has(club.squadId);
                    return (
                      <li key={club.squadId}>
                        <button
                          type="button"
                          onClick={() => setSelectedTeam(club)}
                          aria-pressed={selected}
                          disabled={humanClub}
                          title={humanClub ? t("world.join.humanClub") : undefined}
                          className={`w-full flex items-center gap-3 min-h-12 px-2 py-2 text-left border-0 border-t border-border cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
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
                          {humanClub && <span className="text-sm text-muted-foreground shrink-0">{t("world.join.humanClub")}</span>}
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

        <aside className="md:w-80 shrink-0 md:border-l border-t md:border-t-0 border-border flex flex-col min-h-0">
          <div className="flex-1 min-h-0 md:overflow-y-auto px-6 pt-5 pb-4">
            {selectedTeam ? (
              <ClubProfilePanel club={selectedTeam} profile={selectedProfile} />
            ) : (
              <p className="text-sm text-muted-foreground m-0">{t("newGame.selectClubDetail")}</p>
            )}
          </div>

          {/* Action row: outside the scrolling area, always at the bottom of the card. */}
          <div className="shrink-0 border-t border-border px-6 py-4">
            {startError && (
              <Notice kind="error" className="mb-3">
                {startError}
              </Notice>
            )}
            <div className="flex items-center gap-3 mb-3 min-w-0">
            <FaceImage
              src={managerAvatarUrl(manager.face, managerFaceCountry(manager.nationality?.id), selectedTeam?.colors)}
              size={40}
              fallback={playerInitials(manager.name || "?")}
            />
            <p className="text-sm text-muted-foreground m-0 truncate">
              {manager.nationality && managerValid
                ? t("newGame.managerLine", {
                    name: manager.name.trim(),
                    country: t(`newGame.nationalities.${manager.nationality.id}`, {
                      defaultValue: manager.nationality.name,
                    }),
                  })
                : t("newGame.managerEmpty")}
            </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" className="px-3" onClick={() => setStep("manager")}>
                {t("newGame.back")}
              </Button>
              <Button className="flex-1" onClick={handleStartCareer} disabled={!canStart}>
                {starting
                  ? t("newGame.creatingSeave")
                  : selectedTeam
                    ? t(join ? "world.join.joinWith" : "newGame.startWith", { club: selectedTeam.name })
                    : t("newGame.startCareer")}
              </Button>
            </div>
          </div>
        </aside>
      </main>
    </WizardFrame>
  );
}

/**
 * Page and card shared by both wizard steps. From `md` the page is exactly one viewport tall and
 * the card always has the same frame (1600 px max, the height the wordmark leaves), so moving
 * between the manager form, the world map and a country's club list never resizes it; each column
 * scrolls on its own, so the action row stays visible (issue #66).
 */
function WizardFrame({ backdrop = false, children }: { backdrop?: boolean; children: ReactNode }) {
  return (
    <div className="min-h-screen md:h-dvh md:min-h-0 md:overflow-hidden flex flex-col items-center bg-background px-4 py-6 text-foreground">
      <Wordmark size="lg" className="mb-6 block text-center shrink-0" />
      <div className="relative flex w-full max-w-[1600px] flex-1 min-h-0">
        {backdrop && <PitchBackdrop players={false} scene="new-game" />}
        <div className="relative flex w-full flex-1 flex-col md:flex-row min-h-0 md:overflow-hidden rounded-md border border-border bg-background/90">
          {children}
        </div>
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
          <SectionTitle>{club.name}</SectionTitle>
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
                <span className={`${getDetailedPositionColor(p.position)} shrink-0 text-right`}>{p.position}</span>
                <span className="w-9 shrink-0 text-right tabular-nums text-muted-foreground">{score(p.ovr)}</span>
              </li>
            ))}
          </ul>

          <SectionLabel>{t("newGame.finances")}</SectionLabel>
          <dl className="m-0 flex flex-col gap-1 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{t("newGame.annualRevenue")}</dt>
              <dd className="m-0 tabular-nums">{formatEurosDetailed(profile.annualRevenue)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{t("newGame.weeklyWages")}</dt>
              <dd className="m-0 tabular-nums">
                {formatEurosDetailed(profile.weeklyWages)}
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
  const { t, i18n } = useTranslation();
  const [draft, setDraft] = useState<ManagerData>(initial);
  const nationalityName = (nat: Nationality) => t(`newGame.nationalities.${nat.id}`, { defaultValue: nat.name });
  // Alphabetical by the name in the current language.
  const nationalities = [...MANAGER_NATIONALITIES].sort((a, b) => nationalityName(a).localeCompare(nationalityName(b), i18n.language));

  useEffect(() => {
    setDraft(initial);
  }, [initial]);

  return (
    <div>
      <p className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground m-0 mb-2">{t("newGame.stepOf", { n: 1 })}</p>
      <ScreenTitle subtitle={t("newGame.managerSubtitle")}>{t("newGame.createManagerTitle")}</ScreenTitle>

      <div className="grid gap-8 mt-8 md:grid-cols-[1fr_1.4fr]">
        <div>
          <TextField
            id="new-game-coach"
            label={t("newGame.managerName")}
            type="text"
            {...NO_AUTOFILL}
            name="fmp-coach"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder={t("newGame.enterName")}
          />

          <Label className="mt-6 mb-2">{t("newGame.nationality")}</Label>
          <OptionChips
            aria-label={t("newGame.nationality")}
            columns="grid-cols-2 sm:grid-cols-3 md:grid-cols-2"
            value={draft.nationality?.id ?? null}
            onChange={(id) => {
              const nat = MANAGER_NATIONALITIES.find((n) => n.id === id);
              if (nat) setDraft({ ...draft, nationality: nat });
            }}
            options={nationalities.map((nat) => ({
              key: nat.id,
              label: (
                <>
                  <Flag code={nat.flag} />
                  {nationalityName(nat)}
                </>
              ),
            }))}
          />

          <Label className="mt-6 mb-2">{t("newGame.sackingLabel")}</Label>
          <OptionChips
            aria-label={t("newGame.sackingLabel")}
            value={draft.sackingEnabled ? "yes" : "no"}
            onChange={(k) => setDraft({ ...draft, sackingEnabled: k === "yes" })}
            options={[
              { key: "yes", label: t("newGame.sackingYes") },
              { key: "no", label: t("newGame.sackingNo") },
            ]}
          />
          <p className="text-sm text-muted-foreground mt-2 mb-0">{t("newGame.sackingHint")}</p>
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
                description={t(`newGame.backgrounds.${bg.id}.description`, { defaultValue: bg.description })}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-8">
        <Label className="mb-3">{t("newGame.avatar.title")}</Label>
        <ManagerAvatarEditor
          face={draft.face}
          nationality={managerFaceCountry(draft.nationality?.id)}
          initials={playerInitials(draft.name || "?")}
          onChange={(face) => setDraft({ ...draft, face })}
        />
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
