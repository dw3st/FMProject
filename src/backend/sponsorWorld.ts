/**
 * Sponsors (12.0, `.claude/rules/game/sponsors.md`): the I/O around the pure rules of `src/Domain/sponsors`. Builds the
 * club's context (country, tier, appeal, the board's target), creates the record of a human club, runs the rollover
 * of its country and derives what the screens show (the view, the master sponsor, the pitch boards).
 */
import type { SaveService, SeatMeta } from "@/backend/SaveService";
import { getLeagueData } from "@/backend/advanceDay";
import { playerCupSlug } from "@/backend/cupWorld";
import { recordMoney } from "@/backend/FinancialService";
import { sponsorCatalog } from "@/backend/sponsorCatalog";
import { naturalFinancialTier } from "@/Domain/aiFinance/aiClubFinance";
import { heatOf, seasonTrend, type FanbaseHeat, type TablePlace } from "@/Domain/fanbase/fanbase";
import { managerReputation } from "@/Domain/jobs/jobs";
import { licenceReputation } from "@/Domain/managers/courses";
import { SPONSORS } from "@/Domain/sponsors/sponsorConfig";
import {
  SPONSOR_SLOTS, aiBoards, aiSponsorsOf, campaignOf, contractBoards, contractMaster, evaluateSponsorSeason, generateOffers,
  goalProgress, initialSponsors, masterOf, slotFilled, sponsorAppeal, weeklySponsorIncome,
  type SponsorClubContext, type SponsorSeasonNow, type SponsorSeasonOutcome, type SponsorSeasonReview,
} from "@/Domain/sponsors/sponsors";
import { topPlayerCount, worldTopIds } from "@/Domain/squad/starLimit";
import type { LeagueSeasonState } from "@/types/calendarTypes";
import type { LeagueZone, Squad, StandingRow } from "@/types/playerTypes";
import type { ClubSponsors, MasterSponsor, SponsorBoard, SponsorOffer, SponsorsView } from "@/types/sponsorTypes";

const CONTINENTAL_ZONE_IDS = new Set(["ucl", "uel", "uecl", "lib", "sud"]);

/** Last place of the league's continental zone (0 = none). */
export function continentalZoneTo(zones: readonly LeagueZone[]): number {
  return Math.max(0, ...zones.filter((z) => CONTINENTAL_ZONE_IDS.has(z.id) && typeof z.to === "number").map((z) => z.to!));
}

/** Last promotion place of the league (0 = none). */
export function promotionZoneTo(zones: readonly LeagueZone[]): number {
  return zones.find((z) => z.id === "prom")?.to ?? 0;
}

const yearOf = (date: string): number => parseInt(date.slice(0, 4), 10) || 0;

async function leagueOf(service: SaveService, saveId: string, squad: Squad): Promise<{ leagueSlug: string; country: string | null; zones: LeagueZone[]; size: number }> {
  const index = await service.getSquadIndex(saveId);
  const leagueSlug = index.byId?.(String(squad.id))?.leagueSlug ?? squad.leagueSlug ?? "";
  const league = (await getLeagueData()).find((l) => l.slug === leagueSlug);
  return {
    leagueSlug, country: league?.country ?? null, zones: (league?.zones ?? []) as LeagueZone[],
    size: leagueSlug && typeof index.inLeague === "function" ? index.inLeague(leagueSlug).length : 0,
  };
}

function placeIn(table: readonly StandingRow[], clubId: string): TablePlace | null {
  const at = table.findIndex((r) => r.squadId === clubId);
  return at >= 0 ? { rank: at + 1, leagueSize: table.length, played: table[at]!.mp } : null;
}

/** Furthest stage of the country's cup the club reached ("champion" for the winner); null = none or no cup. */
export async function cupStageReached(service: SaveService, saveId: string, leagueSlug: string, clubId: string): Promise<string | null> {
  const slug = leagueSlug ? await playerCupSlug(leagueSlug) : null;
  const cup = slug ? (await service.getLeagueMeta(saveId, slug))?.cup : null;
  if (!cup) return null;
  if (cup.championId === clubId) return "champion";
  let best: string | null = null;
  for (const stage of cup.stages) if (stage.entrants.includes(clubId)) best = stage.name;
  return best;
}

/** Average home attendance of the club between two dates (null = no home game recorded). */
export function attendanceAverage(squad: Squad, from: string, to: string): number | null {
  const rows = (squad.facilities?.attendance ?? []).filter((r) => r.date >= from && r.date <= to);
  return rows.length > 0 ? rows.reduce((t, r) => t + r.attendance, 0) / rows.length : null;
}

export interface SponsorContextOpts {
  date: string;
  /** Season of the seeds (the year of the club's league); default = the league meta's year. */
  season?: number;
  /** The board's target position; default = the seat's objective, else the middle of the table. */
  target?: number | null;
  /** `campaignOf` of the last league season; default = the last row of the club's history. */
  campaign?: number;
  /** Mood on the networks; default = from the table of today. */
  heat?: FanbaseHeat | null;
  /** The world's top players; default = computed from every squad. */
  top?: ReadonlySet<string>;
  /** Average home attendance of the last season (the attendance goals); default none. */
  attendanceAvg?: number | null;
  /** The seat as it is now (default: read). */
  meta?: SeatMeta | null;
  /** The board meter the reputation uses (default: the seat's). */
  board?: number;
}

/** What the club's offers are made from. */
export async function sponsorContext(
  service: SaveService, saveId: string, seatId: string, squad: Squad, opts: SponsorContextOpts,
): Promise<SponsorClubContext> {
  const league = await leagueOf(service, saveId, squad);
  const clubId = String(squad.id);
  const meta = opts.meta !== undefined ? opts.meta : await service.getSeatMeta(saveId, seatId);
  const tier = naturalFinancialTier(squad.finances);
  const season = opts.season ?? (league.leagueSlug ? (await service.getLeagueMeta(saveId, league.leagueSlug))?.year : undefined) ?? yearOf(opts.date);

  let campaign = opts.campaign;
  if (campaign === undefined) {
    const last = (await service.getClubHistory(saveId, clubId))?.seasons.at(-1);
    campaign = last ? campaignOf(last.position, league.size) : 0;
  }
  let heat = opts.heat;
  if (heat === undefined) {
    const table = league.leagueSlug ? (await service.getLeagueStandings(saveId, league.leagueSlug)) ?? [] : [];
    const trend = seasonTrend(placeIn(table, clubId), tier);
    heat = trend === null ? null : heatOf(trend);
  }
  const reputation = managerReputation(
    await service.getManagers(saveId), opts.board ?? meta?.board?.board ?? 60, yearOf(opts.date), seatId,
    meta?.managerAssets, meta?.managerDecor, licenceReputation(meta?.managerStudies, opts.date),
  );
  const top = opts.top ?? worldTopIds(await service.getAllSquads(saveId));
  const target = opts.target ?? meta?.board?.objective?.target ?? Math.max(1, Math.ceil(league.size / 2));
  return {
    saveId, clubId, season, date: opts.date, country: league.country, tier,
    base: squad.finances?.commercial ?? 0,
    appeal: sponsorAppeal({ campaign, heat, reputation, stars: topPlayerCount(squad, top) }),
    leagueSize: league.size, target,
    continentalTo: continentalZoneTo(league.zones),
    promotion: promotionZoneTo(league.zones) > 0,
    cup: !!(league.leagueSlug && await playerCupSlug(league.leagueSlug)),
    attendanceAvg: opts.attendanceAvg ?? null,
  };
}

/**
 * The club becomes a sponsored (human) club: no contract yet, offers for every slot. Written onto the squad as it is
 * on disk now. Returns the offers (none when the squad is gone).
 */
export async function createClubSponsors(
  service: SaveService, saveId: string, seatId: string, squadId: string, opts: SponsorContextOpts,
): Promise<SponsorOffer[]> {
  const squad = await service.getSquadById(saveId, squadId);
  if (!squad) return [];
  const sponsors = initialSponsors(sponsorCatalog(), await sponsorContext(service, saveId, seatId, squad, opts));
  await service.saveSquadById(saveId, { ...squad, sponsors });
  return sponsors.offers;
}

export interface SponsorRolloverArgs {
  seatId: string;
  clubId: string;
  date: string;
  /** The seat at the start of the day (reputation: assets, studies). */
  meta: SeatMeta;
  /** The league season that just closed: its slug, final table and window. */
  closed: { leagueSlug: string; table: readonly StandingRow[]; start: string; end: string };
  move: "promoted" | "relegated" | null;
  followers: { before: number; after: number } | null;
  /** The new season: its ledger year (also the seed), the board's new target and meter. */
  season: number;
  target: number | null;
  board?: number;
}

/**
 * Rollover of the seat's country (after the board judged the season and the club moved league): bonuses into the new
 * season's ledger, contracts a season shorter, companies leaving or offering to renew, new offers for the empty slots.
 * A club without the record (a save from before 12.0) gets it here, with offers for every slot and no evaluation.
 */
export async function sponsorRollover(
  service: SaveService, saveId: string, args: SponsorRolloverArgs,
): Promise<{ review: SponsorSeasonReview | null; offers: SponsorOffer[] }> {
  const index = await service.getSquadIndex(saveId);
  const entry = index.byId(args.clubId);
  const squad = entry ? await service.getSquad(saveId, entry.leagueSlug, entry.stem) : null;
  if (!entry || !squad) return { review: null, offers: [] };
  const catalog = sponsorCatalog();
  const place = placeIn(args.closed.table, args.clubId);
  const position = place && place.played > 0 ? place.rank : null;
  const closedAttendance = attendanceAverage(squad, args.closed.start, args.closed.end);
  const tier = naturalFinancialTier(squad.finances);
  const trend = seasonTrend(place, tier);
  const ctx = await sponsorContext(service, saveId, args.seatId, squad, {
    date: args.date, season: args.season, target: args.target, meta: args.meta,
    campaign: campaignOf(position, args.closed.table.length),
    heat: trend === null ? null : heatOf(trend),
    attendanceAvg: closedAttendance,
    ...(args.board !== undefined ? { board: args.board } : {}),
  });

  if (!squad.sponsors) {
    const sponsors = initialSponsors(catalog, ctx);
    await service.saveSquad(saveId, entry.leagueSlug, entry.stem, { ...squad, sponsors });
    return { review: null, offers: sponsors.offers };
  }

  const closedZones = ((await getLeagueData()).find((l) => l.slug === args.closed.leagueSlug)?.zones ?? []) as LeagueZone[];
  const continentalTo = continentalZoneTo(closedZones);
  const outcome: SponsorSeasonOutcome = {
    position, leagueSize: args.closed.table.length,
    relegated: args.move === "relegated", promoted: args.move === "promoted",
    continental: position !== null && continentalTo > 0 && position <= continentalTo,
    cupStage: await cupStageReached(service, saveId, args.closed.leagueSlug, args.clubId),
    followersGrowth: args.followers && args.followers.before > 0 ? (args.followers.after - args.followers.before) / args.followers.before : 0,
    attendanceAvg: closedAttendance,
  };
  const review = evaluateSponsorSeason(squad.sponsors, outcome, ctx);
  const offers = generateOffers(catalog, ctx, review.sponsors);
  const sponsors: ClubSponsors = { ...review.sponsors, offers: [...review.sponsors.offers, ...offers] };
  await service.saveSquad(saveId, entry.leagueSlug, entry.stem, { ...squad, sponsors });
  // Bonuses: one ledger line each, in the new season (`recordMoney`: squad + ledger together).
  for (const b of review.bonuses) {
    await recordMoney(service, saveId, args.season, { leagueSlug: entry.leagueSlug, clubSlug: entry.stem }, {
      date: args.date, kind: "commercial", amount: b.amount, label: `Sponsor bonus: ${b.company.name}`,
      ref: { stage: "sponsor_bonus", clubName: b.company.name },
    }, args.seatId);
  }
  return { review, offers };
}

// ── What the screens show ─────────────────────────────────────────────────────

function seasonOf(activeLeagues: readonly LeagueSeasonState[] | undefined, leagueSlug: string, date: string): number {
  return activeLeagues?.find((l) => l.leagueSlug === leagueSlug)?.year ?? yearOf(date);
}

async function derived(service: SaveService, saveId: string, squad: Squad, activeLeagues: readonly LeagueSeasonState[] | undefined, date: string) {
  const league = await leagueOf(service, saveId, squad);
  return aiSponsorsOf(sponsorCatalog(), {
    clubId: String(squad.id), season: seasonOf(activeLeagues, league.leagueSlug, date), country: league.country,
    tier: naturalFinancialTier(squad.finances),
  });
}

/**
 * The club's master sponsor: its contract (a human club with the record; null while the slot is empty), else the name
 * derived from the club's id and season (AI clubs, and a human club still without the record).
 */
export async function masterSponsorOf(
  service: SaveService, saveId: string, squad: Squad, activeLeagues: readonly LeagueSeasonState[] | undefined, date: string,
): Promise<MasterSponsor | null> {
  if (squad.sponsors) return contractMaster(squad.sponsors);
  return masterOf((await derived(service, saveId, squad, activeLeagues, date)).master);
}

/** The sponsors on the home club's pitch boards (master weight 3, kit 2, board 1). */
export async function sponsorBoardsOf(
  service: SaveService, saveId: string, squad: Squad, activeLeagues: readonly LeagueSeasonState[] | undefined, date: string,
): Promise<SponsorBoard[]> {
  if (squad.sponsors) return contractBoards(squad.sponsors);
  return aiBoards(await derived(service, saveId, squad, activeLeagues, date));
}

/** `GET /api/saves/:id/sponsors`: slots, contracts and offers with today's progress of each goal. */
export async function sponsorsView(service: SaveService, saveId: string, meta: SeatMeta, squad: Squad, top: ReadonlySet<string>): Promise<SponsorsView> {
  const date = meta.currentDate ?? "";
  const league = await leagueOf(service, saveId, squad);
  const clubId = String(squad.id);
  const tier = naturalFinancialTier(squad.finances);
  const table = league.leagueSlug ? (await service.getLeagueStandings(saveId, league.leagueSlug)) ?? [] : [];
  const place = placeIn(table, clubId);
  const state = meta.activeLeagues?.find((l) => l.leagueSlug === league.leagueSlug);
  const now: SponsorSeasonNow = {
    position: place && place.played > 0 ? place.rank : null,
    continentalTo: continentalZoneTo(league.zones),
    promotionTo: promotionZoneTo(league.zones),
    cupStage: await cupStageReached(service, saveId, league.leagueSlug, clubId),
    followersTrend: seasonTrend(place, tier),
    attendanceAvg: state ? attendanceAverage(squad, state.start, state.end) : null,
  };
  const ctx = await sponsorContext(service, saveId, meta.seatId, squad, { date, meta, top });
  const s = squad.sponsors ?? { contracts: [], offers: [] };
  return {
    date,
    slots: SPONSOR_SLOTS.map((slot) => ({ slot, count: SPONSORS.SLOTS[slot].count, share: SPONSORS.SLOTS[slot].share, filled: slotFilled(s, slot) })),
    contracts: s.contracts.map((c) => ({ ...c, progress: goalProgress(c.goal, now) })),
    offers: s.offers.filter((o) => o.expires >= date).map((o) => ({ ...o, progress: goalProgress(o.goal, now) })),
    base: ctx.base,
    weekly: squad.sponsors ? weeklySponsorIncome(squad.sponsors) : Math.round(ctx.base / 52),
    appeal: Math.round(ctx.appeal * 1000) / 1000,
    active: !!squad.sponsors,
  };
}
