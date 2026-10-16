import { windowClosedText } from "@/GameInterface/Transfers/transferWindow";

/** Error codes of the seat-offer routes with their own text (`seatOffers.errors.<code>`). */
export const SEAT_OFFER_ERROR_CODES = [
  "alreadyOffered", "tooManyOffers", "notYourTurn", "noRounds", "invalidTerms", "offerClosed", "contractRefused",
  "squadDepth", "squadFull", "onLoan", "windowClosed", "notFound", "noClub",
] as const;

/** Contract refusals that already have a text in `contracts.refusal.*`. */
const CONTRACT_REFUSALS = ["lowWage", "tooManyYears", "invalidYears", "smallerClub", "poorFacilities", "unhappy"];

type T = (key: string, opts?: Record<string, unknown>) => string;

/** The player-facing text of a failed seat-offer call. */
export function seatOfferErrorText(t: T, lang: string, r: { error: string; opensOn?: string; reason?: string }): string {
  if (r.error === "windowClosed") return windowClosedText(t, lang, r.opensOn);
  if (CONTRACT_REFUSALS.includes(r.error)) return t(`contracts.refusal.${r.error}`);
  if (r.error === "contractRefused" && r.reason && CONTRACT_REFUSALS.includes(r.reason)) {
    return `${t("seatOffers.errors.contractRefused")} ${t(`contracts.refusal.${r.reason}`)}`;
  }
  if ((SEAT_OFFER_ERROR_CODES as readonly string[]).includes(r.error)) return t(`seatOffers.errors.${r.error}`);
  return t("negotiation.errors.generic");
}
