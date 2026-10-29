import { saveService } from "@/backend/SaveService";
import { requireSeat } from "@/backend/auth/middleware";
import { withSaveLock } from "@/backend/saveLock";
import { humanClub, nextSeasonEndOf } from "@/backend/achievementRoutes";
import { recordMoney } from "@/backend/FinancialService";
import { filterRetired, isLegend, legendAvailable, legendHireFee, legendPlayer } from "@/Domain/achievements/shop";
import { generateReborn } from "@/Domain/retirement/retirement";
import { YOUTH } from "@/Domain/youth/youthConfig";
import type { RetiredPlayer, RosterPlayer, Squad } from "@/types/playerTypes";

type Req = Request & { params: Record<string, string> };

const RETIRED_PAGE_DEFAULT = 50;
const RETIRED_PAGE_MAX = 100;

/** Reborn offers (`.claude/rules/game/retirement.md`): world-class retirees of the human club. */
export const rebornRoutes = {
  /**
   * `GET` - retired players, newest first, with the last club's name (`.claude/rules/game/history.md`).
   * `?offset=&limit=` (limit 1..100, default 50), `?mine=1` = only retirees of the player's club.
   * Response `{ total, items }`; `statsAtRetirement` is left out (only the reborn offer needs it).
   */
  "/api/saves/:saveId/retired": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "GET") return Response.json({ error: "method not allowed" }, { status: 405 });
    const q = new URL(req.url).searchParams;
    const int = (v: string | null, def: number) => {
      const n = v === null || v === "" ? def : Number(v);
      return Number.isInteger(n) ? n : NaN;
    };
    const offset = int(q.get("offset"), 0);
    const limit = int(q.get("limit"), RETIRED_PAGE_DEFAULT);
    if (!(offset >= 0) || !(limit >= 1 && limit <= RETIRED_PAGE_MAX)) {
      return Response.json({ error: "invalid offset/limit" }, { status: 400 });
    }
    let retired = [...(await saveService.getRetired(saveId))].reverse();
    if (q.get("mine") === "1") {
      const meta = await saveService.getSeatMeta(saveId, auth.seatId);
      retired = retired.filter((r) => r.squadId === meta?.clubId);
    }
    if (q.get("legends") === "1") retired = retired.filter(isLegend);
    // Name search, nationality and "highlights only" (tester reports); the nations offered are the list's before them.
    const nations = [...new Set(retired.map((r) => r.nationality).filter((n): n is string => !!n))].sort();
    const search = (q.get("q") ?? "").slice(0, 60);
    retired = filterRetired(retired, { q: search, nation: q.get("nation") ?? "", notable: q.get("notable") === "1" });
    const index = await saveService.getSquadIndex(saveId);
    const managers = retired.some((r) => r.legendBy) ? await saveService.getManagers(saveId) : [];
    const managerName = (seatId: string) => managers.find((m) => m.seatId === seatId)?.name ?? null;
    const items = retired.slice(offset, offset + limit).map((full) => {
      const { statsAtRetirement: _, ...r } = full;
      // A legend of the list: who brought him back, or the fee to bring him back (tester report).
      const legend = isLegend(full) ? {
        fee: legendAvailable(full) ? legendHireFee(full) : null,
        back: full.legendBy
          ? { via: full.legendVia ?? "points", mine: full.legendBy === auth.seatId, manager: managerName(full.legendBy), on: full.legendOn ?? null }
          : full.rebornOffer === "accepted"
            ? { via: "reborn" as const, mine: full.rebornSeatId === auth.seatId, manager: null, on: null }
            : null,
      } : null;
      return { ...r, clubName: index.byId(r.squadId)?.name ?? r.history?.at(-1)?.clubName ?? null, legend };
    });
    const { season } = await nextSeasonEndOf(saveId, auth.seatId);
    const thisSeason = (await saveService.getAchievements(saveId, auth.seatId)).bought.legendMoneySeason === season;
    return Response.json({ total: retired.length, items, nations, legendHire: { thisSeason } });
  },

  /**
   * `POST` - brings a retired legend back to the academy for money, no points (tester report): one per season per
   * manager, each legend once in the world. 409 `noClub` / `alreadyBought` / `noMoney` / `offerClosed`, 400 `youthFull`.
   */
  "/api/saves/:saveId/legends/:retiredId/hire": async (req: Req) => {
    const saveId = req.params.saveId!;
    const retiredId = req.params.retiredId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "POST") return Response.json({ error: "method not allowed" }, { status: 405 });
    return withSaveLock(saveId, async () => {
      const club = await humanClub(saveId, auth.seatId);
      if (!club) return Response.json({ error: "noClub" }, { status: 409 });
      const season = await nextSeasonEndOf(saveId, auth.seatId);
      const achievements = await saveService.getAchievements(saveId, auth.seatId);
      if (achievements.bought.legendMoneySeason === season.season) return Response.json({ error: "alreadyBought" }, { status: 409 });
      const all = await saveService.getRetired(saveId);
      const rec = all.find((r) => r.id === retiredId);
      if (!rec || !legendAvailable(rec)) return Response.json({ error: "offerClosed" }, { status: 409 });
      if ((club.squad.youth ?? []).length >= YOUTH.MAX_SIZE) return Response.json({ error: "youthFull" }, { status: 400 });
      const fee = legendHireFee(rec);
      if ((club.squad.finances?.budget ?? 0) < fee) return Response.json({ error: "noMoney", fee }, { status: 409 });
      const player = legendPlayer({ retired: rec, squad: club.squad, year: season.year, nextSeasonEnd: season.end });
      await saveService.saveSquad(saveId, club.leagueSlug, club.clubSlug, { ...club.squad, youth: [...(club.squad.youth ?? []), player] });
      const ledgerSeason = (await saveService.getLeagueMeta(saveId, club.leagueSlug))?.year ?? season.year;
      await recordMoney(saveService, saveId, ledgerSeason, { leagueSlug: club.leagueSlug, clubSlug: club.clubSlug }, {
        date: season.date, kind: "transfer_out", amount: -fee, label: `Legend back to the academy: ${rec.name}`,
        ref: { stage: "legend", playerName: rec.name, playerId: player.id },
      }, auth.seatId);
      await saveService.writeRetired(saveId, all.map((r) => (r.id === retiredId
        ? { ...r, legendBy: auth.seatId, legendOn: season.date, legendVia: "money" as const, ...(r.rebornOffer === "pending" ? { rebornOffer: "expired" as const } : {}) }
        : r)));
      await saveService.writeAchievements(saveId, { ...achievements, bought: { ...achievements.bought, legendMoneySeason: season.season } }, auth.seatId);
      return Response.json({ ok: true, player, fee });
    });
  },

  /** `GET` - the offers still pending. */
  "/api/saves/:saveId/reborn": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "GET") return Response.json({ error: "method not allowed" }, { status: 405 });
    const retired = await saveService.getRetired(saveId);
    return Response.json({
      offers: retired.filter((r) => r.rebornSeatId === auth.seatId && r.rebornOffer === "pending").map((r) => ({
        id: r.id, name: r.name, positions: r.positions, age: r.age, nationality: r.nationality,
      })),
    });
  },

  /** `POST { accept }` - answer an offer. Accept adds a 17-year-old reborn to `squad.youth`. */
  "/api/saves/:saveId/reborn/:retiredId": async (req: Req) => {
    const saveId = req.params.saveId!;
    const retiredId = req.params.retiredId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "POST") return Response.json({ error: "method not allowed" }, { status: 405 });
    const body = (await req.json().catch(() => null)) as { accept?: unknown } | null;
    if (!body || typeof body.accept !== "boolean") return Response.json({ error: "accept required" }, { status: 400 });
    return withSaveLock(saveId, async () => {
      const retired = await saveService.getRetired(saveId);
      const rec = retired.find((r) => r.id === retiredId);
      if (!rec) return Response.json({ error: "not found" }, { status: 404 });
      // The offer is the seat's (`.claude/rules/game/retirement.md`); it closes when the seat leaves the club.
      if (rec.rebornOffer !== "pending" || rec.rebornSeatId !== auth.seatId) return Response.json({ error: "offerClosed" }, { status: 409 });
      // Only the club the player retired from can take him back (`.claude/rules/game/jobs.md`).
      const owner = await saveService.getSeatMeta(saveId, auth.seatId);
      if (!owner || rec.squadId !== owner.clubId) return Response.json({ error: "offerClosed" }, { status: 409 });
      const mark = (status: NonNullable<RetiredPlayer["rebornOffer"]>) =>
        saveService.writeRetired(saveId, retired.map((r) => (r.id === retiredId ? { ...r, rebornOffer: status } : r)));
      if (!body.accept) {
        await mark("declined");
        return Response.json({ ok: true, status: "declined" });
      }
      const meta = await saveService.getSeatMeta(saveId, auth.seatId);
      const ref = meta ? await saveService.resolveSquadId(saveId, meta.clubId) : null;
      const squad = ref ? await saveService.getSquad(saveId, ref.leagueSlug, ref.clubSlug) : null;
      if (!meta || !ref || !squad) return Response.json({ error: "squad not found" }, { status: 404 });
      if ((squad.youth ?? []).length >= YOUTH.MAX_SIZE) return Response.json({ error: "youthFull" }, { status: 400 });
      const state = (meta.activeLeagues ?? []).find((l) => l.leagueSlug === meta.leagueSlug);
      const date = meta.currentDate ?? new Date().toISOString().slice(0, 10);
      const year = state?.year ?? Number(date.slice(0, 4));
      const nextSeasonEnd = state?.end ?? `${year + 1}-05-31`;
      const reborn: RosterPlayer = generateReborn({ retired: rec, squad, year, nextSeasonEnd });
      const next: Squad = { ...squad, youth: [...(squad.youth ?? []), reborn] };
      await saveService.saveSquad(saveId, ref.leagueSlug, ref.clubSlug, next);
      await mark("accepted");
      return Response.json({ ok: true, status: "accepted", player: reborn });
    });
  },
};
