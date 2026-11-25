/** Poker table of the games hall: Texas Hold'em against three bots (`.claude/rules/game/casino.md`). */
import { credit, fail, view, type Loaded } from "@/backend/casinoRoutes";
import { gameRoute } from "@/backend/casinoGamesRoutes";
import { saveService } from "@/backend/SaveService";
import { limitsOf, nextDraw } from "@/Domain/casino/casino";
import { CASINO } from "@/Domain/casino/casinoConfig";
import { act, newTable, startHand, type PokerAction, type PokerTable } from "@/Domain/casino/poker";
import type { CasinoError, CasinoState } from "@/types/casinoTypes";

/** Why this buy-in can't sit down now, or null. */
export function buyInRefusal(state: CasinoState, wallet: number, buyIn: number): CasinoError | null {
  if (!Number.isInteger(buyIn) || buyIn < CASINO.POKER.MIN_BUY_IN) return "invalidBuyIn";
  if (buyIn > wallet) return "noMoney";
  if (state.rounds >= CASINO.MAX_ROUNDS_PER_DAY) return "roundsCap";
  const lim = limitsOf(state, wallet);
  if (lim.lost + buyIn > lim.lossCap) return "dailyLossCap";
  return null;
}

function parseAction(v: unknown): PokerAction | "next" | null {
  if (!v || typeof v !== "object") return null;
  const a = v as { kind?: unknown; to?: unknown };
  if (a.kind === "next") return "next";
  if (a.kind === "fold" || a.kind === "check" || a.kind === "call" || a.kind === "allin") return { kind: a.kind };
  if (a.kind === "raise" && typeof a.to === "number" && Number.isInteger(a.to) && a.to > 0) return { kind: "raise", to: a.to };
  return null;
}

async function save(l: Loaded, saveId: string, seatId: string, state: CasinoState, delta: number, best: number, wallet: number) {
  await saveService.writeCasino(saveId, state, seatId);
  const seat = delta !== 0 || best > 0 ? await credit(saveService, saveId, seatId, l.seat, delta, best) : l.seat;
  return Response.json({ view: view({ seat, state, wallet }) });
}

/** Leaving pays his stack back; chips already in an unfinished hand stay in it. */
function leave(state: CasinoState, table: PokerTable, date: string) {
  const payout = table.seats[0]!.stack;
  const multiplier = table.buyIn > 0 ? Math.round((payout / table.buyIn) * 100) / 100 : 0;
  const history = [{ id: table.id, game: "poker" as const, date, stake: table.buyIn, payout, multiplier }, ...state.history].slice(0, CASINO.HISTORY);
  return { state: { ...state, poker: undefined, dayNet: state.dayNet + payout, history }, payout };
}

export const casinoPokerRoutes = {
  "/api/saves/:saveId/casino/poker/sit": gameRoute(async (l, body, saveId, seatId) => {
    if (l.state.poker) return fail("seated");
    const buyIn = Number(body?.buyIn);
    const refusal = buyInRefusal(l.state, l.wallet, buyIn);
    if (refusal) return fail(refusal);
    const draw = nextDraw(l.state);
    const table = newTable(`p${draw.state.nonce}`, buyIn, draw.rng);
    const state: CasinoState = { ...draw.state, poker: table, rounds: draw.state.rounds + 1, dayNet: draw.state.dayNet - buyIn };
    return save(l, saveId, seatId, state, -buyIn, 0, Math.max(0, l.wallet - buyIn));
  }),

  "/api/saves/:saveId/casino/poker/action": gameRoute(async (l, body, saveId, seatId) => {
    const table = l.state.poker;
    if (!table) return fail("noHand");
    const action = parseAction(body?.action);
    if (!action) return fail("invalidAction");
    const draw = nextDraw(l.state);
    if (action === "next") {
      if (table.street !== "done") return fail("handOpen");
      if (draw.state.rounds >= CASINO.MAX_ROUNDS_PER_DAY) return fail("roundsCap");
      const next = startHand(table, draw.rng);
      // Out of chips: the table closes like a leave (nothing comes back).
      if (next.street === "done") {
        const out = leave(draw.state, next, l.seat.currentDate ?? "");
        return save(l, saveId, seatId, out.state, 0, 0, l.wallet);
      }
      return save(l, saveId, seatId, { ...draw.state, poker: next, rounds: draw.state.rounds + 1 }, 0, 0, l.wallet);
    }
    const out = act(table, action, draw.rng);
    if (out.error) return fail(out.error === "notYourTurn" ? "notYourTurn" : "invalidAction");
    return save(l, saveId, seatId, { ...draw.state, poker: out.table }, 0, 0, l.wallet);
  }),

  "/api/saves/:saveId/casino/poker/leave": gameRoute(async (l, _body, saveId, seatId) => {
    const table = l.state.poker;
    if (!table) return fail("noHand");
    const out = leave(l.state, table, l.seat.currentDate ?? "");
    return save(l, saveId, seatId, out.state, out.payout, out.payout, l.wallet + out.payout);
  }),
};
