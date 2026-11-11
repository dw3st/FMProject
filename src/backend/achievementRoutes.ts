import { realLegendPool } from "@/Domain/legends/realLegends";
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
  boughtThisSeason, createdPlayer, legendAvailable, legendPlayer, parseCreatedPlayer, recordPurchase, shopPrice, CREATED_POSITIONS,
} from "@/Domain/achievements/shop";
import { legendTier, spinLegend, spinReel } from "@/Domain/achievements/legendSpin";
import { managerWallet } from "@/Domain/managers/assets";
import { openTotal } from "@/Domain/bets/bets";
import { mulberry32, seedFrom } from "@/Domain/rng";
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

/** A legend as the roulette shows him. */
function legendCard(r: RetiredPlayer) {
  return {
    id: r.id, name: r.name, positions: r.positions, nationality: r.nationality, tier: legendTier(r),
    real: r.real ? { birthYear: r.real.birthYear, ballonDor: r.real.ballonDor, worldCups: r.real.worldCups } : null,
  };
}

/** The current season's pending draw (with the reel it slid through), the prices and the odds. */
function spinView(saveId: string, seatId: string, state: AchievementsState, season: string, pool: RetiredPlayer[]) {
  const pending = state.legendSpin?.season === season ? state.legendSpin : null;
  const winner = pending ? pool.find((r) => r.id === pending.id) ?? null : null;
  const reel = pending && winner ? spinReel(pool, winner, mulberry32(seedFrom(`reel:${saveId}:${seatId}:${pending.id}:${pending.rerolls}`))) : [];
  return {
    price: shopPrice(state, "legend"),
    rerollPoints: ACHIEVEMENTS.LEGEND_SPIN.REROLL_POINTS,
    rerollMoney: ACHIEVEMENTS.LEGEND_SPIN.REROLL_MONEY,
    odds: ACHIEVEMENTS.LEGEND_SPIN.ODDS,
    reelAt: ACHIEVEMENTS.LEGEND_SPIN.REEL_AT,
    pending: pending && winner ? { ...legendCard(winner), rerolls: pending.rerolls, paid: pending.paid, available: legendAvailable(winner) } : null,
    reel: reel.map(legendCard),
  };
}

async function view(saveId: string, seatId: string, state: AchievementsState) {
  const club = await humanClub(saveId, seatId);
  const { season } = await nextSeasonEndOf(saveId, seatId);
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
      // The legend roulette (tester report, option B, 8.9.34): the pending draw and its reel.
      spin: spinView(saveId, seatId, state, season, realLegendPool(retired)),
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

  /**
   * `POST { pay?: "points" | "money" }` - the legend roulette (8.9.34). No pending draw this season: pays the shop's
   * price in points and draws. A pending one: draws again for `REROLL_POINTS` points or `REROLL_MONEY` of the manager's
   * money (a drawn legend another manager took meanwhile is drawn again for free). 409 `alreadyBought`, `noClub`,
   * `notEnoughPoints`, `noMoney`, `noLegends`.
   */
  "/api/saves/:saveId/achievements/shop/legend/spin": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "POST") return bad("method not allowed", 405);
    const body = (await req.json().catch(() => ({}))) as { pay?: unknown } | null;
    const pay = body?.pay === "money" ? "money" : "points";
    return withSaveLock(saveId, async () => {
      const state = await saveService.getAchievements(saveId, auth.seatId);
      const season = await nextSeasonEndOf(saveId, auth.seatId);
      if (boughtThisSeason(state, "legend", season.season)) return bad("alreadyBought", 409);
      const club = await humanClub(saveId, auth.seatId);
      if (!club) return bad("noClub", 409);
      const pool = realLegendPool(await saveService.getRetired(saveId));
      const pending = state.legendSpin?.season === season.season ? state.legendSpin : null;
      const drawnBefore = pending ? pool.find((r) => r.id === pending.id) : undefined;
      const pendingTaken = !!pending && !(drawnBefore && legendAvailable(drawnBefore));
      let spent = state.spent;
      let paid = pending?.paid ?? 0;
      if (!pending) {
        const price = shopPrice(state, "legend");
        if (pointsBalance(state) < price) return bad("notEnoughPoints", 409);
        spent += price;
        paid = price;
      } else if (!pendingTaken && pay === "points") {
        if (pointsBalance(state) < ACHIEVEMENTS.LEGEND_SPIN.REROLL_POINTS) return bad("notEnoughPoints", 409);
        spent += ACHIEVEMENTS.LEGEND_SPIN.REROLL_POINTS;
        paid += ACHIEVEMENTS.LEGEND_SPIN.REROLL_POINTS;
      } else if (!pendingTaken) {
        const meta = await saveService.getSeatMeta(saveId, auth.seatId);
        const wallet = managerWallet(meta?.managerEarnings, meta?.managerSpent, meta?.betNet, openTotal(await saveService.getBets(saveId, auth.seatId)));
        if (wallet < ACHIEVEMENTS.LEGEND_SPIN.REROLL_MONEY) return bad("noMoney", 409);
        await saveService.updateSeat(saveId, auth.seatId, { managerSpent: (meta?.managerSpent ?? 0) + ACHIEVEMENTS.LEGEND_SPIN.REROLL_MONEY });
      }
      const rerolls = pending ? pending.rerolls + 1 : 0;
      const drawn = spinLegend(pool, mulberry32(seedFrom(`spin:${saveId}:${auth.seatId}:${season.season}:${rerolls}:${pending?.id ?? ""}`)));
      if (!drawn) return bad("noLegends", 409);
      const next: AchievementsState = {
        ...state, spent,
        legendSpin: { season: season.season, id: drawn.retired.id, tier: drawn.tier, rerolls, paid },
      };
      await saveService.writeAchievements(saveId, next, auth.seatId);
      return Response.json(await view(saveId, auth.seatId, next));
    });
  },

  /** `POST` - brings the roulette's pending legend back as a 17-year-old academy player (already paid by the spins). */
  "/api/saves/:saveId/achievements/shop/legend": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "POST") return bad("method not allowed", 405);
    return withSaveLock(saveId, async () => {
      const state = await saveService.getAchievements(saveId, auth.seatId);
      const season = await nextSeasonEndOf(saveId, auth.seatId);
      if (boughtThisSeason(state, "legend", season.season)) return bad("alreadyBought", 409);
      const club = await humanClub(saveId, auth.seatId);
      if (!club) return bad("noClub", 409);
      if ((club.squad.youth ?? []).length >= YOUTH.MAX_SIZE) return bad("youthFull");
      const spin = state.legendSpin?.season === season.season ? state.legendSpin : null;
      if (!spin) return bad("notOffered");
      const allRetired = await saveService.getRetired(saveId);
      const retired = realLegendPool(allRetired).find((r) => r.id === spin.id);
      // Taken by another manager since the draw: the next spin is free.
      if (!retired || !legendAvailable(retired)) return bad("offerClosed", 409);
      const player = legendPlayer({ retired, squad: club.squad, year: season.year, nextSeasonEnd: season.end });
      await saveService.saveSquad(saveId, club.leagueSlug, club.clubSlug, { ...club.squad, youth: [...(club.squad.youth ?? []), player] });
      // Marked in the world's list: never a legend again, and a pending reborn offer for him closes.
      // A real legend is not in the list yet: his record joins it, marked (`realLegendPool` reads it back).
      const marked = { ...retired, legendBy: auth.seatId, legendOn: season.date, legendVia: "points" as const, ...(retired.rebornOffer === "pending" ? { rebornOffer: "expired" as const } : {}) };
      await saveService.writeRetired(saveId, allRetired.some((r) => r.id === spin.id)
        ? allRetired.map((r) => (r.id === spin.id ? marked : r))
        : [...allRetired, marked]);
      // The points were spent by the spins: the purchase records the player, the season and the count, at what he cost.
      const bought = recordPurchase(state, "legend", season.date, season.season, { ...player, fromId: spin.id });
      const purchases = (bought.purchases ?? []).map((p, i, all) => (i === all.length - 1 ? { ...p, price: spin.paid } : p));
      const { legendSpin: _done, ...rest } = bought;
      const next: AchievementsState = { ...rest, spent: state.spent, purchases };
      await saveService.writeAchievements(saveId, next, auth.seatId);
      return Response.json({ player, ...(await view(saveId, auth.seatId, next)) });
    });
  },
};
