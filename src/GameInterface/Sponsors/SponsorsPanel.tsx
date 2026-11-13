import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatEuros } from "@/Domain/money";
import { Button } from "@/GameInterface/ui/Button";
import { SectionTitle } from "@/GameInterface/ui/SectionTitle";
import { Icon } from "@/GameInterface/Icons";
import { formatGameDate } from "@/GameInterface/formatDate";
import { SponsorPlate } from "@/GameInterface/Sponsors/SponsorPlate";
import { answerSponsorOffer, fetchSponsors, sponsorErrorKey } from "@/GameInterface/Sponsors/sponsorsApi";
import { perSeason, sponsorGoalText, sponsorProgressText, sponsorProgressTone } from "@/GameInterface/Sponsors/sponsorText";
import type { SponsorGoal, SponsorGoalProgress, SponsorOfferAction, SponsorSlot, SponsorsView } from "@/types/sponsorTypes";

const LABEL = "font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground";
const BADGE = "inline-flex items-center rounded px-2 py-0.5 text-sm bg-secondary/40 text-foreground whitespace-nowrap";
const TONE = { met: "text-chart-2", missed: "text-destructive", unknown: "text-muted-foreground" } as const;

type Contract = SponsorsView["contracts"][number];
type Offer = SponsorsView["offers"][number];
type SlotInfo = SponsorsView["slots"][number];

function Figure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0">
      <p className={`${LABEL} m-0`}>{label}</p>
      <p className="font-display font-bold tabular-nums text-2xl leading-tight m-0 text-foreground">{value}</p>
      {hint && <p className="text-sm text-muted-foreground m-0">{hint}</p>}
    </div>
  );
}

function Term({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className={LABEL}>{label}</dt>
      <dd className="m-0 text-sm text-foreground tabular-nums">{children}</dd>
    </div>
  );
}

/** The goal in words with where it stands today. */
function GoalLine({ goal, progress }: { goal: SponsorGoal; progress: SponsorGoalProgress }) {
  const { t, i18n } = useTranslation();
  return (
    <>
      <span className="block">{sponsorGoalText(goal, t, i18n.language)}</span>
      <span className={`block ${TONE[sponsorProgressTone(progress)]}`}>{sponsorProgressText(goal, progress, t, i18n.language)}</span>
    </>
  );
}

function ContractCard({ contract }: { contract: Contract }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-md border border-border bg-card p-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <SponsorPlate company={contract.company} size="md" />
        <div className="flex flex-wrap gap-1.5">
          <span className={BADGE}>{t(`sponsors.profile.${contract.profile}`)}</span>
          {contract.auto && <span className={BADGE}>{t("sponsors.badge.auto")}</span>}
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 m-0">
        <Term label={t("sponsors.annual")}>
          <span className="font-display font-bold tabular-nums text-lg text-primary">{formatEuros(contract.annual)}</span>
          <span className="block tabular-nums text-muted-foreground">{t("sponsors.perWeek", { value: formatEuros(Math.round(contract.annual / 52)) })}</span>
        </Term>
        <Term label={t("sponsors.bonus")}><span className="tabular-nums">{formatEuros(contract.bonus)}</span></Term>
        <Term label={t("sponsors.goalLabel")}><GoalLine goal={contract.goal} progress={contract.progress} /></Term>
        <Term label={t("sponsors.seasonsLeft")}>{t("sponsors.seasons", { count: contract.seasonsLeft })}</Term>
      </dl>
    </div>
  );
}

function OfferCard({ offer, busy, onAction }: {
  offer: Offer; busy: boolean; onAction: (offer: Offer, action: SponsorOfferAction) => void;
}) {
  const { t, i18n } = useTranslation();
  return (
    <div className="rounded-md border border-border bg-card p-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <SponsorPlate company={offer.company} size="md" />
        <div className="flex flex-wrap gap-1.5">
          <span className={BADGE} title={t(`sponsors.profileHint.${offer.profile}`)}>{t(`sponsors.profile.${offer.profile}`)}</span>
          {offer.renewal && <span className={`${BADGE} text-primary`}>{t("sponsors.badge.renewal")}</span>}
          {offer.negotiated && <span className={BADGE}>{t("sponsors.badge.negotiated")}</span>}
        </div>
      </div>
      <p className="text-sm text-muted-foreground m-0">{t(`sponsors.profileHint.${offer.profile}`)}</p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 m-0">
        <Term label={t("sponsors.annual")}>
          <span className="font-display font-bold tabular-nums text-lg text-primary">{formatEuros(offer.annual)}</span>
        </Term>
        <Term label={t("sponsors.bonus")}><span className="tabular-nums">{formatEuros(offer.bonus)}</span></Term>
        <Term label={t("sponsors.goalLabel")}><GoalLine goal={offer.goal} progress={offer.progress} /></Term>
        <Term label={t("sponsors.years")}>
          {t("sponsors.seasons", { count: offer.years })}
          <span className="block text-muted-foreground">{t("sponsors.expires", { date: formatGameDate(offer.expires, i18n.language) })}</span>
        </Term>
      </dl>
      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={busy} onClick={() => onAction(offer, "accept")}>{t("sponsors.action.accept")}</Button>
        <Button
          variant="secondary"
          className="border border-border"
          disabled={busy || !!offer.negotiated}
          title={offer.negotiated ? t("sponsors.badge.negotiated") : t("sponsors.negotiateHint")}
          onClick={() => onAction(offer, "negotiate")}
        >
          {t("sponsors.action.negotiate")}
        </Button>
        <Button variant="danger" disabled={busy} onClick={() => onAction(offer, "decline")}>{t("sponsors.action.decline")}</Button>
      </div>
    </div>
  );
}

function SlotSection({ slot, view, busy, onAction }: {
  slot: SlotInfo; view: SponsorsView; busy: boolean; onAction: (offer: Offer, action: SponsorOfferAction) => void;
}) {
  const { t } = useTranslation();
  const contracts = view.contracts.filter((c) => c.slot === slot.slot);
  const offers = view.offers.filter((o) => o.slot === slot.slot);
  const free = Math.max(0, slot.count - slot.filled);
  const share = Math.round(slot.share * 1000) / 10;
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <SectionTitle>{t(`sponsors.slot.${slot.slot}`)}</SectionTitle>
        <span className="text-sm text-muted-foreground tabular-nums">
          {t("sponsors.filled", { filled: slot.filled, count: slot.count })}
          {" · "}
          {t(slot.count > 1 ? "sponsors.shareEach" : "sponsors.share", { pct: share })}
        </span>
      </div>
      {contracts.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {contracts.map((c) => <ContractCard key={c.id} contract={c} />)}
        </div>
      )}
      {free > 0 && view.active && (
        <div className="rounded-md border border-dashed border-primary/60 bg-primary/5 p-4 flex flex-col gap-3">
          <div className="flex items-start gap-2">
            <Icon name="handshake" size={18} className="text-primary shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-foreground m-0">{t("sponsors.free", { count: free })}</p>
              <p className="text-sm text-muted-foreground m-0">
                {offers.length > 0 ? t("sponsors.freeWithOffers", { count: offers.length }) : t("sponsors.noOffers")}
              </p>
              {offers.length > 1 && (
                <p className="text-sm text-muted-foreground m-0">{t(slot.count === 1 ? "sponsors.acceptNote" : "sponsors.acceptNoteBoards", { count: slot.count })}</p>
              )}
            </div>
          </div>
          {offers.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
              {offers.map((o) => <OfferCard key={o.id} offer={o} busy={busy} onAction={onAction} />)}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

const SLOT_ORDER: readonly SponsorSlot[] = ["master", "kit", "board"];

/**
 * Finances → Sponsors (`.claude/rules/game/sponsors.md`): the weekly income and the club's appeal, then each slot with
 * its contract or, while it is free, the offers on the table (accept, negotiate once, decline).
 */
export function SponsorsPanel({ saveId, onChanged }: { saveId: string; onChanged?: () => void }) {
  const { t } = useTranslation();
  const [view, setView] = useState<SponsorsView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const load = useCallback(() => {
    let cancelled = false;
    setLoadError(null);
    void fetchSponsors(saveId).then((r) => {
      if (cancelled) return;
      if (r.ok) setView(r.view);
      else setLoadError(t(sponsorErrorKey(r.error, "load")));
    });
    return () => { cancelled = true; };
  }, [saveId, t]);
  useEffect(() => load(), [load]);

  async function act(offer: Offer, action: SponsorOfferAction) {
    setBusy(true);
    setNotice(null);
    const r = await answerSponsorOffer(saveId, offer.id, action);
    setBusy(false);
    if (!r.ok) {
      setNotice({ tone: "error", text: t(sponsorErrorKey(r.error, "action")) });
      // The table may have changed under the screen (an expired offer, a slot filled elsewhere).
      load();
      return;
    }
    setView(r.view);
    const company = offer.company.name;
    const text =
      action === "accept" ? t("sponsors.result.accepted", { company })
      : action === "decline" ? t("sponsors.result.declined", { company })
      : r.negotiation === "raised"
        ? t("sponsors.result.raised", { company, value: perSeason(r.view.offers.find((o) => o.id === offer.id)?.annual ?? offer.annual, t) })
        : t(`sponsors.result.${r.negotiation === "withdrawn" ? "withdrawn" : "kept"}`, { company });
    setNotice({ tone: "ok", text });
    onChanged?.();
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-start gap-2">
        <p className="text-sm text-destructive m-0">{loadError}</p>
        <Button variant="secondary" flush onClick={() => load()}>{t("sponsors.retry")}</Button>
      </div>
    );
  }
  if (!view) return <p className="text-sm text-muted-foreground m-0">{t("sponsors.loading")}</p>;

  const slots = SLOT_ORDER.map((s) => view.slots.find((x) => x.slot === s)).filter((s): s is SlotInfo => !!s);
  const appeal = Math.round((view.appeal - 1) * 100);
  return (
    <div className="flex flex-col gap-6">
      {!view.active && (
        <div className="card-arcade rounded-md p-4 border border-border flex items-start gap-3">
          <Icon name="clock" size={18} className="text-chart-4 shrink-0 mt-0.5" />
          <p className="text-sm text-foreground m-0">{t("sponsors.inactive")}</p>
        </div>
      )}

      <div className="card-arcade rounded-md p-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Figure label={t(view.active ? "sponsors.summary.weekly" : "sponsors.summary.weeklyOld")} value={formatEuros(view.weekly)} />
        <Figure label={t("sponsors.summary.base")} value={formatEuros(view.base)} hint={t("sponsors.summary.baseHint")} />
        <Figure
          label={t("sponsors.summary.appeal")}
          value={`${appeal > 0 ? "+" : appeal < 0 ? "−" : ""}${Math.abs(appeal)}%`}
          hint={t("sponsors.summary.appealHint")}
        />
      </div>

      {notice && (
        <p role="status" className={`text-sm m-0 ${notice.tone === "ok" ? "text-foreground" : "text-destructive"}`}>{notice.text}</p>
      )}

      {slots.map((slot) => <SlotSection key={slot.slot} slot={slot} view={view} busy={busy} onAction={(o, a) => void act(o, a)} />)}
    </div>
  );
}
