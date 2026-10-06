import { initClubMorale, stripClubMorale } from "@/Domain/morale/morale";
import type { SaveMeta, SaveService } from "@/backend/SaveService";
import type { SquadIndex } from "@/backend/squadIndex";
import { getLeagueData, type LeagueDataEntry } from "@/backend/advanceDay";
import { clubLevel, getCountries } from "@/backend/continentalWorld";
import { expectedPositionFromSquads, objectiveFromSquads } from "@/backend/boardWorld";
import { recordMoney } from "@/backend/FinancialService";
import {
  aiTransferBudgetOf, financialTierOf, naturalFinancialTier, popularityOf, seasonalTransferBudgetFor,
} from "@/Domain/aiFinance/aiClubFinance";
import { initialBoardState } from "@/Domain/boardFans/boardFans";
import { addDays } from "@/Domain/dates";
import { initialFamiliarity } from "@/Domain/familiarity/familiarity";
import { seasonLabel } from "@/Domain/history/history";
import {
  clubPrestiges, eligibleCandidates, employedBand, guaranteedClub, guaranteedOfferDue, managerReputation,
  midSeasonOfferCount, moveHumanManager, pickOfferingClubs, seasonEndOfferCount, unemployedBand,
  unemployedOfferCount, type OfferCandidate, type PrestigeBand,
} from "@/Domain/jobs/jobs";
import { JOBS } from "@/Domain/jobs/jobsConfig";
import { initialStaff } from "@/Domain/staff/staff";
import { initialFacilities } from "@/Domain/facilities/facilities";
import { leagueTierOf } from "@/backend/facilityWorld";
import { academyToAi } from "@/Domain/youth/youth";
import { scoutingOnClubLeft } from "@/backend/scoutingWorld";
import { toFreeAgent } from "@/Domain/contracts/freeAgents";
import { renewExpiringOnTakeover } from "@/Domain/contracts/expiry";
import { addYearsIso } from "@/Domain/contracts/contracts";
import { CONTRACT_CONFIG } from "@/Domain/contracts/contractConfig";
import { aiRecordFor, autoLineupForFormationWithFitness } from "@/Domain/advanceDay/matchSimulationLineups";
import { formationForSimId } from "@/Domain/matchFormations";
import { sanitizeFollowedLeagues } from "@/Domain/advanceDay/simMode";
import { buildBoardMessage, buildContractMessage, buildJobMessage } from "@/Domain/inbox/inboxEvents";
import { competitionName } from "@/Domain/world/labels";
import { mulberry32, seedFrom } from "@/Domain/rng";
import { DEFAULT_TACTICAL_STYLE } from "@/types/tacticsTypes";
import type { BoardState } from "@/types/boardTypes";
import type { LeagueSeasonState } from "@/types/calendarTypes";
import type { JobOffer, JobWindow } from "@/types/jobTypes";
import type { ManagerRecord } from "@/types/managerTypes";
import type { LeagueData, Squad } from "@/types/playerTypes";
import { logError } from "@/Logger";
import { wageRevenueBasisOf } from "@/Domain/finance/wages";
import { aiBudgetWithPrize } from "@/Domain/finance/prizes";
import {
  compensationFee, contractUntil, MANAGER_CONTRACT, managerWeeklyWage, offerSeasons, type ManagerContract,
} from "@/Domain/managers/managerContract";
import { vacancyHireOn } from "@/Domain/managers/aiManagers";

/**
 * Job offers and club changes of the human manager — save I/O (`.claude/rules/game/jobs.md`).
 * The model is pure (`src/Domain/jobs`); this file gathers its inputs and applies a change of club.
 */

// ── World ─────────────────────────────────────────────────────────────────────

export interface JobWorld {
  candidates: OfferCandidate[];
  squads: Map<string, Squad>;
  leagueOf: Map<string, string>;
  prestige: Map<string, number>;
  catalog: LeagueDataEntry[];
}

/** Every club of the active leagues as a possible employer, with its prestige. Reads the whole world. */
export async function loadJobWorld(
  service: SaveService, saveId: string, index: SquadIndex, activeLeagues: LeagueSeasonState[],
): Promise<JobWorld> {
  const catalog = await getLeagueData();
  const countries = await getCountries();
  const countryOf = new Map(catalog.map((l) => [l.slug, l.country ?? null] as const));
  const continentOf = new Map(Object.values(countries).map((c) => [c.name, c.continent ?? null] as const));
  const active = new Set(activeLeagues.map((l) => l.leagueSlug));
  const squads = new Map<string, Squad>();
  const leagueOf = new Map<string, string>();
  const prestigeInput: { squadId: string; level: number; tier: ReturnType<typeof financialTierOf> }[] = [];
  for (const squad of await service.getAllSquads(saveId)) {
    const league = index.byId(squad.id)?.leagueSlug;
    if (!league || !active.has(league)) continue;
    let level: number;
    try {
      level = clubLevel(squad);
    } catch {
      continue; // no full XI: not an employer
    }
    squads.set(squad.id, squad);
    leagueOf.set(squad.id, league);
    prestigeInput.push({ squadId: squad.id, level, tier: financialTierOf(squad) });
  }
  const prestige = clubPrestiges(prestigeInput);
  const candidates: OfferCandidate[] = [...squads.values()].map((s) => {
    const country = countryOf.get(leagueOf.get(s.id)!) ?? null;
    return {
      squadId: s.id, prestige: prestige.get(s.id) ?? 0, country,
      continent: country ? continentOf.get(country) ?? null : null,
      ...(s.venue?.city ? { city: s.venue.city } : {}),
    };
  });
  return { candidates, squads, leagueOf, prestige, catalog };
}

// ── Offers ────────────────────────────────────────────────────────────────────

/** One offer from `squadId`, with the objective the board would set and the expected position. */
async function buildOffer(args: {
  service: SaveService;
  saveId: string;
  world: JobWorld;
  squadId: string;
  window: JobWindow;
  date: string;
  expires: string;
  activeLeagues: LeagueSeasonState[];
  index: SquadIndex;
  /** The manager's reputation (wage of the contract on offer). */
  reputation: number;
  /** D3: compensation owed to the current club if he leaves now. */
  compensation: number;
}): Promise<JobOffer | null> {
  const { world, squadId } = args;
  const squad = world.squads.get(squadId);
  const league = world.leagueOf.get(squadId);
  if (!squad || !league) return null;
  const leagueSquads = args.index.inLeague(league)
    .map((t) => world.squads.get(t.squadId))
    .filter((s): s is Squad => !!s);
  const state = args.activeLeagues.find((l) => l.leagueSlug === league);
  const rank = await currentRank(args.service, args.saveId, league, squadId);
  const objective = objectiveFromSquads({
    squads: leagueSquads,
    playerSquadId: squadId,
    leagueSlug: league,
    zones: world.catalog.find((l) => l.slug === league)?.zones ?? [],
    season: state ? seasonLabel(state.year, state.start, state.end) : "",
    ...(rank !== null ? { rank } : {}),
  });
  return {
    id: `job_${args.date}_${squadId}`,
    squadId,
    clubName: squad.name,
    leagueSlug: league,
    leagueName: world.catalog.find((l) => l.slug === league)?.name ?? state?.leagueName ?? league,
    window: args.window,
    date: args.date,
    expires: args.expires,
    objective,
    budget: aiTransferBudgetOf(squad),
    expectedPosition: rank ?? expectedPositionFromSquads(leagueSquads, squadId),
    leagueSize: leagueSquads.length,
    prestige: Math.round((world.prestige.get(squadId) ?? 0) * 1000) / 1000,
    wage: managerWeeklyWage(wageRevenueBasisOf(squad), args.reputation),
    seasons: offerSeasons(world.prestige.get(squadId) ?? 0),
    ...(args.compensation > 0 ? { compensation: args.compensation } : {}),
  };
}

/** The club's table position when its league has games played; null before the first round. */
async function currentRank(service: SaveService, saveId: string, league: string, squadId: string): Promise<number | null> {
  const table = (await service.getLeagueStandings(saveId, league)) ?? [];
  const i = table.findIndex((r) => r.squadId === squadId);
  return i >= 0 && table[i]!.mp > 0 ? i + 1 : null;
}

export interface OfferRequest {
  window: JobWindow;
  date: string;
  /** Last day the offers can be accepted. */
  expires: string;
  managers: ManagerRecord[];
  /** Board confidence used by the reputation (0..100). */
  board: number;
  /** Employed: the human club; unemployed: null. */
  humanSquadId: string | null;
  /** Unemployed: the club he left. */
  unemployed?: { lastClubId: string; since: string; lastOfferDate?: string };
  activeLeagues: LeagueSeasonState[];
  index: SquadIndex;
  /** Clubs with a vacant manager's job (`meta.managerVacancies`): × VACANCY_WEIGHT in the draw. */
  vacant?: Set<string>;
  /** The human manager's current contract (compensation, D3). */
  contract?: ManagerContract;
}

/**
 * The offers of one window. Draws how many from the reputation first and only reads the world when
 * there is at least one (or a guaranteed offer is due).
 */
export async function generateJobOffers(service: SaveService, saveId: string, req: OfferRequest): Promise<JobOffer[]> {
  const year = parseInt(req.date.slice(0, 4), 10);
  const rep = managerReputation(req.managers, req.board, year);
  const rng = mulberry32(seedFrom(`jobs:${saveId}:${req.date}:${req.window}`));
  const count = req.window === "season_end"
    ? seasonEndOfferCount(rep, rng)
    : req.window === "mid_season"
      ? midSeasonOfferCount(rep, req.board, rng)
      : unemployedOfferCount(rng);
  const guaranteed = req.window === "unemployed" && !!req.unemployed
    && guaranteedOfferDue({ since: req.unemployed.since, lastOfferDate: req.unemployed.lastOfferDate, date: req.date });
  if (count === 0 && !guaranteed) return [];

  const world = await loadJobWorld(service, saveId, req.index, req.activeLeagues);
  const fromId = req.humanSquadId ?? req.unemployed?.lastClubId ?? "";
  const from = world.candidates.find((c) => c.squadId === fromId);
  const fromPrestige = world.prestige.get(fromId) ?? 0.5;
  const band: PrestigeBand = req.window === "unemployed" ? unemployedBand(fromPrestige) : employedBand(fromPrestige, rep);
  const exclude = new Set([fromId]);
  const eligible = eligibleCandidates(world.candidates, {
    band, exclude,
    ...(req.window === "mid_season" && from?.city ? { rivalCity: from.city } : {}),
  });
  let picked = pickOfferingClubs({
    candidates: eligible, band, count,
    home: { country: from?.country ?? null, continent: from?.continent ?? null }, rng,
    ...(req.vacant ? { vacant: req.vacant } : {}),
  });
  if (picked.length === 0 && guaranteed) {
    const g = guaranteedClub(world.candidates.filter((c) => !exclude.has(c.squadId)), band);
    if (g) picked = [g];
  }
  const out: JobOffer[] = [];
  for (const c of picked) {
    const offer = await buildOffer({
      service, saveId, world, squadId: c.squadId, window: req.window, date: req.date, expires: req.expires,
      activeLeagues: req.activeLeagues, index: req.index, reputation: rep,
      compensation: req.humanSquadId ? compensationFee(req.contract, req.date) : 0,
    });
    if (offer) out.push(offer);
  }
  return out;
}

/** Validity of a season-end offer: until the eve of the club's first match of the new season. */
export function seasonEndExpiry(date: string, firstMatch: string | null): string {
  if (!firstMatch) return addDays(date, JOBS.SEASON_END_FALLBACK_DAYS);
  // At least one full day to answer, even when the new season starts tomorrow.
  const eve = addDays(firstMatch, -1);
  const minimum = addDays(date, 1);
  return eve > minimum ? eve : minimum;
}

// ── Changing club ─────────────────────────────────────────────────────────────

async function ledgerSeasonOf(service: SaveService, saveId: string, league: string, date: string): Promise<number> {
  return (await service.getLeagueMeta(saveId, league))?.year ?? parseInt(date.slice(0, 4), 10);
}

/**
 * The human club becomes an AI club: its balance leaves the ledger (`club_change` "leave"), it gets
 * the AI tier and transfer budget, loses the staff, the style familiarity and the academy (the best
 * 1-2 promoted by the AI rule, the rest to the free agents), and leaves the player's sell list.
 */
export async function releaseHumanClub(
  service: SaveService, saveId: string, args: { squadId: string; date: string; compensation?: number },
): Promise<void> {
  const index = await service.getSquadIndex(saveId);
  const entry = index.byId(args.squadId);
  if (!entry) return;
  const ref = { leagueSlug: entry.leagueSlug, clubSlug: entry.stem };
  let squad = await service.getSquad(saveId, ref.leagueSlug, ref.clubSlug);
  if (!squad) return;
  const balance = squad.finances?.budget ?? 0;
  if (balance !== 0) {
    squad = await recordMoney(
      service, saveId, await ledgerSeasonOf(service, saveId, entry.leagueSlug, args.date), ref,
      { date: args.date, kind: "club_change", amount: -balance, label: `Leaving ${squad.name}`, ref: { stage: "leave", clubName: squad.name } },
    );
  }
  const academy = academyToAi(squad);
  // Morale, talks and promises end with the club (`.claude/rules/game/morale.md`).
  // Facilities too (`.claude/rules/game/facilities.md`): the AI club uses its tier's implied level;
  // the stadium it has built stays (venue capacity), works in progress are dropped.
  const { staff: _s, styleFamiliarity: _f, facilities: _fac, ...rest } = stripClubMorale(academy.squad);
  const tier = naturalFinancialTier(rest.finances);
  const grant = seasonalTransferBudgetFor(tier, popularityOf(rest));
  // D3: the compensation the manager's new club pays goes half into the AI budget (prize cap).
  const ai: Squad = { ...rest, financialTier: tier, aiTransferBudget: aiBudgetWithPrize(grant, args.compensation ?? 0, grant) };
  await service.saveSquad(saveId, ref.leagueSlug, ref.clubSlug, ai);
  if (academy.released.length > 0) {
    await service.writeFreeAgents(saveId, [
      ...(await service.getFreeAgents(saveId)), ...academy.released.map((p) => toFreeAgent(p, args.date)),
    ]);
  }
  const market = await service.getMarket(saveId);
  // The human's lists, bids, talks and clauses belong to the club he leaves (`.claude/rules/game/negotiation.md`);
  // active loans stay in `loans` so they still end (and return) on their date.
  if (market && (market.playerSellList?.length || market.playerLoanList?.length || market.pendingBids?.length || market.talks || market.sellOnHeld?.length
    || market.preContracts?.length || market.rivalBids?.length || market.lostTargets?.length)) {
    await service.saveMarket(saveId, { ...market, playerSellList: [], playerLoanList: [], pendingBids: [], talks: {}, sellOnHeld: [], preContracts: [], rivalBids: [], lostTargets: [] });
  }
  // Scouting (`.claude/rules/game/scouting.md`): missions and prospects stay with the club, the
  // knowledge and shortlist follow the manager, who keeps knowing his old players.
  await scoutingOnClubLeft(service, saveId, squad.players.map((p) => p.id), args.date);
  // Reborn offers of the old club's retirees close with it (`.claude/rules/game/retirement.md`).
  const retired = await service.getRetired(saveId);
  if (retired.some((r) => r.squadId === args.squadId && r.rebornOffer === "pending")) {
    await service.writeRetired(saveId, retired.map((r) =>
      r.squadId === args.squadId && r.rebornOffer === "pending" ? { ...r, rebornOffer: "expired" as const } : r));
  }
}

/**
 * `squadId` becomes the human club: starting balance = the AI seasonal transfer budget it had
 * (`club_change` "arrive"), staff by tier, familiarity, a tactic from its AI formation with the
 * automatic XI, the board and fans at 60 with the objective for this club. Returns the new board
 * and the tactic's formation.
 */
async function takeOverClub(
  service: SaveService, saveId: string,
  args: { squadId: string; date: string; activeLeagues: LeagueSeasonState[]; startBalance?: number },
): Promise<{
  board: BoardState; formation: string; leagueSlug: string; clubName: string; colors: [string, string];
  /** Players whose contract still ends with this season (warning window only). */
  expiring: { id: string; name: string }[];
}> {
  const index = await service.getSquadIndex(saveId);
  const entry = index.byId(args.squadId);
  if (!entry) throw new Error(`takeOverClub: club ${args.squadId} not found`);
  const ref = { leagueSlug: entry.leagueSlug, clubSlug: entry.stem };
  const squad = await service.getSquad(saveId, ref.leagueSlug, ref.clubSlug);
  if (!squad) throw new Error(`takeOverClub: squad ${args.squadId} not found`);

  // What the offer showed (or, without one, the AI budget it has now).
  const start = args.startBalance ?? aiTransferBudgetOf(squad);
  // Contracts that would end at this season's rollover: the AI board's renewals happen now, since
  // the human only renews by hand from here on.
  const state = args.activeLeagues.find((l) => l.leagueSlug === entry.leagueSlug);
  const seasonEnd = state?.end ?? args.date;
  const renewed = renewExpiringOnTakeover({
    squad, date: seasonEnd > args.date ? seasonEnd : args.date, nextSeasonEnd: addYearsIso(seasonEnd, 1),
  }).squad;
  const { financialTier: _t, aiTransferBudget: _b, ...rest } = renewed;
  // Morale starts over at the new club: everyone at 65, no talks or promises.
  const human: Squad = {
    ...initClubMorale(rest),
    finances: { ...(rest.finances ?? { broadcasting: 0, commercial: 0, total: 0, followers: 0 }), budget: 0 },
    staff: initialStaff(`${saveId}:${args.squadId}:${args.date}`, squad),
    styleFamiliarity: initialFamiliarity(DEFAULT_TACTICAL_STYLE),
  };
  // Facilities of the club (`.claude/rules/game/facilities.md`): set up from its stadium and tier.
  human.facilities = initialFacilities(human, await leagueTierOf(entry.leagueSlug));
  await service.saveSquad(saveId, ref.leagueSlug, ref.clubSlug, human);
  await recordMoney(
    service, saveId, await ledgerSeasonOf(service, saveId, entry.leagueSlug, args.date), ref,
    { date: args.date, kind: "club_change", amount: start, label: `Arriving at ${squad.name}`, ref: { stage: "arrive", clubName: squad.name } },
  );

  // Tactic: the formation the AI played with this squad, balanced style, automatic XI.
  const formation = aiRecordFor(human, args.date).id;
  await service.saveTactics(saveId, {
    formation,
    tactical_style: DEFAULT_TACTICAL_STYLE,
    lineup: autoLineupForFormationWithFitness(human, formationForSimId(formation), args.date),
    assistantRotation: false,
  });

  // The new club starts with an empty sell list.
  const market = await service.getMarket(saveId);
  // The human's lists, bids, talks and clauses belong to the club he leaves (`.claude/rules/game/negotiation.md`);
  // active loans stay in `loans` so they still end (and return) on their date.
  if (market && (market.playerSellList?.length || market.playerLoanList?.length || market.pendingBids?.length || market.talks || market.sellOnHeld?.length
    || market.preContracts?.length || market.rivalBids?.length || market.lostTargets?.length)) {
    await service.saveMarket(saveId, { ...market, playerSellList: [], playerLoanList: [], pendingBids: [], talks: {}, sellOnHeld: [], preContracts: [], rivalBids: [], lostTargets: [] });
  }

  // Board and fans at 60 with this club's objective (mid-season: from the current position).
  const catalog = await getLeagueData();
  const leagueSquads = await service.getSquadsInLeague(saveId, entry.leagueSlug);
  const rank = await currentRank(service, saveId, entry.leagueSlug, args.squadId);
  const objective = objectiveFromSquads({
    squads: leagueSquads,
    playerSquadId: args.squadId,
    leagueSlug: entry.leagueSlug,
    zones: catalog.find((l) => l.slug === entry.leagueSlug)?.zones ?? [],
    season: state ? seasonLabel(state.year, state.start, state.end) : "",
    ...(rank !== null ? { rank } : {}),
  });
  const inWarning = args.date >= addDays(seasonEnd, -CONTRACT_CONFIG.WARNING_DAYS_BEFORE);
  return {
    board: initialBoardState(args.date, objective),
    formation,
    leagueSlug: entry.leagueSlug,
    clubName: squad.name,
    colors: entry.colors,
    expiring: inWarning
      ? human.players.filter((p) => p.contract && p.contract.until <= seasonEnd).map((p) => ({ id: p.id, name: p.name }))
      : [],
  };
}

/**
 * Accepting an offer: the whole switch in one unit of work (the caller flushes a BufferingSaveDAL).
 * Old club → AI (when employed), managers swapped, new club → the player's, the pending offers and
 * their inbox messages drop, and the meta follows the new club.
 */
export async function acceptJobOffer(
  service: SaveService, saveId: string, meta: SaveMeta, offer: JobOffer,
): Promise<SaveMeta> {
  const date = meta.currentDate!;
  const activeLeagues = meta.activeLeagues ?? [];
  const index = await service.getSquadIndex(saveId);
  const employedAt = !meta.unemployed && index.byId(meta.clubId) ? meta.clubId : null;
  // D3: leaving mid-contract, the new club compensates the old one (out of the arriving balance).
  // The compensation shown on the offer (what the player saw), never more than the arriving budget.
  const compensation = employedAt ? Math.min(Math.max(0, offer.compensation ?? 0), Math.max(0, offer.budget)) : 0;
  if (employedAt) await releaseHumanClub(service, saveId, { squadId: employedAt, date, compensation });

  const managers = await service.getManagers(saveId);
  if (managers.length > 0) {
    await service.writeManagers(saveId, moveHumanManager(managers, {
      toSquadId: offer.squadId, fromSquadId: employedAt, fromClubName: employedAt ? meta.clubName : undefined, date,
    }));
  }
  // The old club hires by the AI rule (interim + vacancy, D4); the new one is no longer vacant.
  const vacancies = { ...(meta.managerVacancies ?? {}) };
  delete vacancies[offer.squadId];
  if (employedAt) vacancies[employedAt] = { since: date, hireOn: vacancyHireOn(date, mulberry32(seedFrom(`${saveId}:${employedAt}:${date}:vacancy`))) };

  const taken = await takeOverClub(service, saveId, { squadId: offer.squadId, date, activeLeagues, startBalance: Math.max(0, offer.budget - compensation) });

  // Inbox: the old club's news stays; every pending offer drops with its message.
  const catalog = await getLeagueData();
  const leagueName = competitionName(taken.leagueSlug, catalog as unknown as LeagueData[], "en");
  const inbox = await service.getInbox(saveId);
  await service.writeInbox(saveId, inbox.filter((m) => !(m.category === "job" && m.kind === "offer")));
  await service.appendInbox(saveId, buildJobMessage({
    date, kind: "hired", squadId: offer.squadId, clubName: taken.clubName, leagueSlug: taken.leagueSlug, leagueName,
  }));
  if (taken.board.objective) {
    await service.appendInbox(saveId, buildBoardMessage({ date, kind: "objective", objective: taken.board.objective, leagueName }));
  }
  // Inside the contract-warning window the 90-day notice was missed: send it now.
  if (taken.expiring.length > 0) {
    await service.appendInbox(saveId, buildContractMessage({ date, kind: "expiring", players: taken.expiring }));
  }
  const newState = activeLeagues.find((l) => l.leagueSlug === taken.leagueSlug);
  // The manager's contract at the new club (`.claude/rules/game/jobs.md` → "Contrato do técnico").
  const newSquad = await service.getSquadById(saveId, offer.squadId);
  const wage = offer.wage ?? managerWeeklyWage(newSquad ? wageRevenueBasisOf(newSquad) : 0, await reputationOf(service, saveId, meta));
  // Past the renewal point of the new league's season (85%), the contract counts from the next season.
  const lateInSeason = !!newState && newState.totalRounds > 0 && newState.currentRound >= newState.totalRounds * MANAGER_CONTRACT.RENEWAL_PROGRESS;
  const until = contractUntil(newState?.end ?? date, (offer.seasons ?? 1) + (lateInSeason ? 1 : 0));

  return service.updateMeta(saveId, {
    managerContract: { squadId: offer.squadId, wage, until: until > date ? until : contractUntil(newState?.end ?? date, (offer.seasons ?? 1) + 1), signed: date },
    managerRenewal: undefined,
    managerContractNotices: undefined,
    managerVacancies: vacancies,
    // The new-career transfer grace never applies to a change of club.
    careerStart: undefined,
    clubId: offer.squadId,
    clubName: taken.clubName,
    clubColors: taken.colors,
    leagueSlug: taken.leagueSlug,
    leagueName,
    followedLeagues: sanitizeFollowedLeagues(meta.followedLeagues ?? [], new Set(catalog.map((l) => l.slug)), taken.leagueSlug),
    formation: taken.formation,
    tactical_style: DEFAULT_TACTICAL_STYLE,
    board: taken.board,
    jobOffers: [],
    // The new league's mid-season window counts from now (never right after the switch).
    jobsMidSeason: newState ? seasonLabel(newState.year, newState.start, newState.end) : meta.jobsMidSeason,
    unemployed: undefined,
    rotationOverride: undefined,
    matchMarking: undefined,
    style_focus: undefined,
  });
}

/** The reputation shown on the dashboard (employed: today's board; unemployed: the board at the sacking). */
export async function reputationOf(service: SaveService, saveId: string, meta: SaveMeta): Promise<number> {
  const managers = await service.getManagers(saveId);
  const board = meta.unemployed ? meta.unemployed.board : (meta.board?.board ?? 60);
  const year = parseInt((meta.currentDate ?? "2026").slice(0, 4), 10);
  try {
    return managerReputation(managers, board, year);
  } catch (e) {
    logError("jobs", `save ${saveId}: reputation failed`, e);
    return 0;
  }
}
