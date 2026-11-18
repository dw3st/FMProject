// The first sponsors (tester report 2026-11-18: a new player could miss them). While the master or the kit slot is
// empty with offers on the table, the dashboard opens this window and it only closes once both are signed; the
// director can pick for him (the best fixed amount of each slot). The boards can wait: the director signs them later.
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "@/GameInterface/Components/Modal";
import { Button } from "@/GameInterface/ui/Button";
import { SponsorsPanel } from "@/GameInterface/Sponsors/SponsorsPanel";
import { answerSponsorOffer } from "@/GameInterface/Sponsors/sponsorsApi";
import type { ClubSponsors, SponsorSlot, SponsorsView } from "@/types/sponsorTypes";

const REQUIRED: readonly SponsorSlot[] = ["master", "kit"];

/** The required slots still free with offers on the table, from the squad's record. */
export function sponsorChoicePending(sponsors: ClubSponsors | undefined): boolean {
  if (!sponsors) return false;
  return REQUIRED.some((slot) => !sponsors.contracts.some((c) => c.slot === slot) && sponsors.offers.some((o) => o.slot === slot));
}

function freeRequired(view: SponsorsView): SponsorSlot[] {
  return REQUIRED.filter((slot) => !view.contracts.some((c) => c.slot === slot) && view.offers.some((o) => o.slot === slot));
}

export function SponsorChoiceModal({ saveId, sponsors, onDone }: { saveId: string; sponsors: ClubSponsors | undefined; onDone: () => void }) {
  const { t } = useTranslation();
  const [open] = useState(() => sponsorChoicePending(sponsors));
  const [closed, setClosed] = useState(false);
  const [view, setView] = useState<SponsorsView | null>(null);
  const [busy, setBusy] = useState(false);
  const [panelKey, setPanelKey] = useState(0);
  const onView = useCallback((v: SponsorsView) => setView(v), []);
  const missing = view ? freeRequired(view) : REQUIRED.slice();
  const done = view !== null && missing.length === 0;

  async function directorPicks() {
    if (!view) return;
    setBusy(true);
    for (const slot of freeRequired(view)) {
      const best = [...view.offers.filter((o) => o.slot === slot)].sort((a, b) => b.annual - a.annual)[0];
      if (best) await answerSponsorOffer(saveId, best.id, "accept");
    }
    setBusy(false);
    setPanelKey((k) => k + 1);
  }

  function finish() {
    setClosed(true);
    onDone();
  }

  return (
    <Modal open={open && !closed} onClose={() => { if (done) finish(); }} size="report" panelClassName="max-h-[92vh] overflow-y-auto">
      <div className="p-5 flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <h2 className="font-display font-black uppercase text-xl leading-none m-0">{t("sponsors.choice.title")}</h2>
          <p className="text-sm text-muted-foreground m-0">{t("sponsors.choice.hint")}</p>
        </div>
        <SponsorsPanel key={panelKey} saveId={saveId} onView={onView} />
        <div className="sticky bottom-0 -mx-5 -mb-5 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-card px-5 py-4">
          <p className="text-sm text-muted-foreground m-0">
            {done ? t("sponsors.choice.ready") : t("sponsors.choice.missing", { slots: missing.map((s) => t(`sponsors.slot.${s}`)).join(", ") })}
          </p>
          <div className="flex flex-wrap gap-3">
            {!done && (
              <Button variant="secondary" className="border border-border" disabled={busy || !view} onClick={() => void directorPicks()}>
                {t("sponsors.choice.director")}
              </Button>
            )}
            <Button disabled={!done} onClick={finish}>{t("sponsors.choice.continue")}</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
