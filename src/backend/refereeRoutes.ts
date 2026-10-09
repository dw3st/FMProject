/**
 * Referee routes (`.claude/rules/game/referees.md` → "Rotas"): the Referees tab of the stats screen and the
 * referee block of `match-setup`.
 */
import { saveService } from "@/backend/SaveService";
import { requireSaveOwner } from "@/backend/auth/middleware";
import { withSaveLock } from "@/backend/saveLock";
import { ensureAssignments, officialsFor, refereeView, type RefereeView } from "@/backend/refereeWorld";
import { addOneDay } from "@/Domain/dates";
import { ageOn } from "@/Domain/referees/pool";
import { fixtureKey } from "@/Domain/referees/assign";
import { refereeRows, type RefereeInfo, type RefereeRow } from "@/Domain/referees/stats";
import type { Fixture } from "@/types/calendarTypes";
import type { RefereeSeasonStats } from "@/types/refereeTypes";

type Req = Request & { params: Record<string, string> };
const COMPETITION = /^(all|[a-z0-9_]{1,60})$/;
const SEASON = /^\d{4}(-\d{2})?$/;

/** The referee block of `match-setup`: the official the advance will use, his assistants; the rigor only for the engine. */
export interface MatchSetupReferee extends RefereeView {
  /** Rigor for the live engine (never shown: the screens show `band`). */
  strictness: number;
  assistants: { id: string; name: string; country: string; gender: "male" | "female"; age: number }[];
}

export async function matchSetupReferee(saveId: string, date: string, fixture: Fixture): Promise<MatchSetupReferee | null> {
  if (!(await saveService.getRefereePool(saveId))) return null;
  await withSaveLock(saveId, () => ensureAssignments(saveService, saveId, date));
  const officials = await officialsFor(saveService, saveId, date, fixture);
  if (!officials) return null;
  const state = await saveService.getRefereeState(saveId);
  return {
    ...refereeView(officials.referee, date, state),
    strictness: officials.referee.strictness,
    assistants: officials.assistants.map((a) => ({ id: a.id, name: a.name, country: a.country, gender: a.gender, age: ageOn(a.birthDate, date) })),
  };
}

export interface RefereesResponse {
  season: string | null;
  seasons: string[];
  items: RefereeRow[];
  /** Referee of the human club's next match (today or tomorrow), highlighted in the table. */
  nextRefereeId: string | null;
}

export const refereeRoutes = {
  /** `GET ?competition=<slug|all>&season=<label>`: per referee, the season's matches and cards per match. */
  "/api/saves/:saveId/referees": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSaveOwner(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "GET") return Response.json({ error: "method not allowed" }, { status: 405 });
    const url = new URL(req.url);
    const competition = url.searchParams.get("competition") ?? "all";
    const season = url.searchParams.get("season");
    if (!COMPETITION.test(competition)) return Response.json({ error: "invalid competition" }, { status: 400 });
    if (season !== null && !SEASON.test(season)) return Response.json({ error: "invalid season" }, { status: 400 });
    const [meta, pool, state] = await Promise.all([saveService.getMeta(saveId), saveService.getRefereePool(saveId), saveService.getRefereeState(saveId)]);
    if (!meta || !pool) return Response.json({ error: "no referees" }, { status: 404 });
    const today = meta.currentDate ?? "";
    const keys = await saveService.listRefereeSeasons(saveId);
    const seasonOfKey = (k: string) => /-(\d{4}(?:-\d{2})?)$/.exec(k)?.[1] ?? null;
    const seasons = [...new Set(keys.map(seasonOfKey).filter((s): s is string => !!s))].sort().reverse();
    let stats: Record<string, RefereeSeasonStats>;
    let info: (id: string) => RefereeInfo | undefined;
    if (season) {
      const archives = await Promise.all(keys.filter((k) => seasonOfKey(k) === season).map((k) => saveService.getRefereeSeason(saveId, k)));
      const found = archives.filter((a) => a && a.season === season);
      if (found.length === 0) return Response.json({ error: "season not found" }, { status: 404 });
      stats = Object.assign({}, ...found.map((a) => a!.stats));
      const who = Object.assign({}, ...found.map((a) => a!.referees)) as Record<string, { name: string; country: string; strictness: number; fifa: boolean; gender: "male" | "female"; birthDate: string }>;
      info = (id) => { const r = who[id]; return r ? { ...r, age: ageOn(r.birthDate, today) } : undefined; };
    } else {
      stats = state?.stats ?? {};
      const byId = new Map(pool.referees.map((r) => [r.id, r]));
      info = (id) => { const r = byId.get(id); return r ? { name: r.name, country: r.country, strictness: r.strictness, fifa: r.fifa, gender: r.gender, age: ageOn(r.birthDate, today) } : undefined; };
    }
    let nextRefereeId: string | null = null;
    if (meta.clubId && today) {
      for (const date of [today, addOneDay(today)]) {
        const f = (await saveService.getFixturesForDate(saveId, date)).find((x) => x.home === meta.clubId || x.away === meta.clubId);
        const a = f ? state?.assignments[date]?.[fixtureKey(f.competition, f.id)] : undefined;
        if (a) { nextRefereeId = a.refereeId; break; }
      }
    }
    const body: RefereesResponse = { season, seasons, items: refereeRows(stats, info, competition), nextRefereeId };
    return Response.json(body);
  },
};
