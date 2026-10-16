import { useCallback, useEffect, useState } from "react";
import type { SeatOfferView } from "@/types/seatOfferTypes";

/** Offers between two human managers (multiplayer part 4, `.claude/rules/game/multiplayer.md`). */
export type SeatOfferResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string; demand?: number; opensOn?: string; reason?: string };

export interface SeatOfferList {
  offers: SeatOfferView[];
  seatClubs: { clubId: string; managerName: string }[];
}

async function call<T>(url: string, init?: RequestInit): Promise<SeatOfferResult<T>> {
  try {
    const res = await fetch(url, { ...init, headers: { "content-type": "application/json" } });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.ok) return { ok: true, data: body as T };
    return {
      ok: false, status: res.status, error: String(body.error ?? "generic"),
      ...(typeof body.demand === "number" ? { demand: body.demand } : {}),
      ...(typeof body.opensOn === "string" ? { opensOn: body.opensOn } : {}),
      ...(typeof body.reason === "string" ? { reason: body.reason } : {}),
    };
  } catch {
    return { ok: false, status: 0, error: "generic" };
  }
}

const base = (saveId: string) => `/api/saves/${encodeURIComponent(saveId)}/seat-offers`;

export const seatOfferApi = {
  list: (saveId: string) => call<SeatOfferList>(base(saveId)),
  create: (saveId: string, body: Record<string, unknown>) =>
    call<{ offer: SeatOfferView }>(base(saveId), { method: "POST", body: JSON.stringify(body) }),
  respond: (saveId: string, offerId: string, body: Record<string, unknown>) =>
    call<{ ok: true; status: "countered" | "rejected" | "withdrawn" | "accepted"; offer?: SeatOfferView }>(
      `${base(saveId)}/${encodeURIComponent(offerId)}`, { method: "POST", body: JSON.stringify(body) }),
};

/** Window event fired when the other manager touched an offer (socket `seat_offer`), or after an answer here. */
export const SEAT_OFFERS_CHANGED = "fm:seat-offers-changed";

export function notifySeatOffersChanged(): void {
  try { window.dispatchEvent(new Event(SEAT_OFFERS_CHANGED)); } catch { /* no window (tests) */ }
}

/** The seat's open offers and the other seats' clubs; reloads on `SEAT_OFFERS_CHANGED`. `saveId` null = none. */
export function useSeatOffers(saveId: string | null | undefined): { data: SeatOfferList | null; failed: boolean; reload: () => void } {
  const [data, setData] = useState<SeatOfferList | null>(null);
  const [failed, setFailed] = useState(false);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    window.addEventListener(SEAT_OFFERS_CHANGED, reload);
    return () => window.removeEventListener(SEAT_OFFERS_CHANGED, reload);
  }, [reload]);
  useEffect(() => {
    if (!saveId) { setData(null); return; }
    let alive = true;
    void seatOfferApi.list(saveId).then((r) => {
      if (!alive) return;
      if (r.ok) { setData(r.data); setFailed(false); } else setFailed(true);
    });
    return () => { alive = false; };
  }, [saveId, version]);
  return { data, failed, reload };
}
