import type { BlackjackAction } from "@/Domain/casino/blackjack";
import type { PokerAction } from "@/Domain/casino/poker";
import type { RaceKind } from "@/Domain/casino/race";
import type { BingoResultView, BlackjackView, CasinoView, RaceResultView, SlotMachine, SlotSpinView } from "@/types/casinoTypes";

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

export const raceBet = (saveId: string, car: number, kind: RaceKind, stake: number) =>
  call<{ result: RaceResultView; view: CasinoView }>(`/api/saves/${saveId}/casino/race/bet`, { car, kind, stake });

export const bingoPlay = (saveId: string, cards: number, stake: number) =>
  call<{ result: BingoResultView; view: CasinoView }>(`/api/saves/${saveId}/casino/bingo/play`, { cards, stake });

export const blackjackDeal = (saveId: string, stake: number) =>
  call<{ hand: BlackjackView; view: CasinoView }>(`/api/saves/${saveId}/casino/blackjack/deal`, { stake });

export const blackjackAction = (saveId: string, action: BlackjackAction) =>
  call<{ hand: BlackjackView; view: CasinoView }>(`/api/saves/${saveId}/casino/blackjack/action`, { action });

export const pokerSit = (saveId: string, buyIn: number) => call<{ view: CasinoView }>(`/api/saves/${saveId}/casino/poker/sit`, { buyIn });

export type PokerMove = PokerAction | { kind: "next" };

export const pokerAction = (saveId: string, action: PokerMove) => call<{ view: CasinoView }>(`/api/saves/${saveId}/casino/poker/action`, { action });

export const pokerLeave = (saveId: string) => call<{ view: CasinoView }>(`/api/saves/${saveId}/casino/poker/leave`, {});
