import { describe, expect, test } from "bun:test";
import en from "@/i18n/locales/en.json";
import pt from "@/i18n/locales/pt-BR.json";
import { SEAT_OFFER_ERROR_CODES } from "@/GameInterface/Negotiation/seatOfferErrors";

const get = (o: unknown, path: string): unknown =>
  path.split(".").reduce<unknown>((x, k) => (x as Record<string, unknown> | undefined)?.[k], o);

const ACTIONS = ["offer", "counter", "accept", "reject", "withdraw", "expired", "closed"];

const keys = [
  ...[
    "title", "kind", "transfer", "loan", "sent", "sentHint", "alreadyOpen", "toManager", "withClub", "contract",
    "contractTerms_one", "contractTerms_other", "validUntil", "turn", "yourTurn", "theirTurn", "you", "counters",
    "countersUsed", "accept", "counter", "sendCounter", "reject", "withdraw", "open", "lastCounter", "closed",
    "listLoading", "listFailed", "retry",
    "done.accepted", "done.rejected", "done.withdrawn", "done.countered",
    ...ACTIONS.map((a) => `last.${a}`),
    ...SEAT_OFFER_ERROR_CODES.map((c) => `errors.${c}`),
  ].map((k) => `seatOffers.${k}`),
  "inbox.transfer.subject.seat_offer", "inbox.transfer.body.seat_offer",
  ...ACTIONS.flatMap((a) => [`inbox.transfer.seatOffer.${a}.subject`, `inbox.transfer.seatOffer.${a}.body`]),
];

describe("seat offers i18n", () => {
  for (const [name, lang] of [["en", en], ["pt-BR", pt]] as const) {
    test(`${name} has every key`, () => {
      for (const k of keys) expect(typeof get(lang, k), `${name} ${k}`).toBe("string");
    });
  }
});
