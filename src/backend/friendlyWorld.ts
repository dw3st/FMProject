import { nextClubOfficialDate } from "@/backend/advanceUntil";
import type { SaveService } from "@/backend/SaveService";
import type { SquadIndex } from "@/backend/squadIndex";
import { autoLineupForFormation, slotRoles } from "@/Domain/advanceDay/matchSimulationLineups";
import { quickSimMatch } from "@/Domain/advanceDay/quickSim";
import { addDays } from "@/Domain/dates";
import { friendlyDue, friendlyPool, pickOpponent } from "@/Domain/friendlies/friendlies";
import { FRIENDLY } from "@/Domain/friendlies/friendlyConfig";
import { formationForSimId, formationForTactics } from "@/Domain/matchFormations";
import { countryBlockedDays } from "@/Domain/national/fifaCalendar";
import { friendliesByDirector, type Responsibilities } from "@/Domain/responsibilities/director";
import { mulberry32, seedFrom } from "@/Domain/rng";
import { applyYouthMatch, type YouthInjuryApplied } from "@/Domain/youthComps/youthMatch";
import type { FriendlyScorer } from "@/types/inboxTypes";
import type { Squad } from "@/types/playerTypes";
import type { TacticsSave } from "@/types/tacticsTypes";

/** I/O of the director's friendlies (`.claude/rules/game/responsibilities.md` → "Amistosos"). */

export interface FriendlySeat {
  seatId: string;
  clubId: string;
  leagueSlug: string;
  responsibilities: Responsibilities | undefined;
  tactics: TacticsSave | null | undefined;
}

export interface FriendlyResult {
  seatId: string;
  squad: Squad;
  opponentId: string;
  opponentName: string;
  goalsFor: number;
  goalsAgainst: number;
  scorers: FriendlyScorer[];
  participants: string[];
  injuries: YouthInjuryApplied[];
  healed: { squadId: string; playerId: string; playerName: string }[];
}

export async function playFriendlyDay(args: {
  service: SaveService;
  saveId: string;
  date: string;
  index: SquadIndex;
  seats: FriendlySeat[];
  humanClubs: ReadonlySet<string>;
  teamsPlayingToday: ReadonlySet<string>;
  countryOfLeague: (slug: string) => Promise<string | null | undefined>;
  squadOf: (id: string) => Promise<Squad | null>;
}): Promise<FriendlyResult[]> {
  const { service, saveId, date, index, seats, humanClubs, teamsPlayingToday, countryOfLeague, squadOf } = args;
  const out: FriendlyResult[] = [];
  for (const seat of seats) {
    if (!friendliesByDirector(seat.responsibilities)) continue;
    const country = await countryOfLeague(seat.leagueSlug);
    const due = friendlyDue({
      date,
      playsToday: teamsPlayingToday.has(seat.clubId),
      blocked: countryBlockedDays(country, date, date).has(date),
      nextOfficial: await nextClubOfficialDate(service, saveId, seat.leagueSlug, seat.clubId, addDays(date, 1)),
    });
    if (!due) continue;

    const squad = await squadOf(seat.clubId);
    if (!squad) continue;
    const pool = friendlyPool(squad.players, date, seat.tactics?.lineup ?? []);
    if (!pool) continue;
    const rng = mulberry32(seedFrom(`friendly:${saveId}:${seat.clubId}:${date}`));
    const opponentId = pickOpponent(index.inLeague(seat.leagueSlug).map((t) => t.squadId), seat.clubId, humanClubs, rng());
    const opponent = opponentId ? await squadOf(opponentId) : null;
    if (!opponent) continue;

    const formation = formationForTactics(seat.tactics);
    const opponentFormation = formationForSimId("4-3-3");
    const { recording } = quickSimMatch({
      fixtureId: `friendly_${date}_${seat.clubId}`,
      home: { ...squad, players: pool },
      away: opponent,
      homeLineup: autoLineupForFormation({ ...squad, players: pool }, formation, date),
      awayLineup: autoLineupForFormation(opponent, opponentFormation, date),
      homeRoles: slotRoles(formation),
      awayRoles: slotRoles(opponentFormation),
      pitchCondition: FRIENDLY.PITCH,
    }, rng);

    const applied = applyYouthMatch(squad, recording, { date, rng, trackMorale: false, friendly: true });
    const scorers: FriendlyScorer[] = squad.players.flatMap((p) => {
      const goals = recording.playerStats[p.id]?.goals ?? 0;
      return goals > 0 ? [{ playerId: p.id, name: p.name, goals }] : [];
    });
    out.push({
      seatId: seat.seatId,
      squad: applied.squad,
      opponentId: opponent.id,
      opponentName: opponent.name,
      goalsFor: recording.score.home,
      goalsAgainst: recording.score.away,
      scorers,
      participants: applied.participants,
      injuries: applied.injuriesApplied,
      healed: applied.healedPlayerIds.map((id) => ({
        squadId: squad.id, playerId: id, playerName: squad.players.find((p) => p.id === id)?.name ?? id,
      })),
    });
  }
  return out;
}
