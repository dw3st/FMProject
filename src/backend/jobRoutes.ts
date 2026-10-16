import { saveService, SaveService } from "@/backend/SaveService";
import { BufferingSaveDAL } from "@/backend/dal/BufferingSaveDAL";
import { FileSystemDAL } from "@/backend/dal/FileSystemDAL";
import { requireSeat } from "@/backend/auth/middleware";
import { withSaveLock } from "@/backend/saveLock";
import { acceptJobOffer, reputationOf } from "@/backend/jobWorld";
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
