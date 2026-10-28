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
import { achievementPoints, earnedPoints, pointsBalance, trackValues } from "@/Domain/achievements/progress";
import {
  boughtThisSeason, createdPlayer, legendOptions, legendPlayer, parseCreatedPlayer, recordPurchase, shopPrice, CREATED_POSITIONS,
} from "@/Domain/achievements/shop";
import { weightedScore } from "@/Domain/playerRating";
import { YOUTH } from "@/Domain/youth/youthConfig";
import type { AchievementsState } from "@/types/achievementTypes";
import type { RetiredPlayer, Squad } from "@/types/playerTypes";

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
async function nextSeasonEndOf(saveId: string, seatId: string): Promise<{ year: number; end: string; date: string; season: string }> {
  const meta = await saveService.getSeatMeta(saveId, seatId);
  const state = (meta?.activeLeagues ?? []).find((l) => l.leagueSlug === meta?.leagueSlug);
  const date = meta?.currentDate ?? new Date().toISOString().slice(0, 10);
  const year = state?.year ?? Number(date.slice(0, 4));
  // The shop's season key (each item once per season of the manager's league).
  return { year, end: state?.end ?? `${year + 1}-05-31`, date, season: `${meta?.leagueSlug ?? ""}:${year}` };
}

async function view(saveId: string, seatId: string, state: AchievementsState) {
  const club = await humanClub(saveId, seatId);
  const { season } = await nextSeasonEndOf(saveId, seatId);
  const managers = await saveService.getManagers(saveId);
  const values = trackValues(state, achievementSnapshot(state, club?.squad ?? null, managers, seatId));
  const a = state.attributes;
  const retired = await saveService.getRetired(saveId);
  return {
    tracks: trackViews(state, values),
    secrets: secretViews(state),
    points: {
      earned: earnedPoints(state), spent: state.spent, balance: pointsBalance(state),
      achievements: achievementPoints(state), campaign: state.campaign?.points ?? 0,
    },
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
      costs: { created: shopPrice(state, "created"), legend: shopPrice(state, "legend") },
      bought: state.bought,
      thisSeason: { created: boughtThisSeason(state, "created", season), legend: boughtThisSeason(state, "legend", season) },
      positions: CREATED_POSITIONS,
      history: shopHistory(state, retired, club, seatId),
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

/**
 * The shop history, newest first: every purchase logged, plus the legends this seat brought back before the log
 * existed (from `retired.json`), with where the player is now.
 */
function shopHistory(
  state: AchievementsState, retired: RetiredPlayer[],
  club: { squad: Squad; leagueSlug: string; clubSlug: string } | null, seatId: string,
) {
  const squad = club?.squad ?? null;
  const logged = state.purchases ?? [];
  const loggedLegends = new Set(logged.flatMap((p) => (p.fromId ? [p.fromId] : [])));
  const older = retired
    .filter((r) => r.legendBy === seatId && !loggedLegends.has(r.id))
    .map((r) => {
      const prefix = `legend_${r.id}_`;
      const now = [...(squad?.players ?? []), ...(squad?.youth ?? [])].find((p) => p.id.startsWith(prefix));
      return { item: "legend" as const, date: null, playerId: now?.id ?? prefix, name: r.name, position: r.positions[0] ?? "", price: null, fromId: r.id };
    });
  const where = (id: string): "squad" | "youth" | "gone" =>
    squad?.players.some((p) => p.id === id) ? "squad" : squad?.youth?.some((p) => p.id === id) ? "youth" : "gone";
  return [...logged.map((p) => ({ ...p, price: p.price as number | null, date: p.date as string | null })).reverse(), ...older]
    .map((p) => {
      const at = where(p.playerId);
      const href = club && at !== "gone"
        ? `/player/${encodeURIComponent(club.leagueSlug)}/${encodeURIComponent(club.clubSlug)}/${encodeURIComponent(p.playerId)}`
        : null;
      return { ...p, where: at, href };
    });
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
      const { season: seasonKey } = await nextSeasonEndOf(saveId, auth.seatId);
      if (boughtThisSeason(state, "created", seasonKey)) return bad("alreadyBought", 409);
      if (pointsBalance(state) < shopPrice(state, "created")) return bad("notEnoughPoints", 409);
      const club = await humanClub(saveId, auth.seatId);
      if (!club) return bad("noClub", 409);
      if ((club.squad.youth ?? []).length >= YOUTH.MAX_SIZE) return bad("youthFull");
      const season = await nextSeasonEndOf(saveId, auth.seatId);
      const player = createdPlayer({ input, squad: club.squad, date: season.date, nextSeasonEnd: season.end });
      await saveService.saveSquad(saveId, club.leagueSlug, club.clubSlug, { ...club.squad, youth: [...(club.squad.youth ?? []), player] });
      const next: AchievementsState = recordPurchase(state, "created", season.date, season.season, player);
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
      const { date, season: seasonKey } = await nextSeasonEndOf(saveId, auth.seatId);
      if (boughtThisSeason(state, "legend", seasonKey)) return bad("alreadyBought", 409);
      if (pointsBalance(state) < shopPrice(state, "legend")) return bad("notEnoughPoints", 409);
      if (state.legendOptions) return Response.json(await view(saveId, auth.seatId, state));
      // A world of seats: each seat draws its own three (`.claude/rules/game/multiplayer.md`).
      const multi = (await saveService.getMeta(saveId))?.mode === "multi";
      const ids = legendOptions(await saveService.getRetired(saveId), saveId, date, multi ? auth.seatId : undefined);
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
      const { season: seasonKey } = await nextSeasonEndOf(saveId, auth.seatId);
      if (boughtThisSeason(state, "legend", seasonKey)) return bad("alreadyBought", 409);
      if (pointsBalance(state) < shopPrice(state, "legend")) return bad("notEnoughPoints", 409);
      if (!state.legendOptions?.ids.includes(retiredId)) return bad("notOffered");
      const club = await humanClub(saveId, auth.seatId);
      if (!club) return bad("noClub", 409);
      if ((club.squad.youth ?? []).length >= YOUTH.MAX_SIZE) return bad("youthFull");
      const allRetired = await saveService.getRetired(saveId);
      const retired = allRetired.find((r) => r.id === retiredId);
      // Brought back already (by any seat, or as a reborn): one comeback per player in the world.
      if (!retired || retired.legendBy || retired.rebornOffer === "accepted") return bad("notOffered");
      const season = await nextSeasonEndOf(saveId, auth.seatId);
      const player = legendPlayer({ retired, squad: club.squad, year: season.year, nextSeasonEnd: season.end });
      await saveService.saveSquad(saveId, club.leagueSlug, club.clubSlug, { ...club.squad, youth: [...(club.squad.youth ?? []), player] });
      // Marked in the world's list: never a legend again, and a pending reborn offer for him closes.
      await saveService.writeRetired(saveId, allRetired.map((r) => (r.id === retiredId
        ? { ...r, legendBy: auth.seatId, ...(r.rebornOffer === "pending" ? { rebornOffer: "expired" as const } : {}) }
        : r)));
      const next: AchievementsState = { ...recordPurchase(state, "legend", season.date, season.season, { ...player, fromId: retiredId }), legendOptions: undefined };
      await saveService.writeAchievements(saveId, next, auth.seatId);
      return Response.json({ player, ...(await view(saveId, auth.seatId, next)) });
    });
  },
};
