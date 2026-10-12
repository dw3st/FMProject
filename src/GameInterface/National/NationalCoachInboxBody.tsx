import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { Button } from "@/GameInterface/ui/Button";
import { Flag } from "@/GameInterface/Components/Flag";
import { formatDay } from "@/GameInterface/Dashboard/HomeCards";
import { formatFee } from "@/Domain/money";
import { nationalCompetitionName, nationalityDisplayName } from "@/Domain/world/labels";
import { nationalityFlagCode } from "@/Domain/world/nationalityFlag";
import type { NationalCoachInboxMessage } from "@/types/inboxTypes";
import type { NationalCoachOffer } from "@/types/nationalTypes";

export const COACH_HREF = "/leagues?tab=national&national=coach";

/** Translated subject of a national-team job message (Etapa 41b). */
export function nationalCoachSubject(m: NationalCoachInboxMessage, t: (k: string, o?: Record<string, unknown>) => string, lang: string): string {
  return t(`nationalCoach.inbox.subject.${m.kind}`, {
    nation: nationalityDisplayName(m.nation, lang, t as never), date: m.callUpDate ? formatDay(m.callUpDate, lang) : "",
  });
}

/** A national team's job offer: rank, wage, validity, Accept / Decline (he keeps his club, no confirmation). */
export function NationalOfferCard({ offer, onDone }: { offer: NationalCoachOffer; onDone?: () => void }) {
  const { t, i18n } = useTranslation();
  const { session, currentDate } = useGameSave();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<"accepted" | "declined" | "closed" | "failed" | null>(null);
  const open = !!currentDate && offer.expires >= currentDate;
  const code = nationalityFlagCode(offer.nation);

  async function answer(accept: boolean) {
    if (!session) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/saves/${session.saveId}/national/coach/offers/${encodeURIComponent(offer.id)}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accept }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setStatus(body.error === "offerClosed" ? "closed" : "failed");
        return;
      }
      setStatus(accept ? "accepted" : "declined");
      onDone?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        {code && <Flag code={code} />}
        <span className="font-semibold">{nationalityDisplayName(offer.nation, i18n.language, t)}</span>
        <span className="text-sm text-muted-foreground tabular-nums">
          {t("nationalCoach.offerLine", { rank: offer.rank, wage: formatFee(offer.wage) })}
        </span>
      </div>
      <p className="text-sm text-muted-foreground m-0">{t("nationalCoach.keepsClub")}</p>
      {status ? (
        <p className={`text-sm m-0 ${status === "failed" || status === "closed" ? "text-destructive" : "text-foreground"}`}>
          {t(`nationalCoach.${status}`)}
          {status === "accepted" && <> <a href={COACH_HREF} className="text-primary font-semibold no-underline hover:underline">{t("nationalCoach.inbox.open")}</a></>}
        </p>
      ) : open ? (
        <div className="flex flex-wrap items-center gap-4">
          <Button disabled={busy} onClick={() => void answer(true)}>{t("nationalCoach.accept")}</Button>
          <Button variant="secondary" disabled={busy} onClick={() => void answer(false)}>{t("nationalCoach.decline")}</Button>
          <span className="text-sm text-muted-foreground tabular-nums">{t("nationalCoach.validUntil", { date: formatDay(offer.expires, i18n.language, "year") })}</span>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground m-0">{t("nationalCoach.closed")}</p>
      )}
    </div>
  );
}

/** Body of a `national_coach` inbox message. */
export function NationalCoachInboxBody({ message }: { message: NationalCoachInboxMessage }) {
  const { t, i18n } = useTranslation();
  const nation = nationalityDisplayName(message.nation, i18n.language, t);
  const competition = message.competition ? nationalCompetitionName(message.competition, i18n.language) ?? message.competition : "";
  const text = message.kind === "result"
    ? t(message.met ? "nationalCoach.inbox.body.resultMet" : "nationalCoach.inbox.body.resultFailed", { competition })
    : t(`nationalCoach.inbox.body.${message.kind}`, { nation, competition, date: message.callUpDate ? formatDay(message.callUpDate, i18n.language) : "" });
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-foreground m-0">{text}</p>
      {message.kind === "offer" && message.offer && <NationalOfferCard offer={message.offer} />}
      {(message.kind === "hired" || message.kind === "callup_soon") && (
        <a href={COACH_HREF} className="text-sm text-primary font-semibold no-underline hover:underline">{t("nationalCoach.inbox.open")}</a>
      )}
    </div>
  );
}
