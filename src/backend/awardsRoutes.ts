import { saveService } from "@/backend/SaveService";
import { requireSaveOwner } from "@/backend/auth/middleware";
import type { LeagueSeasonAwards, WorldAwards } from "@/types/awardTypes";

type Req = Request & { params: Record<string, string> };

export interface AwardsResponse {
  /** Years with an awards file, ascending. */
  years: number[];
  year: number;
  leagues: LeagueSeasonAwards[];
  world: WorldAwards | null;
}

/** Season awards (`.claude/rules/game/awards.md`). */
export const awardsRoutes = {
  /**
   * `GET ?year=YYYY` (owner only): the league seasons closed in that year and the world awards of
   * the year (given in January of the next one). Without `year`, the most recent file. 400 on an
   * invalid year, 404 when the year has no file (or the save has none yet).
   */
  "/api/saves/:saveId/awards": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSaveOwner(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "GET") return Response.json({ error: "method not allowed" }, { status: 405 });
    const raw = new URL(req.url).searchParams.get("year");
    let year: number | null = null;
    if (raw !== null && raw !== "") {
      if (!/^\d{4}$/.test(raw)) return Response.json({ error: "invalid year" }, { status: 400 });
      year = Number(raw);
      if (year < 1900 || year > 2999) return Response.json({ error: "invalid year" }, { status: 400 });
    }
    const meta = await saveService.getMeta(saveId);
    if (!meta) return Response.json({ error: "save not found" }, { status: 404 });
    const years = [...(await saveService.listAwardYears(saveId))].sort((a, b) => a - b);
    const pick = year ?? years[years.length - 1];
    if (pick === undefined || !years.includes(pick)) return Response.json({ error: "no awards", years }, { status: 404 });
    const file = await saveService.getAwardsYear(saveId, pick);
    if (!file) return Response.json({ error: "no awards", years }, { status: 404 });
    const body: AwardsResponse = { years, year: pick, leagues: file.leagues, world: file.world ?? null };
    return Response.json(body);
  },
};
