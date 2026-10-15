import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { useSocial } from "@/GameInterface/Social/useSocial";
import { updateSessionCurrentDate } from "@/GameInterface/gameSession";
import { groupAdvanceApi } from "@/GameInterface/World/groupAdvanceApi";
import { summaryOutcome } from "@/GameInterface/World/groupAdvanceText";
import { isDashboardPath } from "@/GameInterface/World/worldNav";
import { DaySummaryModal } from "@/GameInterface/Components/DaySummaryModal";
import { SeasonNoticeModal } from "@/GameInterface/Components/SeasonNoticeModal";
import type { SeasonNotice } from "@/GameInterface/useAdvanceDay";
import type { AdvanceDayResponse } from "@/types/dayLogTypes";
import type { GroupAdvanceView } from "@/types/groupAdvanceTypes";
import type { LeagueData } from "@/types/playerTypes";

export interface GroupAdvanceContextValue {
  enabled: boolean;
  view: GroupAdvanceView | null;
  busy: boolean;
  error: string | null;
  /** `until`: "tomorrow", "next_match", a date, or null (not ready). */
  markReady: (until: string | null) => Promise<void>;
  simulateToday: () => Promise<void>;
  refresh: () => Promise<void>;
}

const OFF: GroupAdvanceContextValue = {
  enabled: false, view: null, busy: false, error: null,
  markReady: async () => {}, simulateToday: async () => {}, refresh: async () => {},
};

const GroupAdvanceContext = createContext<GroupAdvanceContextValue>(OFF);

export function useGroupAdvance(): GroupAdvanceContextValue {
  return useContext(GroupAdvanceContext);
}

/** Group advance of a multi world (`.claude/rules/game/multiplayer.md`, part 3): state, socket, pending summary. */
export function GroupAdvanceProvider({ leagues, mySquadId, children }: { leagues: LeagueData[]; mySquadId: string; children: ReactNode }) {
  const { session, refresh: refreshSave } = useGameSave();
  const { t } = useTranslation();
  const { subscribe, connected } = useSocial();
  const enabled = !!session?.groupAdvance;
  const saveId = session?.saveId ?? "";
  const [view, setView] = useState<GroupAdvanceView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One modal per day that ran without the seat looking, oldest first.
  const [dayQueue, setDayQueue] = useState<AdvanceDayResponse[]>([]);
  const [notice, setNotice] = useState<SeasonNotice | null>(null);
  const lastDate = useRef<string | null>(null);
  const inFlight = useRef(false);
  /** Last date of the summary already shown (or dismissed): a late concurrent fetch never reopens it. */
  const shownKey = useRef<string | null>(null);
  const wasConnected = useRef(false);
  const everConnected = useRef(false);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    const r = await groupAdvanceApi.view(saveId);
    if (r.ok) setView(r.data);
    else if (r.status === 0) setError("network");
  }, [enabled, saveId, t]);

  // The days that ran while the seat was away: a sacking sends him to /fired from any screen; the day modals
  // (one per day, oldest first) only show on the dashboard, once the world stopped.
  const showSummary = useCallback(async () => {
    if (!enabled || inFlight.current) return;
    inFlight.current = true;
    try {
      const r = await groupAdvanceApi.summary(saveId);
      if (!r.ok) {
        if (r.status === 0) setError("network");
        return;
      }
      const out = summaryOutcome(r.data.days);
      if (!out) return;
      if (out.sacked) {
        await groupAdvanceApi.clearSummary(saveId);
        window.location.href = "/fired";
        return;
      }
      if (!isDashboardPath(window.location.pathname) || shownKey.current === out.lastDate) return;
      shownKey.current = out.lastDate;
      const logs = await Promise.all(r.data.days.map(async (d) => {
        const res = await fetch(`/api/saves/${encodeURIComponent(saveId)}/days/${encodeURIComponent(d.date)}`).catch(() => null);
        return res?.ok ? ({ ...(await res.json()), newDate: d.newDate } as AdvanceDayResponse) : null;
      }));
      const days = logs.filter((l): l is AdvanceDayResponse => l !== null);
      setDayQueue(days);
      if (out.notice) setNotice(out.notice);
      if (days.length === 0 && !out.notice) await groupAdvanceApi.clearSummary(saveId);
    } finally {
      inFlight.current = false;
    }
  }, [enabled, saveId, t]);

  useEffect(() => {
    void refresh().then(() => showSummary());
  }, [refresh, showSummary]);

  useEffect(() => {
    if (!enabled) return;
    return subscribe((event) => {
      if (event.type !== "world_progress" || event.saveId !== saveId) return;
      setView((v) => (v ? { ...v, currentDate: event.date, target: event.target, running: event.running, waitingFor: event.waitingFor } : v));
      setError(event.error ?? null);
      if (!event.running) {
        updateSessionCurrentDate(event.date);
        void refresh();
        if (lastDate.current !== event.date) {
          lastDate.current = event.date;
          void refreshSave({ background: true }).then(() => showSummary());
        }
      }
    });
  }, [enabled, saveId, subscribe, refresh, refreshSave, showSummary]);

  const markReady = useCallback(async (until: string | null) => {
    setBusy(true);
    setError(null);
    const r = await groupAdvanceApi.ready(saveId, until);
    if (!r.ok) setError(r.error);
    await refresh();
    setBusy(false);
  }, [saveId, refresh]);

  const simulateToday = useCallback(async () => {
    const today = view?.me.matchToday;
    if (!today || !view) return;
    setBusy(true);
    setError(null);
    const r = await groupAdvanceApi.simulate(saveId, view.currentDate, today.fixtureId);
    if (!r.ok) setError(r.error);
    await refresh();
    setBusy(false);
  }, [saveId, view, refresh]);

  // After a socket drop the world may have moved on: look again.
  useEffect(() => {
    if (connected && !wasConnected.current) {
      // The first connect is covered by the mount effect; only a reconnect needs this.
      if (everConnected.current) {
        void refresh().then(() => showSummary());
      }
      everConnected.current = true;
    }
    wasConnected.current = connected;
  }, [connected, refresh, showSummary]);

  const dismissDay = () => {
    const rest = dayQueue.slice(1);
    setDayQueue(rest);
    if (rest.length > 0) return;
    if (notice) void refreshSave({ background: true });
    else {
      void groupAdvanceApi.clearSummary(saveId);
      void refreshSave();
    }
  };
  const dismissNotice = () => {
    setNotice(null);
    void groupAdvanceApi.clearSummary(saveId);
    void refreshSave();
  };

  const value: GroupAdvanceContextValue = enabled
    ? { enabled, view, busy, error, markReady, simulateToday, refresh }
    : OFF;

  return (
    <GroupAdvanceContext.Provider value={value}>
      {children}
      {dayQueue[0] && <DaySummaryModal dayLog={dayQueue[0]} onDismiss={dismissDay} mySquadId={mySquadId} leagues={leagues} />}
      {notice && dayQueue.length === 0 && (
        <SeasonNoticeModal notice={notice} leagues={leagues} currentLeagueName={session?.leagueName ?? ""} onDismiss={dismissNotice} />
      )}
    </GroupAdvanceContext.Provider>
  );
}
