import type {
  ChatMessageView,
  FriendsResponse,
  MessagesResponse,
  SearchResult,
  SocialErrorCode,
  SocialMe,
} from "@/types/socialTypes";

export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: SocialErrorCode };

export interface RequestAnswer {
  status: "requested" | "friends";
  nickname: string;
}

const KNOWN_ERRORS: ReadonlySet<string> = new Set<SocialErrorCode>([
  "invalidNickname", "nicknameTaken", "nicknameLocked", "noNickname", "invalidQuery", "notFound", "alreadyFriends",
  "limit", "invalidBody", "noAccess", "rateLimited", "tooLarge", "unauthorized", "network",
]);

async function call<T>(method: string, path: string, body?: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = (await res.json().catch(() => null)) as unknown;
    if (res.ok) return { ok: true, data: data as T };
    const code = (data as { error?: unknown } | null)?.error;
    const error: SocialErrorCode =
      typeof code === "string" && KNOWN_ERRORS.has(code) ? (code as SocialErrorCode) : res.status === 401 ? "unauthorized" : "network";
    return { ok: false, status: res.status, error };
  } catch {
    return { ok: false, status: 0, error: "network" };
  }
}

const seg = encodeURIComponent;

export const socialApi = {
  me: () => call<SocialMe>("GET", "/api/social/me"),
  setNickname: (nickname: string) => call<SocialMe>("PUT", "/api/social/nickname", { nickname }),
  search: (q: string) => call<{ results: SearchResult[] }>("GET", `/api/social/search?q=${seg(q)}`),
  requestByNickname: (nickname: string) => call<RequestAnswer>("POST", "/api/social/requests", { nickname }),
  accept: (nickname: string) => call<RequestAnswer>("POST", `/api/social/requests/${seg(nickname)}/accept`),
  decline: (nickname: string) => call<{ ok: true }>("POST", `/api/social/requests/${seg(nickname)}/decline`),
  cancel: (nickname: string) => call<{ ok: true }>("DELETE", `/api/social/requests/${seg(nickname)}`),
  friends: () => call<FriendsResponse>("GET", "/api/social/friends"),
  unfriend: (nickname: string) => call<{ ok: true }>("DELETE", `/api/social/friends/${seg(nickname)}`),
  block: (nickname: string) => call<{ ok: true }>("POST", "/api/social/blocks", { nickname }),
  unblock: (nickname: string) => call<{ ok: true }>("DELETE", `/api/social/blocks/${seg(nickname)}`),
  blocks: () => call<{ blocked: { nickname: string }[] }>("GET", "/api/social/blocks"),
  messages: (room: string, before?: number) =>
    call<MessagesResponse>("GET", `/api/social/rooms/${seg(room)}/messages${before ? `?before=${before}` : ""}`),
  send: (room: string, body: string) =>
    call<{ room: string; message: ChatMessageView }>("POST", `/api/social/rooms/${seg(room)}/messages`, { body }),
  read: (room: string, lastReadId: number) =>
    call<{ lastReadId: number }>("POST", `/api/social/rooms/${seg(room)}/read`, { lastReadId }),
};
