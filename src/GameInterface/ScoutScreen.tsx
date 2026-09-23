import { useState, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { PageHeadline } from "@/GameInterface/Components/PageHeadline";
import { ScoutFilters } from "@/GameInterface/Scout/ScoutFilters";
import { createDefaultScoutFilters, type ScoutFilterState } from "@/GameInterface/Scout/scoutFilterState";
import type { LeagueData, Squad } from "@/types/playerTypes";
import type { CountryEntry } from "@/types/worldTypes";
import { ScoutTable } from "@/GameInterface/Scout/ScoutTable";
import { loadSession } from "@/GameInterface/gameSession";
import { PlayerOfferModal } from "@/GameInterface/Components/PlayerOfferModal";
import type { DisplayPlayer } from "@/GameInterface/playerHelpers";
import type { TransferRecord } from "@/types/transferTypes";
import type { ScoutQuery, ScoutSearchResponse, ScoutSortDir } from "@/Domain/scout/scoutQuery";
import { countryDisplayName, leagueLabel } from "@/Domain/world/labels";
import countriesRaw from "@/Data/countries.json";

const countries: CountryEntry[] = Object.values(countriesRaw as Record<string, CountryEntry>);
const COUNTRY_BY_NAME = new Map(countries.map((c) => [c.name, c]));

const FILTERS_STORAGE_KEY = "scout_filters_v1";
const PAGE_SIZE = 100;

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
  const { t, i18n } = useTranslation();
  const [session] = useState(() => loadSession());
  const [filters, setFilters] = useState<ScoutFilterState>(() => loadFilters());
  const debouncedFilters = useDebounced(filters, 1_000);

  const [sortKey, setSortKey] = useState<string>("avg");
  const [sortDir, setSortDir] = useState<ScoutSortDir>("desc");
  const [page, setPage] = useState(0);
  /** Bumped to re-run the current search (e.g. after an accepted transfer). */
  const [refreshTick, setRefreshTick] = useState(0);

  const [result, setResult] = useState<ScoutSearchResponse | null>(null);
  const [fetching, setFetching] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [leagueRows, setLeagueRows] = useState<LeagueData[]>([]);
  const [mySquadId, setMySquadId] = useState<string>("");
  const [offerTarget, setOfferTarget] = useState<DisplayPlayer | null>(null);

  const isFiltering = filters !== debouncedFilters || fetching;

  // Reset the page to 0 exactly once per settled query change (debounced filters or sort) —
  // not on every keystroke. Comparing + resetting during render (rather than in a `useEffect`)
  // means the fetch effect below only ever sees the final, already-reset page, so a filter or
  // sort change fires a single request instead of one with the stale page plus a follow-up.
  const [committedQuery, setCommittedQuery] = useState({ filters: debouncedFilters, sortKey, sortDir });
  if (
    committedQuery.filters !== debouncedFilters
    || committedQuery.sortKey !== sortKey
    || committedQuery.sortDir !== sortDir
  ) {
    setCommittedQuery({ filters: debouncedFilters, sortKey, sortDir });
    setPage(0);
  }

  function handleSetFilters(f: ScoutFilterState) {
    setFilters(f);
    saveFilters(f);
  }

  function handleSort(key: string) {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  // Static data: league list (filter options) and the user's squad id (disables offers on own players).
  useEffect(() => {
    if (!session) { window.location.href = "/new-game"; return; }
    fetch("/api/leagues")
      .then((r) => r.json() as Promise<LeagueData[]>)
      .then((leagues) => setLeagueRows(Array.isArray(leagues) ? leagues : []))
      .catch(() => setLeagueRows([]));
    fetch(`/api/saves/${session.saveId}/squad/${session.leagueSlug}/${session.clubId}`)
      .then(async (r) => (r.ok ? ((await r.json()) as Squad) : null))
      .then((squad) => setMySquadId(squad?.id ?? session.clubId))
      .catch(() => setMySquadId(session.clubId));
  }, [session]);

  // Server-side search: re-run on (debounced) filter, sort, page, or explicit refresh.
  useEffect(() => {
    if (!session) return;
    const controller = new AbortController();
    const query: ScoutQuery = { filters: debouncedFilters, sortKey, sortDir, page, pageSize: PAGE_SIZE };
    setFetching(true);
    fetch(`/api/saves/${session.saveId}/scout-search`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(query),
      signal: controller.signal,
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`scout-search failed with status ${r.status}`);
        return (await r.json()) as ScoutSearchResponse;
      })
      .then((res) => {
        if (controller.signal.aborted) return;
        setResult(res);
        setFetchError(false);
        // The server clamps out-of-range pages; follow it so the pager stays consistent.
        if (res.page !== page) setPage(res.page);
        setFetching(false);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setFetchError(true);
        setFetching(false);
      });
    return () => controller.abort();
  }, [session, debouncedFilters, sortKey, sortDir, page, refreshTick]);

  const leagueFilterOptions = useMemo(
    () => [
      { value: "all", label: t("scout.allLeagues") },
      ...leagueRows.map((l) => {
        const country = COUNTRY_BY_NAME.get(l.country);
        const countryName = country ? countryDisplayName(country, i18n.language, t) : l.country;
        return { value: l.slug, label: leagueLabel(l, countryName) };
      }),
    ],
    [leagueRows, t, i18n.language],
  );

  const nationalities = result?.nationalities;
  const nationalityFilterOptions = useMemo(
    () => [
      { value: "all", label: t("scout.allNationalities") },
      ...(nationalities ?? []).map((n) => ({ value: n, label: n })),
    ],
    [nationalities, t],
  );

  const sellListedIds = useMemo(() => new Set(result?.sellListedIds ?? []), [result]);

  function refreshAfterTransfer(record: TransferRecord) {
    if (record.status !== "accepted") return;
    setRefreshTick((n) => n + 1);
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
          rows={result?.rows ?? []}
          total={result?.total ?? 0}
          page={result?.page ?? 0}
          pageSize={result?.pageSize ?? PAGE_SIZE}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={handleSort}
          onPageChange={setPage}
          loading={!result && fetching}
          filtering={isFiltering}
          mySquadId={mySquadId}
          onOffer={setOfferTarget}
          sellListedIds={sellListedIds}
          error={fetchError}
          onRetry={() => setRefreshTick((n) => n + 1)}
        />
      </div>

      <PlayerOfferModal
        player={offerTarget}
        onClose={() => setOfferTarget(null)}
        onTransferComplete={refreshAfterTransfer}
      />
    </>
  );
}
