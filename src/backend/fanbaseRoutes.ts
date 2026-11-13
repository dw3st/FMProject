import { saveService } from "@/backend/SaveService";
import { requireSeat } from "@/backend/auth/middleware";
import { getLeagueData } from "@/backend/advanceDay";
import { getSaveDataVersion } from "@/backend/dal/saveDataVersion";
import { financialTierOf } from "@/Domain/aiFinance/aiClubFinance";
import { isCupSlug } from "@/Domain/cups/cupIds";
import { isContinentalSlug } from "@/Domain/continental/competitions";
import { isYouthCompSlug } from "@/Domain/youthComps/youthCompIds";
import { FANBASE_SCOPES, fanbasePage, type FanbaseClub, type FanbaseScope, type TablePlace } from "@/Domain/fanbase/fanbase";

type Req = Request & { params: Record<string, string> };

const PAGE_DEFAULT = 50;
const PAGE_MAX = 100;

/** `saveId` → every club of the world for the day/version in `key` (one read of the squads serves every scope and page). */
const cache = new Map<string, { key: string; clubs: FanbaseClub[] }>();
const MAX_ENTRIES = 8;

/** Every club of the save with its followers, tier and place in its league's table. */
export async function fanbaseClubs(saveId: string): Promise<FanbaseClub[] | null> {
  const meta = await saveService.getMeta(saveId);
  if (!meta) return null;
  const key = `${meta.currentDate ?? ""}#${getSaveDataVersion(saveId)}`;
  const hit = cache.get(saveId);
  if (hit && hit.key === key) return hit.clubs;

  const index = await saveService.getSquadIndex(saveId);
  const humans = await saveService.humanClubIds(saveId);
  const countryOf = new Map((await getLeagueData()).map((l) => [l.slug, l.country ?? null]));
  const leagues = index.leagues().filter((l) => !isCupSlug(l) && !isContinentalSlug(l) && !isYouthCompSlug(l));
  const placeOf = new Map<string, TablePlace>();
  for (const slug of leagues) {
    const table = (await saveService.getLeagueStandings(saveId, slug)) ?? [];
    table.forEach((row, i) => placeOf.set(row.squadId, { rank: i + 1, leagueSize: table.length, played: row.mp }));
  }
  const clubs: FanbaseClub[] = [];
  for (const squad of await saveService.getAllSquads(saveId)) {
    const entry = index.byId(String(squad.id));
    if (!entry || !squad.finances) continue;
    clubs.push({
      squadId: entry.squadId,
      name: squad.name,
      leagueSlug: entry.leagueSlug,
      country: countryOf.get(entry.leagueSlug) ?? null,
      followers: squad.finances.followers ?? 0,
      tier: financialTierOf(squad),
      place: placeOf.get(entry.squadId) ?? null,
      human: humans.has(entry.squadId),
    });
  }
  cache.delete(saveId);
  cache.set(saveId, { key, clubs });
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  return clubs;
}

export const fanbaseRoutes = {
  /** Followers ranking of the world, the viewer's country or league (`.claude/rules/game/fanbase.md`). */
  "/api/saves/:saveId/fanbase": async (req: Req) => {
    if (req.method !== "GET") return Response.json({ error: "method not allowed" }, { status: 405 });
    const { saveId } = req.params;
    const auth = requireSeat(req, saveId!);
    if (auth instanceof Response) return auth;
    const url = new URL(req.url);
    const scope = (url.searchParams.get("scope") ?? "world") as FanbaseScope;
    if (!FANBASE_SCOPES.includes(scope)) return Response.json({ error: "invalidScope" }, { status: 400 });
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const limit = Number(url.searchParams.get("limit") ?? PAGE_DEFAULT);
    if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > PAGE_MAX) {
      return Response.json({ error: "invalidPage" }, { status: 400 });
    }
    const clubs = await fanbaseClubs(saveId!);
    if (!clubs) return Response.json({ error: "save not found" }, { status: 404 });
    const seat = await saveService.getSeatMeta(saveId!, auth.seatId);
    return Response.json(fanbasePage(clubs, { scope, myClubId: seat?.clubId || null, offset, limit }));
  },
};
