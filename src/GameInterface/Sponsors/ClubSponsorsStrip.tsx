import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { SponsorPlate } from "@/GameInterface/Sponsors/SponsorPlate";
import { SPONSORS_PANEL_HREF } from "@/GameInterface/Sponsors/sponsorLinks";
import { PLATE_BOX } from "@/GameInterface/Sponsors/sponsorPlateStyle";
import { fetchSponsors } from "@/GameInterface/Sponsors/sponsorsApi";
import type { SponsorSlot, SponsorsView } from "@/types/sponsorTypes";

const LABEL = "font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground m-0";
const SLOT_ORDER: readonly SponsorSlot[] = ["master", "kit", "board"];

/** The places of the club in strip order: each slot's contracts first, then its free places. */
export function stripPlaces(view: Pick<SponsorsView, "slots" | "contracts">): { slot: SponsorSlot; contract: SponsorsView["contracts"][number] | null }[] {
  return SLOT_ORDER.flatMap((slot) => {
    const count = view.slots.find((s) => s.slot === slot)?.count ?? 0;
    const signed = view.contracts.filter((c) => c.slot === slot).slice(0, count);
    return Array.from({ length: count }, (_, i) => ({ slot, contract: signed[i] ?? null }));
  });
}

/**
 * The club's own sponsors at the top of the Club tab (12.1, `.claude/rules/game/sponsors.md`): the master plate, the
 * kit supplier and the four boards, each a link to the company's page; a free place is a dashed plate. Nothing while
 * it loads or without a club.
 */
export function ClubSponsorsStrip({ saveId }: { saveId: string }) {
  const { t } = useTranslation();
  const [view, setView] = useState<SponsorsView | null>(null);

  useEffect(() => {
    let alive = true;
    setView(null);
    void fetchSponsors(saveId).then((r) => { if (alive && r.ok) setView(r.view); });
    return () => { alive = false; };
  }, [saveId]);

  if (!view) return null;
  return (
    <section className="rounded-md border border-border bg-card px-4 py-3 flex flex-col gap-3" aria-label={t("sponsors.strip.title")}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className={LABEL}>{t("sponsors.strip.title")}</p>
        <a href={SPONSORS_PANEL_HREF} className="text-sm font-semibold text-primary no-underline hover:underline">{t("sponsors.strip.open")}</a>
      </div>
      {!view.active ? (
        <p className="text-sm text-muted-foreground m-0">{t("sponsors.inactive")}</p>
      ) : (
        <div className="flex flex-wrap gap-x-4 gap-y-3">
          {stripPlaces(view).map((place, i) => (
            <div key={place.contract?.id ?? `${place.slot}${i}`} className="flex flex-col gap-1 min-w-0">
              <p className={LABEL}>{t(`sponsors.strip.slot.${place.slot}`)}</p>
              {place.contract ? (
                <SponsorPlate company={place.contract.company} size="sm" linked />
              ) : (
                <a
                  href={SPONSORS_PANEL_HREF}
                  className={`inline-flex items-center justify-center rounded border border-dashed border-border text-sm text-muted-foreground no-underline hover:border-primary hover:text-foreground ${PLATE_BOX.sm.box}`}
                >
                  {t("sponsors.strip.free")}
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
