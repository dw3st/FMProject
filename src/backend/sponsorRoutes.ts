import { saveService } from "@/backend/SaveService";
import { requireSeat } from "@/backend/auth/middleware";
import { withSaveLock } from "@/backend/saveLock";
import { sponsorsView } from "@/backend/sponsorWorld";
import { topIdsOf } from "@/backend/starLimitWorld";
import { acceptOffer, declineOffer, negotiateOffer, type SponsorActionResult } from "@/Domain/sponsors/sponsors";
import type { SponsorOfferAction } from "@/types/sponsorTypes";

type Req = Request & { params: Record<string, string> };

const ACTIONS: readonly SponsorOfferAction[] = ["accept", "decline", "negotiate"];
const ERROR_STATUS = { notFound: 404, slotTaken: 409, alreadyNegotiated: 409 } as const;

/** The seat's club, or the refusal: 404 without the save, 409 `noClub` without a club. */
async function loadClub(saveId: string, seatId: string) {
  const meta = await saveService.getSeatMeta(saveId, seatId);
  if (!meta) return Response.json({ error: "save not found" }, { status: 404 });
  if (meta.unemployed || !meta.clubId) return Response.json({ error: "noClub" }, { status: 409 });
  const entry = (await saveService.getSquadIndex(saveId)).byId(meta.clubId);
  const squad = entry ? await saveService.getSquad(saveId, entry.leagueSlug, entry.stem) : null;
  if (!entry || !squad) return Response.json({ error: "squad not found" }, { status: 404 });
  return { meta, squad, ref: { leagueSlug: entry.leagueSlug, clubSlug: entry.stem } };
}

/**
 * Sponsors of the seat's club (`.claude/rules/game/sponsors.md`): the view, and the answer to an offer. Seat only;
 * the answer under the save lock and behind the lobby guard; no club → 409 `noClub`.
 */
export const sponsorRoutes = {
  "/api/saves/:saveId/sponsors": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "GET") return Response.json({ error: "method not allowed" }, { status: 405 });
    const club = await loadClub(saveId, auth.seatId);
    if (club instanceof Response) return club;
    return Response.json(await sponsorsView(saveService, saveId, club.meta, club.squad, await topIdsOf(saveId)));
  },

  /** `POST { action: "accept" | "decline" | "negotiate" }`. */
  "/api/saves/:saveId/sponsors/offers/:offerId": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "POST") return Response.json({ error: "method not allowed" }, { status: 405 });
    let body: unknown;
    try { body = await req.json(); } catch { return Response.json({ error: "invalid body" }, { status: 400 }); }
    const action = (body as { action?: unknown } | null)?.action as SponsorOfferAction;
    if (!ACTIONS.includes(action)) return Response.json({ error: "invalidAction" }, { status: 400 });
    const offerId = req.params.offerId ?? "";
    return withSaveLock(saveId, async () => {
      const club = await loadClub(saveId, auth.seatId);
      if (club instanceof Response) return club;
      const date = club.meta.currentDate ?? "";
      // A club still without the record (a save from before 12.0) has no offers.
      if (!club.squad.sponsors) return Response.json({ error: "notFound" }, { status: 404 });
      const result: SponsorActionResult = action === "accept" ? acceptOffer(club.squad.sponsors, offerId, date)
        : action === "decline" ? declineOffer(club.squad.sponsors, offerId, date)
        : negotiateOffer(club.squad.sponsors, offerId, date);
      if (!result.ok) return Response.json({ error: result.error }, { status: ERROR_STATUS[result.error] });
      const squad = { ...club.squad, sponsors: result.sponsors };
      // Read before the write: saving the squad invalidates the stars index.
      const top = await topIdsOf(saveId);
      await saveService.saveSquad(saveId, club.ref.leagueSlug, club.ref.clubSlug, squad);
      return Response.json({
        ok: true, action,
        ...(result.contract ? { contract: result.contract } : {}),
        ...(result.negotiation ? { negotiation: result.negotiation } : {}),
        view: await sponsorsView(saveService, saveId, club.meta, squad, top),
      });
    });
  },
};
