import { playerContinentalSlug } from "@/backend/continentalWorld";
import { playerCupSlug } from "@/backend/cupWorld";
import type { SaveService } from "@/backend/SaveService";
import { autoLineupForFormation, slotRoles } from "@/Domain/advanceDay/matchSimulationLineups";
import { expectedGoals, teamStrength } from "@/Domain/advanceDay/quickSim";
import { BETS } from "@/Domain/bets/betsConfig";
import { maxStake, openTotal, resultOfEvent, settleBets } from "@/Domain/bets/bets";
import { buildMarkets, onlyForOwnClub, scorerShares, trimMarkets } from "@/Domain/bets/odds";
import { addDays } from "@/Domain/dates";
import { managerWallet } from "@/Domain/managers/assets";
import { formationForSimId } from "@/Domain/matchFormations";
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
}

export function walletOf(seat: BetSeat, state: BetsState): number {
  return managerWallet(seat.managerEarnings, seat.managerSpent, seat.betNet, openTotal(state));
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

/** The games he can still bet on: after today, within `DAYS_AHEAD`, in his league and his club's competitions. */
export async function betQuotes(service: SaveService, saveId: string, seat: BetSeat): Promise<GameQuote[]> {
  const today = seat.currentDate;
  if (!today || !seat.leagueSlug) return [];
  const slugs = [seat.leagueSlug, await playerCupSlug(seat.leagueSlug), seat.clubId ? await playerContinentalSlug(service, saveId, seat.clubId) : null]
    .filter((s): s is NonNullable<typeof s> => !!s);
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
        out.push({
          full,
          game: { competition: slug, fixtureId: f.id, date: f.date, home: f.home, away: f.away, homeName: home.name, awayName: away.name, own, markets: trimMarkets(onlyForOwnClub(full, own)) },
        });
      }
    }
  }
  return out.sort((a, b) => a.game.date.localeCompare(b.game.date));
}

export async function betsView(service: SaveService, saveId: string, seatId: string, seat: BetSeat, summary: boolean): Promise<BetsView> {
  const state = await service.getBets(saveId, seatId);
  const wallet = walletOf(seat, state);
  return {
    wallet,
    openTotal: openTotal(state),
    betNet: seat.betNet ?? 0,
    maxStake: maxStake(wallet),
    open: state.open,
    settled: state.settled,
    games: summary ? [] : (await betQuotes(service, saveId, seat)).map((q) => q.game),
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
