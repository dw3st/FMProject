import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatEuros } from "@/Domain/money";
import { FOUNDED } from "@/Domain/ownClub/ownClubConfig";
import { Label } from "@/GameInterface/ui/Label";
import { StepperField } from "@/GameInterface/ui/StepperField";
import { fetchPresident, setTicketPrice, type TicketProjection } from "@/GameInterface/OwnClub/ownClubApi";

const round1 = (v: number) => Math.round(v * 10) / 10;

/** The president's ticket price (`.claude/rules/game/own-club.md`): 0.5x to 2.0x, saved on change. Nothing for anyone else. */
export function TicketPriceControl({ saveId }: { saveId: string }) {
  const { t, i18n } = useTranslation();
  const [mult, setMult] = useState<number | null>(null);
  const [projection, setProjection] = useState<TicketProjection | null>(null);
  const [error, setError] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    let alive = true;
    void fetchPresident(saveId).then((r) => {
      if (!alive || !r.ok || !r.data.president) return;
      setMult(r.data.mult);
      setProjection(r.data.projection);
    });
    return () => { alive = false; };
  }, [saveId]);

  if (mult === null) return null;

  const change = (v: number) => {
    const next = round1(Math.min(FOUNDED.PRICE_MAX, Math.max(FOUNDED.PRICE_MIN, v)));
    setMult(next);
    setError(false);
    const n = ++seq.current;
    void setTicketPrice(saveId, next).then((r) => {
      if (n !== seq.current) return;
      if (r.ok) setProjection(r.data.projection);
      else setError(true);
    });
  };
  const nf = (n: number) => Math.round(n).toLocaleString(i18n.language);
  const format = (v: number) => `${v.toLocaleString(i18n.language, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}x`;
  const parse = (s: string) => {
    const n = Number.parseFloat(s.trim().replace(",", ".").replace(/x$/i, ""));
    return Number.isFinite(n) ? round1(n) : null;
  };

  return (
    <section className="card-arcade rounded-md p-4 flex flex-wrap items-center gap-6">
      <div className="flex flex-col gap-2">
        <Label>{t("ownClub.ticket.label")}</Label>
        <StepperField
          value={mult}
          onChange={change}
          step={(v, dir) => round1(v + dir * FOUNDED.PRICE_STEP)}
          min={FOUNDED.PRICE_MIN}
          max={FOUNDED.PRICE_MAX}
          format={format}
          parse={parse}
          downLabel={t("ownClub.ticket.down")}
          upLabel={t("ownClub.ticket.up")}
          ariaLabel={t("ownClub.ticket.label")}
        />
      </div>
      {projection && (
        <div className="flex gap-6 tabular-nums">
          <div className="flex flex-col gap-1">
            <Label>{t("ownClub.ticket.attendance")}</Label>
            <span className="font-display font-bold text-xl leading-none">{nf(projection.attendance)}<span className="text-sm text-muted-foreground font-sans font-normal"> / {nf(projection.capacity)}</span></span>
          </div>
          <div className="flex flex-col gap-1">
            <Label>{t("ownClub.ticket.gate")}</Label>
            <span className="font-display font-bold text-xl leading-none text-primary">{formatEuros(projection.gate)}</span>
          </div>
        </div>
      )}
      <p className="text-sm text-muted-foreground m-0 basis-full">{error ? t("ownClub.errors.generic") : t("ownClub.ticket.hint")}</p>
    </section>
  );
}
