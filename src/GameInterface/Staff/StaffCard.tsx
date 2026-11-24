import { useTranslation } from "react-i18next";
import { formatWageFull } from "@/Domain/money";
import { StaffStars } from "@/GameInterface/Staff/StaffStars";
import { StaffFace } from "@/GameInterface/Components/PersonFace";
import { contractEnd, dayLabel, type StaffMemberView } from "@/GameInterface/Staff/staffApi";
import { Icon } from "@/GameInterface/Icons";
import { StrongCountry } from "@/GameInterface/Scouting/StrongCountry";

/**
 * One professional of the club, inside his role block (the role is the block's header): name, age, stars,
 * contract and what he does. Click opens the profile.
 */
export function StaffCard({ member, effect, onOpen, clubColors }: { member: StaffMemberView; effect: string; onOpen: () => void; clubColors?: readonly string[] }) {
  const { t } = useTranslation();
  const c = member.contract;
  const leaving = c?.decision === "leave";
  return (
    <button
      type="button"
      onClick={onOpen}
      className="text-left rounded-md border border-border bg-card p-3 flex flex-col gap-2 hover:border-primary transition-colors min-w-0"
    >
      <div className="flex items-center gap-3 w-full min-w-0">
        <StaffFace member={member} clubColors={clubColors} size={40} />
        <div className="min-w-0 flex-1">
          <p className="font-display font-black uppercase text-base leading-none m-0 truncate">{member.name}</p>
          <p className="text-sm text-muted-foreground m-0 mt-1 truncate">{member.nationality} · {t("staff.age", { age: member.age })}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <StaffStars stars={member.stars} />
        {member.trusted && (
          <span className="flex items-center gap-1.5 text-sm text-primary" title={t("staff.trusted.help")}>
            <Icon name="handshake" size={16} />{t("staff.trusted.badge")}
          </span>
        )}
      </div>
      {member.course && (
        <p className="flex items-center gap-1.5 text-sm text-chart-4 m-0" title={t("staff.course.awayHelp")}>
          <Icon name="clock" size={16} />{t("staff.course.away", { until: dayLabel(member.course.until) })}
        </p>
      )}
      {c && (
        <p className="text-sm tabular-nums m-0 text-foreground">
          {t("staff.contractLine", { until: contractEnd(c.until), wage: formatWageFull(c.wage) })}
        </p>
      )}
      {c && leaving && (
        <span className="self-start inline-flex items-center gap-1.5 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-sm text-destructive" title={t("staff.leavingHelp")}>
          <Icon name="log-out" size={16} />{t("staff.leavingBadge")}
        </span>
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

/** The free places of a role, as one dashed card: how many, and what an empty role costs. */
export function VacantStaffCard({ free, effect }: { free: number; effect?: string }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-md border border-dashed border-border p-3 flex flex-col gap-2 justify-center min-h-[96px]">
      <p className="font-display font-black uppercase text-base leading-none m-0 text-muted-foreground">
        {t("staff.vacantSlots", { count: free })}
      </p>
      {effect && <p className="text-sm text-destructive m-0">{effect}</p>}
    </div>
  );
}
