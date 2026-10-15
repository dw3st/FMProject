import { saveService } from "@/backend/SaveService";
import { achievementSnapshot } from "@/backend/achievementsWorld";
import { requireSeat } from "@/backend/auth/middleware";
import { withSaveLock } from "@/backend/saveLock";
import { ACHIEVEMENTS } from "@/Domain/achievements/achievementsConfig";
import {
  availableBadges, availableDecor, availableFrames, availableTitles, parseDecor, parseProfile, secretViews,
  shownProfile, trackViews,
} from "@/Domain/achievements/items";
import { attributeBoost, attributeReduce } from "@/Domain/achievements/managerAttributes";
import { earnedPoints, pointsBalance, trackValues } from "@/Domain/achievements/progress";
import { createdPlayer, legendOptions, legendPlayer, parseCreatedPlayer, CREATED_POSITIONS } from "@/Domain/achievements/shop";
import { weightedScore } from "@/Domain/playerRating";
import { YOUTH } from "@/Domain/youth/youthConfig";
import type { AchievementsState } from "@/types/achievementTypes";
import type { Squad } from "@/types/playerTypes";

type Req = Request & { params: Record<string, string> };

async function humanClub(saveId: string, seatId: string): Promise<{ squad: Squad; leagueSlug: string; clubSlug: string } | null> {
  const meta = await saveService.getSeatMeta(saveId, seatId);
  if (!meta?.clubId) return null;
  const ref = await saveService.resolveSquadId(saveId, meta.clubId);
  if (!ref) return null;
  const squad = await saveService.getSquad(saveId, ref.leagueSlug, ref.clubSlug);
  return squad ? { squad, ...ref } : null;
}

/** Next season end of the human league (the academy contract), as the reborn route does. */
async function nextSeasonEndOf(saveId: string, seatId: string): Promise<{ year: number; end: string; date: string }> {
  const meta = await saveService.getSeatMeta(saveId, seatId);
  const state = (meta?.activeLeagues ?? []).find((l) => l.leagueSlug === meta?.leagueSlug);
  const date = meta?.currentDate ?? new Date().toISOString().slice(0, 10);
  const year = state?.year ?? Number(date.slice(0, 4));
  return { year, end: state?.end ?? `${year + 1}-05-31`, date };
}

async function view(saveId: string, seatId: string, state: AchievementsState) {
  const club = await humanClub(saveId, seatId);
  const managers = await saveService.getManagers(saveId);
  const values = trackValues(state, achievementSnapshot(state, club?.squad ?? null, managers, seatId));
  const a = state.attributes;
  const retired = state.legendOptions ? await saveService.getRetired(saveId) : [];
  return {
    tracks: trackViews(state, values),
    secrets: secretViews(state),
    points: { earned: earnedPoints(state), spent: state.spent, balance: pointsBalance(state) },
    attributes: a,
    effects: {
      motivation: attributeBoost(a.motivation),
      tactics: attributeBoost(a.tactics),
      youth: attributeBoost(a.youth),
      negotiation: attributeReduce(a.negotiation),
      discipline: attributeReduce(a.discipline),
    },
    profile: shownProfile(state),
    available: {
      frames: availableFrames(state),
      badges: availableBadges(state),
      titles: availableTitles(state),
      decor: availableDecor(state),
    },
    thresholds: { frames: ACHIEVEMENTS.FRAME_POINTS, decor: ACHIEVEMENTS.DECOR_POINTS, maxBadges: ACHIEVEMENTS.MAX_BADGES },
    decor: state.decor,
    shop: {
      costs: ACHIEVEMENTS.SHOP,
      bought: state.bought,
      positions: CREATED_POSITIONS,
      legends: (state.legendOptions?.ids ?? []).flatMap((id) => {
        const r = retired.find((x) => x.id === id);
        return r ? [{
          id: r.id, name: r.name, positions: r.positions, nationality: r.nationality, age: r.age,
          wasWorldClass: r.wasWorldClass, level: Math.round(weightedScore(r.statsAtRetirement, r.positions[0] ?? "CM") * 100) / 100,
          appearances: r.appearances, goals: r.goals,
        }] : [];
      }),
    },
    hasClub: !!club,
  };
}

const bad = (error: string, status = 400) => Response.json({ error }, { status });

/** Achievements of the career (`.claude/rules/game/achievements.md`). Owner only; writes under the save lock. */
export const achievementRoutes = {
  "/api/saves/:saveId/achievements": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "GET") return bad("method not allowed", 405);
    if (!(await saveService.getSeat(saveId, auth.seatId))) return bad("save not found", 404);
    return Response.json(await view(saveId, auth.seatId, await saveService.getAchievements(saveId, auth.seatId)));
  },

  /** `PUT { frame, badges, title }`: only unlocked items. */
  "/api/saves/:saveId/achievements/profile": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "PUT") return bad("method not allowed", 405);
    const body = await req.json().catch(() => null);
    return withSaveLock(saveId, async () => {
      const state = await saveService.getAchievements(saveId, auth.seatId);
      let profile;
      try { profile = parseProfile(body, state); } catch (e) { return bad((e as Error).message); }
      const next = { ...state, profile };
      await saveService.writeAchievements(saveId, next, auth.seatId);
      return Response.json(await view(saveId, auth.seatId, next));
    });
  },

  /** `PUT { banner, flag, mosaic }`: the stadium decorations drawn at home. */
  "/api/saves/:saveId/achievements/stadium": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "PUT") return bad("method not allowed", 405);
    const body = await req.json().catch(() => null);
    return withSaveLock(saveId, async () => {
      const state = await saveService.getAchievements(saveId, auth.seatId);
      let decor;
      try { decor = parseDecor(body, state); } catch (e) { return bad((e as Error).message); }
      const next = { ...state, decor };
      await saveService.writeAchievements(saveId, next, auth.seatId);
      return Response.json(await view(saveId, auth.seatId, next));
    });
  },

  /** `POST { name, position, nationality, foot }`: the created player joins the academy (once per career). */
  "/api/saves/:saveId/achievements/shop/created": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "POST") return bad("method not allowed", 405);
    const body = await req.json().catch(() => null);
    let input;
    try { input = parseCreatedPlayer(body); } catch { return bad("invalidPlayer"); }
    return withSaveLock(saveId, async () => {
      const state = await saveService.getAchievements(saveId, auth.seatId);
      if (state.bought.created) return bad("alreadyBought", 409);
      if (pointsBalance(state) < ACHIEVEMENTS.SHOP.created) return bad("notEnoughPoints", 409);
      const club = await humanClub(saveId, auth.seatId);
      if (!club) return bad("noClub", 409);
      if ((club.squad.youth ?? []).length >= YOUTH.MAX_SIZE) return bad("youthFull");
      const season = await nextSeasonEndOf(saveId, auth.seatId);
      const player = createdPlayer({ input, squad: club.squad, date: season.date, nextSeasonEnd: season.end });
      await saveService.saveSquad(saveId, club.leagueSlug, club.clubSlug, { ...club.squad, youth: [...(club.squad.youth ?? []), player] });
      const next: AchievementsState = { ...state, spent: state.spent + ACHIEVEMENTS.SHOP.created, bought: { ...state.bought, created: season.date } };
      await saveService.writeAchievements(saveId, next, auth.seatId);
      return Response.json({ player, ...(await view(saveId, auth.seatId, next)) });
    });
  },

  /** `POST`: draws the three legends to choose from (once; kept). */
  "/api/saves/:saveId/achievements/shop/legend/draw": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "POST") return bad("method not allowed", 405);
    return withSaveLock(saveId, async () => {
      const state = await saveService.getAchievements(saveId, auth.seatId);
      if (state.bought.legend) return bad("alreadyBought", 409);
      if (pointsBalance(state) < ACHIEVEMENTS.SHOP.legend) return bad("notEnoughPoints", 409);
      if (state.legendOptions) return Response.json(await view(saveId, auth.seatId, state));
      const { date } = await nextSeasonEndOf(saveId, auth.seatId);
      const ids = legendOptions(await saveService.getRetired(saveId), saveId, date);
      if (ids.length === 0) return bad("noLegends", 409);
      const next = { ...state, legendOptions: { date, ids } };
      await saveService.writeAchievements(saveId, next, auth.seatId);
      return Response.json(await view(saveId, auth.seatId, next));
    });
  },

  /** `POST { retiredId }`: one of the drawn legends comes back as a 17-year-old academy player. */
  "/api/saves/:saveId/achievements/shop/legend": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "POST") return bad("method not allowed", 405);
    const body = (await req.json().catch(() => null)) as { retiredId?: unknown } | null;
    if (!body || typeof body.retiredId !== "string") return bad("retiredId required");
    const retiredId = body.retiredId;
    return withSaveLock(saveId, async () => {
      const state = await saveService.getAchievements(saveId, auth.seatId);
      if (state.bought.legend) return bad("alreadyBought", 409);
      if (pointsBalance(state) < ACHIEVEMENTS.SHOP.legend) return bad("notEnoughPoints", 409);
      if (!state.legendOptions?.ids.includes(retiredId)) return bad("notOffered");
      const club = await humanClub(saveId, auth.seatId);
      if (!club) return bad("noClub", 409);
      if ((club.squad.youth ?? []).length >= YOUTH.MAX_SIZE) return bad("youthFull");
      const retired = (await saveService.getRetired(saveId)).find((r) => r.id === retiredId);
      if (!retired) return bad("notOffered");
      const season = await nextSeasonEndOf(saveId, auth.seatId);
      const player = legendPlayer({ retired, squad: club.squad, year: season.year, nextSeasonEnd: season.end });
      await saveService.saveSquad(saveId, club.leagueSlug, club.clubSlug, { ...club.squad, youth: [...(club.squad.youth ?? []), player] });
      const next: AchievementsState = {
        ...state, spent: state.spent + ACHIEVEMENTS.SHOP.legend, bought: { ...state.bought, legend: season.date }, legendOptions: undefined,
      };
      await saveService.writeAchievements(saveId, next, auth.seatId);
      return Response.json({ player, ...(await view(saveId, auth.seatId, next)) });
    });
  },
};
