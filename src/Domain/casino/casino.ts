import { CASINO } from "@/Domain/casino/casinoConfig";
import { mulberry32, seedFrom } from "@/Domain/rng";
import type { CasinoError, CasinoLimits, CasinoResult, CasinoState } from "@/types/casinoTypes";

/** An empty state with a fresh secret salt. */
export function emptyCasino(salt: string): CasinoState {
  return { salt, nonce: 0, day: "", startWallet: 0, dayNet: 0, rounds: 0, history: [] };
}

/** The counters of `date`: a new game day starts from the wallet he has now. */
export function onDay(state: CasinoState, date: string, wallet: number): CasinoState {
  return state.day === date ? state : { ...state, day: date, startWallet: wallet, dayNet: 0, rounds: 0 };
}

export function limitsOf(state: CasinoState, wallet: number): CasinoLimits {
  return {
    minStake: CASINO.MIN_STAKE,
    maxStake: Math.floor(wallet * CASINO.MAX_SHARE),
    lossCap: Math.floor(state.startWallet * CASINO.DAILY_LOSS_SHARE),
    lost: Math.max(0, -state.dayNet),
    rounds: state.rounds,
    maxRounds: CASINO.MAX_ROUNDS_PER_DAY,
    maxAutoSpins: CASINO.MAX_AUTO_SPINS,
  };
}

/** Why a stake can't be played now (state already moved to the game day), or null. */
export function stakeRefusal(state: CasinoState, wallet: number, stake: number): CasinoError | null {
  if (!Number.isInteger(stake) || stake < CASINO.MIN_STAKE) return "invalidStake";
  const lim = limitsOf(state, wallet);
  if (lim.maxStake < CASINO.MIN_STAKE || stake > wallet) return "noMoney";
  if (stake > lim.maxStake) return "stakeTooHigh";
  if (state.rounds >= CASINO.MAX_ROUNDS_PER_DAY) return "roundsCap";
  if (lim.lost + stake > lim.lossCap) return "dailyLossCap";
  return null;
}

/** The draw of the next nonce: unpredictable without the seat's salt. */
export function nextDraw(state: CasinoState): { rng: () => number; state: CasinoState } {
  return { rng: mulberry32(seedFrom(`${state.salt}:${state.nonce}`)), state: { ...state, nonce: state.nonce + 1 } };
}

/** Records a finished play: day net, rounds (unless already counted) and the history. */
export function record(state: CasinoState, result: CasinoResult, countRound = true): CasinoState {
  return {
    ...state,
    dayNet: state.dayNet + result.payout - result.stake,
    rounds: state.rounds + (countRound ? 1 : 0),
    history: [result, ...state.history].slice(0, CASINO.HISTORY),
  };
}

export function parseStake(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

/** Spins in one request: 1..MAX_AUTO_SPINS. */
export function parseSpins(v: unknown): number | null {
  if (v === undefined || v === null) return 1;
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= CASINO.MAX_AUTO_SPINS ? n : null;
}

/** A crash round starts: the stake leaves now and the round counts for the day. */
export function openCrash(state: CasinoState, round: NonNullable<CasinoState["open"]>): CasinoState {
  return { ...state, open: round, rounds: state.rounds + 1, dayNet: state.dayNet - round.stake };
}

/** A crash round ends: what came back and the crash point go to the history. */
export function closeCrash(state: CasinoState, payout: number, multiplier: number): CasinoState {
  const round = state.open;
  if (!round) return state;
  const result: CasinoResult = { id: round.id, game: "crash", date: round.date, stake: round.stake, payout, multiplier, crash: round.crash };
  return { ...state, open: undefined, dayNet: state.dayNet + payout, history: [result, ...state.history].slice(0, CASINO.HISTORY) };
}
