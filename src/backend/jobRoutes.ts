import { saveService, SaveService } from "@/backend/SaveService";
import { BufferingSaveDAL } from "@/backend/dal/BufferingSaveDAL";
import { FileSystemDAL } from "@/backend/dal/FileSystemDAL";
import { requireSaveOwner } from "@/backend/auth/middleware";
import { withSaveLock } from "@/backend/saveLock";
import { acceptJobOffer, reputationOf } from "@/backend/jobWorld";
import { logError } from "@/Logger";

type Req = Request & { params: Record<string, string> };

/** Job offers to the human manager (`.claude/rules/game/jobs.md`). */
export const jobRoutes = {
  /** `GET` - reputation (0..100), pending offers and the unemployment state. */
  "/api/saves/:saveId/jobs": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSaveOwner(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "GET") return Response.json({ error: "method not allowed" }, { status: 405 });
    const meta = await saveService.getMeta(saveId);
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
    const auth = requireSaveOwner(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "POST") return Response.json({ error: "method not allowed" }, { status: 405 });
    const body = (await req.json().catch(() => null)) as { accept?: unknown } | null;
    if (!body || typeof body.accept !== "boolean") return Response.json({ error: "accept required" }, { status: 400 });
    return withSaveLock(saveId, async () => {
      const meta = await saveService.getMeta(saveId);
      if (!meta?.currentDate) return Response.json({ error: "save not found" }, { status: 404 });
      const offers = meta.jobOffers ?? [];
      const offer = offers.find((o) => o.id === offerId);
      if (!offer || offer.expires < meta.currentDate) return Response.json({ error: "offerClosed" }, { status: 409 });
      if (!body.accept) {
        await saveService.updateMeta(saveId, { jobOffers: offers.filter((o) => o.id !== offerId) });
        return Response.json({ ok: true, status: "declined" });
      }
      const index = await saveService.getSquadIndex(saveId);
      if (!index.byId(offer.squadId)) return Response.json({ error: "offerClosed" }, { status: 409 });

      const buffer = new BufferingSaveDAL(new FileSystemDAL());
      const service = new SaveService(buffer);
      let next;
      try {
        next = await acceptJobOffer(service, saveId, (await service.getMeta(saveId))!, offer);
        await buffer.flush();
      } catch (err) {
        logError("jobs", `save ${saveId}: failed to accept offer ${offerId}`, err);
        return Response.json({ error: "failed to change club" }, { status: 500 });
      }
      // The day's service built its own index; the singleton's cache must see the new tactics/meta.
      saveService.dropSquadIndex(saveId);
      return Response.json({ ok: true, status: "accepted", clubId: next.clubId, leagueSlug: next.leagueSlug });
    });
  },
};
