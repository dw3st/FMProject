/**
 * Offers between two human seats (multiplayer part 4, `.claude/rules/game/multiplayer.md`): list, make, counter,
 * accept, refuse and withdraw. The pure rules live in `src/Domain/seatOffers/`, the world side in
 * `src/backend/seatOfferWorld.ts`.
 */
import { randomUUID } from "crypto";
import { SaveService, saveService } from "@/backend/SaveService";
import { BufferingSaveDAL } from "@/backend/dal/BufferingSaveDAL";
import { FileSystemDAL } from "@/backend/dal/FileSystemDAL";
import { requireSeat } from "@/backend/auth/middleware";
import { withSaveLock } from "@/backend/saveLock";
import { logError } from "@/Logger";
import { loadWindowContext, seatWindowRef, windowClosedResponse } from "@/backend/marketWindowWorld";
import { seasonEndOf } from "@/backend/negotiationWorld";
import {
  checkOfferWorld, closeOffersForPlayer, completeSeatLoan, completeSeatTransfer, nudgeSeats, tellSeat, type SeatNudges,
} from "@/backend/seatOfferWorld";
import { createSeatOffer, offerExpiry, respondSeatOffer, seatOfferView, type SeatOfferAnswer } from "@/Domain/seatOffers/seatOffers";
import { SEAT_OFFERS } from "@/Domain/seatOffers/seatOfferConfig";
import { parseSellOnPct, roundFeeUp } from "@/Domain/negotiation/negotiation";
import { loanUntil } from "@/Domain/negotiation/loans";
import { evaluateContractOffer } from "@/Domain/contracts/contracts";
import type { WindowStatus } from "@/Domain/market/windows";
import type { SeatOffer, SeatOfferSide, SeatOfferTerms, SeatOfferView } from "@/types/seatOfferTypes";

type Req = Request & { params: Record<string, string> };

const json = (body: unknown, status = 200) => Response.json(body, { status });

const MAX_BODY_BYTES = 8 * 1024;

/** The JSON object of the body; 413 `tooLarge` over 8 KB (declared and read), 400 `invalidTerms` when not an object. */
async function readBody(req: Request): Promise<Record<string, unknown> | Response> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return json({ error: "tooLarge" }, 413);
  const text = await req.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return json({ error: "tooLarge" }, 413);
  try {
    const v = JSON.parse(text) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : json({ error: "invalidTerms" }, 400);
  } catch {
    return json({ error: "invalidTerms" }, 400);
  }
}

const isFee = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
/** A loan share sent as an integer percentage 0..100 (as in `POST /loans`), as a 0..1 fraction; null when invalid. */
const parseShare = (v: unknown): number | null =>
  typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 100 && v % 10 === 0 ? v / 100 : null;

async function managerName(service: SaveService, saveId: string, seatId: string): Promise<string> {
  return (await service.getSeat(saveId, seatId))?.manager?.name ?? "";
}

/** Today's window of a seat's club (the buyer's window governs an offer). */
async function seatWindowToday(service: SaveService, saveId: string, seatId: string): Promise<WindowStatus> {
  const meta = await service.getSeatMeta(saveId, seatId);
  if (!meta) return { open: false };
  const windows = await loadWindowContext(meta, await service.getSquadIndex(saveId), undefined, [seatWindowRef(meta)]);
  return windows.seat(seatId).today;
}

async function viewOf(saveId: string, o: SeatOffer, seatId: string): Promise<SeatOfferView | null> {
  const other = o.seller.seatId === seatId ? o.buyer.seatId : o.seller.seatId;
  return seatOfferView(o, seatId, await managerName(saveService, saveId, other));
}

/** Drops `offer` from the file and tells both sides. */
async function dropOffer(saveId: string, offers: SeatOffer[], offer: SeatOffer, action: "expired" | "closed", date: string): Promise<void> {
  await saveService.writeSeatOffers(saveId, offers.filter((x) => x.id !== offer.id));
  await tellSeat(saveService, saveId, offer, "seller", action, date);
  await tellSeat(saveService, saveId, offer, "buyer", action, date);
}

/** Creates an offer (`POST /seat-offers`), inside the save lock. */
async function createOffer(saveId: string, seatId: string, body: Record<string, unknown>): Promise<Response> {
  const meta = await saveService.getSeatMeta(saveId, seatId);
  if (!meta) return json({ error: "save not found" }, 404);
  if (meta.unemployed || !meta.clubId) return json({ error: "noClub" }, 409);
  const { kind, playerId, fromSquadId } = body;
  if ((kind !== "transfer" && kind !== "loan") || typeof playerId !== "string" || !playerId || typeof fromSquadId !== "string" || !fromSquadId) {
    return json({ error: "invalidTerms" }, 400);
  }
  const date = meta.currentDate ?? "";
  // Only another seat's club, and a player who is there.
  const sellerSeatId = fromSquadId === meta.clubId ? null : await saveService.seatOfClub(saveId, fromSquadId);
  if (!sellerSeatId || sellerSeatId === seatId) return json({ error: "notFound" }, 404);
  const sellerSquad = await saveService.getSquadById(saveId, fromSquadId);
  const target = sellerSquad?.players.find((p) => p.id === playerId);
  if (!sellerSquad || !target) return json({ error: "notFound" }, 404);

  const window = (await loadWindowContext(meta, await saveService.getSquadIndex(saveId), undefined, [seatWindowRef(meta)])).seat(seatId).today;
  if (!window.open) return windowClosedResponse(window);

  const buyerSquad = await saveService.getSquadById(saveId, meta.clubId);
  if (!buyerSquad) return json({ error: "noClub" }, 409);
  const parties = {
    kind, playerId,
    seller: { seatId: sellerSeatId, clubId: sellerSquad.id, clubName: sellerSquad.name },
    buyer: { seatId, clubId: buyerSquad.id, clubName: buyerSquad.name },
  } as const;
  const check = await checkOfferWorld(saveService, saveId, parties);
  if (!check.ok) return json({ error: check.error }, check.status);

  const offers = await saveService.getSeatOffers(saveId);
  if (offers.some((o) => o.buyer.seatId === seatId && o.playerId === playerId && o.kind === kind)) return json({ error: "alreadyOffered" }, 409);
  if (offers.filter((o) => o.buyer.seatId === seatId).length >= SEAT_OFFERS.MAX_OPEN_SENT) return json({ error: "tooManyOffers" }, 409);

  let terms: SeatOfferTerms;
  if (kind === "transfer") {
    const { fee, wage, years } = body;
    const pct = parseSellOnPct(body.sellOnPct);
    if (!isFee(fee) || pct === null || typeof wage !== "number" || !Number.isFinite(wage) || typeof years !== "number") {
      return json({ error: "invalidTerms" }, 400);
    }
    const negotiation = (await saveService.getAchievements(saveId, seatId)).attributes.negotiation;
    const contract = evaluateContractOffer({ wage, years }, check.player, check.buyer, date, { fromSquad: check.seller, negotiation });
    if (!contract.accepted) return json({ error: contract.reason, demand: contract.demand }, 400);
    terms = { fee: roundFeeUp(fee), sellOnPct: pct, wage, years };
  } else {
    const share = parseShare(body.wageShare);
    const fee = body.fee === undefined ? 0 : body.fee;
    if (share === null || !isFee(fee)) return json({ error: "invalidTerms" }, 400);
    let until = loanUntil(date, seasonEndOf(meta.activeLeagues, meta.leagueSlug, date));
    const contractEnd = check.player.contract?.until;
    if (contractEnd && contractEnd < until) until = contractEnd;
    terms = { fee: roundFeeUp(fee), wageShare: share, until };
  }

  const offer = createSeatOffer({
    id: randomUUID(), kind, playerId, playerName: check.player.name,
    seller: parties.seller, buyer: parties.buyer, date, terms, windowUntil: window.until ?? null,
  });
  await saveService.writeSeatOffers(saveId, [...offers, offer]);
  await tellSeat(saveService, saveId, offer, "seller", "offer", date);
  return json({ offer: seatOfferView(offer, seatId, await managerName(saveService, saveId, sellerSeatId)) });
}

/** The answer in the body, or null when malformed (`wageShare` as an integer percentage). */
function parseAnswer(body: Record<string, unknown>): SeatOfferAnswer | null {
  const a = body.action;
  if (a === "accept" || a === "reject" || a === "withdraw") return { action: a };
  if (a !== "counter") return null;
  if (!isFee(body.fee)) return { action: "counter", fee: -1 };
  const share = body.wageShare === undefined ? undefined : parseShare(body.wageShare);
  const pct = body.sellOnPct === undefined ? undefined : body.sellOnPct;
  return {
    action: "counter", fee: roundFeeUp(body.fee),
    ...(typeof pct === "number" ? { sellOnPct: pct } : pct === undefined ? {} : { sellOnPct: -1 }),
    ...(share === undefined ? {} : { wageShare: share ?? -1 }),
  };
}

/** Answers an offer (`POST /seat-offers/:offerId`), inside the save lock. */
async function answerOffer(saveId: string, seatId: string, offerId: string, body: Record<string, unknown>): Promise<Response> {
  const meta = await saveService.getSeatMeta(saveId, seatId);
  if (!meta) return json({ error: "save not found" }, 404);
  const date = meta.currentDate ?? "";
  const offers = await saveService.getSeatOffers(saveId);
  const offer = offers.find((o) => o.id === offerId);
  const side: SeatOfferSide | null = !offer ? null : offer.seller.seatId === seatId ? "seller" : offer.buyer.seatId === seatId ? "buyer" : null;
  if (!offer || !side) return json({ error: "notFound" }, 404);
  const answer = parseAnswer(body);
  if (!answer) return json({ error: "invalidTerms" }, 400);
  const other: SeatOfferSide = side === "seller" ? "buyer" : "seller";

  const r = respondSeatOffer(offer, side, answer, date);
  if (!r.ok) {
    if (r.error === "offerClosed") {
      await dropOffer(saveId, offers, offer, "expired", date);
      return json({ error: "offerClosed" }, 409);
    }
    return json({ error: r.error }, r.error === "notYourTurn" ? 403 : r.error === "noRounds" ? 409 : 400);
  }

  if (!r.closed) {
    // A counter: never past the buyer's window.
    const window = await seatWindowToday(saveService, saveId, offer.buyer.seatId);
    const capped = offerExpiry(date, window.until ?? null);
    const next = capped < r.offer.expires ? { ...r.offer, expires: capped } : r.offer;
    await saveService.writeSeatOffers(saveId, offers.map((x) => (x.id === offer.id ? next : x)));
    await tellSeat(saveService, saveId, next, other, "counter", date);
    return json({ ok: true, status: "countered", offer: seatOfferView(next, seatId, await managerName(saveService, saveId, other === "seller" ? next.seller.seatId : next.buyer.seatId)) });
  }

  if (r.closed === "reject" || r.closed === "withdraw") {
    await saveService.writeSeatOffers(saveId, offers.filter((x) => x.id !== offer.id));
    await tellSeat(saveService, saveId, r.offer, other, r.closed, date);
    return json({ ok: true, status: r.closed === "reject" ? "rejected" : "withdrawn" });
  }

  // Accept: everything is checked again.
  const window = await seatWindowToday(saveService, saveId, offer.buyer.seatId);
  if (!window.open) return windowClosedResponse(window);
  const check = await checkOfferWorld(saveService, saveId, offer);
  if (!check.ok) {
    // A full squad or the seller's minimums only block the accept (as in the daily expiry): the offer stays.
    if (check.error !== "squadFull" && check.error !== "squadDepth") await dropOffer(saveId, offers, offer, "closed", date);
    return json({ error: check.error }, check.status);
  }
  if (offer.kind === "transfer") {
    const negotiation = (await saveService.getAchievements(saveId, offer.buyer.seatId)).attributes.negotiation;
    const contract = evaluateContractOffer(
      { wage: offer.terms.wage ?? 0, years: offer.terms.years ?? 0 }, check.player, check.buyer, date,
      { fromSquad: check.seller, negotiation },
    );
    if (!contract.accepted) {
      await dropOffer(saveId, offers, offer, "closed", date);
      return json({ error: "contractRefused", reason: contract.reason }, 409);
    }
  }
  const accepted = r.offer;
  const buffer = new BufferingSaveDAL(new FileSystemDAL());
  const unit = new SaveService(buffer);
  // The socket nudges go only once the unit is written.
  const nudges: SeatNudges = new Set();
  try {
    if (offer.kind === "transfer") await completeSeatTransfer(unit, saveId, accepted, check, date);
    else await completeSeatLoan(unit, saveId, accepted, check, date);
    const rest = await closeOffersForPlayer(unit, saveId, offers.filter((x) => x.id !== offer.id), offer.playerId, date, undefined, undefined, nudges);
    await unit.writeSeatOffers(saveId, rest);
    await tellSeat(unit, saveId, accepted, other, "accept", date, undefined, nudges);
    await buffer.flush();
  } catch (err) {
    logError("seatOffers", `save ${saveId}: failed to complete offer ${offer.id}`, err);
    return json({ error: "failed to complete" }, 500);
  }
  nudgeSeats(saveId, nudges);
  return json({ ok: true, status: "accepted" });
}

/** Offers between human managers (`.claude/rules/game/multiplayer.md` → "Parte 4"). */
export const seatOfferRoutes = {
  /**
   * `GET` - the open offers where the seat is a party, and the other seats' clubs (with their manager).
   * `POST { kind, playerId, fromSquadId, fee, sellOnPct?, wage?, years?, wageShare? (0..100) }` - make an offer.
   */
  "/api/saves/:saveId/seat-offers": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method === "GET") {
      const offers = await saveService.getSeatOffers(saveId);
      const views: SeatOfferView[] = [];
      for (const o of offers) {
        const v = await viewOf(saveId, o, auth.seatId);
        if (v) views.push(v);
      }
      const seatClubs = (await saveService.listSeats(saveId))
        .filter(({ seatId, seat }) => seatId !== auth.seatId && seat.clubId && !seat.unemployed)
        .map(({ seat }) => ({ clubId: seat.clubId, managerName: seat.manager?.name ?? "" }));
      return json({ offers: views, seatClubs });
    }
    if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
    const body = await readBody(req);
    if (body instanceof Response) return body;
    return withSaveLock(saveId, () => createOffer(saveId, auth.seatId, body));
  },

  /** `POST { action: "accept" | "reject" | "counter" | "withdraw", fee?, sellOnPct?, wageShare? (0..100) }`. */
  "/api/saves/:saveId/seat-offers/:offerId": async (req: Req) => {
    const saveId = req.params.saveId!;
    const auth = requireSeat(req, saveId);
    if (auth instanceof Response) return auth;
    if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
    const body = await readBody(req);
    if (body instanceof Response) return body;
    return withSaveLock(saveId, () => answerOffer(saveId, auth.seatId, req.params.offerId!, body));
  },
};
