import type { CasinoView, SlotMachine, SlotSpinView } from "@/types/casinoTypes";

export type CasinoCall<T> = { ok: true; data: T } | { ok: false; error: string };

async function call<T>(url: string, body?: unknown): Promise<CasinoCall<T>> {
  try {
    const r = await fetch(url, body === undefined ? undefined : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = await r.json().catch(() => null);
    if (!r.ok) return { ok: false, error: typeof data?.error === "string" ? data.error : "generic" };
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, error: "generic" };
  }
}

export const casinoView = (saveId: string) => call<CasinoView>(`/api/saves/${saveId}/casino`);

export const spinSlot = (saveId: string, machine: SlotMachine, stake: number, spins: number) =>
  call<{ results: SlotSpinView[]; stopped: string | null; view: CasinoView }>(`/api/saves/${saveId}/casino/slot`, { machine, stake, spins });

export const crashBet = (saveId: string, stake: number, autoCashOut: number | null) =>
  call<{ roundId: string; startedAt: number; view: CasinoView }>(`/api/saves/${saveId}/casino/crash/bet`, { stake, autoCashOut });

export interface CashOutResult {
  won: boolean;
  crashed: boolean;
  multiplier: number;
  payout: number;
  crash: number;
  view?: CasinoView;
}

export const crashCashOut = (saveId: string, roundId: string) => call<CashOutResult>(`/api/saves/${saveId}/casino/crash/cashout`, { roundId });
