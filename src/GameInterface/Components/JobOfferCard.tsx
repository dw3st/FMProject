import { useState } from "react";
import { DialogTitle } from "@headlessui/react";
import { useTranslation } from "react-i18next";
import { ClubLogo, squadLogoUrl } from "@/GameInterface/Components/ClubLogo";
import { Modal } from "@/GameInterface/Components/Modal";
import { Button } from "@/GameInterface/ui/Button";
import { objectiveText } from "@/GameInterface/boardText";
import { formatDay } from "@/GameInterface/Dashboard/HomeCards";
import { competitionName } from "@/Domain/world/labels";
import { formatFee } from "@/Domain/money";
import type { JobOffer } from "@/types/jobTypes";
import type { LeagueData } from "@/types/playerTypes";

/**
 * A club's job offer (`.claude/rules/game/jobs.md`): club, league, the board's objective, the
 * starting budget and the squad's expected position, with Accept / Decline. Accepting asks for a
 * confirmation first ("You will leave <club>"), then reloads into the new club.
 */
export function JobOfferCard({
  saveId,
  offer,
  leagues,
  pending,
  currentClubName,
  onAnswered,
}: {
  saveId: string;
  offer: JobOffer;
  leagues: LeagueData[];
  /** Still in `meta.jobOffers` and not expired. */
  pending: boolean;
  /** The club he would leave (null while unemployed). */
  currentClubName: string | null;
  onAnswered?: (status: "declined") => void;
}) {
  const { t, i18n } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [declined, setDeclined] = useState(false);
  const league = competitionName(offer.leagueSlug, leagues, i18n.language) || offer.leagueName;
  const label = "font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground";

  async function answer(accept: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/saves/${saveId}/jobs/${encodeURIComponent(offer.id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accept }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error === "offerClosed" ? t("jobs.closed") : t("jobs.actionFailed"));
        setConfirming(false);
        return;
      }
      if (accept) {
        window.location.href = "/dashboard";
        return;
      }
      setDeclined(true);
      onAnswered?.("declined");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 min-w-0">
        <ClubLogo logoUrl={squadLogoUrl(offer.squadId)} className="w-8 h-8 shrink-0" imgClassName="w-full h-full object-contain" />
        <div className="min-w-0">
          <p className="font-semibold text-foreground m-0 truncate">{offer.clubName}</p>
          <p className="text-sm text-muted-foreground m-0 truncate">{league}</p>
        </div>
      </div>

      <dl className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 m-0">
        <div className="min-w-0">
          <dt className={label}>{t("jobs.objective")}</dt>
          <dd className="m-0 text-sm text-foreground">{offer.objective ? objectiveText(offer.objective, t) : "—"}</dd>
        </div>
        <div className="min-w-0">
          <dt className={label}>{t("jobs.budget")}</dt>
          <dd className="m-0 text-sm text-foreground tabular-nums">
            {formatFee(Math.max(0, offer.budget - (offer.compensation ?? 0)))}
            {(offer.compensation ?? 0) > 0 && (
              <span className="block text-muted-foreground">
                {t("jobs.offer.compensation", { club: currentClubName ?? "", amount: formatFee(offer.compensation ?? 0) })}
              </span>
            )}
          </dd>
        </div>
        {offer.wage !== undefined && (
          <div className="min-w-0">
            <dt className={label}>{t("jobs.offer.wage")}</dt>
            <dd className="m-0 text-sm text-foreground tabular-nums">
              {t("jobs.offer.wageValue", { wage: formatFee(offer.wage) })} · {t("jobs.offer.years", { count: offer.seasons ?? 1 })}
            </dd>
          </div>
        )}
        <div className="min-w-0">
          <dt className={label}>{t("jobs.squadStrength")}</dt>
          <dd className="m-0 text-sm text-foreground tabular-nums">
            {t("jobs.expectedPosition", { position: offer.expectedPosition, size: offer.leagueSize })}
          </dd>
        </div>
      </dl>

      {declined ? (
        <p className="text-sm text-muted-foreground m-0">{t("jobs.declined")}</p>
      ) : pending ? (
        <div className="flex flex-wrap items-center gap-4">
          <Button disabled={busy} onClick={() => setConfirming(true)}>{t("jobs.accept")}</Button>
          <Button variant="secondary" disabled={busy} onClick={() => void answer(false)}>{t("jobs.decline")}</Button>
          <span className="text-sm text-muted-foreground tabular-nums">
            {t("jobs.validUntil", { date: formatDay(offer.expires, i18n.language, "year") })}
          </span>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground m-0">{t("jobs.closed")}</p>
      )}
      {error && <p className="text-sm text-destructive m-0">{error}</p>}

      <Modal open={confirming} onClose={() => !busy && setConfirming(false)} size="sm">
        <div className="p-6 space-y-4">
          <DialogTitle as="h2" className="font-display font-black uppercase text-xl leading-none m-0">{t("jobs.confirmTitle")}</DialogTitle>
          <p className="text-sm text-foreground m-0">
            {currentClubName
              ? t("jobs.confirmLeave", { from: currentClubName, to: offer.clubName })
              : t("jobs.confirmTake", { to: offer.clubName })}
          </p>
          <div className="flex justify-end gap-4">
            <Button variant="secondary" disabled={busy} onClick={() => setConfirming(false)}>{t("common.cancel")}</Button>
            <Button disabled={busy} onClick={() => void answer(true)}>{busy ? t("jobs.switching") : t("jobs.confirm")}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
