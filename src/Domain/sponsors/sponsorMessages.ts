import type { SponsorInboxMessage } from "@/types/inboxTypes";
import type { SponsorContract, SponsorOffer, SponsorSlot } from "@/types/sponsorTypes";
import type { SponsorSeasonReview } from "@/Domain/sponsors/sponsors";
import { SPONSOR_SLOTS } from "@/Domain/sponsors/sponsors";
import { formatEurosText } from "@/Domain/money";

export type SponsorMessageArgs =
  | { date: string; kind: "offers"; offers: readonly SponsorOffer[] }
  | { date: string; kind: "auto_signed"; signed: readonly SponsorContract[] }
  | { date: string; kind: "season_review"; review: Pick<SponsorSeasonReview, "bonuses" | "renewals" | "left"> };

/** Offers counted by slot (slots without offers left out); the latest last day. */
export function offersBySlot(offers: readonly SponsorOffer[]): { slot: SponsorSlot; count: number }[] {
  return SPONSOR_SLOTS
    .map((slot) => ({ slot, count: offers.filter((o) => o.slot === slot).length }))
    .filter((x) => x.count > 0);
}

/**
 * Inbox `sponsor` (`.claude/rules/game/sponsors.md`). English fallbacks in `subject` / `preview`; the screen
 * translates from the fields. The id is stable per day and kind.
 */
export function buildSponsorMessage(args: SponsorMessageArgs): SponsorInboxMessage {
  const base = {
    id: `sponsor-${args.date}-${args.kind}`, date: args.date, createdAt: args.date, read: false, category: "sponsor" as const,
  };
  if (args.kind === "offers") {
    const n = args.offers.length;
    const expires = args.offers.reduce((d, o) => (o.expires > d ? o.expires : d), "");
    return {
      ...base, kind: "offers", subject: "Sponsorship offers", preview: `${n} offer${n === 1 ? "" : "s"} to answer by ${expires}`,
      offers: offersBySlot(args.offers), expires,
    };
  }
  if (args.kind === "auto_signed") {
    const first = args.signed[0];
    return {
      ...base, kind: "auto_signed", subject: "The director signed sponsors",
      preview: first ? `${first.company.name}: ${formatEurosText(first.annual)} a season${args.signed.length > 1 ? ` (+${args.signed.length - 1})` : ""}` : "",
      signed: args.signed.map((c) => ({ slot: c.slot, company: c.company.name, annual: c.annual, years: c.seasonsLeft })),
    };
  }
  const { bonuses, renewals, left } = args.review;
  const paid = bonuses.reduce((t, b) => t + b.amount, 0);
  return {
    ...base, kind: "season_review", subject: "Sponsors: season review",
    preview: `Bonuses ${formatEurosText(paid)} · ${renewals.length} renewal offer${renewals.length === 1 ? "" : "s"} · ${left.length} left`,
    bonuses: bonuses.map((b) => ({ slot: b.slot, company: b.company.name, amount: b.amount })),
    renewals: renewals.map((r) => ({ slot: r.slot, company: r.company.name, annual: r.annual })),
    left: left.map((l) => ({ slot: l.slot, company: l.company.name, reason: l.reason })),
  };
}
