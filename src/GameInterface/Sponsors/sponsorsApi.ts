import type { SponsorContract, SponsorNegotiation, SponsorOfferAction, SponsorsView } from "@/types/sponsorTypes";

/** Refusals of the sponsor routes that have their own text (`sponsors.error.*`). */
const KNOWN_ERRORS = ["notFound", "slotTaken", "alreadyNegotiated", "noClub", "lobby", "invalidAction"] as const;
type KnownError = typeof KNOWN_ERRORS[number];

/** i18n key of a refusal: its own text, else the generic one of loading / answering. */
export function sponsorErrorKey(error: string | undefined, when: "load" | "action"): string {
  if (error && (KNOWN_ERRORS as readonly string[]).includes(error)) return `sponsors.error.${error as KnownError}`;
  return when === "load" ? "sponsors.error.load" : "sponsors.error.generic";
}

async function errorOf(res: Response): Promise<string | undefined> {
  try {
    const body = (await res.json()) as { error?: unknown };
    return typeof body.error === "string" ? body.error : undefined;
  } catch {
    return undefined;
  }
}

export type SponsorsLoad = { ok: true; view: SponsorsView } | { ok: false; error?: string };

/** `GET /api/saves/:id/sponsors`. */
export async function fetchSponsors(saveId: string): Promise<SponsorsLoad> {
  try {
    const res = await fetch(`/api/saves/${saveId}/sponsors`);
    if (!res.ok) return { ok: false, error: await errorOf(res) };
    return { ok: true, view: (await res.json()) as SponsorsView };
  } catch {
    return { ok: false };
  }
}

export type SponsorAnswer =
  | { ok: true; action: SponsorOfferAction; contract?: SponsorContract; negotiation?: SponsorNegotiation; view: SponsorsView }
  | { ok: false; error?: string };

/** `POST /api/saves/:id/sponsors/offers/:offerId { action }`. */
export async function answerSponsorOffer(saveId: string, offerId: string, action: SponsorOfferAction): Promise<SponsorAnswer> {
  try {
    const res = await fetch(`/api/saves/${saveId}/sponsors/offers/${encodeURIComponent(offerId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (!res.ok) return { ok: false, error: await errorOf(res) };
    return (await res.json()) as SponsorAnswer;
  } catch {
    return { ok: false };
  }
}
