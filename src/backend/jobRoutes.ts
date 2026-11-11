import { saveService, SaveService } from "@/backend/SaveService";
import { BufferingSaveDAL } from "@/backend/dal/BufferingSaveDAL";
import { FileSystemDAL } from "@/backend/dal/FileSystemDAL";
import { requireSeat } from "@/backend/auth/middleware";
import { withSaveLock } from "@/backend/saveLock";
import { acceptJobOffer, reputationOf, resignFromClub } from "@/backend/jobWorld";
import { worldLobbyGuard } from "@/backend/worlds/worldLobbyGuard";
import { applyForJob, jobPosts } from "@/backend/jobPostsWorld";
import { addDays } from "@/Domain/dates";
import { JOBS } from "@/Domain/jobs/jobsConfig";
import { compensationFee } from "@/Domain/managers/managerContract";
import { managerWallet } from "@/Domain/managers/assets";
import { openTotal } from "@/Domain/bets/bets";
import { nudgeSeats, type SeatNudges } from "@/backend/seatOfferWorld";
import { logError } from "@/Logger";

type Req = Request & { params: Record<string, string> };

/** Job offers to the human manager (`.claude/rules/game/jobs.md`). */
export const jobRoutes = {
  /** `GET` - reputation (0..100), pending offers and the unemployment state. */
  "/api/saves/:saveId/jobs": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "GET") return Response.json({ error: "method not allowed" }, { status: 405 });
    const meta = await saveService.getSeatMeta(saveId, auth.seatId);
    if (!meta) return Response.json({ error: "save not found" }, { status: 404 });
    const date = meta.currentDate ?? "";
    return Response.json({
      reputation: await reputationOf(saveService, saveId, meta),
      offers: (meta.jobOffers ?? []).filter((o) => o.expires >= date),
      unemployed: meta.unemployed ?? null,
      seeking: meta.jobSeeking ?? null,
    });
  },

  /** `PUT { on }` - "available on the market" (8.9.23). 409 `noClub` without a club, `lobby` in a lobby. */
  "/api/saves/:saveId/job-seeking": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "PUT") return Response.json({ error: "method not allowed" }, { status: 405 });
    const lobby = await worldLobbyGuard(saveId);
    if (lobby) return lobby;
    const body = (await req.json().catch(() => null)) as { on?: unknown } | null;
    if (!body || typeof body.on !== "boolean") return Response.json({ error: "on required" }, { status: 400 });
    const on = body.on;
    return withSaveLock(saveId, async () => {
      const meta = await saveService.getSeatMeta(saveId, auth.seatId);
      if (!meta?.currentDate) return Response.json({ error: "save not found" }, { status: 404 });
      if (!meta.clubId || meta.unemployed) return Response.json({ error: "noClub" }, { status: 409 });
      const seeking = on
        ? (meta.jobSeeking ?? { since: meta.currentDate, nextOfferDate: addDays(meta.currentDate, JOBS.seeking.FIRST_OFFER_DAYS) })
        : undefined;
      await saveService.updateSeat(saveId, auth.seatId, { jobSeeking: seeking });
      return Response.json({ ok: true, seeking: seeking ?? null });
    });
  },

  /** `GET ?league=` - job security of every club of a league and the open application (8.9.29). Default: the seat's league. */
  "/api/saves/:saveId/job-posts": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "GET") return Response.json({ error: "method not allowed" }, { status: 405 });
    const meta = await saveService.getSeatMeta(saveId, auth.seatId);
    if (!meta) return Response.json({ error: "save not found" }, { status: 404 });
    const league = new URL(req.url).searchParams.get("league") || meta.leagueSlug;
    if (!/^[a-z0-9_]{1,80}$/.test(league)) return Response.json({ error: "invalidLeague" }, { status: 400 });
    const view = await jobPosts(saveService, saveId, meta, league);
    if (!view) return Response.json({ error: "invalidLeague" }, { status: 400 });
    return Response.json(view);
  },

  /**
   * `POST { squadId }` - apply for the club's job; `DELETE` - withdraw the open application. The answer comes in a
   * few days through the inbox. 409 `alreadyApplied`, `own`, `human`, `refused`, `noApplication`, `lobby`; 404 `notFound`.
   */
  "/api/saves/:saveId/job-applications": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "POST" && req.method !== "DELETE") return Response.json({ error: "method not allowed" }, { status: 405 });
    const lobby = await worldLobbyGuard(saveId);
    if (lobby) return lobby;
    const body = req.method === "POST" ? (await req.json().catch(() => null)) as { squadId?: unknown } | null : null;
    if (req.method === "POST" && (!body || typeof body.squadId !== "string" || body.squadId.length > 80)) {
      return Response.json({ error: "squadId required" }, { status: 400 });
    }
    return withSaveLock(saveId, async () => {
      const meta = await saveService.getSeatMeta(saveId, auth.seatId);
      if (!meta?.currentDate) return Response.json({ error: "save not found" }, { status: 404 });
      if (req.method === "DELETE") {
        if (!meta.jobApplication) return Response.json({ error: "noApplication" }, { status: 409 });
        await saveService.updateSeat(saveId, auth.seatId, { jobApplication: undefined });
        return Response.json({ ok: true });
      }
      const r = await applyForJob(saveService, saveId, auth.seatId, meta, body!.squadId as string);
      if (!r.ok) return Response.json({ error: r.error }, { status: r.status });
      return Response.json({ ok: true, answerOn: r.application.answerOn });
    });
  },

  /** `POST` - resign from the club now (8.9.23): no severance, unemployed. 409 `noClub`, `lobby`. */
  "/api/saves/:saveId/job-resign": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "POST") return Response.json({ error: "method not allowed" }, { status: 405 });
    const lobby = await worldLobbyGuard(saveId);
    if (lobby) return lobby;
    return withSaveLock(saveId, async () => {
      const meta = await saveService.getSeatMeta(saveId, auth.seatId);
      if (!meta?.currentDate) return Response.json({ error: "save not found" }, { status: 404 });
      if (!meta.clubId || meta.unemployed) return Response.json({ error: "noClub" }, { status: 409 });
      // The release fee (half the wage of the weeks left, as an offer's compensation) from the manager's own money.
      const fee = compensationFee(meta.managerContract, meta.currentDate);
      const wallet = managerWallet(meta.managerEarnings, meta.managerSpent, meta.betNet, openTotal(await saveService.getBets(saveId, auth.seatId)));
      if (fee > wallet) return Response.json({ error: "noMoney", fee, wallet }, { status: 409 });
      const buffer = new BufferingSaveDAL(new FileSystemDAL());
      const service = new SaveService(buffer);
      const nudges: SeatNudges = new Set();
      try {
        await resignFromClub(service, saveId, auth.seatId, (await service.getSeatMeta(saveId, auth.seatId))!, nudges, fee);
        await buffer.flush();
      } catch (err) {
        logError("jobs", `save ${saveId}: failed to resign`, err);
        return Response.json({ error: "failed to resign" }, { status: 500 });
      }
      nudgeSeats(saveId, nudges);
      saveService.dropSquadIndex(saveId);
      return Response.json({ ok: true, fee });
    });
  },

  /**
   * `POST { accept }` - answer an offer. Decline drops it; accept switches club in one unit of work
   * (a BufferingSaveDAL flushed with the meta last). 409 `offerClosed` when it expired or is gone.
   */
  "/api/saves/:saveId/jobs/:offerId": async (req: Req) => {
    const saveId = req.params.saveId!;
    const offerId = req.params.offerId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "POST") return Response.json({ error: "method not allowed" }, { status: 405 });
    const body = (await req.json().catch(() => null)) as { accept?: unknown } | null;
    if (!body || typeof body.accept !== "boolean") return Response.json({ error: "accept required" }, { status: 400 });
    return withSaveLock(saveId, async () => {
      const meta = await saveService.getSeatMeta(saveId, auth.seatId);
      if (!meta?.currentDate) return Response.json({ error: "save not found" }, { status: 404 });
      const offers = meta.jobOffers ?? [];
      const offer = offers.find((o) => o.id === offerId);
      if (!offer || offer.expires < meta.currentDate) return Response.json({ error: "offerClosed" }, { status: 409 });
      if (!body.accept) {
        await saveService.updateSeat(saveId, auth.seatId, { jobOffers: offers.filter((o) => o.id !== offerId) });
        return Response.json({ ok: true, status: "declined" });
      }
      // Another seat took the club since the offer (`.claude/rules/game/multiplayer.md`): one human per club.
      if ((await saveService.humanClubIds(saveId)).has(offer.squadId)) {
        await saveService.updateSeat(saveId, auth.seatId, { jobOffers: offers.filter((o) => o.squadId !== offer.squadId) });
        return Response.json({ error: "offerClosed" }, { status: 409 });
      }
      const index = await saveService.getSquadIndex(saveId);
      if (!index.byId(offer.squadId)) return Response.json({ error: "offerClosed" }, { status: 409 });

      const buffer = new BufferingSaveDAL(new FileSystemDAL());
      const service = new SaveService(buffer);
      let next;
      // Socket nudges of the seats whose offers with this seat close: only once the unit is written.
      const nudges: SeatNudges = new Set();
      try {
        next = await acceptJobOffer(service, saveId, auth.seatId, (await service.getSeatMeta(saveId, auth.seatId))!, offer, nudges);
        await buffer.flush();
      } catch (err) {
        logError("jobs", `save ${saveId}: failed to accept offer ${offerId}`, err);
        return Response.json({ error: "failed to change club" }, { status: 500 });
      }
      nudgeSeats(saveId, nudges);
      // The day's service built its own index; the singleton's cache must see the new tactics/meta.
      saveService.dropSquadIndex(saveId);
      return Response.json({ ok: true, status: "accepted", clubId: next.clubId, leagueSlug: next.leagueSlug });
    });
  },
};
