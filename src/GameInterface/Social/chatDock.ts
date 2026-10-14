import { SOCIAL } from "@/Domain/social/socialConfig";

/** One conversation in the dock above the status bar: open (a window) or minimized (a tab). */
export interface DockChat {
  room: string;
  minimized: boolean;
}

/** Per tab (each game screen is its own page, so the dock is restored on every screen). */
export const DOCK_STORAGE_KEY = "fm.social.chats.v1";
const MAX_DOCK = 10;
const ROOM_RE = /^(dm|world):[A-Za-z0-9_.-]{1,40}$/;

function limitOpen(dock: DockChat[], maxOpen: number): DockChat[] {
  let open = dock.filter((c) => !c.minimized).length;
  return dock.map((c) => {
    if (!c.minimized && open > maxOpen) {
      open--;
      return { ...c, minimized: true };
    }
    return c;
  });
}

/** Opens (or brings back) a chat as the newest window; the oldest open ones minimize past the limit. */
export function openInDock(dock: readonly DockChat[], room: string, maxOpen: number = SOCIAL.MAX_OPEN_CHATS): DockChat[] {
  const next = [...dock.filter((c) => c.room !== room), { room, minimized: false }];
  return limitOpen(next, maxOpen).slice(-MAX_DOCK);
}

export function closeInDock(dock: readonly DockChat[], room: string): DockChat[] {
  return dock.filter((c) => c.room !== room);
}

export function toggleInDock(dock: readonly DockChat[], room: string, maxOpen: number = SOCIAL.MAX_OPEN_CHATS): DockChat[] {
  const chat = dock.find((c) => c.room === room);
  if (!chat) return [...dock];
  if (chat.minimized) return openInDock(dock, room, maxOpen);
  return dock.map((c) => (c.room === room ? { ...c, minimized: true } : c));
}

export function isRoomVisible(dock: readonly DockChat[], room: string): boolean {
  return dock.some((c) => c.room === room && !c.minimized);
}

export function parseDock(raw: string | null): DockChat[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    const out: DockChat[] = [];
    for (const e of v) {
      const entry = e as { room?: unknown; minimized?: unknown } | null;
      if (entry && typeof entry.room === "string" && ROOM_RE.test(entry.room) && typeof entry.minimized === "boolean") {
        out.push({ room: entry.room, minimized: entry.minimized });
      }
    }
    return limitOpen(out.slice(-MAX_DOCK), SOCIAL.MAX_OPEN_CHATS);
  } catch {
    return [];
  }
}
