import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { SOCIAL } from "@/Domain/social/socialConfig";
import { forgetSession } from "@/GameInterface/gameSession";
import { socialApi } from "@/GameInterface/Social/socialApi";
import {
  DOCK_STORAGE_KEY,
  closeInDock,
  isRoomVisible,
  openInDock,
  parseDock,
  pruneDmChats,
  toggleInDock,
  type DockChat,
} from "@/GameInterface/Social/chatDockState";
import {
  applyPresence,
  mergeMessages,
  parseServerEvent,
  reconnectAction,
  reconnectDelay,
  totalUnread,
  unreadAfterRead,
  unreadFromLists,
} from "@/GameInterface/Social/socialState";
import { worldApi } from "@/GameInterface/World/worldApi";
import type { WorldInviteView } from "@/types/multiplayerTypes";
import type {
  ChatMessageView,
  ClientEvent,
  FriendsResponse,
  ServerEvent,
  SocialErrorCode,
  SocialMe,
} from "@/types/socialTypes";

/** Close code the server uses when the session logged out: never reconnect. */
const LOGOUT_CLOSE_CODE = 4001;
const EMPTY_LISTS: FriendsResponse = { friends: [], incoming: [], outgoing: [], worlds: [] };

export interface TypingInfo {
  from: string;
  at: number;
}

export interface SocialContextValue {
  me: SocialMe | null;
  setMe: (me: SocialMe) => void;
  lists: FriendsResponse;
  refreshFriends: () => Promise<void>;
  unread: Record<string, number>;
  totalUnread: number;
  /** People with the game open (from the socket's pong); null until known. */
  online: number | null;
  connected: boolean;
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
  dock: DockChat[];
  openChat: (room: string) => void;
  closeChat: (room: string) => void;
  toggleChat: (room: string) => void;
  messages: Record<string, ChatMessageView[]>;
  hasMore: Record<string, boolean>;
  roomErrors: Record<string, SocialErrorCode>;
  typing: Record<string, TypingInfo>;
  loadMessages: (room: string, older: boolean) => Promise<void>;
  send: (room: string, body: string) => Promise<SocialErrorCode | null>;
  markRoomRead: (room: string) => void;
  sendTyping: (room: string) => void;
  /** Invites to worlds of friends (multiplayer part 2). */
  worldInvites: WorldInviteView[];
  refreshWorldInvites: () => Promise<void>;
  declineWorldInvite: (saveId: string) => Promise<void>;
  /** Bumped on `world_members` of the open world: the world screen reloads. */
  worldVersion: number;
}

const SocialContext = createContext<SocialContextValue | null>(null);

export function useSocial(): SocialContextValue {
  const ctx = useContext(SocialContext);
  if (!ctx) throw new Error("useSocial must be used within SocialProvider");
  return ctx;
}

function readDock(): DockChat[] {
  try {
    return parseDock(sessionStorage.getItem(DOCK_STORAGE_KEY));
  } catch {
    return [];
  }
}

function writeDock(dock: DockChat[]): void {
  try {
    sessionStorage.setItem(DOCK_STORAGE_KEY, JSON.stringify(dock));
  } catch {
    // private window or blocked storage: the dock just isn't restored on the next screen
  }
}

/** Friends, chat windows and the socket of one game page (`.claude/rules/social.md`). */
export function SocialProvider({ saveId, children }: { saveId: string | null; children: ReactNode }) {
  const [me, setMe] = useState<SocialMe | null>(null);
  const [lists, setLists] = useState<FriendsResponse>(EMPTY_LISTS);
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [messages, setMessages] = useState<Record<string, ChatMessageView[]>>({});
  const [hasMore, setHasMore] = useState<Record<string, boolean>>({});
  const [roomErrors, setRoomErrors] = useState<Record<string, SocialErrorCode>>({});
  const [typing, setTyping] = useState<Record<string, TypingInfo>>({});
  const [online, setOnline] = useState<number | null>(null);
  const [connected, setConnected] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [dock, setDock] = useState<DockChat[]>(readDock);
  // The socket opens only once `/api/social/me` answered: the lab's /simulate page reuses the Layout on a server
  // without the social routes, and there it must not retry a socket forever.
  const [available, setAvailable] = useState(false);

  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const unreadRef = useRef(unread);
  unreadRef.current = unread;
  const dockRef = useRef(dock);
  dockRef.current = dock;
  const wsRef = useRef<WebSocket | null>(null);
  const lastTypingRef = useRef<Record<string, number>>({});

  useEffect(() => {
    writeDock(dock);
  }, [dock]);

  const refreshFriends = useCallback(async () => {
    const r = await socialApi.friends();
    if (!r.ok) return;
    setLists(r.data);
    setUnread(unreadFromLists(r.data));
    // A DM with someone no longer a friend (unfriended, or renamed) closes; the dock's storage follows.
    setDock((d) => pruneDmChats(d, r.data.friends.map((f) => f.nickname)));
  }, []);

  const [worldInvites, setWorldInvites] = useState<WorldInviteView[]>([]);
  const [worldVersion, setWorldVersion] = useState(0);

  const refreshWorldInvites = useCallback(async () => {
    const r = await worldApi.invites();
    if (r.ok) setWorldInvites(r.data.invites);
  }, []);

  const declineWorldInvite = useCallback(async (inviteSaveId: string) => {
    const r = await worldApi.declineInvite(inviteSaveId);
    if (r.ok) setWorldInvites((prev) => prev.filter((i) => i.saveId !== inviteSaveId));
  }, []);

  useEffect(() => {
    void socialApi.me().then((r) => {
      if (!r.ok) return;
      setMe(r.data);
      setAvailable(true);
    });
    void refreshFriends();
    void refreshWorldInvites();
  }, [refreshFriends, refreshWorldInvites]);

  const sendWs = useCallback((event: ClientEvent) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(event));
  }, []);

  const markRoomRead = useCallback((room: string) => {
    const list = messagesRef.current[room];
    const last = list?.[list.length - 1];
    if (!last || !((unreadRef.current[room] ?? 0) > 0)) return;
    setUnread((prev) => ({ ...prev, [room]: 0 }));
    void socialApi.read(room, last.id);
  }, []);

  const handleEvent = useCallback(
    (event: ServerEvent) => {
      switch (event.type) {
        case "message": {
          // Merge only into a room already loaded; an unloaded room fetches its history when it opens.
          setMessages((prev) =>
            prev[event.room] ? { ...prev, [event.room]: mergeMessages(prev[event.room]!, [event.message]) } : prev,
          );
          setTyping((prev) => {
            if (!prev[event.room]) return prev;
            const next = { ...prev };
            delete next[event.room];
            return next;
          });
          if (event.message.mine) break;
          if (isRoomVisible(dockRef.current, event.room) && !document.hidden) {
            void socialApi.read(event.room, event.message.id);
          } else {
            setUnread((prev) => ({ ...prev, [event.room]: (prev[event.room] ?? 0) + 1 }));
          }
          break;
        }
        case "presence":
          setLists((prev) => ({ ...prev, friends: applyPresence(prev.friends, event) }));
          break;
        case "friend_request":
        case "friend_update":
          void refreshFriends();
          break;
        case "read": {
          // Only what is above the read mark stops counting (a message may have arrived since).
          const left = unreadAfterRead(messagesRef.current[event.room], event.lastReadId);
          if (left === null) void refreshFriends();
          else setUnread((prev) => ({ ...prev, [event.room]: left }));
          break;
        }
        case "typing":
          setTyping((prev) => ({ ...prev, [event.room]: { from: event.from, at: Date.now() } }));
          break;
        case "pong":
          setOnline(event.online);
          break;
        case "world_invite":
          void refreshWorldInvites();
          break;
        case "world_members":
          if (event.saveId === saveId) setWorldVersion((v) => v + 1);
          break;
        case "world_started":
          if (event.saveId === saveId && window.location.pathname === "/world") window.location.replace("/dashboard");
          break;
        case "world_removed":
        case "world_deleted":
          forgetSession(event.saveId);
          if (event.saveId === saveId) window.location.replace("/start");
          break;
      }
    },
    [refreshFriends, refreshWorldInvites, saveId],
  );
  const handleRef = useRef(handleEvent);
  handleRef.current = handleEvent;

  const loadMessages = useCallback(async (room: string, older: boolean) => {
    const current = messagesRef.current[room];
    const before = older ? current?.[0]?.id : undefined;
    if (older && before === undefined) return;
    const r = await socialApi.messages(room, before);
    if (!r.ok) {
      setRoomErrors((prev) => ({ ...prev, [room]: r.error }));
      return;
    }
    setRoomErrors((prev) => {
      if (!prev[room]) return prev;
      const next = { ...prev };
      delete next[room];
      return next;
    });
    setMessages((prev) => ({ ...prev, [room]: mergeMessages(prev[room] ?? [], r.data.messages) }));
    setHasMore((prev) => ({ ...prev, [room]: r.data.hasMore }));
  }, []);

  useEffect(() => {
    if (!available) return;
    let stopped = false;
    let attempt = 0;
    let everOpened = false;
    let failedInARow = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const stop = () => {
      stopped = true;
      setConnected(false);
    };

    const connect = () => {
      if (stopped) return;
      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${proto}://${window.location.host}/api/ws`);
      wsRef.current = ws;
      let opened = false;
      ws.onopen = () => {
        opened = true;
        const reconnected = everOpened;
        everOpened = true;
        attempt = 0;
        failedInARow = 0;
        setConnected(true);
        ws.send(JSON.stringify({ type: "hello", saveId, hidden: document.hidden } satisfies ClientEvent));
        if (reconnected) {
          // Whatever arrived while disconnected: the lists (unread, presence) and every room already loaded.
          void refreshFriends();
          void refreshWorldInvites();
          for (const room of Object.keys(messagesRef.current)) void loadMessages(room, false);
        }
      };
      ws.onmessage = (e) => {
        const event = parseServerEvent(e.data);
        if (event) handleRef.current(event);
      };
      ws.onclose = (e) => {
        if (wsRef.current === ws) wsRef.current = null;
        setConnected(false);
        if (stopped) return;
        if (e.code === LOGOUT_CLOSE_CODE) {
          stop();
          return;
        }
        failedInARow = opened ? 0 : failedInARow + 1;
        const delay = reconnectDelay(attempt);
        attempt++;
        reconnectTimer = setTimeout(() => {
          if (stopped) return;
          // The browser never says why an upgrade failed: ask the API (401 = logged out, 404 = no social routes).
          void socialApi.me().then((r) => {
            if (stopped) return;
            const meStatus = r.ok ? 200 : r.status;
            if (reconnectAction({ meStatus, failedInARow, everOpened }) === "stop") stop();
            else connect();
          });
        }, delay);
      };
      ws.onerror = () => ws.close();
    };

    connect();
    const pingTimer = setInterval(() => {
      if (!document.hidden) sendWs({ type: "ping" });
    }, SOCIAL.PING_MS);
    const onVisibility = () => {
      if (document.hidden) return;
      sendWs({ type: "ping" });
      for (const c of dockRef.current) if (!c.minimized) markRoomRead(c.room);
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      clearInterval(pingTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [available, saveId, sendWs, markRoomRead, refreshFriends, refreshWorldInvites, loadMessages]);

  const send = useCallback(async (room: string, body: string): Promise<SocialErrorCode | null> => {
    const r = await socialApi.send(room, body);
    if (!r.ok) return r.error;
    setMessages((prev) => ({ ...prev, [room]: mergeMessages(prev[room] ?? [], [r.data.message]) }));
    return null;
  }, []);

  const sendTyping = useCallback(
    (room: string) => {
      const now = Date.now();
      if (now - (lastTypingRef.current[room] ?? 0) < SOCIAL.TYPING_THROTTLE_MS) return;
      lastTypingRef.current[room] = now;
      sendWs({ type: "typing", room });
    },
    [sendWs],
  );

  const openChat = useCallback((room: string) => setDock((d) => openInDock(d, room)), []);
  const closeChat = useCallback((room: string) => setDock((d) => closeInDock(d, room)), []);
  const toggleChat = useCallback((room: string) => setDock((d) => toggleInDock(d, room)), []);

  const value = useMemo<SocialContextValue>(
    () => ({
      me, setMe, lists, refreshFriends, unread, totalUnread: totalUnread(unread), online, connected,
      panelOpen, setPanelOpen, dock, openChat, closeChat, toggleChat, messages, hasMore, roomErrors, typing,
      loadMessages, send, markRoomRead, sendTyping, worldInvites, refreshWorldInvites, declineWorldInvite, worldVersion,
    }),
    [me, lists, refreshFriends, unread, online, connected, panelOpen, dock, openChat, closeChat, toggleChat, messages,
      hasMore, roomErrors, typing, loadMessages, send, markRoomRead, sendTyping, worldInvites, refreshWorldInvites,
      declineWorldInvite, worldVersion],
  );

  return <SocialContext.Provider value={value}>{children}</SocialContext.Provider>;
}
