/**
 * Sponsors (12.0, `.claude/rules/game/sponsors.md`): pure rules. A human club's weekly commercial income comes from
 * its contracts (master, kit supplier, four boards); companies make offers with a fixed value, a bonus and a goal;
 * the season's rollover pays the bonuses and decides who stays. An AI club stores nothing: its sponsors are names
 * drawn from its id and season (`aiSponsorsOf`).
 */
import { addDays } from "@/Domain/dates";
import type { FanbaseHeat } from "@/Domain/fanbase/fanbase";
import { mulberry32, seedFrom, shuffle, unitFrom } from "@/Domain/rng";
import { SPONSORS } from "@/Domain/sponsors/sponsorConfig";
import { SPONSOR_TRAIT_EFFECTS, sponsorTraitOf, type SponsorTrait } from "@/Domain/sponsors/sponsorTraits";
import type { FinancialTier } from "@/types/playerTypes";
import type {
  ClubSponsors, MasterSponsor, SponsorBoard, SponsorBrand, SponsorCompany, SponsorContract, SponsorContractEnd, SponsorGoal,
  SponsorGoalProgress, SponsorHistoryEntry, SponsorNegotiation, SponsorOffer, SponsorPaid, SponsorProfile, SponsorSlot,
} from "@/types/sponsorTypes";

export const SPONSOR_SLOTS: readonly SponsorSlot[] = ["master", "kit", "board"];
export const SPONSOR_PROFILES: readonly SponsorProfile[] = ["safe", "standard", "demanding"];

const TIER_RANK: Record<FinancialTier, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, ELITE: 3 };
/** Cup stages in order (`CupStageName`). */
const CUP_STAGES = ["preliminary", "r128", "r64", "r32", "r16", "qf", "sf", "final"];

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Money on the sponsors' grid (thousands; hundreds for very small values). */
export function roundSponsorMoney(v: number): number {
  const step = v >= 20 * SPONSORS.ROUND ? SPONSORS.ROUND : SPONSORS.ROUND / 10;
  return Math.max(0, Math.round(v / step) * step);
}

export function emptySponsors(): ClubSponsors {
  return { contracts: [], offers: [] };
}

export function brandOf(c: SponsorCompany | SponsorBrand): SponsorBrand {
  return { id: c.id, name: c.name, sector: c.sector, size: c.size, colors: [c.colors[0], c.colors[1]], ...(c.funny ? { funny: true as const } : {}) };
}

// ── Appeal ────────────────────────────────────────────────────────────────────

/** Last league season as −1 (last) .. +1 (champion); 0 without a season. */
export function campaignOf(position: number | null, leagueSize: number): number {
  if (position === null || leagueSize < 2) return 0;
  return clamp(1 - (2 * (position - 1)) / (leagueSize - 1), -1, 1);
}

/** How attractive the club is to sponsors (0.7..1.3; 1 = an ordinary club). */
export function sponsorAppeal(a: {
  /** `campaignOf` of the last league season. */
  campaign: number;
  /** Mood on the networks (`heatOf`); null = no trend. */
  heat: FanbaseHeat | null;
  /** Manager reputation 0..100. */
  reputation: number;
  /** Players of the world's top 25 in the squad. */
  stars: number;
}): number {
  const A = SPONSORS.APPEAL;
  const social = a.heat === "hot" ? 1 : a.heat === "cold" ? -1 : 0;
  const manager = clamp((a.reputation - 50) / 50, -1, 1);
  const stars = Math.min(1, Math.max(0, a.stars) / A.STARS_FULL);
  return clamp(1 + A.CAMPAIGN * clamp(a.campaign, -1, 1) + A.SOCIAL * social + A.MANAGER * manager + A.STARS * stars, A.MIN, A.MAX);
}

// ── Companies ─────────────────────────────────────────────────────────────────

/** Whether `c` would sponsor a club of this tier and country in this slot. A company without a country fits any. */
export function companyEligible(
  c: SponsorCompany, club: { tier: FinancialTier; country: string | null }, slot: SponsorSlot,
): boolean {
  const rank = TIER_RANK[club.tier];
  const sameCountry = !c.country || (club.country !== null && c.country === club.country);
  if (c.size === "global") return rank >= TIER_RANK.HIGH;
  if (c.size === "national") return rank >= TIER_RANK.MEDIUM && (sameCountry || club.tier === "ELITE");
  return sameCountry && (rank <= TIER_RANK.MEDIUM || slot === "board");
}

/**
 * The companies that may offer for a slot, in catalog order. With fewer than `need`, the `global` / `national` of any
 * country come in, then anyone: a slot never stays without offers.
 * The kit supplier is always a sportswear company (of any size and country: kit makers dress clubs of every level);
 * only with fewer than `need` of them does the usual rule complete the list.
 */
export function eligibleCompanies(
  catalog: readonly SponsorCompany[], club: { tier: FinancialTier; country: string | null }, slot: SponsorSlot, need = 1,
): SponsorCompany[] {
  if (slot === "kit") {
    const makers = catalog.filter((c) => c.sector === "sportswear");
    if (makers.length >= need) return makers;
    const seenMakers = new Set(makers.map((c) => c.id));
    return [...makers, ...eligibleCompanies(catalog.filter((c) => !seenMakers.has(c.id)), club, "master", need - makers.length)];
  }
  const own = catalog.filter((c) => companyEligible(c, club, slot));
  if (own.length >= need) return own;
  const seen = new Set(own.map((c) => c.id));
  const wide = catalog.filter((c) => c.size !== "local" && !seen.has(c.id));
  const pool = [...own, ...wide];
  if (pool.length >= need) return pool;
  for (const c of wide) seen.add(c.id);
  return [...pool, ...catalog.filter((c) => !seen.has(c.id))];
}

// ── Offers ────────────────────────────────────────────────────────────────────

/** What the offers of a club are made from (built by the server, `sponsorWorld.ts`). */
export interface SponsorClubContext {
  saveId: string;
  clubId: string;
  /** Season of the seeds (the year of the club's league). */
  season: number | string;
  date: string;
  /** leagueData country of the club's league. */
  country: string | null;
  tier: FinancialTier;
  /** `finances.commercial`. */
  base: number;
  appeal: number;
  leagueSize: number;
  /** The board's target position for the season. */
  target: number;
  /** Last place of the league's continental zone (0 = none). */
  continentalTo: number;
  /** The league has promotion places. */
  promotion: boolean;
  /** The country has a national cup. */
  cup: boolean;
  /** Average home attendance of the last season (null = no history). */
  attendanceAvg: number | null;
}

export function slotFilled(s: ClubSponsors, slot: SponsorSlot): number {
  return s.contracts.filter((c) => c.slot === slot).length;
}

export function slotFree(s: ClubSponsors, slot: SponsorSlot): number {
  return Math.max(0, SPONSORS.SLOTS[slot].count - slotFilled(s, slot));
}

/** Offers a slot gets when it has `free` empty places. */
export function offersForSlot(slot: SponsorSlot, free: number): number {
  if (free <= 0) return 0;
  return slot === "board" ? free + SPONSORS.BOARD_EXTRA_OFFERS : SPONSORS.SLOTS[slot].offers;
}

function positionGoal(profile: SponsorProfile, ctx: Pick<SponsorClubContext, "leagueSize" | "target">): SponsorGoal {
  const n = Math.max(1, ctx.leagueSize);
  const t = clamp(Math.round(ctx.target), 1, n);
  const step = SPONSORS.GOAL.POSITION_STEP;
  return { kind: "league_position", max: profile === "safe" ? Math.min(n, t + step) : profile === "demanding" ? Math.max(1, t - step) : t };
}

/** The goals a company of this profile may ask in this slot (the league position always first). */
export function goalOptions(slot: SponsorSlot, profile: SponsorProfile, ctx: SponsorClubContext): SponsorGoal[] {
  const out: SponsorGoal[] = [positionGoal(profile, ctx)];
  if (profile === "safe") return out;
  const G = SPONSORS.GOAL;
  if (profile === "demanding" && ctx.continentalTo > 0 && ctx.target <= ctx.continentalTo + G.CONTINENTAL_REACH) out.push({ kind: "continental" });
  if (ctx.cup) out.push({ kind: "cup_stage", stage: profile === "demanding" ? "sf" : "qf" });
  if (profile === "demanding" && ctx.promotion) out.push({ kind: "promotion" });
  if (slot === "board") {
    out.push({ kind: "followers_growth", pct: G.FOLLOWERS[profile] });
    if (ctx.attendanceAvg !== null && ctx.attendanceAvg > 0) {
      out.push({ kind: "attendance", avg: Math.round(ctx.attendanceAvg * G.ATTENDANCE[profile]) });
    }
  }
  return out;
}

/** A goal carried into a new season (a renewal): the same kind when the club can still be asked it. */
export function refreshGoal(goal: SponsorGoal, profile: SponsorProfile, ctx: SponsorClubContext): SponsorGoal {
  const fallback = positionGoal(profile, ctx);
  switch (goal.kind) {
    case "league_position": return fallback;
    case "continental": return ctx.continentalTo > 0 ? goal : fallback;
    case "cup_stage": return ctx.cup ? goal : fallback;
    case "promotion": return ctx.promotion ? goal : fallback;
    case "followers_growth": return goal;
    case "attendance": {
      if (ctx.attendanceAvg === null || ctx.attendanceAvg <= 0 || profile === "safe") return fallback;
      return { kind: "attendance", avg: Math.round(ctx.attendanceAvg * SPONSORS.GOAL.ATTENDANCE[profile]) };
    }
  }
}

function offerId(ctx: Pick<SponsorClubContext, "clubId" | "season">, slot: SponsorSlot, companyId: string, tag = ""): string {
  return `so_${slot}_${seedFrom(`${ctx.clubId}:${ctx.season}:${slot}:${companyId}:${tag}`).toString(36)}`;
}

/**
 * Fixed value and bonus of an offer. The company's trait (12.1): `generous` pays more fixed, `stingy` less fixed and
 * a bigger bonus; any other trait (or none) leaves the numbers as they are.
 */
export function offerValue(args: {
  base: number; slot: SponsorSlot; appeal: number; profile: SponsorProfile; size: SponsorCompany["size"]; noise: number;
  trait?: SponsorTrait;
}): { annual: number; bonus: number } {
  const unit = Math.max(0, args.base) * SPONSORS.SLOTS[args.slot].share * args.appeal * args.noise * SPONSORS.SIZE_MULT[args.size];
  const p = SPONSORS.PROFILE[args.profile];
  const E = SPONSOR_TRAIT_EFFECTS;
  if (args.trait === "generous") return { annual: roundSponsorMoney(unit * p.fixed * E.GENEROUS_FIXED), bonus: roundSponsorMoney(unit * p.bonus) };
  if (args.trait === "stingy") return { annual: roundSponsorMoney(unit * p.fixed * E.STINGY_FIXED), bonus: roundSponsorMoney(unit * p.bonus * E.STINGY_BONUS) };
  return { annual: roundSponsorMoney(unit * p.fixed), bonus: roundSponsorMoney(unit * p.bonus) };
}

/** Seasons a company with this trait signs for: `longterm` always 3, `shortterm` always 1, the others `fallback`. */
export function traitYears(trait: SponsorTrait, fallback: number): number {
  return trait === "longterm" ? SPONSOR_TRAIT_EFFECTS.LONGTERM_YEARS : trait === "shortterm" ? SPONSOR_TRAIT_EFFECTS.SHORTTERM_YEARS : fallback;
}

/**
 * New offers for every slot with an empty place and no offer on the table (a renewal does not count): master 3, kit
 * supplier 2, boards free places + 2. Deterministic for the same save, club, season and slot. Companies already at
 * the club (contract or offer) never come again.
 */
export function generateOffers(
  catalog: readonly SponsorCompany[], ctx: SponsorClubContext, current: ClubSponsors,
  slots: readonly SponsorSlot[] = SPONSOR_SLOTS,
): SponsorOffer[] {
  const used = new Set([...current.contracts.map((c) => c.company.id), ...current.offers.map((o) => o.company.id)]);
  const out: SponsorOffer[] = [];
  for (const slot of SPONSOR_SLOTS) {
    if (!slots.includes(slot)) continue;
    if (current.offers.some((o) => o.slot === slot && !o.renewal)) continue;
    const n = offersForSlot(slot, slotFree(current, slot));
    if (n === 0) continue;
    const rng = mulberry32(seedFrom(`sponsors:${ctx.saveId}:${ctx.clubId}:${ctx.season}:${slot}`));
    const pool = eligibleCompanies(catalog.filter((c) => !used.has(c.id)), ctx, slot, n);
    const picked = shuffle(pool, rng).slice(0, n);
    const profiles = picked.map(() => SPONSOR_PROFILES[Math.floor(rng() * SPONSOR_PROFILES.length)]!);
    // Never all the same profile: the last one changes.
    const swap = SPONSOR_PROFILES.filter((p) => p !== profiles[0])[Math.floor(rng() * (SPONSOR_PROFILES.length - 1))]!;
    if (profiles.length >= 2 && profiles.every((p) => p === profiles[0])) profiles[profiles.length - 1] = swap;
    picked.forEach((company, i) => {
      const profile = profiles[i]!;
      const options = goalOptions(slot, profile, ctx);
      const goal = options[Math.floor(rng() * options.length)]!;
      const noise = SPONSORS.NOISE.MIN + rng() * (SPONSORS.NOISE.MAX - SPONSORS.NOISE.MIN);
      const minYears = profile === "demanding" ? SPONSORS.YEARS.DEMANDING_MIN : SPONSORS.YEARS.MIN;
      // The draw is always made (the other offers of the slot keep their numbers); the trait then decides.
      const trait = sponsorTraitOf(company.id);
      const years = traitYears(trait, minYears + Math.floor(rng() * (SPONSORS.YEARS.MAX - minYears + 1)));
      used.add(company.id);
      out.push({
        id: offerId(ctx, slot, company.id),
        slot, company: brandOf(company), profile,
        ...offerValue({ base: ctx.base, slot, appeal: ctx.appeal, profile, size: company.size, noise, trait }),
        goal, years, expires: addDays(ctx.date, SPONSORS.OFFER_DAYS),
      });
    });
  }
  return out;
}

/** A club's first sponsors record: no contract, offers for every slot. */
export function initialSponsors(catalog: readonly SponsorCompany[], ctx: SponsorClubContext): ClubSponsors {
  return { contracts: [], offers: generateOffers(catalog, ctx, emptySponsors()) };
}

// ── Answering ─────────────────────────────────────────────────────────────────

export type SponsorActionError = "notFound" | "slotTaken" | "alreadyNegotiated";
export type SponsorActionResult =
  | { ok: true; sponsors: ClubSponsors; contract?: SponsorContract; negotiation?: SponsorNegotiation }
  | { ok: false; error: SponsorActionError };

function liveOffer(s: ClubSponsors, offerId_: string, date: string): SponsorOffer | undefined {
  const o = s.offers.find((x) => x.id === offerId_);
  return o && o.expires >= date ? o : undefined;
}

function sign(s: ClubSponsors, offer: SponsorOffer, date: string, auto: boolean): { sponsors: ClubSponsors; contract: SponsorContract } {
  const contract: SponsorContract = {
    id: `sc_${offer.id}_${date}`, slot: offer.slot, company: offer.company, profile: offer.profile,
    annual: offer.annual, bonus: offer.bonus, goal: offer.goal, seasonsLeft: offer.years, signedOn: date,
    ...(auto ? { auto: true as const } : {}),
  };
  const contracts = [...s.contracts, contract];
  // A renewal taken: the company's last contract (closed at the rollover) ended by being renewed.
  const closed = offer.renewal ? (s.history ?? []).findLastIndex((h) => h.companyId === offer.company.id && h.slot === offer.slot && h.end === "expired") : -1;
  const history = closed >= 0 ? s.history!.map((h, i) => (i === closed ? { ...h, end: "renewed" as const } : h)) : s.history;
  const full = contracts.filter((c) => c.slot === offer.slot).length >= SPONSORS.SLOTS[offer.slot].count;
  // The other offers of the slot drop once it is full (master, kit: at once; boards: when the four are taken).
  const offers = s.offers.filter((o) => o.id !== offer.id && !(full && o.slot === offer.slot));
  return { sponsors: { ...s, contracts, offers, ...(history ? { history } : {}) }, contract };
}

/** The offer becomes a contract (the slot must have a free place). */
export function acceptOffer(s: ClubSponsors, id: string, date: string): SponsorActionResult {
  const offer = liveOffer(s, id, date);
  if (!offer) return { ok: false, error: "notFound" };
  if (slotFree(s, offer.slot) <= 0) return { ok: false, error: "slotTaken" };
  return { ok: true, ...sign(s, offer, date, false) };
}

export function declineOffer(s: ClubSponsors, id: string, date: string): SponsorActionResult {
  if (!liveOffer(s, id, date)) return { ok: false, error: "notFound" };
  return { ok: true, sponsors: { ...s, offers: s.offers.filter((o) => o.id !== id) } };
}

/** Chances [raise, keep] of a negotiation (the rest withdraws): a `haggler` gives in more, a `proud` company walks away more. */
export function negotiationChances(trait: SponsorTrait): readonly [number, number] {
  if (trait === "haggler") return SPONSOR_TRAIT_EFFECTS.HAGGLER_NEGOTIATE;
  if (trait === "proud") return SPONSOR_TRAIT_EFFECTS.PROUD_NEGOTIATE;
  return [SPONSORS.NEGOTIATE.RAISE_CHANCE, SPONSORS.NEGOTIATE.KEEP_CHANCE];
}

/**
 * What the company answers when asked for more (drawn once from the offer's id). `companyId` brings the company's
 * trait (12.1); without it, the default chances.
 */
export function negotiationOutcome(id: string, companyId?: string): SponsorNegotiation {
  const r = unitFrom(`sponsors:negotiate:${id}`);
  const [raise, keep] = negotiationChances(companyId ? sponsorTraitOf(companyId) : "none");
  return r < raise ? "raised" : r < raise + keep ? "kept" : "withdrawn";
}

/** Once per offer: 45% the fixed value goes up 8%, 35% it stays, 20% the company walks away. */
export function negotiateOffer(s: ClubSponsors, id: string, date: string): SponsorActionResult {
  const offer = liveOffer(s, id, date);
  if (!offer) return { ok: false, error: "notFound" };
  if (offer.negotiated) return { ok: false, error: "alreadyNegotiated" };
  const negotiation = negotiationOutcome(id, offer.company.id);
  if (negotiation === "withdrawn") return { ok: true, negotiation, sponsors: { ...s, offers: s.offers.filter((o) => o.id !== id) } };
  const next: SponsorOffer = {
    ...offer, negotiated: true,
    ...(negotiation === "raised" ? { annual: roundSponsorMoney(offer.annual * SPONSORS.NEGOTIATE.RAISE) } : {}),
  };
  return { ok: true, negotiation, sponsors: { ...s, offers: s.offers.map((o) => (o.id === id ? next : o)) } };
}

/**
 * The day's check: offers past their last day leave the table; where the slot still has a free place the director
 * signs the expired offer of highest fixed value (no draw). Nothing expired = the same object.
 */
export function expireOffers(s: ClubSponsors, date: string): { sponsors: ClubSponsors; signed: SponsorContract[]; changed: boolean } {
  const expired = s.offers.filter((o) => o.expires < date);
  if (expired.length === 0) return { sponsors: s, signed: [], changed: false };
  let cur = s;
  const signed: SponsorContract[] = [];
  for (const slot of SPONSOR_SLOTS) {
    for (;;) {
      if (slotFree(cur, slot) <= 0) break;
      const best = cur.offers
        .filter((o) => o.slot === slot && o.expires < date)
        .sort((a, b) => b.annual - a.annual || (a.id < b.id ? -1 : 1))[0];
      if (!best) break;
      const r = sign(cur, best, date, true);
      cur = r.sponsors;
      signed.push(r.contract);
    }
  }
  return { sponsors: { ...cur, offers: cur.offers.filter((o) => o.expires >= date) }, signed, changed: true };
}

// ── Season rollover ───────────────────────────────────────────────────────────

/** How the closed season went, for the goals. */
export interface SponsorSeasonOutcome {
  /** Final league position (null = no games). */
  position: number | null;
  leagueSize: number;
  relegated: boolean;
  promoted: boolean;
  /** Finished inside the continental zone. */
  continental: boolean;
  /** Furthest national cup stage reached (`CupStageName`; "champion" for the winner); null = none. */
  cupStage: string | null;
  /** Followers change at the rollover (0.04 = +4%). */
  followersGrowth: number;
  /** Average home attendance of the season (null = no data). */
  attendanceAvg: number | null;
}

function cupRank(stage: string | null): number {
  if (stage === "champion") return CUP_STAGES.length;
  return stage ? CUP_STAGES.indexOf(stage) : -1;
}

export function goalMet(goal: SponsorGoal, o: SponsorSeasonOutcome): boolean {
  switch (goal.kind) {
    case "league_position": return o.position !== null && o.position <= goal.max;
    case "continental": return o.continental;
    case "cup_stage": return cupRank(o.cupStage) >= CUP_STAGES.indexOf(goal.stage);
    case "promotion": return o.promoted;
    case "followers_growth": return o.followersGrowth >= goal.pct;
    case "attendance": return o.attendanceAvg !== null && o.attendanceAvg >= goal.avg;
  }
}

/** Places a league-position goal was missed by (0 = met or not a position goal). */
export function positionMiss(goal: SponsorGoal, o: SponsorSeasonOutcome): number {
  if (goal.kind !== "league_position" || o.position === null) return 0;
  return Math.max(0, o.position - goal.max);
}

export type SponsorLeaveReason = "relegated" | "missed";

export interface SponsorSeasonReview {
  sponsors: ClubSponsors;
  /** Bonuses to pay (goal met), one per contract. */
  bonuses: { contractId: string; slot: SponsorSlot; company: SponsorBrand; amount: number }[];
  /** Companies offering to stay (already among `sponsors.offers`). */
  renewals: SponsorOffer[];
  left: { slot: SponsorSlot; company: SponsorBrand; reason: SponsorLeaveReason }[];
}

/**
 * The rollover of the club's country: bonus for a goal met, one season less, the company leaves at once on a
 * relegation or a position missed by 6+, and a contract at its end offers a renewal (× 1.10 goal met, × 0.90 missed
 * narrowly) or leaves. `next` is the club in the new season (the renewals' goals and last day).
 */
export function evaluateSponsorSeason(s: ClubSponsors, o: SponsorSeasonOutcome, next: SponsorClubContext): SponsorSeasonReview {
  const R = SPONSORS.ROLLOVER;
  const contracts: SponsorContract[] = [];
  const bonuses: SponsorSeasonReview["bonuses"] = [];
  const renewals: SponsorOffer[] = [];
  const left: SponsorSeasonReview["left"] = [];
  for (const c of s.contracts) {
    const met = goalMet(c.goal, o);
    if (met && c.bonus > 0) bonuses.push({ contractId: c.id, slot: c.slot, company: c.company, amount: c.bonus });
    const seasonsLeft = c.seasonsLeft - 1;
    const miss = positionMiss(c.goal, o);
    // The company's trait (12.1): `impatient` leaves on a smaller miss, `loyal` never leaves for a missed goal.
    const trait = sponsorTraitOf(c.company.id);
    const exitMiss = trait === "impatient" ? SPONSOR_TRAIT_EFFECTS.IMPATIENT_MISS : R.EXIT_MISS;
    if (o.relegated) { left.push({ slot: c.slot, company: c.company, reason: "relegated" }); continue; }
    if (!met && trait !== "loyal" && miss >= exitMiss) { left.push({ slot: c.slot, company: c.company, reason: "missed" }); continue; }
    if (seasonsLeft > 0) { contracts.push({ ...c, seasonsLeft }); continue; }
    const near = !met && (trait === "loyal" || c.goal.kind !== "league_position" || miss <= R.NEAR_MISS);
    if (!met && !near) { left.push({ slot: c.slot, company: c.company, reason: "missed" }); continue; }
    const factor = met ? R.RENEW_MET : R.RENEW_MISSED;
    const offer: SponsorOffer = {
      id: offerId(next, c.slot, c.company.id, "renewal"),
      slot: c.slot, company: c.company, profile: c.profile,
      annual: roundSponsorMoney(c.annual * factor), bonus: roundSponsorMoney(c.bonus * factor),
      goal: refreshGoal(c.goal, c.profile, next), years: traitYears(trait, SPONSORS.YEARS.RENEWAL),
      expires: addDays(next.date, SPONSORS.OFFER_DAYS), renewal: true,
    };
    renewals.push(offer);
  }
  // A renewal replaces whatever that company still had on the table.
  const renewing = new Set(renewals.map((r) => r.company.id));
  const offers = [...s.offers.filter((x) => !renewing.has(x.company.id)), ...renewals];
  return { sponsors: { ...s, contracts, offers }, bonuses, renewals, left };
}

// ── Books (12.1): what each contract paid, and the finished contracts ─────────

/** Finished contracts kept per club (the oldest leave). */
export const SPONSOR_HISTORY_MAX = 60;

const paidOf = (c: SponsorContract): SponsorPaid => c.paid ?? { fixed: 0, bonus: 0, met: 0, missed: 0 };

/** Monday: each contract's week added to its running total (the same `annual / 52` the ledger line is made of). */
export function creditWeeklyPaid(s: ClubSponsors): ClubSponsors {
  if (s.contracts.length === 0) return s;
  return { ...s, contracts: s.contracts.map((c) => ({ ...c, paid: { ...paidOf(c), fixed: paidOf(c).fixed + Math.round(c.annual / 52) } })) };
}

/**
 * The books of a season review: every contract of `before` counts its goal (met: the bonus too); the ones that went
 * on keep the totals, the ones that ended become history entries. `sponsors` is the record after the review (with
 * the new offers); `date` the day of the rollover.
 */
export function seasonBooks(
  before: ClubSponsors, review: Pick<SponsorSeasonReview, "left">, sponsors: ClubSponsors, o: SponsorSeasonOutcome, date: string,
): ClubSponsors {
  const paid = new Map<string, SponsorPaid>();
  const ended: SponsorHistoryEntry[] = [];
  const alive = new Set(sponsors.contracts.map((c) => c.id));
  for (const c of before.contracts) {
    const met = goalMet(c.goal, o);
    const p = paidOf(c);
    const next: SponsorPaid = { fixed: p.fixed, bonus: p.bonus + (met ? c.bonus : 0), met: p.met + (met ? 1 : 0), missed: p.missed + (met ? 0 : 1) };
    if (alive.has(c.id)) { paid.set(c.id, next); continue; }
    const reason = review.left.find((l) => l.slot === c.slot && l.company.id === c.company.id)?.reason;
    const end: SponsorContractEnd = reason === "relegated" ? "relegated" : reason === "missed" && c.seasonsLeft > 1 ? "left_early" : "expired";
    ended.push({
      companyId: c.company.id, companyName: c.company.name, slot: c.slot, from: c.signedOn, to: date,
      seasons: next.met + next.missed, fixedPaid: next.fixed, bonusPaid: next.bonus, goalsMet: next.met, goalsMissed: next.missed, end,
    });
  }
  const history = [...(sponsors.history ?? []), ...ended].slice(-SPONSOR_HISTORY_MAX);
  return {
    ...sponsors,
    contracts: sponsors.contracts.map((c) => (paid.has(c.id) ? { ...c, paid: paid.get(c.id)! } : c)),
    ...(history.length > 0 ? { history } : {}),
  };
}

// ── Income, boards, AI ────────────────────────────────────────────────────────

/** Monday income of the contracts in force (an empty slot earns nothing). */
export function weeklySponsorIncome(s: ClubSponsors): number {
  return Math.round(s.contracts.reduce((t, c) => t + c.annual, 0) / 52);
}

/** The weekly commercial line: the contracts when the club has sponsors, else the old `commercial / 52`. */
export function weeklyCommercialIncome(squad: { sponsors?: ClubSponsors; finances?: { commercial?: number } }): number {
  return squad.sponsors ? weeklySponsorIncome(squad.sponsors) : Math.round((squad.finances?.commercial ?? 0) / 52);
}

export interface AiSponsors {
  master: SponsorBrand | null;
  kit: SponsorBrand | null;
  boards: SponsorBrand[];
}

/** An AI club's sponsors: names only, drawn from the club's id and season; never the same company twice. */
export function aiSponsorsOf(
  catalog: readonly SponsorCompany[], club: { clubId: string; season: number | string; country: string | null; tier: FinancialTier },
): AiSponsors {
  const rng = mulberry32(seedFrom(`sponsors:ai:${club.clubId}:${club.season}`));
  const used = new Set<string>();
  const draw = (slot: SponsorSlot, n: number): SponsorBrand[] => {
    const free = catalog.filter((c) => !used.has(c.id));
    const picked = shuffle(eligibleCompanies(free, club, slot, n), rng).slice(0, n);
    for (const c of picked) used.add(c.id);
    return picked.map(brandOf);
  };
  const master = draw("master", 1)[0] ?? null;
  const kit = draw("kit", 1)[0] ?? null;
  return { master, kit, boards: draw("board", SPONSORS.SLOTS.board.count) };
}

/** Only the master sponsor of `aiSponsorsOf` (its first draw): the same company, without drawing the other slots. */
export function aiMasterSponsorOf(
  catalog: readonly SponsorCompany[], club: { clubId: string; season: number | string; country: string | null; tier: FinancialTier },
): SponsorBrand | null {
  const rng = mulberry32(seedFrom(`sponsors:ai:${club.clubId}:${club.season}`));
  const picked = shuffle(eligibleCompanies(catalog, club, "master", 1), rng)[0];
  return picked ? brandOf(picked) : null;
}

const boardOf = (b: SponsorBrand, slot: SponsorSlot): SponsorBoard => ({ id: b.id, name: b.name, colors: b.colors, weight: SPONSORS.SLOTS[slot].weight });

/** The pitch boards of a human club: its contracts (master 3, kit 2, board 1). */
export function contractBoards(s: ClubSponsors): SponsorBoard[] {
  return SPONSOR_SLOTS.flatMap((slot) => s.contracts.filter((c) => c.slot === slot).map((c) => boardOf(c.company, slot)));
}

export function aiBoards(a: AiSponsors): SponsorBoard[] {
  return [
    ...(a.master ? [boardOf(a.master, "master")] : []),
    ...(a.kit ? [boardOf(a.kit, "kit")] : []),
    ...a.boards.map((b) => boardOf(b, "board")),
  ];
}

export function masterOf(b: SponsorBrand | null | undefined): MasterSponsor | null {
  return b ? { id: b.id, name: b.name, sector: b.sector, colors: b.colors } : null;
}

/** The master sponsor of a human club's record (null = the slot is empty). */
export function contractMaster(s: ClubSponsors): MasterSponsor | null {
  return masterOf(s.contracts.find((c) => c.slot === "master")?.company);
}

// ── Progress ──────────────────────────────────────────────────────────────────

/** The season so far, for the goals on screen. */
export interface SponsorSeasonNow {
  /** League position today (null before any game). */
  position: number | null;
  continentalTo: number;
  /** Last promotion place of the league (0 = none). */
  promotionTo: number;
  cupStage: string | null;
  /** Followers change the season is heading for (`seasonTrend`; null = no trend yet). */
  followersTrend: number | null;
  /** Average home attendance of the running season (null = no home game yet). */
  attendanceAvg: number | null;
}

/** Where a goal stands today. `met` null = too early to tell. */
export function goalProgress(goal: SponsorGoal, now: SponsorSeasonNow): SponsorGoalProgress {
  switch (goal.kind) {
    case "league_position":
      return now.position === null ? { met: null, target: goal.max } : { met: now.position <= goal.max, current: now.position, target: goal.max };
    case "continental":
      return now.position === null || now.continentalTo <= 0
        ? { met: null, ...(now.continentalTo > 0 ? { target: now.continentalTo } : {}) }
        : { met: now.position <= now.continentalTo, current: now.position, target: now.continentalTo };
    case "promotion":
      return now.position === null || now.promotionTo <= 0
        ? { met: null, ...(now.promotionTo > 0 ? { target: now.promotionTo } : {}) }
        : { met: now.position <= now.promotionTo, current: now.position, target: now.promotionTo };
    case "cup_stage":
      return { met: cupRank(now.cupStage) >= CUP_STAGES.indexOf(goal.stage) ? true : null };
    case "followers_growth":
      return now.followersTrend === null ? { met: null, target: goal.pct } : { met: now.followersTrend >= goal.pct, current: now.followersTrend, target: goal.pct };
    case "attendance":
      return now.attendanceAvg === null ? { met: null, target: goal.avg } : { met: now.attendanceAvg >= goal.avg, current: Math.round(now.attendanceAvg), target: goal.avg };
  }
}
