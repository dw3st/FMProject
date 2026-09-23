import { useState, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { PageHeadline } from "@/GameInterface/Components/PageHeadline";
import { ScoutFilters } from "@/GameInterface/Scout/ScoutFilters";
import { createDefaultScoutFilters, type ScoutFilterState } from "@/GameInterface/Scout/scoutFilterState";

const FILTERS_STORAGE_KEY = "scout_filters_v1";

function loadFilters(): ScoutFilterState {
  try {
    const raw = localStorage.getItem(FILTERS_STORAGE_KEY);
    if (!raw) return createDefaultScoutFilters();
    return { ...createDefaultScoutFilters(), ...JSON.parse(raw) };
  } catch {
    return createDefaultScoutFilters();
  }
}

let _saveTimer: ReturnType<typeof setTimeout> | null = null;
function saveFilters(f: ScoutFilterState) {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    try { localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(f)); } catch { /* unavailable */ }
  }, 400);
}
import type { LeagueData } from "@/types/playerTypes";
import { ScoutTable } from "@/GameInterface/Scout/ScoutTable";
import { loadSession } from "@/GameInterface/gameSession";
import { PlayerOfferModal } from "@/GameInterface/Components/PlayerOfferModal";
import { mapSquadsToScoutPlayers } from "@/Domain/scout/scoutQuery";
import type { DisplayPlayer } from "@/GameInterface/playerHelpers";
import type { Squad } from "@/types/playerTypes";
import type { TransferRecord } from "@/types/transferTypes";

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setDebounced(value), delay);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [value, delay]);
  return debounced;
}

export function ScoutScreen() {
  const { t } = useTranslation();
  const [filters, setFilters] = useState<ScoutFilterState>(() => loadFilters());
  const debouncedFilters = useDebounced(filters, 1_000);
  const isFiltering = filters !== debouncedFilters;

  function handleSetFilters(f: ScoutFilterState) {
    setFilters(f);
    saveFilters(f);
  }

  const [allPlayers, setAllPlayers] = useState<DisplayPlayer[]>([]);
  const [leagueRows, setLeagueRows] = useState<Pick<LeagueData, "slug" | "name">[]>([]);
  const [loading, setLoading] = useState(true);
  const [mySquadId, setMySquadId] = useState<string>("");
  const [offerTarget, setOfferTarget] = useState<DisplayPlayer | null>(null);
  const [sellListedIds, setSellListedIds] = useState<Set<string>>(new Set());

  const leagueFilterOptions = useMemo(
    () => [
      { value: "all", label: t("scout.allLeagues") },
      ...leagueRows.map((l) => ({ value: l.slug, label: l.name })),
    ],
    [leagueRows, t],
  );

  const nationalityFilterOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of allPlayers) {
      if (p.nationality) set.add(p.nationality);
    }
    return [
      { value: "all", label: t("scout.allNationalities") },
      ...[...set].sort((a, b) => a.localeCompare(b)).map((n) => ({ value: n, label: n })),
    ];
  }, [allPlayers, t]);

  useEffect(() => {
    const session = loadSession();
    if (!session) { window.location.href = "/new-game"; return; }

    Promise.all([
      fetch(`/api/saves/${session.saveId}/all-squads`).then((r) => r.json() as Promise<Squad[]>),
      fetch("/api/leagues").then((r) => r.json() as Promise<LeagueData[]>),
      fetch(`/api/saves/${session.saveId}/squad/${session.leagueSlug}/${session.clubId}`),
      fetch(`/api/saves/${session.saveId}/sell-listed-players`).then((r) => r.json() as Promise<string[]>),
    ])
      .then(async ([squads, leagues, mySquadRes, sellIds]) => {
        const mySquadJson = mySquadRes.ok ? ((await mySquadRes.json()) as Squad) : null;
        const myId = mySquadJson?.id ?? session.clubId;
        setMySquadId(myId);
        const list = Array.isArray(leagues) ? leagues : [];
        setLeagueRows(list.map((l) => ({ slug: l.slug, name: l.name })));
        const leagueSlugs = list.map((l) => l.slug);
        setAllPlayers(mapSquadsToScoutPlayers(squads, leagueSlugs));
        setSellListedIds(new Set(Array.isArray(sellIds) ? sellIds : []));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  function refreshScoutPlayersAfterTransfer(record: TransferRecord) {
    if (record.status !== "accepted") return;
    const session = loadSession();
    if (!session) return;
    Promise.all([
      fetch(`/api/saves/${session.saveId}/all-squads`).then((r) => r.json() as Promise<Squad[]>),
      fetch("/api/leagues").then((r) => r.json() as Promise<LeagueData[]>),
    ]).then(([squads, leagues]) => {
      const list = Array.isArray(leagues) ? leagues : [];
      const leagueSlugs = list.map((l) => l.slug);
      setAllPlayers(mapSquadsToScoutPlayers(squads, leagueSlugs));
    });
  }

  return (
    <>
      <div className="flex-1 p-4 flex flex-col gap-4 overflow-auto">
        <PageHeadline backHref="/dashboard">
          {t("scout.title")} <span className="text-primary glow-text">{t("scout.database")}</span>
        </PageHeadline>

        <ScoutFilters
          filters={filters}
          setFilters={handleSetFilters}
          leagueOptions={leagueFilterOptions}
          nationalityOptions={nationalityFilterOptions}
        />
        <ScoutTable
          filters={debouncedFilters}
          players={allPlayers}
          loading={loading}
          filtering={isFiltering}
          mySquadId={mySquadId}
          onOffer={setOfferTarget}
          sellListedIds={sellListedIds}
        />
      </div>

      <PlayerOfferModal
        player={offerTarget}
        onClose={() => setOfferTarget(null)}
        onTransferComplete={refreshScoutPlayersAfterTransfer}
      />
    </>
  );
}
