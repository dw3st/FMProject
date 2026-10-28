import { useTranslation } from "react-i18next";
import { projectGroup, projectProgress } from "@/Domain/facilities/facilities";
import type { FacilityGroup, FacilityProject } from "@/types/facilityTypes";
import { formatGameDate } from "@/GameInterface/formatDate";

type TFn = (key: string, opts?: Record<string, unknown>) => string;

/** Short name of a works: "East stand +2,000 seats", "Training ground: gym", "Academy level 4". */
export function projectLabel(p: FacilityProject, t: TFn, nf: (n: number) => string): string {
  if (p.kind === "stand") return t("facilities.projects.stand", { stand: t(`facilities.stand.${p.stand}`), seats: nf(p.seats ?? 0) });
  if (p.item) return t("facilities.projects.item", { what: t(`facilities.kind.${p.kind}`), item: t(`facilities.item.${p.item}`) });
  return t("facilities.projects.level", { what: t(`facilities.kind.${p.kind}`), level: p.level });
}

/** The works that holds the area's slot (a small repair paid now never does). */
export function runningWorksOf(projects: FacilityProject[], group: FacilityGroup): FacilityProject | undefined {
  return projects.find((p) => !p.paidNow && projectGroup(p) === group);
}

/** Progress bar of the works running in an area, shown in the card instead of the "already under way" note. */
export function RunningWorks({ project, date }: { project: FacilityProject; date: string }) {
  const { t, i18n } = useTranslation();
  const nf = (n: number) => Math.round(n).toLocaleString(i18n.language);
  const pct = Math.round(projectProgress(project, date) * 100);
  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground">
          {t("facilities.projects.running")}
        </span>
        <span className="text-sm text-muted-foreground tabular-nums">
          {t("facilities.projects.delivery", { date: formatGameDate(project.end, i18n.language) })}
        </span>
      </div>
      <span className="text-sm font-semibold text-foreground">{projectLabel(project, t, nf)}</span>
      <div className="flex items-center gap-3">
        <div className="h-1.5 bg-border rounded overflow-hidden flex-1 min-w-16">
          <div className="h-full bg-primary rounded" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-sm tabular-nums font-semibold text-foreground w-12 text-right">{pct}%</span>
      </div>
    </div>
  );
}
