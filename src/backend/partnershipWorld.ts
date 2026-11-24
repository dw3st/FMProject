import { getLeagueData, getPyramids } from "@/backend/advanceDay";
import { countryByLeague } from "@/backend/cupWorld";
import type { SaveService } from "@/backend/SaveService";
import { naturalFinancialTier } from "@/Domain/aiFinance/aiClubFinance";
import { pyramidByLeague, tierOfLeague } from "@/Domain/season/countryRollover";
import { answerPartnership, compareStanding, type ClubStanding, type PartnershipRefusal } from "@/Domain/partnerships/partnerships";
import { starterLineAverages } from "@/Domain/scouting/missions";
import { MIN_BY_ROLE } from "@/Domain/contracts/freeAgents";
import { getMainRole, type MainRole } from "@/Domain/roles";
import { parentOfferCandidate, offerWindowKey } from "@/Domain/partnerships/partnerships";
import { PARTNER } from "@/Domain/partnerships/partnershipConfig";
import { loanAvailability, loanUntil } from "@/Domain/negotiation/loans";
import { autoLineupDefaultFormation } from "@/Domain/advanceDay/matchSimulationLineups";
import { seasonEndOf } from "@/backend/negotiationWorld";
import { NEGOTIATION } from "@/Domain/negotiation/negotiationConfig";
import { addDays } from "@/Domain/dates";
import type { Squad } from "@/types/playerTypes";
import type { Partnership, PartnershipKind, SeatPartnerships } from "@/types/partnershipTypes";
import type { SeatMeta } from "@/backend/SaveService";

const MAIN_ROLES: MainRole[] = ["GK", "Defender", "Midfielder", "Forward"];

export interface StandingInfo extends ClubStanding {
  id: string;
  country: string;
}

/** Where a club stands: the division of its league in the country's pyramid (1 when none) and its natural tier. */
export async function standingOf(squad: Squad, leagueSlug: string): Promise<StandingInfo> {
  const pyramid = pyramidByLeague(await getPyramids()).get(leagueSlug);
  const country = countryByLeague(await getLeagueData()).get(leagueSlug) ?? "";
  return {
    id: squad.id,
    country,
    division: (pyramid ? tierOfLeague(pyramid, leagueSlug) : null) ?? 1,
    tier: naturalFinancialTier(squad.finances),
  };
}

/** AI clubs that partner another manager of this world, mapped to that seat. */
export async function partnersElsewhere(service: SaveService, saveId: string, seatId: string): Promise<Set<string>> {
  const out = new Set<string>();
  for (const s of await service.listSeats(saveId)) {
    if (s.seatId === seatId) continue;
    const p = s.seat.partnerships;
    if (p?.satellite) out.add(p.satellite.clubId);
    if (p?.parent) out.add(p.parent.clubId);
  }
  return out;
}

export interface PartnerCandidate {
  clubId: string;
  name: string;
  leagueSlug: string;
  division: number;
  tier: string;
  refusal: PartnershipRefusal | null;
}

/** Every club of the human club's country, with the AI's answer for this kind of partnership. */
export async function partnershipCandidates(
  service: SaveService, saveId: string, meta: SeatMeta, human: Squad, kind: PartnershipKind,
): Promise<PartnerCandidate[]> {
  const index = await service.getSquadIndex(saveId);
  const humanEntry = index.byId(human.id);
  if (!humanEntry) return [];
  const humanStanding = await standingOf(human, humanEntry.leagueSlug);
  const countryOf = countryByLeague(await getLeagueData());
  const humans = await service.humanClubIds(saveId);
  const taken = await partnersElsewhere(service, saveId, meta.seatId);
  const out: PartnerCandidate[] = [];
  for (const slug of index.leagues()) {
    if (countryOf.get(slug) !== humanStanding.country) continue;
    for (const team of index.inLeague(slug)) {
      if (team.squadId === human.id) continue;
      const squad = await service.getSquadById(saveId, team.squadId);
      if (!squad) continue;
      const st = await standingOf(squad, slug);
      out.push({
        clubId: squad.id, name: squad.name, leagueSlug: slug, division: st.division, tier: st.tier,
        refusal: answerPartnership({
          kind, human: humanStanding, target: st, current: meta.partnerships,
          targetHuman: humans.has(squad.id), takenElsewhere: taken.has(squad.id),
        }),
      });
    }
  }
  return out.sort((a, b) => a.division - b.division || a.name.localeCompare(b.name));
}

/** Why a partnership no longer holds, or null: the partner got a manager, partners another one, or the levels changed. */
export async function partnershipBreak(
  service: SaveService, saveId: string, seatId: string, human: Squad, kind: PartnershipKind, partner: Partnership,
  humans: Set<string>, elsewhere: Set<string>,
): Promise<"human" | "other" | "level" | null> {
  if (humans.has(partner.clubId)) return "human";
  if (elsewhere.has(partner.clubId)) return "other";
  const index = await service.getSquadIndex(saveId);
  const hEntry = index.byId(human.id);
  const pEntry = index.byId(partner.clubId);
  const squad = pEntry ? await service.getSquadById(saveId, partner.clubId) : null;
  if (!hEntry || !pEntry || !squad) return "level";
  const cmp = compareStanding(await standingOf(squad, pEntry.leagueSlug), await standingOf(human, hEntry.leagueSlug));
  if (kind === "satellite" ? cmp >= 0 : cmp <= 0) return "level";
  void seatId;
  return null;
}

/** Lines the human satellite needs: below the minimum + 1, plus its weakest outfield line. */
export function neededLines(squad: Squad): Set<MainRole> {
  const out = new Set<MainRole>();
  for (const role of MAIN_ROLES) {
    const n = squad.players.filter((p) => getMainRole(p.positions[0] ?? "CM") === role).length;
    if (n <= MIN_BY_ROLE[role]) out.add(role);
  }
  const avg = starterLineAverages(squad);
  const weakest = (["Defender", "Midfielder", "Forward"] as MainRole[]).sort((a, b) => avg[a] - avg[b])[0]!;
  out.add(weakest);
  return out;
}

/** The partnerships without one kind. */
export function withoutPartner(p: SeatPartnerships | undefined, kind: PartnershipKind): SeatPartnerships {
  const next: SeatPartnerships = { ...(p ?? {}) };
  delete next[kind];
  return next;
}

/** One day of a seat's partnerships: ends broken ones, expires the parent's offer, makes a new one on Mondays. */
export async function partnershipDay(
  service: SaveService, saveId: string, args: {
    seatId: string; meta: SeatMeta; date: string; windowOpen: boolean; windowUntil?: string;
    humans: Set<string>;
  },
): Promise<{ partnerships?: SeatPartnerships; news: PartnershipNews[] }> {
  const { meta, date } = args;
  let p = meta.partnerships;
  if (!p || !meta.clubId || (!p.satellite && !p.parent)) return { news: [] };
  const human = await service.getSquadById(saveId, meta.clubId);
  if (!human) return { news: [] };
  const news: PartnershipNews[] = [];
  let changed = false;
  const elsewhere = await partnersElsewhere(service, saveId, args.seatId);
  for (const kind of ["satellite", "parent"] as const) {
    const partner = p[kind];
    if (!partner) continue;
    const why = await partnershipBreak(service, saveId, args.seatId, human, kind, partner, args.humans, elsewhere);
    if (!why) continue;
    p = withoutPartner(p, kind);
    changed = true;
    news.push({ kind: "partnership_ended", clubName: partner.clubName, partnerKind: kind, partnerEnd: why });
  }
  const parentP = p.parent;
  if (parentP?.pending && parentP.pending.expires < date) {
    p = { ...p, parent: { ...parentP, pending: undefined } };
    changed = true;
  }
  const parentNow = p.parent;
  const monday = new Date(`${date}T12:00:00Z`).getUTCDay() === 1;
  if (parentNow && !parentNow.pending && monday && args.windowOpen) {
    const window = offerWindowKey(args.windowUntil);
    const offers = parentNow.offers?.window === window ? parentNow.offers : { window, count: 0 };
    if (offers.count < PARTNER.OFFERS_PER_WINDOW && offers.lastWeek !== date) {
      const parent = await service.getSquadById(saveId, parentNow.clubId);
      if (parent) {
        const starters = new Set(autoLineupDefaultFormation(parent));
        const pick = parentOfferCandidate({
          parent, satellite: human, neededLines: neededLines(human),
          available: (pl) => loanAvailability(pl, parent, { starterIds: starters, listed: false }) === null,
          excluded: new Set(),
        });
        if (pick) {
          const index = await service.getSquadIndex(saveId);
          const until = loanUntil(date, seasonEndOf(meta.activeLeagues, index.byId(human.id)?.leagueSlug, date));
          const offer = {
            id: `${parent.id}:${pick.id}:${date}`, playerId: pick.id, playerName: pick.name,
            wageShare: PARTNER.PARENT_MIN_SHARE, until, expires: addDays(date, NEGOTIATION.BID.VALID_DAYS),
          };
          p = { ...p, parent: { ...parentNow, pending: offer, offers: { window, count: offers.count + 1, lastWeek: date } } };
          changed = true;
          news.push({ kind: "partnership_offer", clubName: parentNow.clubName, partnerKind: "parent", offerId: offer.id,
            playerId: pick.id, playerName: pick.name, wageShare: offer.wageShare, until, expires: offer.expires });
        }
      }
    }
  }
  return { ...(changed ? { partnerships: p } : {}), news };
}

export interface PartnershipNews {
  kind: "partnership_ended" | "partnership_offer";
  clubName: string;
  partnerKind: PartnershipKind;
  partnerEnd?: "human" | "other" | "level";
  offerId?: string;
  playerId?: string;
  playerName?: string;
  wageShare?: number;
  until?: string;
  expires?: string;
}
