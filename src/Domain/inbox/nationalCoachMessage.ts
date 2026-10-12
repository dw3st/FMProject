import type { NationalCoachInboxMessage } from "@/types/inboxTypes";
import type { NationalCoachOffer } from "@/types/nationalTypes";

/** One piece of national-team news for the human manager (Etapa 41b). */
export interface NationalCoachNews {
  kind: NationalCoachInboxMessage["kind"];
  date: string;
  teamId: string;
  nation: string;
  offer?: NationalCoachOffer;
  callUpDate?: string;
  competition?: string;
  met?: boolean;
}

const SUBJECT: Record<NationalCoachNews["kind"], (n: string) => string> = {
  offer: (n) => `${n} offer you their national team`,
  hired: (n) => `You are the new ${n} coach`,
  callup_soon: (n) => `${n}: call-up next week`,
  result: (n) => `${n}: the federation reviews the campaign`,
  sacked: (n) => `${n} sack you`,
  resigned: (n) => `You left ${n}`,
};

/** Inbox message of a piece of news (the screen translates `national.coach.inbox.*`; the subject is the fallback). */
export function buildNationalCoachMessage(n: NationalCoachNews): NationalCoachInboxMessage {
  const suffix = n.offer?.id ?? n.competition ?? n.callUpDate ?? n.teamId;
  return {
    id: `natcoach-${n.kind}-${n.date}-${suffix}`,
    date: n.date,
    createdAt: new Date().toISOString(),
    read: false,
    category: "national_coach",
    kind: n.kind,
    subject: SUBJECT[n.kind](n.nation),
    preview: n.nation,
    teamId: n.teamId,
    nation: n.nation,
    ...(n.offer ? { offer: n.offer } : {}),
    ...(n.callUpDate ? { callUpDate: n.callUpDate } : {}),
    ...(n.competition ? { competition: n.competition } : {}),
    ...(n.met !== undefined ? { met: n.met } : {}),
  };
}
