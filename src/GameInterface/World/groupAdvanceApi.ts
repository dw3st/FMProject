import type { GroupAdvanceView, PendingDay, PendingSummaryAggregate } from "@/types/groupAdvanceTypes";
import type { PlayedMatchRecording } from "@/Domain/advanceDay/matches";
import type { MatchEvent } from "@/types/dayLogTypes";

export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

async function call<T>(url: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, init ? { ...init, headers: { "Content-Type": "application/json" } } : undefined);
    const body = (await res.json().catch(() => ({}))) as T & { error?: string };
    return res.ok ? { ok: true, data: body } : { ok: false, status: res.status, error: body.error ?? `HTTP ${res.status}` };
  } catch {
    return { ok: false, status: 0, error: "network" };
  }
}

const base = (saveId: string) => `/api/worlds/${encodeURIComponent(saveId)}`;

export const groupAdvanceApi = {
  view: (saveId: string) => call<GroupAdvanceView>(`${base(saveId)}/advance`),
  ready: (saveId: string, until: string | null) =>
    call<{ readyUntil: string | null }>(`${base(saveId)}/ready`, { method: "POST", body: JSON.stringify({ until }) }),
  simulate: (saveId: string, date: string, fixtureId: string) =>
    call<{ ok: true }>(`${base(saveId)}/match-decision`, { method: "POST", body: JSON.stringify({ date, fixtureId, mode: "simulate" }) }),
  liveRecording: (saveId: string, date: string, fixtureId: string, recording: PlayedMatchRecording) =>
    call<{ ok: true }>(`${base(saveId)}/live-recording`, { method: "POST", body: JSON.stringify({ date, fixtureId, recording }) }),
  pendingLive: (saveId: string) =>
    call<{ date: string; fixtureId: string; event: MatchEvent | null }>(`${base(saveId)}/live-recording`),
  summary: (saveId: string) => call<{ days: PendingDay[]; aggregate: PendingSummaryAggregate | null }>(`${base(saveId)}/summary`),
  retry: (saveId: string) => call<{ ok: true }>(`${base(saveId)}/advance/retry`, { method: "POST", body: "{}" }),
  clearSummary: (saveId: string) => call<{ ok: true }>(`${base(saveId)}/summary`, { method: "DELETE" }),
};
