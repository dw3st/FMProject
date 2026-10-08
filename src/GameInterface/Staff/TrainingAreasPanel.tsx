import { useTranslation } from "react-i18next";
import { SelectCombobox } from "@/GameInterface/Components/SelectCombobox";
import { SectionTitle } from "@/GameInterface/ui/SectionTitle";
import { TABLE_CELL, TABLE_STYLE } from "@/GameInterface/ui/leagueTableStyle";
import { COACH_AREAS, type CoachArea } from "@/Domain/staff/staffTypes";
import { STAFF_AREAS_PER_COACH } from "@/Domain/staff/staff";
import { STAFF } from "@/Domain/staff/staffConfig";
import { StaffStars } from "@/GameInterface/Staff/StaffStars";
import { formatEffect, type StaffData } from "@/GameInterface/Staff/staffApi";

const AUTO = "__auto";
/** Screen order of the seven areas. */
const AREA_ORDER = ["goalkeeping", "defending", "shooting", "technical", "passing", "physical", "setPieces"] as const;

const isCoachArea = (a: string): a is CoachArea => (COACH_AREAS as readonly string[]).includes(a);

/**
 * The seven training areas (`.claude/rules/game/development.md` → "Áreas de treino"): who leads
 * each one, his stars and the multiplier on that area's growth. The five field areas take an area
 * coach (`PUT /staff/areas`; "Automatic" lets the club pick the best free one).
 */
export function TrainingAreasPanel({
  data, busy, onAssign,
}: {
  data: StaffData;
  busy: boolean;
  onAssign: (area: CoachArea, memberId: string | null) => void;
}) {
  const { t, i18n } = useTranslation();
  const coaches = data.members.filter((m) => m.role === "coach");
  const nameOf = (id: string | undefined) => data.members.find((m) => m.id === id)?.name ?? "";
  const byArea = new Map(data.areas.map((a) => [a.area, a]));
  // Manual areas per coach: a coach already leading two by hand cannot take a third.
  const manualLoad = new Map<string, number>();
  for (const id of Object.values(data.areaAssignments)) if (id) manualLoad.set(id, (manualLoad.get(id) ?? 0) + 1);

  return (
    <section className="flex flex-col gap-3">
      <SectionTitle>{t("staff.areasTitle")}</SectionTitle>
      <p className="text-sm text-muted-foreground m-0">{t("staff.areasSubtitle", { pct: Math.round((1 - STAFF.AREA_VACANT_MULT) * 100) })}</p>
      <div className={TABLE_STYLE.shell}>
        <table className="w-full">
          <thead className={TABLE_STYLE.head}>
            <tr>
              <th className={`${TABLE_CELL.head} text-left`}>{t("staff.areaCol")}</th>
              <th className={`${TABLE_CELL.head} text-left`}>{t("staff.leaderCol")}</th>
              <th className={`${TABLE_CELL.head} text-left`}>{t("staff.starsCol")}</th>
              <th className={`${TABLE_CELL.head} text-center`}>{t("staff.multCol")}</th>
            </tr>
          </thead>
          <tbody className={TABLE_STYLE.body}>
            {AREA_ORDER.map((area) => {
              const view = byArea.get(area);
              const vacant = !view || view.stars === null;
              const manual = isCoachArea(area) ? data.areaAssignments[area] : undefined;
              return (
                <tr key={area} className={TABLE_STYLE.row}>
                  <td className={`${TABLE_CELL.body} ${TABLE_STYLE.name}`}>{t(`staff.area.${area}`)}</td>
                  <td className={`${TABLE_CELL.body} text-sm`}>
                    {isCoachArea(area) && coaches.length > 0 ? (
                      <SelectCombobox<string>
                        className="min-w-48"
                        value={manual ?? AUTO}
                        disabled={busy}
                        onChange={(v) => onAssign(area, v === AUTO ? null : v)}
                        options={[
                          {
                            value: AUTO,
                            label: !manual && view?.memberId
                              ? t("staff.autoWith", { name: nameOf(view.memberId) })
                              : t("staff.auto"),
                          },
                          ...coaches.map((c) => {
                            const full = c.id !== manual && (manualLoad.get(c.id) ?? 0) >= STAFF_AREAS_PER_COACH;
                            return {
                              value: c.id,
                              label: full ? t("staff.coachFull", { name: c.name, n: STAFF_AREAS_PER_COACH }) : c.name,
                              disabled: full,
                            };
                          }),
                        ]}
                      />
                    ) : (
                      <span className={vacant ? "text-muted-foreground" : "text-foreground"}>
                        {vacant ? t("staff.nobody") : nameOf(view?.memberId)}
                      </span>
                    )}
                  </td>
                  <td className={TABLE_CELL.body}><StaffStars stars={vacant ? null : view!.stars} /></td>
                  <td className={`${TABLE_CELL.body} ${vacant ? "text-center font-black font-display text-destructive tabular-nums" : TABLE_STYLE.key}`}>
                    {view ? formatEffect(view.mult, i18n.language, t("staff.noEffect")) : ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
