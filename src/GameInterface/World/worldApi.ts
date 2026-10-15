import type { SaveManager } from "@/types/seatTypes";
import type {
  WorldByCode, WorldDeadline, WorldErrorCode, WorldInviteView, WorldPhase, WorldView,
} from "@/types/multiplayerTypes";

/** `byCode` also tells the league of the world (backend adds it; optional for older servers). */
export type WorldByCodeView = WorldByCode & { leagueSlug?: string; leagueName?: string };

export type WorldApiError = WorldErrorCode | "generic";
export type WorldResult<T> = { ok: true; data: T } | { ok: false; status: number; error: WorldApiError; saveId?: string };

const seg = (s: string) => encodeURIComponent(s);

async function call<T>(method: string, path: string, body?: unknown): Promise<WorldResult<T>> {
  try {
    const res = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (res.ok) return { ok: true, data: json as T };
    return {
      ok: false,
      status: res.status,
      error: (typeof json?.error === "string" ? json.error : "generic") as WorldApiError,
      ...(typeof json?.saveId === "string" ? { saveId: json.saveId } : {}),
    };
  } catch {
    return { ok: false, status: 0, error: "generic" };
  }
}

export const worldApi = {
  view: (saveId: string) => call<WorldView>("GET", `/api/worlds/${seg(saveId)}`),
  byCode: (code: string) => call<WorldByCodeView>("GET", `/api/worlds/by-code/${seg(code)}`),
  join: (body: { code: string; clubId: string; manager: SaveManager; sackingEnabled: boolean }) =>
    call<{ saveId: string; seatId: string; phase: WorldPhase }>("POST", "/api/worlds/join", body),
  newCode: (saveId: string) => call<{ inviteCode: string }>("POST", `/api/worlds/${seg(saveId)}/invite-code`),
  settings: (saveId: string, deadlineHours: WorldDeadline) =>
    call<{ deadlineHours: WorldDeadline }>("PUT", `/api/worlds/${seg(saveId)}/settings`, { deadlineHours }),
  invite: (saveId: string, nickname: string) => call<{ ok: true }>("POST", `/api/worlds/${seg(saveId)}/invites`, { nickname }),
  invites: () => call<{ invites: WorldInviteView[] }>("GET", "/api/worlds/invites"),
  declineInvite: (saveId: string) => call<{ ok: true }>("DELETE", `/api/worlds/invites/${seg(saveId)}`),
  start: (saveId: string) => call<{ phase: WorldPhase }>("POST", `/api/worlds/${seg(saveId)}/start`),
  remove: (saveId: string, seatId: string) => call<{ ok: true }>("POST", `/api/worlds/${seg(saveId)}/members/${seg(seatId)}/remove`),
  leave: (saveId: string) => call<{ ok: true; deleted?: true }>("POST", `/api/worlds/${seg(saveId)}/leave`),
  transferOwner: (saveId: string, seatId: string) => call<{ ok: true }>("POST", `/api/worlds/${seg(saveId)}/owner`, { seatId }),
};
