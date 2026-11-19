import { playerContinentalSlug } from "@/backend/continentalWorld";
import { playerCupSlug } from "@/backend/cupWorld";
import type { SaveService } from "@/backend/SaveService";
import { autoLineupForFormation, slotRoles } from "@/Domain/advanceDay/matchSimulationLineups";
import { expectedGoals, teamStrength } from "@/Domain/advanceDay/quickSim";
import { BETS } from "@/Domain/bets/betsConfig";
import { maxStake, openTotal, resultOfEvent, settleBets } from "@/Domain/bets/bets";
import { buildMarkets, onlyForOwnClub, scorerShares, trimMarkets } from "@/Domain/bets/odds";
import { getSaveDataVersion } from "@/backend/dal/saveDataVersion";
import { addDays } from "@/Domain/dates";
import { matchConditions } from "@/Domain/matchday/matchConditions";
import { managerWallet } from "@/Domain/managers/assets";
import { formationForSimId } from "@/Domain/matchFormations";
import { isYouthCompSlug } from "@/Domain/youthComps/youthCompIds";
import { ROLE_GROUP } from "@/GameEngine/Configs/QuickSimConfig";
import type { BetGame, BetMarkets, BetsState, BetsView } from "@/types/betTypes";
import type { Fixture } from "@/types/calendarTypes";
import type { MatchEvent } from "@/types/dayLogTypes";
import type { Squad } from "@/types/playerTypes";

export interface BetSeat {
  currentDate?: string;
  leagueSlug?: string;
  clubId?: string;
  managerEarnings?: number;
  managerSpent?: number;
  betNet?: number;
  casinoNet?: number;
}

export function walletOf(seat: BetSeat, state: BetsState): number {
  return managerWallet(seat.managerEarnings, seat.managerSpent, seat.betNet, openTotal(state), seat.casinoNet);
}

/** Prices of one game, from the same expected goals the simulated matches use (automatic 4-3-3). */
function marketsOf(fixture: Fixture, home: Squad, away: Squad): BetMarkets {
  const formation = formationForSimId("4-3-3");
  const roles = slotRoles(formation);
  const xiOf = (s: Squad) => autoLineupForFormation(s, formation, fixture.date).map((id, i) => ({ p: s.players.find((x) => x.id === id), role: roles[i]! }));
  const xiH = xiOf(home).filter((x) => x.p);
  const xiA = xiOf(away).filter((x) => x.p);
  const strengthOf = (xi: typeof xiH) => teamStrength(xi.map((x) => x.p!), xi.map((x) => x.role));
  const sH = strengthOf(xiH);
  const sA = strengthOf(xiA);
  const candidates = (xi: typeof xiH, side: "home" | "away") => xi.map((x) => ({
    playerId: x.p!.id, playerName: x.p!.name, side, group: ROLE_GROUP[x.role] ?? ("MID" as const), finishing: x.p!.stats.finishing ?? 0,
  }));
  return buildMarkets({
    xgHome: expectedGoals(sH, sA, !fixture.neutral),
    xgAway: expectedGoals(sA, sH, false),
    scorers: scorerShares([...candidates(xiH, "home"), ...candidates(xiA, "away")]),
  });
}

interface GameQuote {
  game: BetGame;
  /** Every price, before the own-club filter. */
  full: BetMarkets;
}

/** A competition of this world that takes bets: every league, national cup and continental, never the youth ones. */
export async function isBettableCompetition(service: SaveService, saveId: string, slug: string): Promise<boolean> {
  if (isYouthCompSlug(slug)) return false;
  return (await service.listCompetitionSlugs(saveId)).includes(slug);
}

/** His league and his club's cup and continental ("Minhas competições"). */
export async function mineSlugs(service: SaveService, saveId: string, seat: BetSeat): Promise<string[]> {
  if (!seat.leagueSlug) return [];
  return [seat.leagueSlug, await playerCupSlug(seat.leagueSlug), seat.clubId ? await playerContinentalSlug(service, saveId, seat.clubId) : null]
    .filter((s): s is NonNullable<typeof s> => !!s);
}

/** What to quote: every competition of the world, the one asked, else his own. */
export type BetSlugs = { all: true } | { competition?: string };

/** The competitions a list shows. */
async function betSlugs(service: SaveService, saveId: string, seat: BetSeat, which: BetSlugs = {}): Promise<string[]> {
  if (!seat.leagueSlug) return [];
  if ("all" in which) return (await service.listCompetitionSlugs(saveId)).filter((s) => !isYouthCompSlug(s));
  if (which.competition) return (await isBettableCompetition(service, saveId, which.competition)) ? [which.competition] : [];
  return mineSlugs(service, saveId, seat);
}

/** The first match day after the betting window, for "the next game is on ...". */
async function nextGameDate(service: SaveService, saveId: string, seat: BetSeat, which: BetSlugs): Promise<string | null> {
  const today = seat.currentDate;
  if (!today) return null;
  let best: string | null = null;
  for (const slug of await betSlugs(service, saveId, seat, which)) {
    for (const d of Object.keys((await service.getDateIndex(saveId, slug)) ?? {})) {
      if (d > today && (best === null || d < best)) best = d;
    }
  }
  return best;
}

/**
 * The games he can still bet on: after today, within `DAYS_AHEAD`. By default his league and his club's competitions;
 * with `competition`, that one (any league in the world, tester report, 8.9.2).
 */
export async function betQuotes(service: SaveService, saveId: string, seat: BetSeat, competition?: string): Promise<GameQuote[]> {
  return quotesOf(service, saveId, seat, { competition });
}

async function quotesOf(service: SaveService, saveId: string, seat: BetSeat, which: BetSlugs): Promise<GameQuote[]> {
  const today = seat.currentDate;
  if (!today || !seat.leagueSlug) return [];
  const slugs = await betSlugs(service, saveId, seat, which);
  const last = addDays(today, BETS.DAYS_AHEAD);
  const squads = new Map<string, Squad | null>();
  const squadOf = async (id: string) => {
    if (!squads.has(id)) squads.set(id, await service.getSquadById(saveId, id));
    return squads.get(id)!;
  };
  const out: GameQuote[] = [];
  for (const slug of slugs) {
    const index = (await service.getDateIndex(saveId, slug)) ?? {};
    const rounds = new Set(Object.entries(index).filter(([d]) => d > today && d <= last).flatMap(([, r]) => r));
    for (const r of rounds) {
      const round = await service.getRound(saveId, slug, r);
      for (const f of round?.fixtures ?? []) {
        if (f.played || !f.home || !f.away || f.date <= today || f.date > last) continue;
        const [home, away] = [await squadOf(f.home), await squadOf(f.away)];
        if (!home || !away) continue;
        const own = f.home === seat.clubId ? "home" : f.away === seat.clubId ? "away" : null;
        const full = marketsOf(f, home, away);
        const kickoff = matchConditions({ ...f, competition: slug }, f.neutral ? null : home.country ?? null).kickoff;
        out.push({
          full,
          game: { competition: slug, fixtureId: f.id, date: f.date, home: f.home, away: f.away, homeName: home.name, awayName: away.name, own, kickoff, markets: trimMarkets(onlyForOwnClub(full, own)) },
        });
      }
    }
  }
  return out.sort((a, b) => a.game.date.localeCompare(b.game.date));
}

/**
 * Every competition's quotes, kept per save, day, club and data version (a transfer moves a price): the list of the
 * whole world is asked at every visit to the tab.
 */
const allCache = new Map<string, Promise<GameQuote[]>>();
const ALL_CACHE_MAX = 8;

export function allBetQuotes(service: SaveService, saveId: string, seat: BetSeat): Promise<GameQuote[]> {
  const key = `${saveId}:${seat.currentDate}:${seat.leagueSlug}:${seat.clubId}:${getSaveDataVersion(saveId)}`;
  const hit = allCache.get(key);
  if (hit) return hit;
  const run = quotesOf(service, saveId, seat, { all: true });
  allCache.set(key, run);
  run.catch(() => allCache.delete(key));
  while (allCache.size > ALL_CACHE_MAX) allCache.delete(allCache.keys().next().value!);
  return run;
}

/** The list of every competition sends only the 1X2 prices: the rest comes with the game's own call. */
export function liteGame(g: BetGame): BetGame {
  return { ...g, markets: { result: g.markets.result, scores: [], scorers: [] }, more: g.markets.scores.length + g.markets.scorers.length };
}

export interface BetsViewOptions {
  summary?: boolean;
  /** One competition (full prices). */
  competition?: string;
  /** With `competition`: just that game. */
  fixture?: string;
  /** Every competition of the world, 1X2 only (`liteGame`). */
  all?: boolean;
}

export async function betsView(service: SaveService, saveId: string, seatId: string, seat: BetSeat, opts: BetsViewOptions = {}): Promise<BetsView> {
  const { summary = false, competition, fixture, all = false } = opts;
  const state = await service.getBets(saveId, seatId);
  const wallet = walletOf(seat, state);
  const which: BetSlugs = all ? { all: true } : { competition };
  let games: BetGame[] = [];
  if (!summary) {
    if (all) games = (await allBetQuotes(service, saveId, seat)).map((q) => liteGame(q.game));
    else games = (await betQuotes(service, saveId, seat, competition)).map((q) => q.game).filter((g) => !fixture || g.fixtureId === fixture);
  }
  return {
    wallet,
    openTotal: openTotal(state),
    betNet: seat.betNet ?? 0,
    maxStake: maxStake(wallet),
    open: state.open,
    settled: state.settled,
    games,
    nextDate: summary || games.length > 0 ? null : await nextGameDate(service, saveId, seat, which),
    today: seat.currentDate ?? null,
    mine: summary ? [] : await mineSlugs(service, saveId, seat),
  };
}

/** The day's step: resolves the seat's bets on today's games. */
export async function settleSeatBets(service: SaveService, saveId: string, seatId: string, date: string, events: MatchEvent[]) {
  const state = await service.getBets(saveId, seatId);
  if (state.open.length === 0) return null;
  const outcome = settleBets(state, events.map(resultOfEvent), date);
  if (outcome.settled.length === 0) return null;
  await service.writeBets(saveId, outcome.state, seatId);
  return outcome;
}
