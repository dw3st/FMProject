import { requireSeat } from "@/backend/auth/middleware";
import { walletOf } from "@/backend/betsWorld";
import { withSaveLock } from "@/backend/saveLock";
import { saveService, type SaveService, type SeatMeta } from "@/backend/SaveService";
import { closeCrash, emptyCasino, limitsOf, nextDraw, onDay, openCrash, parseSpins, parseStake, record, stakeRefusal } from "@/Domain/casino/casino";
import { CASINO } from "@/Domain/casino/casinoConfig";
import { spinClassic } from "@/Domain/casino/classicSlot";
import { cashOutAt, crashPoint, parseAutoCashOut, secondsTo, settleUnclaimed } from "@/Domain/casino/crash";
import { spinStadium } from "@/Domain/casino/stadiumSlot";
import { blackjackView } from "@/Domain/casino/blackjackView";
import { publicTable } from "@/Domain/casino/poker";
import { raceCard } from "@/Domain/casino/race";
import type { CasinoError, CasinoState, CasinoView, SlotSpinView } from "@/types/casinoTypes";

type Req = Request & { params: Record<string, string> };

const STATUS: Record<CasinoError, number> = {
  invalidStake: 400, invalidMachine: 400, invalidAuto: 400, stakeTooHigh: 400,
  dailyLossCap: 409, roundsCap: 409, noMoney: 409, roundOpen: 409, noRound: 409, noClub: 409,
  invalidBet: 400, invalidAction: 400, invalidBuyIn: 400, noHand: 409, handOpen: 409, notYourTurn: 409, seated: 409,
};

export const fail = (error: CasinoError) => Response.json({ error }, { status: STATUS[error] });

/** Server clock: a seam for tests. */
let clock = () => Date.now();
export const casinoNow = () => clock();
export function setCasinoClock(fn: (() => number) | null): void {
  clock = fn ?? (() => Date.now());
}

function newSalt(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function walletFor(service: SaveService, saveId: string, seatId: string, seat: SeatMeta): Promise<number> {
  return walletOf(seat, await service.getBets(saveId, seatId));
}

/** Adds a casino result to the seat (`casinoNet`, biggest single payout). */
export async function credit(service: SaveService, saveId: string, seatId: string, seat: SeatMeta, delta: number, win: number): Promise<SeatMeta> {
  const casinoNet = (seat.casinoNet ?? 0) + delta;
  const casinoBiggestWin = Math.max(seat.casinoBiggestWin ?? 0, win);
  await service.updateSeat(saveId, seatId, { casinoNet, casinoBiggestWin });
  return { ...seat, casinoNet, casinoBiggestWin };
}

export interface Loaded { seat: SeatMeta; state: CasinoState; wallet: number }

/** Seat and casino state on today's counters; an open crash round whose time is over is settled first. */
export async function load(service: SaveService, saveId: string, seatId: string): Promise<Loaded | null> {
  const seat0 = await service.getSeatMeta(saveId, seatId);
  if (!seat0) return null;
  let seat = seat0;
  let state = await service.getCasino(saveId, seatId);
  if (!state) {
    // The salt keeps the race card and every draw stable: the first state is written at once.
    state = emptyCasino(newSalt());
    await service.writeCasino(saveId, state, seatId);
  }
  const open = state.open;
  if (open && clock() - open.startedAt >= secondsTo(open.crash) * 1000) {
    const out = settleUnclaimed(open.crash, open.auto);
    const payout = out.won ? Math.floor(open.stake * out.multiplier) : 0;
    state = closeCrash(state, payout, out.won ? out.multiplier : 0);
    if (payout > 0) seat = await credit(service, saveId, seatId, seat, payout, payout);
    await service.writeCasino(saveId, state, seatId);
  }
  const wallet = await walletFor(service, saveId, seatId, seat);
  return { seat, state: onDay(state, seat.currentDate ?? "", wallet), wallet };
}

export function view(l: Loaded): CasinoView {
  const open = l.state.open;
  return {
    wallet: l.wallet,
    casinoNet: l.seat.casinoNet ?? 0,
    limits: limitsOf(l.state, l.wallet),
    history: l.state.history.map((r) => r),
    crashHistory: l.state.history.filter((r) => r.game === "crash").map((r) => r.crash!).slice(0, 12),
    open: open ? { roundId: open.id, startedAt: open.startedAt, stake: open.stake, auto: open.auto } : null,
    now: clock(),
    growth: CASINO.CRASH.GROWTH,
    race: raceCard(l.state.salt, l.state.raceNo ?? 0),
    blackjack: l.state.blackjack ? blackjackView(l.state.blackjack, null) : null,
    poker: l.state.poker ? publicTable(l.state.poker, true) : null,
  };
}

export async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  return (await req.json().catch(() => null)) as Record<string, unknown> | null;
}

export const casinoRoutes = {
  "/api/saves/:saveId/casino": async (req: Req) => {
    if (req.method !== "GET") return Response.json({ error: "method not allowed" }, { status: 405 });
    const saveId = req.params.saveId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    return withSaveLock(saveId, async () => {
      const l = await load(saveService, saveId, auth.seatId);
      if (!l) return Response.json({ error: "save not found" }, { status: 404 });
      return Response.json(view(l));
    });
  },

  "/api/saves/:saveId/casino/slot": async (req: Req) => {
    if (req.method !== "POST") return Response.json({ error: "method not allowed" }, { status: 405 });
    const saveId = req.params.saveId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    const body = await readBody(req);
    const machine = body?.machine;
    if (machine !== "classic" && machine !== "stadium") return fail("invalidMachine");
    const stake = parseStake(body?.stake);
    const spins = parseSpins(body?.spins);
    if (spins === null) return fail("invalidStake");
    return withSaveLock(saveId, async () => {
      const l = await load(saveService, saveId, auth.seatId);
      if (!l) return Response.json({ error: "save not found" }, { status: 404 });
      let { state, wallet } = l;
      const results: SlotSpinView[] = [];
      let stopped: CasinoError | null = null;
      let delta = 0;
      let best = 0;
      for (let i = 0; i < spins; i++) {
        const refusal = stakeRefusal(state, wallet, stake);
        if (refusal) { stopped = refusal; break; }
        const draw = nextDraw(state);
        state = draw.state;
        const spin = machine === "classic" ? spinClassic(draw.rng) : spinStadium(draw.rng);
        const payout = Math.floor(stake * spin.multiplier);
        state = record(state, { id: `s${state.nonce}`, game: machine, date: l.seat.currentDate ?? "", stake, payout, multiplier: spin.multiplier });
        delta += payout - stake;
        wallet = Math.max(0, wallet + payout - stake);
        best = Math.max(best, payout);
        results.push({ stops: spin.stops, multiplier: spin.multiplier, payout, ...("wins" in spin ? { wins: spin.wins } : {}) });
      }
      if (results.length === 0) return fail(stopped!);
      await saveService.writeCasino(saveId, state, auth.seatId);
      const seat = await credit(saveService, saveId, auth.seatId, l.seat, delta, best);
      return Response.json({ results, stopped, view: view({ seat, state, wallet }) });
    });
  },

  "/api/saves/:saveId/casino/crash/bet": async (req: Req) => {
    if (req.method !== "POST") return Response.json({ error: "method not allowed" }, { status: 405 });
    const saveId = req.params.saveId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    const body = await readBody(req);
    const stake = parseStake(body?.stake);
    const auto = parseAutoCashOut(body?.autoCashOut);
    if (auto === "invalid") return fail("invalidAuto");
    return withSaveLock(saveId, async () => {
      const l = await load(saveService, saveId, auth.seatId);
      if (!l) return Response.json({ error: "save not found" }, { status: 404 });
      if (l.state.open) return fail("roundOpen");
      const refusal = stakeRefusal(l.state, l.wallet, stake);
      if (refusal) return fail(refusal);
      const draw = nextDraw(l.state);
      const round = { id: crypto.randomUUID(), stake, startedAt: clock(), crash: crashPoint(draw.rng()), auto, date: l.seat.currentDate ?? "" };
      const state = openCrash(draw.state, round);
      await saveService.writeCasino(saveId, state, auth.seatId);
      const seat = await credit(saveService, saveId, auth.seatId, l.seat, -stake, 0);
      return Response.json({ roundId: round.id, startedAt: round.startedAt, view: view({ seat, state, wallet: Math.max(0, l.wallet - stake) }) });
    });
  },

  "/api/saves/:saveId/casino/crash/cashout": async (req: Req) => {
    if (req.method !== "POST") return Response.json({ error: "method not allowed" }, { status: 405 });
    const saveId = req.params.saveId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    const body = await readBody(req);
    const roundId = typeof body?.roundId === "string" ? body.roundId : "";
    return withSaveLock(saveId, async () => {
      const now = clock();
      const seat0 = await saveService.getSeatMeta(saveId, auth.seatId);
      if (!seat0) return Response.json({ error: "save not found" }, { status: 404 });
      const state0 = await saveService.getCasino(saveId, auth.seatId);
      const round = state0?.open;
      if (!state0 || !round || round.id !== roundId) {
        const done = state0?.history.find((r) => r.id === roundId);
        if (!done) return fail("noRound");
        const won = done.payout > 0;
        return Response.json({ won, crashed: !won, multiplier: done.multiplier, crash: done.crash, payout: done.payout });
      }
      // Past the crash time this is the same as settling it unclaimed (only the auto cash-out can win).
      const late = now - round.startedAt >= secondsTo(round.crash) * 1000;
      const out = late ? settleUnclaimed(round.crash, round.auto) : cashOutAt((now - round.startedAt) / 1000, round.crash, round.auto);
      const payout = out.won ? Math.floor(round.stake * out.multiplier) : 0;
      const state = closeCrash(state0, payout, out.won ? out.multiplier : 0);
      await saveService.writeCasino(saveId, state, auth.seatId);
      const seat = payout > 0 ? await credit(saveService, saveId, auth.seatId, seat0, payout, payout) : seat0;
      const wallet = await walletFor(saveService, saveId, auth.seatId, seat);
      const response = out.won
        ? { won: true, crashed: false, multiplier: out.multiplier, payout, crash: round.crash }
        : { won: false, crashed: true, multiplier: 0, payout: 0, crash: round.crash };
      return Response.json({ ...response, view: view({ seat, state: onDay(state, seat.currentDate ?? "", wallet), wallet }) });
    });
  },
};
