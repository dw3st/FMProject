/** Games hall: car race, blackjack and bingo (`.claude/rules/game/casino.md`). The poker table is in casinoPokerRoutes. */
import { requireSeat } from "@/backend/auth/middleware";
import { credit, fail, load, readBody, view, type Loaded } from "@/backend/casinoRoutes";
import { withSaveLock } from "@/backend/saveLock";
import { saveService } from "@/backend/SaveService";
import { parseBingoCards, playBingo } from "@/Domain/casino/bingo";
import {
  applyAction, dealRound, extraStake, legalActions, parseBlackjackAction, playerDone, settle, settlesAtOnce,
  type BlackjackRound,
} from "@/Domain/casino/blackjack";
import { blackjackView } from "@/Domain/casino/blackjackView";
import { limitsOf, nextDraw, parseStake, record, stakeRefusal } from "@/Domain/casino/casino";
import { CASINO } from "@/Domain/casino/casinoConfig";
import { drawOrder, parseRaceBet, raceCard, racePayout } from "@/Domain/casino/race";
import type { BingoResultView, CasinoState, RaceResultView } from "@/types/casinoTypes";

type Req = Request & { params: Record<string, string> };

/** Common gate of a game route: method, seat, body, the save lock and the loaded state. */
export function gameRoute(run: (l: Loaded, body: Record<string, unknown> | null, saveId: string, seatId: string) => Promise<Response>) {
  return async (req: Req) => {
    if (req.method !== "POST") return Response.json({ error: "method not allowed" }, { status: 405 });
    const saveId = req.params.saveId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    const body = await readBody(req);
    return withSaveLock(saveId, async () => {
      const l = await load(saveService, saveId, auth.seatId);
      if (!l) return Response.json({ error: "save not found" }, { status: 404 });
      return run(l, body, saveId, auth.seatId);
    });
  };
}

/** Extra money on an open hand (double, split): never more than he has nor past the day's loss cap. */
export function extraRefusal(state: CasinoState, wallet: number, extra: number): "noMoney" | "dailyLossCap" | null {
  if (extra > wallet) return "noMoney";
  const lim = limitsOf(state, wallet);
  return lim.lost + extra > lim.lossCap ? "dailyLossCap" : null;
}

/** Closes a blackjack round: the payout comes back, the hand goes to the history. */
function closeBlackjack(state: CasinoState, r: BlackjackRound) {
  const out = settle(r);
  const { payout, staked } = out.settlement;
  const multiplier = staked > 0 ? Math.round((payout / staked) * 100) / 100 : 0;
  const history = [{ id: r.id, game: "blackjack" as const, date: r.date, stake: staked, payout, multiplier }, ...state.history].slice(0, CASINO.HISTORY);
  return { state: { ...state, blackjack: undefined, dayNet: state.dayNet + payout, history }, out };
}

export const casinoGamesRoutes = {
  "/api/saves/:saveId/casino/race/bet": gameRoute(async (l, body, saveId, seatId) => {
    const bet = parseRaceBet(body?.car, body?.kind);
    if (!bet) return fail("invalidBet");
    const stake = parseStake(body?.stake);
    const refusal = stakeRefusal(l.state, l.wallet, stake);
    if (refusal) return fail(refusal);
    const no = l.state.raceNo ?? 0;
    const card = raceCard(l.state.salt, no);
    const draw = nextDraw(l.state);
    const order = drawOrder(card.cars.map((c) => c.strength), draw.rng);
    const multiplier = racePayout(card, order, bet.car, bet.kind);
    const payout = Math.floor(stake * multiplier);
    const state = { ...record(draw.state, { id: `r${draw.state.nonce}`, game: "race", date: l.seat.currentDate ?? "", stake, payout, multiplier }), raceNo: no + 1 };
    await saveService.writeCasino(saveId, state, seatId);
    const seat = await credit(saveService, saveId, seatId, l.seat, payout - stake, payout);
    const result: RaceResultView = { order: order.map((i) => i + 1), car: bet.car, kind: bet.kind, multiplier, payout, card };
    return Response.json({ result, view: view({ seat, state, wallet: Math.max(0, l.wallet + payout - stake) }) });
  }),

  "/api/saves/:saveId/casino/bingo/play": gameRoute(async (l, body, saveId, seatId) => {
    const cards = parseBingoCards(body?.cards);
    if (cards === null) return fail("invalidBet");
    const price = parseStake(body?.stake);
    const total = price * cards;
    const refusal = stakeRefusal(l.state, l.wallet, Number.isInteger(price) && price >= CASINO.MIN_STAKE ? total : price);
    if (refusal) return fail(refusal);
    const draw = nextDraw(l.state);
    const game = playBingo(cards, draw.rng);
    const payout = game.cards.reduce((a, c) => a + Math.floor(price * c.multiplier), 0);
    const multiplier = Math.round((payout / total) * 100) / 100;
    const state = record(draw.state, { id: `b${draw.state.nonce}`, game: "bingo", date: l.seat.currentDate ?? "", stake: total, payout, multiplier });
    await saveService.writeCasino(saveId, state, seatId);
    const seat = await credit(saveService, saveId, seatId, l.seat, payout - total, payout);
    const result: BingoResultView = { cards: game.cards, balls: game.balls, payout };
    return Response.json({ result, view: view({ seat, state, wallet: Math.max(0, l.wallet + payout - total) }) });
  }),

  "/api/saves/:saveId/casino/blackjack/deal": gameRoute(async (l, body, saveId, seatId) => {
    if (l.state.blackjack) return fail("handOpen");
    const stake = parseStake(body?.stake);
    const refusal = stakeRefusal(l.state, l.wallet, stake);
    if (refusal) return fail(refusal);
    const draw = nextDraw(l.state);
    const round = dealRound(`j${draw.state.nonce}`, l.seat.currentDate ?? "", stake, draw.rng);
    let state: CasinoState = { ...draw.state, blackjack: round, rounds: draw.state.rounds + 1, dayNet: draw.state.dayNet - stake };
    let delta = -stake;
    let best = 0;
    let hand = blackjackView(round, null);
    if (settlesAtOnce(round)) {
      const closed = closeBlackjack(state, round);
      state = closed.state;
      delta += closed.out.settlement.payout;
      best = closed.out.settlement.payout;
      hand = blackjackView(closed.out.round, closed.out.settlement);
    }
    await saveService.writeCasino(saveId, state, seatId);
    const seat = await credit(saveService, saveId, seatId, l.seat, delta, best);
    return Response.json({ hand, view: view({ seat, state, wallet: Math.max(0, l.wallet + delta) }) });
  }),

  "/api/saves/:saveId/casino/blackjack/action": gameRoute(async (l, body, saveId, seatId) => {
    const round0 = l.state.blackjack;
    if (!round0) return fail("noHand");
    const action = parseBlackjackAction(body?.action);
    if (!action || !legalActions(round0).includes(action)) return fail("invalidAction");
    const extra = extraStake(round0, action);
    if (extra > 0) {
      const refusal = extraRefusal(l.state, l.wallet, extra);
      if (refusal) return fail(refusal);
    }
    const round = applyAction(round0, action);
    let state: CasinoState = { ...l.state, blackjack: round, dayNet: l.state.dayNet - extra };
    let delta = -extra;
    let best = 0;
    let hand = blackjackView(round, null);
    if (playerDone(round)) {
      const closed = closeBlackjack(state, round);
      state = closed.state;
      delta += closed.out.settlement.payout;
      best = closed.out.settlement.payout;
      hand = blackjackView(closed.out.round, closed.out.settlement);
    }
    await saveService.writeCasino(saveId, state, seatId);
    const seat = await credit(saveService, saveId, seatId, l.seat, delta, best);
    return Response.json({ hand, view: view({ seat, state, wallet: Math.max(0, l.wallet + delta) }) });
  }),
};

