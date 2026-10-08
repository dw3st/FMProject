import { useTranslation } from "react-i18next";
import { Button } from "@/GameInterface/ui/Button";
import { formatWageFull } from "@/Domain/money";
import type { StaffRole } from "@/Domain/staff/staffTypes";
import { StaffStars } from "@/GameInterface/Staff/StaffStars";
import { contractEnd, type StaffMemberView } from "@/GameInterface/Staff/staffApi";

const LABEL = "block font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground";

/** One professional of the club: role, name, age, stars, contract and what he does. Click opens the profile. */
export function StaffCard({ member, effect, onOpen }: { member: StaffMemberView; effect: string; onOpen: () => void }) {
  const { t } = useTranslation();
  const c = member.contract;
  const leaving = c?.decision === "leave";
  return (
    <button
      type="button"
      onClick={onOpen}
      className="text-left rounded-md border border-border bg-card p-4 flex flex-col gap-3 hover:border-primary transition-colors"
    >
      <div className="flex items-start justify-between gap-2 w-full">
        <div className="min-w-0">
          <span className={LABEL}>{t(`staff.roles.${member.role}`)}</span>
          <p className="font-display font-black uppercase text-base leading-none m-0 mt-1 truncate">{member.name}</p>
          <p className="text-sm text-muted-foreground m-0 mt-1">{member.nationality} · {t("staff.age", { age: member.age })}</p>
        </div>
      </div>
      <StaffStars stars={member.stars} />
      {c && (
        <p className={`text-sm tabular-nums m-0 ${leaving ? "text-destructive" : "text-foreground"}`}>
          {t("staff.contractLine", { until: contractEnd(c.until), wage: formatWageFull(c.wage) })}
          {leaving ? ` · ${t("staff.leaving")}` : ""}
        </p>
      )}
      <p className="text-sm text-muted-foreground m-0">{effect}</p>
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
        onClick={() => { window.location.href = `/transfers?tab=staff&role=${role}`; }}
      >
        {t("staff.search")}
      </Button>
    </div>
  );
}
