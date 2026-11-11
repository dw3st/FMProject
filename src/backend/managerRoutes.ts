import { listSaveMembers } from "@/backend/auth/saveOwnership";
import { getSocialUser } from "@/backend/social/socialStore";
import { shownProfile } from "@/Domain/achievements/items";
import { saveService } from "@/backend/SaveService";
import { requireSeat } from "@/backend/auth/middleware";
import { getLeagueData } from "@/backend/advanceDay";
import { rankManagers, rankingPage } from "@/Domain/managers/managers";
import { managerFaceCountry } from "@/Domain/faces/managerFace";
import { clubCountryResolver } from "@/backend/matchCrowd";
import { jobPosts } from "@/backend/jobPostsWorld";
import type { SeatMeta } from "@/backend/SaveService";
import type { SquadIndex } from "@/backend/squadIndex";
import type { ManagerRecord } from "@/types/managerTypes";

type Req = Request & { params: Record<string, string> };

const PAGE_DEFAULT = 50;
const PAGE_MAX = 100;

type RankedManager = ManagerRecord & { rank: number };
interface DecorateCtx {
  liveSeats: ReadonlySet<string>;
  index: SquadIndex;
  clubNameOf: (id: string) => string | null;
  countryOfClub: (id: string) => string | null;
}

/** The ranking item of each manager (club names, face, the asking seat's profile, other humans' nicknames and assets). */
async function decorateManagers(saveId: string, seatId: string, meta: SeatMeta, items: RankedManager[], ctx: DecorateCtx) {
  const { liveSeats, index, clubNameOf, countryOfClub } = ctx;
  const mine = (m: { seatId?: string }) => m.seatId === seatId;
  // The asking seat's manager's profile items (`.claude/rules/game/achievements.md`): frame, title, badges.
  const profile = items.some(mine) ? shownProfile(await saveService.getAchievements(saveId, seatId)) : null;
  // Human managers show the assets they bought.
  const assetsBySeat = new Map(await Promise.all(items.filter((m) => m.seatId).map(async (m) =>
    [m.seatId!, (await saveService.getSeat(saveId, m.seatId!))?.managerAssets] as const)));
  // Another human's manager is marked in the ranking (the friends' league): his nickname.
  const nicknames = new Map(listSaveMembers(saveId).map((x) => [x.seatId, getSocialUser(x.userId)?.nickname ?? null] as const));
  return items.map((m) => ({
    ...m,
    ...(m.seatId && liveSeats.has(m.seatId) && !mine(m) ? { human: nicknames.get(m.seatId) ?? m.name } : {}),
    ...(m.seatId && assetsBySeat.get(m.seatId) ? { assets: assetsBySeat.get(m.seatId) } : {}),
    isPlayer: mine(m),
    clubName: m.squadId ? clubNameOf(m.squadId) : null,
    ...(m.squadId.startsWith("nat_") ? { national: true } : {}),
    free: !m.squadId,
    interim: !!m.interim,
    // Season awards (Etapa 32): best manager of a league, world manager of the year.
    awards: m.awards ?? [],
    // Every manager's passages (Etapa 25), with the clubs' names and leagues (links on the manager page, 8.9.31).
    clubs: (m.clubs ?? []).map((c) => ({ ...c, clubName: clubNameOf(c.squadId), leagueSlug: index.byId(c.squadId)?.leagueSlug ?? null })),
    ...(mine(m) ? { earnings: meta.managerEarnings ?? 0, ...(profile ? { profile } : {}) } : {}),
    // Face (Etapa 31b): shirt in the current club's colours; the human manager's saved avatar and
    // nationality, an AI manager's appearance from the country of his first club (stable).
    clubColors: m.squadId ? index.byId(m.squadId)?.colors ?? null : null,
    ...(mine(m)
      ? { face: meta.manager?.face ?? null, nationality: managerFaceCountry(meta.manager?.nationalityIso) }
      : { nationality: countryOfClub(m.clubs?.[0]?.squadId ?? m.squadId) }),
  }));
}

/** Manager ranking (`.claude/rules/game/managers.md`). */
export const managerRoutes = {
  /**
   * `GET` - `?scope=world|country|free` (country = the player's league country; free = managers
   * without a club), `?offset=&limit=`
   * (limit 1..100, default 50). Response `{ total, playerRank, items }`; each item carries its rank
   * within the scope, the club's name and the full title list (the human manager also his club passages).
   */
  "/api/saves/:saveId/managers": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "GET") return Response.json({ error: "method not allowed" }, { status: 405 });
    const q = new URL(req.url).searchParams;
    const int = (v: string | null, def: number) => {
      const n = v === null || v === "" ? def : Number(v);
      return Number.isInteger(n) ? n : NaN;
    };
    const offset = int(q.get("offset"), 0);
    const limit = int(q.get("limit"), PAGE_DEFAULT);
    const scope = q.get("scope") ?? "world";
    if (!(offset >= 0) || !(limit >= 1 && limit <= PAGE_MAX) || (scope !== "world" && scope !== "country" && scope !== "free" && scope !== "humans")) {
      return Response.json({ error: "invalid offset/limit/scope" }, { status: 400 });
    }
    const meta = await saveService.getSeatMeta(saveId, auth.seatId);
    if (!meta) return Response.json({ error: "save not found" }, { status: 404 });
    // A manager who left the world keeps his seat id but no seat (part 2): he counts as free.
    const liveSeats = new Set((await saveService.getMeta(saveId))?.seats ?? []);
    const index = await saveService.getSquadIndex(saveId);
    const clubCountry = await clubCountryResolver(saveService, saveId);
    // National-team coaches (`nat_…`, `.claude/rules/game/national-teams.md`): the nation is the "club" and the country.
    const national = await saveService.getNationalState(saveId);
    const nationOf = (id: string | undefined) => (id && id.startsWith("nat_") ? national?.teams[id]?.nation ?? null : null);
    const countryOfClub = (id: string) => nationOf(id) ?? clubCountry(id);
    const clubNameOf = (id: string) => nationOf(id) ?? index.byId(id)?.name ?? null;
    const myCountry = countryOfClub(meta.clubId)
      ?? (await getLeagueData()).find((l) => l.slug === meta.leagueSlug)?.country ?? null;
    // Retired managers (free for too long) leave the ranking tab (`.claude/rules/game/managers.md`).
    const page = rankingPage(
      rankManagers((await saveService.getManagers(saveId)).filter((m) => !m.retired)),
      scope === "world" ? () => true
        : scope === "humans" ? (m) => !!m.seatId && liveSeats.has(m.seatId)
        : scope === "free" ? (m) => !m.squadId && (!m.seatId || !liveSeats.has(m.seatId))
        : (m) => myCountry !== null && countryOfClub(m.squadId) === myCountry,
      offset, limit, auth.seatId,
    );
    // `me=1`: the asking seat's manager comes along even off the page (the Dashboard opens his profile, 4.47.11).
    if (q.get("me") === "1" && page.playerRank !== null && !page.items.some((m) => m.seatId === auth.seatId)) {
      const ranked = rankManagers((await saveService.getManagers(saveId)).filter((m) => !m.retired));
      const self = ranked.find((m) => m.seatId === auth.seatId);
      if (self) page.items.push({ ...self, rank: page.playerRank });
    }
    return Response.json({
      ...page,
      humans: liveSeats.size,
      items: await decorateManagers(saveId, auth.seatId, meta, page.items, { liveSeats, index, clubNameOf, countryOfClub }),
    });
  },
  /**
   * `GET` - one manager's page (8.9.31): the ranking item with his world rank, the league of his club and, at an AI club,
   * the job security of the Posts tab. 404 for an unknown or retired manager.
   */
  "/api/saves/:saveId/managers/:managerId": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "GET") return Response.json({ error: "method not allowed" }, { status: 405 });
    const id = req.params.managerId ?? "";
    if (!/^[A-Za-z0-9_:.-]{1,120}$/.test(id)) return Response.json({ error: "not found" }, { status: 404 });
    const meta = await saveService.getSeatMeta(saveId, auth.seatId);
    if (!meta) return Response.json({ error: "save not found" }, { status: 404 });
    const ranked = rankManagers((await saveService.getManagers(saveId)).filter((m) => !m.retired));
    const at = ranked.findIndex((m) => m.id === id);
    if (at < 0) return Response.json({ error: "not found" }, { status: 404 });
    const liveSeats = new Set((await saveService.getMeta(saveId))?.seats ?? []);
    const index = await saveService.getSquadIndex(saveId);
    const clubCountry = await clubCountryResolver(saveService, saveId);
    const national = await saveService.getNationalState(saveId);
    const nationOf = (sid: string | undefined) => (sid && sid.startsWith("nat_") ? national?.teams[sid]?.nation ?? null : null);
    const countryOfClub = (sid: string) => nationOf(sid) ?? clubCountry(sid);
    const clubNameOf = (sid: string) => nationOf(sid) ?? index.byId(sid)?.name ?? null;
    const m = ranked[at]!;
    const [item] = await decorateManagers(saveId, auth.seatId, meta, [{ ...m, rank: at + 1 }], { liveSeats, index, clubNameOf, countryOfClub });
    const leagueSlug = m.squadId ? index.byId(m.squadId)?.leagueSlug ?? null : null;
    const row = leagueSlug ? (await jobPosts(saveService, saveId, meta, leagueSlug))?.rows.find((r) => r.squadId === m.squadId) ?? null : null;
    return Response.json({
      ...item, total: ranked.length, leagueSlug,
      job: row ? { level: row.level, target: row.target, position: row.position } : null,
    });
  },
};
