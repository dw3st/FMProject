import { careerTotals } from "@/Domain/history/history";
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
  boughtThisSeason, createdPlayer, legendExtraPrice, legendOffer, legendPlayer, legendRarity, parseCreatedPlayer, recordPurchase, shopPrice, CREATED_POSITIONS,
} from "@/Domain/achievements/shop";
import { weightedScore } from "@/Domain/playerRating";
import { YOUTH } from "@/Domain/youth/youthConfig";
import type { AchievementsState } from "@/types/achievementTypes";
import type { RetiredPlayer, Squad } from "@/types/playerTypes";

type Req = Request & { params: Record<string, string> };

export async function humanClub(saveId: string, seatId: string): Promise<{ squad: Squad; leagueSlug: string; clubSlug: string } | null> {
  const meta = await saveService.getSeatMeta(saveId, seatId);
  if (!meta?.clubId) return null;
  const ref = await saveService.resolveSquadId(saveId, meta.clubId);
  if (!ref) return null;
  const squad = await saveService.getSquad(saveId, ref.leagueSlug, ref.clubSlug);
  return squad ? { squad, ...ref } : null;
}

/** Next season end of the human league (the academy contract), as the reborn route does. */
export async function nextSeasonEndOf(saveId: string, seatId: string): Promise<{ year: number; start: string; end: string; date: string; season: string }> {
  const meta = await saveService.getSeatMeta(saveId, seatId);
  const state = (meta?.activeLeagues ?? []).find((l) => l.leagueSlug === meta?.leagueSlug);
  const date = meta?.currentDate ?? new Date().toISOString().slice(0, 10);
  const year = state?.year ?? Number(date.slice(0, 4));
  // The shop's season key (each item once per season of the manager's league).
  return { year, start: state?.start ?? date, end: state?.end ?? `${year + 1}-05-31`, date, season: `${meta?.leagueSlug ?? ""}:${year}` };
}

/** A retiree with no history row (kept from before the rows) falls back to the season of the record. */
function legendCareer(r: RetiredPlayer): { appearances: number; goals: number } {
  const { apps, goals } = careerTotals(r.history);
  return apps > 0 ? { appearances: apps, goals } : { appearances: r.appearances, goals: r.goals };
}

async function view(saveId: string, seatId: string, state: AchievementsState) {
  const club = await humanClub(saveId, seatId);
  const { season, start: seasonStart } = await nextSeasonEndOf(saveId, seatId);
  const managers = await saveService.getManagers(saveId);
  const seat = await saveService.getSeatMeta(saveId, seatId);
  const earnings = seat?.managerEarnings ?? 0;
  const bets = { net: seat?.betNet ?? 0, exact: seat?.betExact ?? 0, longshot: seat?.betLongshot ?? false };
  const values = trackValues(state, achievementSnapshot(state, club?.squad ?? null, managers, seatId, earnings, bets));
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
      history: await shopHistory(saveId, state, retired, club, seatId),
      legends: legendOffer(retired, { saveId, seatId, season, seasonStart }).map((r) => ({
        rarity: legendRarity(r),
        price: shopPrice(state, "legend") + legendExtraPrice(r),
        id: r.id, name: r.name, positions: r.positions, nationality: r.nationality, age: r.age,
        wasWorldClass: r.wasWorldClass, level: Math.round(weightedScore(r.statsAtRetirement, r.positions[0] ?? "CM") * 100) / 100,
        // Career totals (tester question): the retirement record alone holds just his last season.
        ...legendCareer(r),
      })),
    },
    hasClub: !!club,
  };
}

/**
 * The shop history, newest first: every purchase logged, plus the legends this seat brought back before the log
 * existed (from `retired.json`), with where the player is now.
 */
async function shopHistory(
  saveId: string, state: AchievementsState, retired: RetiredPlayer[],
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
  const where = (id: string): "squad" | "youth" | null =>
    squad?.players.some((p) => p.id === id) ? "squad" : squad?.youth?.some((p) => p.id === id) ? "youth" : null;
  const entries = [...logged.map((p) => ({ ...p, price: p.price as number | null, date: p.date as string | null })).reverse(), ...older];
  // Players who left the club (tester report): their current club (a link to the page), free or retired.
  const away = entries.map((p) => p.playerId).filter((id) => !where(id));
  const elsewhere = new Map<string, { at: "other" | "free" | "retired"; href: string | null; clubName: string | null }>();
  if (away.length > 0) {
    const wanted = new Set(away);
    // A legend bought before the purchase log is known only by the prefix of his id (`legend_<retiredId>_`).
    const prefixes = away.filter((id) => id.endsWith("_"));
    const keyOf = (id: string): string | null => (wanted.has(id) ? id : prefixes.find((pre) => id.startsWith(pre)) ?? null);
    const [squads, free, index] = await Promise.all([
      saveService.getAllSquads(saveId), saveService.getFreeAgents(saveId), saveService.getSquadIndex(saveId),
    ]);
    for (const sq of squads) {
      for (const p of [...sq.players, ...(sq.youth ?? [])]) {
        const key = keyOf(p.id);
        if (!key) continue;
        const entry = index.byId(sq.id);
        elsewhere.set(key, {
          at: "other",
          href: entry ? `/player/${encodeURIComponent(entry.leagueSlug)}/${encodeURIComponent(entry.stem)}/${encodeURIComponent(p.id)}` : null,
          clubName: sq.name,
        });
      }
    }
    for (const f of free) {
      const key = keyOf(f.player.id);
      if (key && !elsewhere.has(key)) elsewhere.set(key, { at: "free", href: null, clubName: null });
    }
    for (const r of retired) {
      const key = keyOf(r.id);
      if (key && !elsewhere.has(key)) elsewhere.set(key, { at: "retired", href: null, clubName: null });
    }
  }
  return entries.map((p) => {
    const at = where(p.playerId);
    if (at && club) {
      const href = `/player/${encodeURIComponent(club.leagueSlug)}/${encodeURIComponent(club.clubSlug)}/${encodeURIComponent(p.playerId)}`;
      return { ...p, where: at, href, clubName: null as string | null };
    }
    const found = elsewhere.get(p.playerId);
    return { ...p, where: found?.at ?? ("gone" as const), href: found?.href ?? null, clubName: found?.clubName ?? null };
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

  /** `POST { retiredId }`: one of the shop's legends comes back as a 17-year-old academy player. */
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
      const club = await humanClub(saveId, auth.seatId);
      if (!club) return bad("noClub", 409);
      if ((club.squad.youth ?? []).length >= YOUTH.MAX_SIZE) return bad("youthFull");
      const allRetired = await saveService.getRetired(saveId);
      // Brought back already (by any seat, or as a reborn) is off the list: one comeback per player in the world.
      const season = await nextSeasonEndOf(saveId, auth.seatId);
      const retired = legendOffer(allRetired, { saveId, seatId: auth.seatId, season: season.season, seasonStart: season.start }).find((r) => r.id === retiredId);
      if (!retired) return bad("notOffered");
      const extra = legendExtraPrice(retired);
      if (pointsBalance(state) < shopPrice(state, "legend") + extra) return bad("notEnoughPoints", 409);
      const player = legendPlayer({ retired, squad: club.squad, year: season.year, nextSeasonEnd: season.end });
      await saveService.saveSquad(saveId, club.leagueSlug, club.clubSlug, { ...club.squad, youth: [...(club.squad.youth ?? []), player] });
      // Marked in the world's list: never a legend again, and a pending reborn offer for him closes.
      await saveService.writeRetired(saveId, allRetired.map((r) => (r.id === retiredId
        ? { ...r, legendBy: auth.seatId, legendOn: season.date, legendVia: "points" as const, ...(r.rebornOffer === "pending" ? { rebornOffer: "expired" as const } : {}) }
        : r)));
      const next: AchievementsState = recordPurchase(state, "legend", season.date, season.season, { ...player, fromId: retiredId }, extra);
      await saveService.writeAchievements(saveId, next, auth.seatId);
      return Response.json({ player, ...(await view(saveId, auth.seatId, next)) });
    });
  },
};
