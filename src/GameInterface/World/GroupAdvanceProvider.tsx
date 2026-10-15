import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { useSocial } from "@/GameInterface/Social/useSocial";
import { updateSessionCurrentDate } from "@/GameInterface/gameSession";
import { groupAdvanceApi } from "@/GameInterface/World/groupAdvanceApi";
import { summaryOutcome } from "@/GameInterface/World/groupAdvanceText";
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
  const { subscribe } = useSocial();
  const enabled = !!session?.groupAdvance;
  const saveId = session?.saveId ?? "";
  const [view, setView] = useState<GroupAdvanceView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dayLog, setDayLog] = useState<AdvanceDayResponse | null>(null);
  const [notice, setNotice] = useState<SeasonNotice | null>(null);
  const lastDate = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    const r = await groupAdvanceApi.view(saveId);
    if (r.ok) setView(r.data);
  }, [enabled, saveId]);

  // The days that ran while the seat was away: shown on the dashboard, once the world stopped.
  const showSummary = useCallback(async () => {
    if (!enabled || window.location.pathname !== "/dashboard") return;
    const r = await groupAdvanceApi.summary(saveId);
    if (!r.ok) return;
    const out = summaryOutcome(r.data.days);
    if (!out) return;
    if (out.sacked) {
      await groupAdvanceApi.clearSummary(saveId);
      window.location.href = "/fired";
      return;
    }
    const res = await fetch(`/api/saves/${encodeURIComponent(saveId)}/days/${encodeURIComponent(out.lastDate)}`).catch(() => null);
    if (res?.ok) setDayLog({ ...(await res.json()), newDate: out.newDate } as AdvanceDayResponse);
    if (out.notice) setNotice(out.notice);
    if (!res?.ok && !out.notice) await groupAdvanceApi.clearSummary(saveId);
  }, [enabled, saveId]);

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

  const dismissDay = () => {
    setDayLog(null);
    if (!notice) void groupAdvanceApi.clearSummary(saveId);
    void refreshSave();
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
      {dayLog && <DaySummaryModal dayLog={dayLog} onDismiss={dismissDay} mySquadId={mySquadId} leagues={leagues} />}
      {notice && !dayLog && (
        <SeasonNoticeModal notice={notice} leagues={leagues} currentLeagueName={session?.leagueName ?? ""} onDismiss={dismissNotice} />
      )}
    </GroupAdvanceContext.Provider>
  );
}
