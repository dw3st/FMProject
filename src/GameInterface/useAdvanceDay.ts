import { useState, useCallback, useMemo, useRef } from "react";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { updateSessionCurrentDate } from "@/GameInterface/gameSession";
import { useKeybinds } from "@/GameInterface/useKeybinds";
import type { AdvanceDayResponse } from "@/types/dayLogTypes";
import type { ClubMove } from "@/types/pyramidTypes";

/** The fast-forward button only shows when the next player match is more than this many days away. */
const FAST_FORWARD_MIN_DAYS = 2;
const FAST_FORWARD_BATCH_DAYS = 7;

/** One season rollover of the player's country, as the notice modal shows it. */
export interface SeasonNotice {
  archiveYear?: number;
  moves: ClubMove[];
  playerMove: ClubMove | null;
  playerChampionOf: string | null;
}

export interface FastForwardProgress {
  daysAdvanced: number;
  /** Days from the start of the run to the current target (the target moves after a rollover). */
  totalDays: number;
  currentDate: string;
  stopping: boolean;
  error: string | null;
}

interface AdvanceUntilResponse {
  newDate: string | null;
  daysAdvanced: number;
  target: string | null;
  matchDate: string | null;
  done: boolean;
  seasonEvents: SeasonNotice[];
  error?: string;
}

const DAY_MS = 86_400_000;
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / DAY_MS);
}
function previousDay(d: string): string {
  return new Date(Date.parse(d + "T00:00:00Z") - DAY_MS).toISOString().slice(0, 10);
}

export function useAdvanceDay() {
  const { session, squad, fixtures, currentDate: simDate, refresh } = useGameSave();

  const [advancing, setAdvancing] = useState(false);
  const [dayLog, setDayLog] = useState<AdvanceDayResponse | null>(null);
  const [fastForward, setFastForward] = useState<FastForwardProgress | null>(null);
  const [seasonNotice, setSeasonNotice] = useState<SeasonNotice | null>(null);
  const stopRequested = useRef(false);

  const mySquadId = squad?.id ?? session?.clubId ?? "";

  /** The player's next unplayed match on or after today, from the loaded league calendar. */
  const nextMatchDate = useMemo(() => {
    if (!simDate || !mySquadId) return null;
    const dates = fixtures
      .filter((f) => !f.played && f.date >= simDate && (f.home === mySquadId || f.away === mySquadId))
      .map((f) => f.date)
      .sort();
    return dates[0] ?? null;
  }, [fixtures, simDate, mySquadId]);

  // No upcoming match in the loaded calendar = waiting for the season rollover: also far away.
  const canFastForward =
    !!session && !!simDate && (nextMatchDate === null || daysBetween(simDate, nextMatchDate) > FAST_FORWARD_MIN_DAYS);

  const handleAdvanceDay = useCallback(async () => {
    if (!session || advancing || fastForward) return;

    const todayFixture = fixtures.find(
      (f) =>
        f.date === simDate &&
        (f.home === mySquadId || f.away === mySquadId) &&
        !f.played,
    );
    if (todayFixture) {
      window.location.href = "/match-preview";
      return;
    }

    setAdvancing(true);
    try {
      const res = await fetch(`/api/advance-day/${session.saveId}`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to advance day");
      const log = (await res.json()) as AdvanceDayResponse;
      setDayLog(log);
      if (log.seasonEnded) {
        setSeasonNotice({
          archiveYear: log.archiveYear,
          moves: log.moves ?? [],
          playerMove: log.playerMove ?? null,
          playerChampionOf: log.playerChampionOf ?? null,
        });
      }
    } catch {
      // silently fail for now
    } finally {
      setAdvancing(false);
    }
  }, [session, mySquadId, advancing, fastForward, fixtures, simDate]);

  const handleFastForward = useCallback(async () => {
    if (!session || advancing || fastForward || !simDate) return;
    stopRequested.current = false;
    const initialTotal = nextMatchDate ? Math.max(1, daysBetween(simDate, nextMatchDate) - 1) : 1;
    let progress: FastForwardProgress = {
      daysAdvanced: 0, totalDays: initialTotal, currentDate: simDate, stopping: false, error: null,
    };
    setFastForward(progress);
    setAdvancing(true);

    let lastDate = simDate;
    let notice: SeasonNotice | null = null;
    try {
      for (;;) {
        const res = await fetch(`/api/saves/${session.saveId}/advance-until`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ maxDays: FAST_FORWARD_BATCH_DAYS }),
        });
        const body = (await res.json().catch(() => null)) as AdvanceUntilResponse | null;
        if (!body) throw new Error(`HTTP ${res.status}`);
        if (body.newDate) lastDate = body.newDate;
        const advanced = progress.daysAdvanced + (body.daysAdvanced ?? 0);
        const remaining = body.target && body.newDate ? Math.max(0, daysBetween(body.newDate, body.target)) : 0;
        progress = { ...progress, daysAdvanced: advanced, totalDays: advanced + remaining, currentDate: lastDate };
        setFastForward(progress);
        if (body.seasonEvents?.length) notice = body.seasonEvents[body.seasonEvents.length - 1]!;
        if (!res.ok || body.error) throw new Error(body.error ?? `HTTP ${res.status}`);
        if (body.done || stopRequested.current || body.daysAdvanced === 0) break;
      }
    } catch (err) {
      progress = { ...progress, error: err instanceof Error ? err.message : String(err) };
      setFastForward(progress);
    }

    // Reload like Continuar does: day summary of the last simulated day, then the session.
    updateSessionCurrentDate(lastDate);
    if (progress.daysAdvanced > 0) {
      try {
        const res = await fetch(`/api/saves/${session.saveId}/days/${previousDay(lastDate)}`);
        if (res.ok) setDayLog({ ...(await res.json()), newDate: lastDate } as AdvanceDayResponse);
      } catch {
        // the summary is optional
      }
    }
    if (notice) setSeasonNotice(notice);
    await refresh();
    setAdvancing(false);
    // Keep the panel open only to show an error.
    if (!progress.error) setFastForward(null);
  }, [session, advancing, fastForward, simDate, nextMatchDate, refresh]);

  const stopFastForward = useCallback(() => {
    stopRequested.current = true;
    setFastForward((p) => (p ? { ...p, stopping: true } : p));
  }, []);

  const dismissFastForward = useCallback(() => setFastForward(null), []);

  const dismissDayLog = useCallback(() => {
    if (dayLog?.newDate) {
      updateSessionCurrentDate(dayLog.newDate);
    }
    setDayLog(null);
    void refresh();
  }, [dayLog, refresh]);

  const dismissSeasonNotice = useCallback(() => {
    setSeasonNotice(null);
    // The session picks up the new league / club from the server.
    void refresh();
  }, [refresh]);

  useKeybinds("dashboard", { advanceDay: handleAdvanceDay });

  return {
    handleAdvanceDay,
    advancing,
    dayLog,
    dismissDayLog,
    canFastForward,
    handleFastForward,
    fastForward,
    stopFastForward,
    dismissFastForward,
    seasonNotice,
    dismissSeasonNotice,
  };
}
