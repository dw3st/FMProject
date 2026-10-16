import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { useSocial } from "@/GameInterface/Social/useSocial";
import { updateSessionCurrentDate } from "@/GameInterface/gameSession";
import { groupAdvanceApi } from "@/GameInterface/World/groupAdvanceApi";
import { notifySeatOffersChanged } from "@/GameInterface/Negotiation/seatOfferApi";
import { summaryOutcome } from "@/GameInterface/World/groupAdvanceText";
import { isDashboardPath } from "@/GameInterface/World/worldNav";
import { DaySummaryModal } from "@/GameInterface/Components/DaySummaryModal";
import { SeasonNoticeModal } from "@/GameInterface/Components/SeasonNoticeModal";
import type { SeasonNotice } from "@/GameInterface/useAdvanceDay";
import type { GroupAdvanceView, PendingSummaryAggregate } from "@/types/groupAdvanceTypes";
import type { LeagueData } from "@/types/playerTypes";

export interface GroupAdvanceContextValue {
  enabled: boolean;
  view: GroupAdvanceView | null;
  busy: boolean;
  error: string | null;
  /** `until`: "tomorrow", "next_match", a date, or null (not ready). */
  markReady: (until: string | null) => Promise<void>;
  simulateToday: () => Promise<void>;
  /** "Try again" after the executor gave up on a failed day. */
  retryAdvance: () => Promise<void>;
  refresh: () => Promise<void>;
}

const OFF: GroupAdvanceContextValue = {
  enabled: false, view: null, busy: false, error: null,
  markReady: async () => {}, simulateToday: async () => {}, retryAdvance: async () => {}, refresh: async () => {},
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
  // The days that ran without the seat looking, as one summary.
  const [summary, setSummary] = useState<PendingSummaryAggregate | null>(null);
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

  // The days that ran while the seat was away: a sacking sends him to /fired from any screen; the summary (one
  // window for every day, built by the server) only shows on the dashboard, once the world stopped.
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
      setSummary(r.data.aggregate);
      if (out.notice) setNotice(out.notice);
      if (!r.data.aggregate && !out.notice) await groupAdvanceApi.clearSummary(saveId);
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
      // Another manager touched an offer with this seat (part 4): inbox, squad and the open offer cards reload.
      if (event.type === "seat_offer" && event.saveId === saveId) {
        void refreshSave({ background: true });
        notifySeatOffersChanged();
        return;
      }
      if (event.type !== "world_progress" || event.saveId !== saveId) return;
      // The executor's failure lives in the view (a code, with the next retry); the action error stays the seat's own.
      setView((v) => (v
        ? { ...v, currentDate: event.date, target: event.target, running: event.running, waitingFor: event.waitingFor, error: event.error ?? null }
        : v));
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

  const retryAdvance = useCallback(async () => {
    setBusy(true);
    setError(null);
    const r = await groupAdvanceApi.retry(saveId);
    if (!r.ok) setError(r.error);
    await refresh();
    setBusy(false);
  }, [saveId, refresh]);

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
    setSummary(null);
    if (!notice) void groupAdvanceApi.clearSummary(saveId);
    void refreshSave({ background: true });
  };
  const dismissNotice = () => {
    setNotice(null);
    void groupAdvanceApi.clearSummary(saveId);
    void refreshSave({ background: true });
  };

  const value: GroupAdvanceContextValue = enabled
    ? { enabled, view, busy, error, markReady, simulateToday, retryAdvance, refresh }
    : OFF;

  return (
    <GroupAdvanceContext.Provider value={value}>
      {children}
      {summary && (
        <DaySummaryModal
          dayLog={summary.log} range={summary.range} notices={summary.notices} matchReportDate={summary.matchReportDate}
          onDismiss={dismissDay} mySquadId={mySquadId} leagues={leagues}
        />
      )}
      {notice && !summary && (
        <SeasonNoticeModal notice={notice} leagues={leagues} currentLeagueName={session?.leagueName ?? ""} onDismiss={dismissNotice} />
      )}
    </GroupAdvanceContext.Provider>
  );
}
