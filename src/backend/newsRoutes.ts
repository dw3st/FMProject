import { saveService } from "@/backend/SaveService";
import { requireSaveOwner } from "@/backend/auth/middleware";
import { isRealIsoDate } from "@/Domain/dates";
import type { NewsItem } from "@/types/newsTypes";

type Req = Request & { params: Record<string, string> };

const bad = (error: string, status = 400) => Response.json({ error }, { status });
const SCOPES = ["all", "club", "league", "followed"] as const;
type Scope = (typeof SCOPES)[number];

export const newsRoutes = {
  /** `?scope=all|club|league|followed&competition=&before=YYYY-MM-DD&limit=1..100`. */
  "/api/saves/:saveId/news": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSaveOwner(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "GET") return bad("method not allowed", 405);
    const meta = await saveService.getMeta(saveId);
    if (!meta) return bad("save not found", 404);

    const q = new URL(req.url).searchParams;
    const scope = (q.get("scope") ?? "all") as Scope;
    if (!SCOPES.includes(scope)) return bad("invalid scope");
    const limitRaw = q.get("limit");
    const limit = limitRaw === null ? 40 : Number(limitRaw);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) return bad("invalid limit");
    const before = q.get("before");
    if (before !== null && !isRealIsoDate(before)) return bad("invalid before");
    const competition = q.get("competition") || null;
    if (competition !== null && !/^[a-z0-9_]{1,80}$/i.test(competition)) return bad("invalid competition");

    const followed = meta.followedLeagues ?? [];
    const keep = (n: NewsItem): boolean => {
      if (before !== null && n.date >= before) return false;
      if (scope === "club" && !(meta.clubId && n.clubIds.includes(meta.clubId))) return false;
      if (scope === "league" && n.league !== meta.leagueSlug) return false;
      if (scope === "followed" && !(n.league && followed.includes(n.league))) return false;
      if (competition !== null && n.league !== competition && n.competition !== competition) return false;
      return true;
    };

    // Newest month first; a day never spans two months, so once there is more than `limit` the first
    // `limit` items (and the rest of their day) are all loaded.
    const months = (await saveService.listNewsMonths(saveId)).sort().reverse();
    const found: NewsItem[] = [];
    for (const m of months) {
      if (before !== null && m > before.slice(0, 7)) continue;
      found.push(...(await saveService.getNewsMonth(saveId, m)).filter(keep));
      if (found.length > limit) break;
    }
    found.sort((a, b) => b.date.localeCompare(a.date) || b.importance - a.importance || a.id.localeCompare(b.id));

    if (found.length <= limit) return Response.json({ items: found, nextBefore: null });
    // Close the day of the last kept item so a page never splits a day.
    const lastDate = found[limit - 1]!.date;
    let end = limit;
    while (end < found.length && found[end]!.date === lastDate) end++;
    return Response.json({ items: found.slice(0, end), nextBefore: end < found.length ? lastDate : null });
  },
};
