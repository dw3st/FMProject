import { saveService } from "@/backend/SaveService";
import { requireSeat } from "@/backend/auth/middleware";
import { withSaveLock } from "@/backend/saveLock";
import { logError } from "@/Logger";
import { loadWindowContext, seatWindowRef, windowClosedResponse } from "@/backend/marketWindowWorld";
import { emptyMarket, humanRosterSize, seasonEndOf, startLoan } from "@/backend/negotiationWorld";
import { starLimitResponse } from "@/backend/starLimitWorld";
import { partnershipCandidates, withoutPartner } from "@/backend/partnershipWorld";
import { satelliteLoanBlock } from "@/Domain/partnerships/partnerships";
import { PARTNER } from "@/Domain/partnerships/partnershipConfig";
import { loanUntil } from "@/Domain/negotiation/loans";
import { HUMAN_MAX_SQUAD, MAX_SQUAD } from "@/Domain/contracts/freeAgents";
import { humanSaleBlocked } from "@/Domain/transfer/transferAcceptance";
import { overallAvg } from "@/Domain/playerRating";
import { buildTransferNegotiationMessage } from "@/Domain/inbox/inboxEvents";
import type { MarketState } from "@/types/transferMarketTypes";
import type { PartnershipKind } from "@/types/partnershipTypes";

type Req = Request & { params: Record<string, string> };

const json = (body: unknown, status = 200) => Response.json(body, { status });
const isKind = (k: unknown): k is PartnershipKind => k === "satellite" || k === "parent";

/** Club partnerships (report 648035a3, `.claude/rules/game/partnerships.md`). */
export const partnershipRoutes = {
  /**
   * `GET` - the seat's partners, the players lent to the satellite and the clubs of the country for each kind (with the
   * AI's answer). `POST { kind, clubId }` - proposes; the AI club signs or refuses (409 with the reason).
   */
  "/api/saves/:saveId/partnerships": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method === "GET") {
      const meta = await saveService.getSeatMeta(saveId, auth.seatId);
      if (!meta) return json({ error: "save not found" }, 404);
      if (meta.unemployed || !meta.clubId) return json({ error: "noClub" }, 409);
      const human = await saveService.getSquadById(saveId, meta.clubId);
      if (!human) return json({ error: "squad not found" }, 404);
      const p = meta.partnerships ?? {};
      const market = await saveService.getMarket(saveId, auth.seatId);
      const satellite = p.satellite ? await saveService.getSquadById(saveId, p.satellite.clubId) : null;
      const lent = (market?.loans ?? [])
        .filter((l) => p.satellite && l.fromClubId === human.id && l.toClubId === p.satellite.clubId)
        .map((l) => {
          const player = satellite?.players.find((x) => x.id === l.playerId);
          return { playerId: l.playerId, name: player?.name ?? l.playerId, until: l.until, wageShare: l.wageShare,
            apps: player?.seasonLog?.appearances ?? 0, overall: player ? overallAvg(player) : null };
        });
      const fromParent = (market?.loans ?? [])
        .filter((l) => p.parent && l.toClubId === human.id && l.fromClubId === p.parent.clubId)
        .map((l) => ({ playerId: l.playerId, until: l.until, wageShare: l.wageShare,
          name: human.players.find((x) => x.id === l.playerId)?.name ?? l.playerId }));
      const [satellites, parents] = await Promise.all([
        partnershipCandidates(saveService, saveId, meta, human, "satellite"),
        partnershipCandidates(saveService, saveId, meta, human, "parent"),
      ]);
      return json({ partnerships: p, lent, fromParent, maxLoans: PARTNER.MAX_LOANS, candidates: { satellite: satellites, parent: parents } });
    }
    if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
    const body = (await req.json().catch(() => null)) as { kind?: unknown; clubId?: unknown } | null;
    const kind = body?.kind;
    const clubId = body?.clubId;
    if (!isKind(kind) || typeof clubId !== "string" || !clubId) return json({ error: "invalidRequest" }, 400);
    return withSaveLock(saveId, async () => {
      const meta = await saveService.getSeatMeta(saveId, auth.seatId);
      if (!meta) return json({ error: "save not found" }, 404);
      if (meta.unemployed || !meta.clubId) return json({ error: "noClub" }, 409);
      const human = await saveService.getSquadById(saveId, meta.clubId);
      if (!human) return json({ error: "squad not found" }, 404);
      const candidate = (await partnershipCandidates(saveService, saveId, meta, human, kind)).find((c) => c.clubId === clubId);
      if (!candidate) return json({ error: "notFound" }, 404);
      if (candidate.refusal) return json({ error: candidate.refusal }, 409);
      const date = meta.currentDate ?? "";
      const partnerships = { ...(meta.partnerships ?? {}), [kind]: { clubId, clubName: candidate.name, since: date } };
      await saveService.updateSeat(saveId, auth.seatId, { partnerships });
      await saveService.appendInbox(saveId, buildTransferNegotiationMessage({
        date, kind: "partnership_signed", playerId: "", playerName: "", clubName: candidate.name, partnerKind: kind,
      }), auth.seatId);
      return json({ ok: true, partnerships });
    });
  },

  /** `DELETE` - ends a partnership; loans already running go on until their date. */
  "/api/saves/:saveId/partnerships/:kind": async (req: Req) => {
    const saveId = req.params.saveId!;
    const kind = req.params.kind;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "DELETE") return json({ error: "method not allowed" }, 405);
    if (!isKind(kind)) return json({ error: "invalidRequest" }, 400);
    return withSaveLock(saveId, async () => {
      const meta = await saveService.getSeatMeta(saveId, auth.seatId);
      if (!meta) return json({ error: "save not found" }, 404);
      if (!meta.partnerships?.[kind]) return json({ error: "noPartner" }, 409);
      const partnerships = withoutPartner(meta.partnerships, kind);
      await saveService.updateSeat(saveId, auth.seatId, { partnerships });
      return json({ ok: true, partnerships });
    });
  },

  /**
   * `POST { playerId, wageShare (0..50) }` - lends one of the human's players to the satellite: no fee, the satellite
   * pays the share of the wage, the loan runs to the end of the satellite's season, with the option to recall him.
   */
  "/api/saves/:saveId/partnerships/satellite/loan": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
    const body = (await req.json().catch(() => null)) as { playerId?: unknown; wageShare?: unknown } | null;
    const playerId = body?.playerId;
    const rawShare = body?.wageShare;
    if (typeof playerId !== "string" || !playerId || typeof rawShare !== "number" || !Number.isInteger(rawShare)) {
      return json({ error: "invalidRequest" }, 400);
    }
    const wageShare = rawShare / 100;
    return withSaveLock(saveId, async () => {
      const meta = await saveService.getSeatMeta(saveId, auth.seatId);
      if (!meta) return json({ error: "save not found" }, 404);
      if (meta.unemployed || !meta.clubId) return json({ error: "noClub" }, 409);
      const humanWindow = (await loadWindowContext(meta, await saveService.getSquadIndex(saveId), undefined, [seatWindowRef(meta)])).seat(auth.seatId).today;
      if (!humanWindow.open) return windowClosedResponse(humanWindow);
      const human = await saveService.getSquadById(saveId, meta.clubId);
      const sat = meta.partnerships?.satellite;
      const satellite = sat ? await saveService.getSquadById(saveId, sat.clubId) : null;
      if (!human) return json({ error: "squad not found" }, 404);
      const player = human.players.find((p) => p.id === playerId);
      if (!player) return json({ error: "notYourPlayer" }, 404);
      if (player.loan) return json({ error: "onLoan" }, 400);
      if (player.deferredTo) return json({ error: "committed" }, 409);
      if (humanSaleBlocked(human)) return json({ error: "squadDepth" }, 409);
      const market: MarketState = (await saveService.getMarket(saveId, auth.seatId)) ?? emptyMarket();
      const lentNow = (market.loans ?? []).filter((l) => sat && l.fromClubId === human.id && l.toClubId === sat.clubId).length;
      const block = satelliteLoanBlock({ player, satellite: satellite ?? undefined, lentNow, wageShare });
      if (block) return json({ error: block }, block === "invalidShare" ? 400 : 409);
      if (satellite!.players.length >= MAX_SQUAD) return json({ error: "satelliteFull" }, 409);
      const date = meta.currentDate ?? "";
      const satEntry = (await saveService.getSquadIndex(saveId)).byId(satellite!.id);
      const until = loanUntil(date, seasonEndOf(meta.activeLeagues, satEntry?.leagueSlug, date));
      try {
        const next = await startLoan(saveService, saveId, auth.seatId, meta, market, {
          player, parent: human, borrower: satellite!, wageShare, until, fee: 0, recall: true,
        });
        await saveService.saveMarket(saveId, { ...next, playerLoanList: (next.playerLoanList ?? []).filter((id) => id !== playerId) }, auth.seatId);
        await saveService.appendDayTransfers(saveId, date, [{ playerId, from: human.id, to: satellite!.id, fee: 0, kind: "loan", date }]);
      } catch (err) {
        logError("partnerships", `save ${saveId}: failed to lend ${playerId} to the satellite`, err);
        return json({ error: "failed to complete" }, 500);
      }
      return json({ ok: true, until });
    });
  },

  /** `POST { accept }` - answers the parent club's loan offer (no fee; the human club pays the offered share). */
  "/api/saves/:saveId/partnerships/parent/offer": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
    const body = (await req.json().catch(() => null)) as { accept?: unknown } | null;
    if (typeof body?.accept !== "boolean") return json({ error: "invalidRequest" }, 400);
    const accept = body.accept;
    return withSaveLock(saveId, async () => {
      const meta = await saveService.getSeatMeta(saveId, auth.seatId);
      if (!meta) return json({ error: "save not found" }, 404);
      if (meta.unemployed || !meta.clubId) return json({ error: "noClub" }, 409);
      const parentP = meta.partnerships?.parent;
      const offer = parentP?.pending;
      const date = meta.currentDate ?? "";
      if (!parentP || !offer || offer.expires < date) return json({ error: "offerClosed" }, 409);
      const cleared = { ...meta.partnerships, parent: { ...parentP, pending: undefined } };
      if (!accept) {
        await saveService.updateSeat(saveId, auth.seatId, { partnerships: cleared });
        return json({ ok: true });
      }
      const humanWindow = (await loadWindowContext(meta, await saveService.getSquadIndex(saveId), undefined, [seatWindowRef(meta)])).seat(auth.seatId).today;
      if (!humanWindow.open) return windowClosedResponse(humanWindow);
      const borrower = await saveService.getSquadById(saveId, meta.clubId);
      const parent = await saveService.getSquadById(saveId, parentP.clubId);
      const player = parent?.players.find((p) => p.id === offer.playerId);
      if (!borrower || !parent || !player || player.loan || player.deferredTo) {
        await saveService.updateSeat(saveId, auth.seatId, { partnerships: cleared });
        return json({ error: "offerClosed" }, 409);
      }
      if ((await humanRosterSize(saveService, saveId, auth.seatId, borrower)) >= HUMAN_MAX_SQUAD) return json({ error: "squadFull" }, 409);
      const starLimit = await starLimitResponse(saveId, borrower, player.id);
      if (starLimit) return starLimit;
      const market: MarketState = (await saveService.getMarket(saveId, auth.seatId)) ?? emptyMarket();
      try {
        const next = await startLoan(saveService, saveId, auth.seatId, meta, market, {
          player, parent, borrower, wageShare: offer.wageShare, until: offer.until, fee: 0, extendContract: true,
        });
        await saveService.saveMarket(saveId, next, auth.seatId);
        await saveService.appendDayTransfers(saveId, date, [{ playerId: player.id, from: parent.id, to: borrower.id, fee: 0, kind: "loan", date }]);
      } catch (err) {
        logError("partnerships", `save ${saveId}: failed to take ${player.id} from the parent`, err);
        return json({ error: "failed to complete" }, 500);
      }
      await saveService.updateSeat(saveId, auth.seatId, { partnerships: cleared });
      return json({ ok: true, until: offer.until });
    });
  },
};
