import { saveService } from "@/backend/SaveService";
import { requireSeat } from "@/backend/auth/middleware";
import { loadWindowContext, seatWindowRef } from "@/backend/marketWindowWorld";
import { humanMatchRegistrationToday } from "@/backend/registrationWorld";
import { liveBids } from "@/Domain/negotiation/bids";
import { seatOfferView } from "@/Domain/seatOffers/seatOffers";
import { formationForTactics } from "@/Domain/matchFormations";
import { getFormationSlots } from "@/types/formationSlots";
import { navBadges, type NavBadges } from "@/Domain/navBadges/navBadges";

type Req = Request & { params: Record<string, string> };

/** Counts on the menu tabs (report 2026-11-16, `.claude/rules/ui-standard.md`). Empty without a club. */
export const navBadgeRoutes = {
  "/api/saves/:saveId/nav-badges": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "GET") return Response.json({ error: "method not allowed" }, { status: 405 });
    const meta = await saveService.getSeatMeta(saveId, auth.seatId);
    if (!meta) return Response.json({ error: "save not found" }, { status: 404 });
    const date = meta.currentDate ?? "";
    const squad = meta.clubId ? await saveService.getSquadById(saveId, meta.clubId) : null;
    if (!squad || !date) return Response.json({ badges: {} satisfies NavBadges });

    const [tactics, market, scouting, inbox, index] = await Promise.all([
      saveService.getTactics(saveId, auth.seatId),
      saveService.getMarket(saveId, auth.seatId),
      saveService.getScouting(saveId, auth.seatId),
      saveService.getInbox(saveId, auth.seatId),
      saveService.getSquadIndex(saveId),
    ]);
    const formation = formationForTactics(tactics ?? { formation: meta.formation ?? "4-3-3" });
    const slots = getFormationSlots(formation as unknown as Parameters<typeof getFormationSlots>[0]).length;
    const registration = await humanMatchRegistrationToday(saveService, saveId, auth.seatId, squad);
    const windows = await loadWindowContext(meta, index, undefined, [seatWindowRef(meta)]);
    const seatOffers = meta.mode === "multi" ? await saveService.getSeatOffers(saveId) : [];
    const offers = [
      ...liveBids(market?.pendingBids, date, squad).map((b) => b.id),
      ...seatOffers.filter((o) => o.expires >= date && seatOfferView(o, auth.seatId, "")?.myTurn).map((o) => o.id),
    ];
    const seasonEnd = (meta.activeLeagues ?? []).find((l) => l.leagueSlug === meta.leagueSlug)?.end ?? null;
    const badges = navBadges({
      date, squad, seasonEnd,
      lineup: tactics?.lineup ?? [], slots,
      registeredToday: registration?.ids ?? null,
      window: windows.seat(auth.seatId).today,
      offers,
      scoutNews: inbox
        .filter((m) => m.category === "scouting" && (m.kind === "gem" || m.kind === "shortlist"))
        .map((m) => ({ id: m.id, date: m.date })),
      prospects: scouting.prospects.filter((p) => p.expires >= date).map((p) => p.player.id),
    });
    return Response.json({ badges });
  },
};
