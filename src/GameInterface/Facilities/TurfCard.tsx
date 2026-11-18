import { useTranslation } from "react-i18next";
import { OptionChips } from "@/GameInterface/ui/OptionChips";
import { PitchSurfaceSvg } from "@/GameInterface/Components/PitchSurfaceSvg";
import { MOWING_PATTERNS, TURF_TYPES } from "@/Domain/facilities/turf";
import { FACILITIES } from "@/Domain/facilities/facilityConfig";
import type { FacilitiesViewData } from "@/GameInterface/Facilities/facilitiesApi";
import { BuildActions } from "@/GameInterface/Craft/RecipeLine";
import type { FacilityRequest, MowingPattern } from "@/types/facilityTypes";
import { RunningWorks, runningWorksOf } from "@/GameInterface/Facilities/RunningWorks";

/** Club screen: the stadium pitch's grass and mowing, and the turf works (spec 2026-10-16-pitch-types §4). */
export function TurfCard({ data, ground, pending, onAsk, onMowing }: {
  data: FacilitiesViewData;
  /** The club (home ground): the same painted grass tone as its matches. */
  ground?: string;
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
        <PitchSurfaceSvg condition={condition} turf={data.turf} mowing={data.mowing} seed="club" ground={ground} className="w-full sm:w-56 h-auto rounded border border-border" />
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
            <div key={tp} className="flex flex-col gap-3 rounded-md border border-border p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold">{t(`facilities.turf.type.${tp}`)}</div>
                  <div className="text-sm text-muted-foreground">{t(`facilities.turf.about.${tp}`)}</div>
                </div>
                {q && <span className="text-sm tabular-nums text-muted-foreground">{t("facilities.weeks", { count: q.weeks })}</span>}
              </div>
              {q && (
                <BuildActions
                  build={q.build} stock={data.stock} workshop={data.facilities.craft?.workshop ?? 1}
                  blockedHint={stadiumBusy ? t("facilities.groupBusy", { group: t("facilities.items.group.stadium") }) : null}
                  pending={pending} onBuild={() => onAsk({ kind: "turf", turf: tp })}
                />
              )}
            </div>
          );
        })}
        {stadiumBusy && (() => {
          const running = runningWorksOf(data.facilities.projects, "stadium");
          return running
            ? <RunningWorks project={running} date={data.date} />
            : <p className="text-sm text-muted-foreground m-0">{t("facilities.groupBusy", { group: t("facilities.items.group.stadium") })}</p>;
        })()}
      </div>
    </section>
  );
}
