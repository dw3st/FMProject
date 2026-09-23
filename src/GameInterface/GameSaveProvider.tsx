import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { SaveMeta } from "@/backend/SaveService";
import type { TrainingIntensity } from "@/types/developmentTypes";
import { DEFAULT_MIN_ENERGY_TO_TRAIN, DEFAULT_TRAINING_INTENSITY } from "@/types/developmentTypes";
import { loadSession, saveSession, type GameSession } from "@/GameInterface/gameSession";
import type { Fixture, SeasonData } from "@/types/calendarTypes";
import type { Squad } from "@/types/playerTypes";
import type { InboxMessage } from "@/types/inboxTypes";

export type GameSaveApiResponse = SaveMeta & { season?: SeasonData };

export interface GameSaveContextValue {
  session: GameSession | null;
  squad: Squad | null;
  save: GameSaveApiResponse | null;
  loading: boolean;
  /** Calendar from the loaded save (empty if no season). */
  fixtures: Fixture[];
  /** ISO dates that are rest days (pre-seeded + user toggles). */
  restDays: string[];
  /** Best-known sim date from save or session. */
  currentDate: string;
  /** Inbox messages for the active save (newest first). Null until first fetch completes. */
  inboxMessages: InboxMessage[] | null;
  /** Cached unread count derived from inboxMessages. */
  unreadInboxCount: number;
  /** Refetch save JSON + club squad; syncs budget, tactics fields, and session storage. */
  refresh: () => Promise<void>;
  /** Refetch inbox messages only. */
  refreshInbox: () => Promise<void>;
  /** Persist and broadcast session updates (e.g. after tactics APIs that already wrote to disk). */
  mergeSession: (patch: Partial<GameSession>) => void;
  /** Toggle a future non-game day between "training" and "rest". Optimistically updates local state. */
  toggleDayType: (date: string, type: "training" | "rest") => Promise<void>;
  /** Update inbox messages locally (after mark-read calls) without refetching. */
  setInboxMessages: (updater: (prev: InboxMessage[] | null) => InboxMessage[] | null) => void;
}

const GameSaveContext = createContext<GameSaveContextValue | null>(null);

function sessionFromSaveJson(s: GameSession, raw: GameSaveApiResponse): GameSession {
  return {
    ...s,
    currentDate: raw.currentDate ?? s.currentDate,
    formation: raw.formation ?? s.formation,
    tactical_style: raw.tactical_style ?? s.tactical_style,
    min_energy_to_train:
      raw.min_energy_to_train != null
        ? Math.min(100, Math.max(0, Number(raw.min_energy_to_train)))
        : (s.min_energy_to_train ?? DEFAULT_MIN_ENERGY_TO_TRAIN),
    training_intensity:
      (raw.training_intensity as TrainingIntensity | undefined) ??
      s.training_intensity ??
      DEFAULT_TRAINING_INTENSITY,
  };
}

export function GameSaveProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<GameSession | null>(() => loadSession());
  const [squad, setSquad] = useState<Squad | null>(null);
  const [save, setSave] = useState<GameSaveApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [restDaysOverride, setRestDaysOverride] = useState<string[] | null>(null);
  const [inboxMessages, setInboxMessagesState] = useState<InboxMessage[] | null>(null);

  const mergeSession = useCallback((patch: Partial<GameSession>) => {
    setSession((prev) => {
      const base = prev ?? loadSession();
      if (!base) return null;
      const next = { ...base, ...patch } as GameSession;
      saveSession(next);
      return next;
    });
  }, []);

  const toggleDayType = useCallback(async (date: string, type: "training" | "rest") => {
    const s = loadSession();
    if (!s) return;
    // Optimistic update
    setRestDaysOverride((prev) => {
      const current = new Set(prev ?? save?.season?.restDays ?? []);
      if (type === "rest") current.add(date);
      else current.delete(date);
      return Array.from(current).sort();
    });
    try {
      const res = await fetch(`/api/saves/${s.saveId}/day-type/${date}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      if (res.ok) {
        const data = (await res.json()) as { restDays: string[] };
        setRestDaysOverride(data.restDays);
      }
    } catch {
      setRestDaysOverride(null);
    }
  }, [save?.season?.restDays]);

  const refreshInbox = useCallback(async () => {
    const s = loadSession();
    if (!s) {
      setInboxMessagesState(null);
      return;
    }
    try {
      const res = await fetch(`/api/saves/${s.saveId}/inbox`);
      if (!res.ok) {
        setInboxMessagesState(null);
        return;
      }
      const data = (await res.json()) as InboxMessage[];
      setInboxMessagesState(Array.isArray(data) ? data : []);
    } catch {
      setInboxMessagesState(null);
    }
  }, []);

  const setInboxMessages = useCallback(
    (updater: (prev: InboxMessage[] | null) => InboxMessage[] | null) => {
      setInboxMessagesState((prev) => updater(prev));
    },
    [],
  );

  const refresh = useCallback(async () => {
    const s = loadSession();
    if (!s) {
      setSession(null);
      setSquad(null);
      setSave(null);
      setInboxMessagesState(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [saveRes, squadRes, inboxRes] = await Promise.all([
        fetch(`/api/saves/${s.saveId}`),
        fetch(`/api/saves/${s.saveId}/squad/${s.leagueSlug}/${s.clubId}`),
        fetch(`/api/saves/${s.saveId}/inbox`),
      ]);

      const saveJson = saveRes.ok ? ((await saveRes.json()) as GameSaveApiResponse) : null;
      const squadJson = squadRes.ok ? ((await squadRes.json()) as Squad) : null;
      const inboxJson = inboxRes.ok ? ((await inboxRes.json()) as InboxMessage[]) : null;

      let nextSession = s;
      if (saveJson) {
        nextSession = sessionFromSaveJson(s, saveJson);
      }
      if (squadJson?.finances?.budget != null) {
        nextSession = { ...nextSession, budget: squadJson.finances.budget };
      }
      if (saveJson || squadJson) {
        saveSession(nextSession);
      }
      setSession(nextSession);
      setSave(saveJson);
      setSquad(squadJson);
      setInboxMessagesState(Array.isArray(inboxJson) ? inboxJson : null);
      setRestDaysOverride(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const fixtures = useMemo(() => save?.season?.calendar ?? [], [save]);
  const restDays = useMemo(
    () => restDaysOverride ?? save?.season?.restDays ?? [],
    [restDaysOverride, save?.season?.restDays],
  );
  const currentDate = useMemo(
    () => save?.currentDate ?? session?.currentDate ?? "",
    [save?.currentDate, session?.currentDate],
  );
  const unreadInboxCount = useMemo(
    () => (inboxMessages ?? []).reduce((acc, m) => (m.read ? acc : acc + 1), 0),
    [inboxMessages],
  );

  const value = useMemo(
    (): GameSaveContextValue => ({
      session,
      squad,
      save,
      loading,
      fixtures,
      restDays,
      currentDate,
      inboxMessages,
      unreadInboxCount,
      refresh,
      refreshInbox,
      mergeSession,
      toggleDayType,
      setInboxMessages,
    }),
    [
      session,
      squad,
      save,
      loading,
      fixtures,
      restDays,
      currentDate,
      inboxMessages,
      unreadInboxCount,
      refresh,
      refreshInbox,
      mergeSession,
      toggleDayType,
      setInboxMessages,
    ],
  );

  return <GameSaveContext.Provider value={value}>{children}</GameSaveContext.Provider>;
}

export function useGameSave(): GameSaveContextValue {
  const ctx = useContext(GameSaveContext);
  if (!ctx) {
    throw new Error("useGameSave must be used within GameSaveProvider");
  }
  return ctx;
}
