import { useTranslation } from "react-i18next";
import { OptionChips } from "@/GameInterface/ui/OptionChips";
import { Button } from "@/GameInterface/ui/Button";
import { PitchSurfaceSvg } from "@/GameInterface/Components/PitchSurfaceSvg";
import { MOWING_PATTERNS, TURF_TYPES } from "@/Domain/facilities/turf";
import { FACILITIES } from "@/Domain/facilities/facilityConfig";
import { formatFee } from "@/Domain/money";
import type { FacilitiesViewData } from "@/GameInterface/Facilities/facilitiesApi";
import type { FacilityRequest, MowingPattern } from "@/types/facilityTypes";

/** Club screen: the stadium pitch's grass and mowing, and the turf works (spec 2026-10-16-pitch-types §4). */
export function TurfCard({ data, pending, onAsk, onMowing }: {
  data: FacilitiesViewData;
  pending: boolean;
  onAsk: (req: FacilityRequest) => void;
  onMowing: (m: MowingPattern) => void;
}) {
  const { t } = useTranslation();
  const pitch = data.items.find((i) => i.id === "stadiumPitch");
  const condition = Math.round(pitch?.condition ?? 100);
  const stadiumBusy = (data.busyGroups ?? []).includes("stadium");
  return (
    <section className="card-arcade rounded-md p-4 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-display font-black uppercase text-xl leading-none m-0">{t("facilities.turf.title")}</h3>
        <span className={`text-sm tabular-nums ${condition < FACILITIES.WEAR.WARN_BELOW ? "text-destructive" : "text-muted-foreground"}`}>
          {t(`facilities.turf.type.${data.turf}`)} · {t("facilities.turf.condition", { pct: condition })}
        </span>
      </div>
      <div className="flex flex-col sm:flex-row gap-4">
        <PitchSurfaceSvg condition={condition} turf={data.turf} mowing={data.mowing} seed="club" className="w-full sm:w-56 h-auto rounded border border-border" />
        <div className="flex flex-col gap-3 min-w-0">
          <p className="text-sm text-muted-foreground m-0">{t(`facilities.turf.about.${data.turf}`)}</p>
          <div className="flex flex-col gap-1">
            <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground">{t("facilities.mowing.label")}</span>
            <OptionChips
              options={MOWING_PATTERNS.map((m) => ({ key: m, label: t(`facilities.mowing.${m}`) }))}
              value={data.mowing}
              onChange={onMowing}
            />
          </div>
        </div>
      </div>
      <div className="border-t border-border pt-4 flex flex-col gap-3">
        <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground">{t("facilities.turf.change")}</span>
        {TURF_TYPES.filter((tp) => tp !== data.turf).map((tp) => {
          const q = data.turfQuotes[tp];
          return (
            <div key={tp} className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-semibold">{t(`facilities.turf.type.${tp}`)}</div>
                <div className="text-sm text-muted-foreground">{t(`facilities.turf.about.${tp}`)}</div>
                {q && (
                  <div className="text-sm tabular-nums text-muted-foreground">
                    {formatFee(q.cost)} · {t("facilities.weeks", { count: q.weeks })}
                    {!q.forecast.approved && ` · ${t(`facilities.reason.${q.forecast.reason ?? "no_money"}`)}`}
                  </div>
                )}
              </div>
              <Button disabled={!q || pending || stadiumBusy || !q.forecast.approved} onClick={() => onAsk({ kind: "turf", turf: tp })}>
                {t("facilities.turf.change")}
              </Button>
            </div>
          );
        })}
        {stadiumBusy && <p className="text-sm text-muted-foreground m-0">{t("facilities.groupBusy", { group: t("facilities.items.group.stadium") })}</p>}
      </div>
    </section>
  );
}
