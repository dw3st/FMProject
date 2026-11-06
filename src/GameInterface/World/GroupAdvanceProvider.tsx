import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { isOnlyMe, myTurnNow, othersNowReady } from "@/Domain/groupAdvance/readyNotice";
import { Icon } from "@/GameInterface/Icons";
import { announceTurn } from "@/GameInterface/World/turnNotice";
import { armReadySound, playReadySound } from "@/GameInterface/readySound";
import { useSocial } from "@/GameInterface/Social/useSocial";
import { updateSessionCurrentDate } from "@/GameInterface/gameSession";
import { groupAdvanceApi } from "@/GameInterface/World/groupAdvanceApi";
import { notifySeatOffersChanged } from "@/GameInterface/Negotiation/seatOfferApi";
import { summaryOutcome } from "@/GameInterface/World/groupAdvanceText";
import { isDashboardPath } from "@/GameInterface/World/worldNav";
import { SeasonNoticeModal } from "@/GameInterface/Components/SeasonNoticeModal";
import type { SeasonNotice } from "@/GameInterface/useAdvanceDay";
import type { GroupAdvanceView } from "@/types/groupAdvanceTypes";
import { RENEWAL_URL } from "@/GameInterface/useAdvanceDay";
import type { LeagueData } from "@/types/playerTypes";
import { navigate, useRoute } from "@/GameInterface/router/navigation";

export interface GroupAdvanceContextValue {
  enabled: boolean;
  view: GroupAdvanceView | null;
  busy: boolean;
  error: string | null;
  /** `until`: "tomorrow", "next_match", a date, or null (not ready). */
  markReady: (until: string | null) => Promise<void>;
  simulateToday: () => Promise<void>;
  undoSimulate: () => Promise<void>;
  /** "Try again" after the executor gave up on a failed day. */
  retryAdvance: () => Promise<void>;
  refresh: () => Promise<void>;
}

const OFF: GroupAdvanceContextValue = {
  enabled: false, view: null, busy: false, error: null,
  markReady: async () => {}, simulateToday: async () => {}, undoSimulate: async () => {}, retryAdvance: async () => {}, refresh: async () => {},
};

const GroupAdvanceContext = createContext<GroupAdvanceContextValue>(OFF);

export function useGroupAdvance(): GroupAdvanceContextValue {
  return useContext(GroupAdvanceContext);
}

/** Group advance of a multi world (`.claude/rules/game/multiplayer.md`, part 3): state, socket, pending summary. */
export function GroupAdvanceProvider({ leagues, mySquadId, children }: { leagues: LeagueData[]; mySquadId: string; children: ReactNode }) {
  const { session, refresh: refreshSave } = useGameSave();
  const { t } = useTranslation();
  const { subscribe, connected, me } = useSocial();
  const enabled = !!session?.groupAdvance;
  const saveId = session?.saveId ?? "";
  const [view, setView] = useState<GroupAdvanceView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The days that ran without the seat looking, as one summary.
  const [notice, setNotice] = useState<SeasonNotice | null>(null);
  const [turnCard, setTurnCard] = useState(false);
  const lastDate = useRef<string | null>(null);
  const inFlight = useRef(false);
  /** Last date of the summary already shown (or dismissed): a late concurrent fetch never reopens it. */
  const shownKey = useRef<string | null>(null);
  /** Who the world was waiting for, and my nickname: another manager leaving the list plays the chime. */
  const waitingRef = useRef<string[] | null>(null);
  const nickRef = useRef<string | null>(null);
  nickRef.current = me?.nickname ?? null;
  const membersRef = useRef(0);
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
        navigate("/fired");
        return;
      }
      if (!out.notice) {
        await groupAdvanceApi.clearSummary(saveId);
        void refreshSave({ background: true });
        return;
      }
      if (!isDashboardPath(window.location.pathname) || shownKey.current === out.lastDate) return;
      shownKey.current = out.lastDate;
      setNotice(out.notice);
    } finally {
      inFlight.current = false;
    }
  }, [enabled, saveId, t]);

  useEffect(() => {
    void refresh().then(() => showSummary());
  }, [refresh, showSummary]);

  // The provider lives in the fixed frame (8.8): a summary held back off the dashboard shows when he gets there.
  const { pathname } = useRoute();
  const onDashboard = isDashboardPath(pathname);
  useEffect(() => {
    if (onDashboard) void showSummary();
  }, [onDashboard, showSummary]);

  useEffect(() => {
    if (!view) return;
    waitingRef.current = view.waitingFor;
    membersRef.current = view.members.length;
  }, [view]);

  useEffect(() => (enabled ? armReadySound() : undefined), [enabled]);

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
      const myTurn = membersRef.current > 1 && myTurnNow(waitingRef.current, event.waitingFor, nickRef.current);
      if (myTurn || othersNowReady(waitingRef.current, event.waitingFor, nickRef.current).length > 0) playReadySound();
      if (myTurn) {
        setTurnCard(true);
        announceTurn(t("world.advance.turn.title"), t("world.advance.turn.body"));
      }
      waitingRef.current = event.waitingFor;
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
  }, [enabled, saveId, subscribe, refresh, refreshSave, showSummary, t]);

  const markReady = useCallback(async (until: string | null) => {
    setBusy(true);
    setError(null);
    const r = await groupAdvanceApi.ready(saveId, until);
    if (!r.ok && r.error === "renewalPending") { navigate(RENEWAL_URL); return; }
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
    if (!r.ok && r.error === "renewalPending") { navigate(RENEWAL_URL); return; }
    if (!r.ok) setError(r.error);
    await refresh();
    setBusy(false);
  }, [saveId, view, refresh]);

  const undoSimulate = useCallback(async () => {
    const d = view?.me.decision;
    if (!view || !d || d.mode !== "simulate" || d.date !== view.currentDate) return;
    setBusy(true);
    setError(null);
    const r = await groupAdvanceApi.undoSimulate(saveId, d.date, d.fixtureId);
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

  const dismissNotice = () => {
    setNotice(null);
    void groupAdvanceApi.clearSummary(saveId);
    void refreshSave({ background: true });
  };

  const value: GroupAdvanceContextValue = enabled
    ? { enabled, view, busy, error, markReady, simulateToday, undoSimulate, retryAdvance, refresh }
    : OFF;

  return (
    <GroupAdvanceContext.Provider value={value}>
      {children}
      {turnCard && !notice && isOnlyMe(view?.waitingFor, me?.nickname ?? null) && (
        <div role="status" className="fixed top-16 right-6 z-50 w-[300px] rounded-md border border-primary bg-card shadow-lg flex items-start gap-2 p-3">
          <Icon name="bell" size={16} className="shrink-0 text-primary mt-0.5" />
          <span className="flex-1 min-w-0 text-sm text-muted-foreground">
            <span className="block font-semibold text-foreground">{t("world.advance.turn.title")}</span>
            {t("world.advance.turn.body")}
          </span>
          <button
            type="button"
            onClick={() => setTurnCard(false)}
            aria-label={t("social.popup.dismiss")}
            className="shrink-0 bg-transparent border-0 p-0 text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      )}
      {notice && (
        <SeasonNoticeModal notice={notice} leagues={leagues} currentLeagueName={session?.leagueName ?? ""} currentClubId={session?.clubId ?? ""} onDismiss={dismissNotice} />
      )}
    </GroupAdvanceContext.Provider>
  );
}
