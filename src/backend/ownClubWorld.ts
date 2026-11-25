import type { SaveService, SeatMeta } from "@/backend/SaveService";
import { getLeagueData, getPyramids } from "@/backend/advanceDay";
import { acceptJobOffer, resignFromClub } from "@/backend/jobWorld";
import { returnDueLoans } from "@/backend/negotiationWorld";
import type { SeatNudges } from "@/backend/seatOfferWorld";
import { getStaffNameBook } from "@/backend/staffNameBook";
import { CONTINENTAL_SLUGS } from "@/Domain/continental/competitions";
import { contractEndFor, renewalContract } from "@/Domain/contracts/contracts";
import { toFreeAgent } from "@/Domain/contracts/freeAgents";
import { buildJobMessage } from "@/Domain/inbox/inboxEvents";
import { FOUNDED } from "@/Domain/ownClub/ownClubConfig";
import { foundedSquadPlan, ownClubUnlock, type ClubIdentity, type FoundedSlot } from "@/Domain/ownClub/ownClub";
import { overallAvg } from "@/Domain/playerRating";
import { unitFrom } from "@/Domain/rng";
import { leagueNationality } from "@/Domain/world/defaultNationality";
import { competitionName } from "@/Domain/world/labels";
import { makeAcademyPlayer, setAcademyNameBook } from "@/Domain/youth/youth";
import type { LeagueSeasonMeta } from "@/types/calendarTypes";
import type { JobOffer } from "@/types/jobTypes";
import type { LeagueData, RosterPlayer, Squad } from "@/types/playerTypes";
import type { Pyramids } from "@/types/pyramidTypes";

/** Founding the manager's own club (`.claude/rules/game/own-club.md`). E/S over the pure rules of `@/Domain/ownClub`. */

export type FoundBlock = "humanClub" | "continental";

export interface FoundClubOption { id: string; name: string; blocked?: FoundBlock }
export interface FoundCountryOption { country: string; leagues: { slug: string; clubs: FoundClubOption[] }[] }

/** The league slugs of the last level of every country with a pyramid of 2+ levels. */
export function lowestLeagues(pyramids: Pyramids): { country: string; slugs: string[] }[] {
  const out: { country: string; slugs: string[] }[] = [];
  for (const [country, p] of Object.entries(pyramids)) {
    if (p.levels.length < 2) continue;
    const last = [...p.levels].sort((a, b) => b.tier - a.tier)[0]!;
    out.push({ country, slugs: last.groups.map((g) => g.leagueSlug) });
  }
  return out.sort((a, b) => a.country.localeCompare(b.country));
}

/** Clubs in a continental competition still running (in its groups or league-phase pots, no champion yet). */
export function clubsInRunningContinental(metas: readonly (LeagueSeasonMeta | null)[]): Set<string> {
  const out = new Set<string>();
  for (const m of metas) {
    const c = m?.continental;
    if (!c || c.championId) continue;
    for (const g of c.groups ?? []) for (const id of g.clubs) out.add(id);
    for (const pot of c.pots ?? []) for (const id of pot) out.add(id);
  }
  return out;
}

async function continentalClubs(service: SaveService, saveId: string): Promise<Set<string>> {
  return clubsInRunningContinental(await Promise.all(CONTINENTAL_SLUGS.map((s) => service.getLeagueMeta(saveId, s))));
}

/** Clubs held by another seat (the seat's own club is never blocked: he leaves it first). */
async function otherHumanClubs(service: SaveService, saveId: string, meta: SeatMeta): Promise<Set<string>> {
  const set = await service.humanClubIds(saveId);
  if (meta.clubId && !meta.unemployed) set.delete(meta.clubId);
  return set;
}

/** `GET` payload: the unlock state and every lowest-division club with the reason it cannot be founded. */
export async function foundClubOptions(service: SaveService, saveId: string, meta: SeatMeta) {
  const unlock = ownClubUnlock(await service.getAchievements(saveId, meta.seatId));
  const index = await service.getSquadIndex(saveId);
  const humans = await otherHumanClubs(service, saveId, meta);
  const continental = await continentalClubs(service, saveId);
  const countries: FoundCountryOption[] = lowestLeagues(await getPyramids()).map(({ country, slugs }) => ({
    country,
    leagues: slugs.map((slug) => ({
      slug,
      clubs: index.inLeague(slug).map((t): FoundClubOption => {
        const blocked: FoundBlock | undefined = humans.has(t.squadId) ? "humanClub" : continental.has(t.squadId) ? "continental" : undefined;
        return { id: t.squadId, name: t.name, ...(blocked ? { blocked } : {}) };
      }),
    })),
  }));
  return { ...unlock, foundedClub: meta.foundedClub ?? null, countries };
}

export type FoundCheck =
  | { ok: true; country: string; leagueSlug: string }
  | { ok: false; status: number; error: string };

/** Every rule before the unit of work opens. */
export async function checkFounding(service: SaveService, saveId: string, meta: SeatMeta, squadId: string): Promise<FoundCheck> {
  if (!ownClubUnlock(await service.getAchievements(saveId, meta.seatId)).unlocked) return { ok: false, status: 409, error: "locked" };
  if (meta.foundedClub) return { ok: false, status: 409, error: "alreadyFounded" };
  const entry = (await service.getSquadIndex(saveId)).byId(squadId);
  if (!entry) return { ok: false, status: 404, error: "notFound" };
  const lowest = lowestLeagues(await getPyramids()).find((c) => c.slugs.includes(entry.leagueSlug));
  if (!lowest) return { ok: false, status: 400, error: "notLowest" };
  if ((await otherHumanClubs(service, saveId, meta)).has(squadId)) return { ok: false, status: 409, error: "humanClub" };
  if ((await continentalClubs(service, saveId)).has(squadId)) return { ok: false, status: 409, error: "continental" };
  return { ok: true, country: lowest.country, leagueSlug: entry.leagueSlug };
}

/** Mean overall of a squad's first team (0 for an empty one). */
export function squadLevel(squad: Pick<Squad, "players">): number {
  if (squad.players.length === 0) return 0;
  return squad.players.reduce((s, p) => s + overallAvg(p), 0) / squad.players.length;
}

const SPECIFICS: Record<FoundedSlot["line"], string[]> = {
  GK: ["GK"],
  DEF: ["CB", "CB", "LB", "RB", "CB", "LB", "RB"],
  MID: ["CDM", "CM", "CM", "CAM", "LM", "RM", "CM"],
  FWD: ["ST", "LW", "RW", "ST", "ST"],
};

/** The 22 founded players (deterministic per save and club), with contracts of FOUNDED.CONTRACT_SEASONS seasons. */
export function foundedPlayers(args: {
  saveId: string; squad: Squad; worstLevel: number; nationality: string | null; date: string; seasonEnd: string;
}): RosterPlayer[] {
  const { saveId, squad, worstLevel, nationality, date, seasonEnd } = args;
  const seed = `founded:${saveId}:${squad.id}`;
  const taken = new Set<string>();
  const byLine: Record<string, number> = {};
  const fresh: Squad = { ...squad, players: [], youth: [] };
  return foundedSquadPlan(worstLevel).map((slot) => {
    const k = byLine[slot.line] ?? 0;
    byLine[slot.line] = k + 1;
    const list = SPECIFICS[slot.line];
    const specific = list[k % list.length] ?? list[Math.floor(unitFrom(`${seed}:pos:${slot.i}`) * list.length)]!;
    const player = makeAcademyPlayer({
      id: `founded_${squad.id}_${slot.i}`, seed, i: slot.i, squad: fresh, specific, level: slot.level,
      ageRange: [slot.age, slot.age], nationality, taken,
    });
    const p: RosterPlayer = {
      ...player,
      profile: { summary: "One of the founding squad.", archetype: "Founder" },
    };
    const contract = renewalContract(p, fresh, seasonEnd, FOUNDED.CONTRACT_SEASONS);
    return { ...p, contract: { ...contract, until: contractEndFor(date, seasonEnd, FOUNDED.CONTRACT_SEASONS) } };
  });
}

/**
 * Founding: the manager leaves his club (no fee), the chosen club's loans with seats end, every player and academy
 * player goes to the free agents, 22 founded players arrive, the club takes the new identity (standings row renamed,
 * points kept; history emptied) and the manager takes it over with no contract end and no board objective. The caller
 * flushes a BufferingSaveDAL.
 */
export async function foundClub(
  service: SaveService, saveId: string, seatId: string, squadId: string, identity: ClubIdentity, nudges: SeatNudges,
): Promise<SeatMeta> {
  let meta = (await service.getSeatMeta(saveId, seatId))!;
  const date = meta.currentDate!;
  // 1. Leave the current club (no release fee: the president founds a club, he is not bought out).
  if (meta.clubId && !meta.unemployed) {
    await resignFromClub(service, saveId, seatId, meta, nudges, 0);
    meta = (await service.getSeatMeta(saveId, seatId))!;
  }
  // 2. Loans with this club end now (only a seat's market holds loans: the AI never loans to the AI).
  for (const { seatId: other } of await service.listSeats(saveId)) {
    const otherMeta = await service.getSeatMeta(saveId, other);
    const market = await service.getMarket(saveId, other);
    if (!otherMeta || !market) continue;
    const ids = new Set((market.loans ?? []).filter((l) => l.fromClubId === squadId || l.toClubId === squadId).map((l) => l.playerId));
    if (ids.size === 0) continue;
    const res = await returnDueLoans(service, saveId, other, otherMeta, market, date, { recalled: ids });
    await service.saveMarket(saveId, res.market, other);
  }

  const index = await service.getSquadIndex(saveId);
  const entry = index.byId(squadId);
  if (!entry) throw new Error(`foundClub: club ${squadId} not found`);
  const squad = (await service.getSquad(saveId, entry.leagueSlug, entry.stem))!;
  const others = (await service.getSquadsInLeague(saveId, entry.leagueSlug)).filter((s) => s.id !== squadId && s.players.length > 0);
  const worst = others.length > 0 ? Math.min(...others.map(squadLevel)) : squadLevel(squad);
  const catalog = await getLeagueData();
  const country = catalog.find((l) => l.slug === entry.leagueSlug)?.country;
  const seasonEnd = meta.activeLeagues?.find((l) => l.leagueSlug === entry.leagueSlug)?.end ?? date;

  // 3. Old players and the academy → free agents.
  const leaving = [...squad.players.filter((p) => !p.loan), ...(squad.youth ?? [])];
  if (leaving.length > 0) {
    await service.writeFreeAgents(saveId, [...(await service.getFreeAgents(saveId)), ...leaving.map((p) => toFreeAgent(p, date))]);
  }
  // 4. The founding squad.
  setAcademyNameBook(await getStaffNameBook().catch(() => null));
  const players = foundedPlayers({ saveId, squad, worstLevel: worst, nationality: leagueNationality(country), date, seasonEnd });
  const { registrations: _r, aiFormation: _f, ticketPriceMult: _t, ...rest } = squad;
  const founded: Squad = {
    ...rest,
    name: identity.name,
    shortName: identity.shortName,
    colors: identity.colors,
    players,
    youth: [],
    foundedBy: { seatId, on: date },
  };
  await service.saveSquad(saveId, entry.leagueSlug, entry.stem, founded);
  // 5. The table keeps the points under the new name; the club's history starts over.
  const table = await service.getLeagueStandings(saveId, entry.leagueSlug);
  if (table) {
    await service.writeLeagueStandings(saveId, entry.leagueSlug, table.map((row) => {
      if (row.squadId !== squadId) return row;
      const renamed = { ...row, name: identity.name, colors: identity.colors };
      return "shortName" in row ? { ...renamed, shortName: identity.shortName } : renamed;
    }));
  }
  await service.writeClubHistory(saveId, { squadId, seasons: [], scorers: {}, records: {} });
  service.dropSquadIndex(saveId);

  // 6. Take the club over as an offer would (no "hired" news), then the president's terms.
  const leagueName = competitionName(entry.leagueSlug, catalog as unknown as LeagueData[], "en");
  const offer: JobOffer = {
    id: `found_${squadId}_${date}`, squadId, clubName: identity.name, leagueSlug: entry.leagueSlug, leagueName,
    window: "unemployed", date, expires: date, objective: null, budget: squad.aiTransferBudget ?? 0, expectedPosition: 1,
    leagueSize: index.inLeague(entry.leagueSlug).length, prestige: 0, seasons: 1, ...(country ? { country } : {}),
  };
  const next = await acceptJobOffer(service, saveId, seatId, meta, offer, nudges, { announce: false });
  const { until: _u, ...contract } = next.managerContract ?? { squadId, wage: 0, signed: date };
  await service.updateSeat(saveId, seatId, {
    managerContract: contract,
    clubName: identity.name,
    clubColors: identity.colors,
    ...(next.board ? { board: { ...next.board, objective: null, ultimatum: undefined } } : {}),
    foundedClub: { squadId, on: date },
  });
  await service.appendInbox(saveId, buildJobMessage({
    date, kind: "founded", squadId, clubName: identity.name, leagueSlug: entry.leagueSlug, leagueName,
  }), seatId);
  return (await service.getSeatMeta(saveId, seatId))!;
}
