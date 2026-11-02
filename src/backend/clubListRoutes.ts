import { saveService } from "@/backend/SaveService";
import { requireSeat } from "@/backend/auth/middleware";
import type { ClubEntry } from "@/Domain/world/clubSearch";

type Req = Request & { params: Record<string, string> };

/** Every club of the save with the league it plays in now (the squad index, not `leagueData`): the club search of Leagues. */
export const clubListRoutes = {
  "/api/saves/:saveId/clubs": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "GET") return Response.json({ error: "method not allowed" }, { status: 405 });
    const index = await saveService.getSquadIndex(saveId);
    const clubs: ClubEntry[] = index.leagues().flatMap((league) =>
      index.inLeague(league).map((team) => ({ id: team.squadId, name: team.name, league })),
    );
    return Response.json({ clubs });
  },
};
