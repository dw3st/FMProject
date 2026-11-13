import type { SaveService, SeatMeta } from "@/backend/SaveService";
import { startingFacilities } from "@/backend/facilityWorld";
import { jobPosts } from "@/backend/jobPostsWorld";
import { masterSponsorOf } from "@/backend/sponsorWorld";
import { clubCountryResolver } from "@/backend/matchCrowd";
import { buildClubFinanceRows } from "@/Domain/aiFinance/financeRows";
import { clubLegends, emptyClubHistory, titleGallery } from "@/Domain/clubHistory/clubHistory";
import { conditionOf } from "@/Domain/facilities/facilityItems";
import { livingFacilities } from "@/Domain/facilities/facilities";
import { matchPitch } from "@/Domain/facilities/pitch";
import { STADIUM_ART_ITEMS, stadiumArtLevel } from "@/Domain/facilities/stadiumArt";
import type { ClubOverview } from "@/types/clubOverviewTypes";
import type { Squad } from "@/types/playerTypes";

/**
 * Overview of any club for the club page (tester report, 8.9.30): manager and job security with the application,
 * stadium, money, season and honours. An AI club's stadium items are the ones it would start with as a human club
 * (revenue and tier, `startingFacilities`) and its pitch the AI formula of the day: nothing is stored for it.
 */
export async function clubOverview(service: SaveService, saveId: string, meta: SeatMeta, squad: Squad): Promise<ClubOverview> {
  const index = await service.getSquadIndex(saveId);
  const leagueSlug = index.byId(squad.id)?.leagueSlug ?? squad.leagueSlug ?? "";
  const date = meta.currentDate ?? "";
  const humanIds = await service.humanClubIds(saveId);
  const human = humanIds.has(squad.id);

  // Stadium: the club's own items (a human club) or its starting items, the pitch of today's home match.
  const items = livingFacilities(squad)?.items ?? (await startingFacilities(squad, leagueSlug)).items;
  const window = (meta.activeLeagues ?? []).find((l) => l.leagueSlug === leagueSlug);
  const pitch = Math.round(matchPitch(squad, {}, window, date).condition);
  const stadium = {
    level: stadiumArtLevel(STADIUM_ART_ITEMS.map((id) => items[id].level)),
    pitch,
    seats: Math.round(conditionOf(items.seats)),
    structure: Math.round(conditionOf(items.stadiumStructure)),
  };

  // Manager and job security (the Posts tab of the managers ranking, 8.9.29).
  const posts = leagueSlug ? await jobPosts(service, saveId, meta, leagueSlug) : null;
  const row = posts?.rows.find((r) => r.squadId === squad.id) ?? null;
  const managers = await service.getManagers(saveId);
  const m = managers.find((x) => x.squadId === squad.id) ?? null;
  const country = await clubCountryResolver(service, saveId);

  // Season: the league table.
  const table = leagueSlug ? (await service.getLeagueStandings(saveId, leagueSlug)) ?? [] : [];
  const at = table.findIndex((r) => r.squadId === squad.id);
  const st = at >= 0 ? table[at]! : null;

  const money = buildClubFinanceRows([squad], meta.clubId, humanIds)[0]!;
  const history = (await service.getClubHistory(saveId, squad.id)) ?? emptyClubHistory(squad.id);

  return {
    squadId: squad.id,
    leagueSlug,
    venue: squad.venue ? { name: squad.venue.name, city: squad.venue.city, capacity: squad.venue.capacity } : null,
    stadium,
    manager: m
      ? {
        id: m.id, name: m.name, human: !!m.seatId, interim: !!m.interim,
        nationality: country(m.clubs?.[0]?.squadId ?? m.squadId),
        since: m.clubs?.slice().reverse().find((c) => c.squadId === squad.id && !c.to)?.from ?? m.hiredOn ?? null,
      }
      : null,
    job: row ? { level: row.level, target: row.target, blocked: row.blocked, size: posts!.rows.length } : null,
    application: posts?.application ? { squadId: posts.application.squadId, answerOn: posts.application.answerOn } : null,
    employed: posts?.employed ?? (!!meta.clubId && !meta.unemployed),
    money: human ? null : {
      tier: money.tier, popularity: money.popularity, wageBill: money.wageBill, maxWageBudget: money.maxWageBudget,
      hiring: money.hiring, transferBudget: money.transferBudget, seasonalTransferBudget: money.seasonalTransferBudget,
    },
    season: st ? { position: at + 1, size: table.length, played: st.mp, points: st.pts, form: st.form.slice(-5) } : null,
    titles: titleGallery(history.seasons).map((g) => ({ title: g.title, count: g.seasons.length })),
    legends: clubLegends(history.scorers).slice(0, 3).map((l) => ({ playerId: l.playerId, name: l.name, tier: l.tier })),
    // Only the name: another human club's contract values stay private.
    masterSponsor: await masterSponsorOf(service, saveId, squad, meta.activeLeagues, date),
  };
}
