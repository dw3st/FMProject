import { saveService } from "@/backend/SaveService";
import { requireSeat } from "@/backend/auth/middleware";
import { championTitles } from "@/Domain/champions/champions";

type Req = Request & { params: Record<string, string> };

/**
 * The world's champions (Stats → Champions): the titles in `managers.json`, which every manager collects from the start
 * of the career with the club and the season. So the manager shown is the one in charge that day.
 */
export const championRoutes = {
  "/api/saves/:saveId/champions": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "GET") return Response.json({ error: "method not allowed" }, { status: 405 });
    const [managers, index, national] = await Promise.all([
      saveService.getManagers(saveId),
      saveService.getSquadIndex(saveId),
      saveService.getNationalState(saveId),
    ]);
    const titles = championTitles(managers, (id) => {
      const nation = id.startsWith("nat_") ? national?.teams[id]?.nation ?? null : null;
      const entry = index.byId(id);
      return { name: nation ?? entry?.name ?? id, league: entry?.leagueSlug ?? null, nation };
    });
    return Response.json({ titles });
  },
};
