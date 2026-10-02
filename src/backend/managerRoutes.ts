import { saveService } from "@/backend/SaveService";
import { requireSaveOwner } from "@/backend/auth/middleware";
import { getLeagueData } from "@/backend/advanceDay";
import { rankManagers, rankingPage } from "@/Domain/managers/managers";

type Req = Request & { params: Record<string, string> };

const PAGE_DEFAULT = 50;
const PAGE_MAX = 100;

/** Manager ranking (`.claude/rules/game/managers.md`). */
export const managerRoutes = {
  /**
   * `GET` - `?scope=world|country` (country = the player's league country), `?offset=&limit=`
   * (limit 1..100, default 50). Response `{ total, playerRank, items }`; each item carries its rank
   * within the scope, the club's name and the full title list.
   */
  "/api/saves/:saveId/managers": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSaveOwner(req, saveId);
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
    if (!(offset >= 0) || !(limit >= 1 && limit <= PAGE_MAX) || (scope !== "world" && scope !== "country")) {
      return Response.json({ error: "invalid offset/limit/scope" }, { status: 400 });
    }
    const meta = await saveService.getMeta(saveId);
    if (!meta) return Response.json({ error: "save not found" }, { status: 404 });
    const index = await saveService.getSquadIndex(saveId);
    const catalog = await getLeagueData();
    const countryOf = new Map(catalog.map((l) => [l.slug, l.country] as const));
    const countryOfClub = (squadId: string) => {
      const slug = index.byId(squadId)?.leagueSlug;
      return slug ? countryOf.get(slug) ?? null : null;
    };
    const myCountry = countryOf.get(index.byId(meta.clubId)?.leagueSlug ?? meta.leagueSlug) ?? null;
    const page = rankingPage(
      rankManagers(await saveService.getManagers(saveId)),
      scope === "world" ? () => true : (m) => myCountry !== null && countryOfClub(m.squadId) === myCountry,
      offset, limit,
    );
    return Response.json({
      ...page,
      items: page.items.map((m) => ({ ...m, clubName: index.byId(m.squadId)?.name ?? null })),
    });
  },
};
