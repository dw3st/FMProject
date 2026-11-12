import { useTranslation } from "react-i18next";
import { Button } from "@/GameInterface/ui/Button";
import { formatWageFull } from "@/Domain/money";
import type { StaffRole } from "@/Domain/staff/staffTypes";
import { StaffStars } from "@/GameInterface/Staff/StaffStars";
import { StaffFace } from "@/GameInterface/Components/PersonFace";
import { contractEnd, dayLabel, type StaffMemberView } from "@/GameInterface/Staff/staffApi";
import { Icon } from "@/GameInterface/Icons";
import { StrongCountry } from "@/GameInterface/Scouting/StrongCountry";
import { navigate } from "@/GameInterface/router/navigation";

const LABEL = "block font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground";

/** One professional of the club: role, name, age, stars, contract and what he does. Click opens the profile. */
export function StaffCard({ member, effect, onOpen, clubColors }: { member: StaffMemberView; effect: string; onOpen: () => void; clubColors?: readonly string[] }) {
  const { t } = useTranslation();
  const c = member.contract;
  const leaving = c?.decision === "leave";
  return (
    <button
      type="button"
      onClick={onOpen}
      className="text-left rounded-md border border-border bg-card p-4 flex flex-col gap-3 hover:border-primary transition-colors"
    >
      <div className="flex items-start gap-3 w-full">
        <StaffFace member={member} clubColors={clubColors} size={48} />
        <div className="min-w-0">
          <span className={LABEL}>{t(`staff.roles.${member.role}`)}</span>
          <p className="font-display font-black uppercase text-base leading-none m-0 mt-1 truncate">{member.name}</p>
          <p className="text-sm text-muted-foreground m-0 mt-1">{member.nationality} · {t("staff.age", { age: member.age })}</p>
        </div>
      </div>
      <StaffStars stars={member.stars} />
      {member.trusted && (
        <p className="flex items-center gap-1.5 text-sm text-primary m-0" title={t("staff.trusted.help")}>
          <Icon name="handshake" size={16} />{t("staff.trusted.badge")}
        </p>
      )}
      {member.course && (
        <p className="flex items-center gap-1.5 text-sm text-chart-4 m-0" title={t("staff.course.awayHelp")}>
          <Icon name="clock" size={16} />{t("staff.course.away", { until: dayLabel(member.course.until) })}
        </p>
      )}
      {c && (
        <p className={`text-sm tabular-nums m-0 ${leaving ? "text-destructive" : "text-foreground"}`}>
          {t("staff.contractLine", { until: contractEnd(c.until), wage: formatWageFull(c.wage) })}
          {leaving ? ` · ${t("staff.leaving")}` : ""}
        </p>
      )}
      {member.endsInDays !== undefined && !leaving && (
        <p className="flex items-center gap-1.5 text-sm text-chart-4 m-0 tabular-nums">
          <Icon name="alert" size={16} />{t("staff.expiring.card", { days: member.endsInDays })}
        </p>
      )}
      <p className="text-sm text-muted-foreground m-0 tabular-nums" title={t("staff.effectsHelp")}>{effect}</p>
      {member.strongCountry && <StrongCountry country={member.strongCountry.country} k={member.strongCountry.k} />}
    </button>
  );
}

/** Empty slot of a role the club can still fill: dashed card with "Search". */
export function VacantStaffCard({ role, used, max, effect, disabled }: { role: StaffRole; used: number; max: number; effect?: string; disabled?: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-md border border-dashed border-border p-4 flex flex-col gap-3">
      <div>
        <span className={LABEL}>{t(`staff.roles.${role}`)}</span>
        <p className="font-display font-black uppercase text-base leading-none m-0 mt-1 text-muted-foreground">{t("staff.vacant")}</p>
        {max > 1 && <p className="text-sm text-muted-foreground m-0 mt-1 tabular-nums">{t("staff.slotsUsed", { used, max })}</p>}
      </div>
      {effect && <p className="text-sm text-destructive m-0">{effect}</p>}
      <Button
        variant="secondary"
        flush
        disabled={disabled}
        className="self-start"
        onClick={() => { navigate(`/transfers?tab=staff&role=${role}`); }}
      >
        {t("staff.search")}
      </Button>
    </div>
  );
}
