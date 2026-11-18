import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { StaffRole } from "@/Domain/staff/staffTypes";
import { Icon } from "@/GameInterface/Icons";
import { dayLabel, ROLE_ICON, type StaffData } from "@/GameInterface/Staff/staffApi";
import { navigate } from "@/GameInterface/router/navigation";

const ACTION = "inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border bg-card text-sm font-semibold text-foreground hover:border-primary disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer";

/**
 * One role of the staff (`.claude/rules/game/staff.md`): icon, name, "N de M vagas", the search for a free place
 * or, at the limit, the request of one more place to the board; the professionals below.
 */
export function StaffRoleBlock({ role, tone, limit, busy, onAsk, wide, children }: {
  role: StaffRole;
  tone: string;
  limit: StaffData["limits"][StaffRole];
  busy: boolean;
  onAsk: (role: StaffRole) => void;
  /** Several places: the block spans the row and lays the cards side by side. */
  wide: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const req = limit.request;
  const full = limit.used >= limit.max;
  return (
    <section className="rounded-md border border-border p-3 flex flex-col gap-3 h-full">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className={`flex items-center justify-center w-9 h-9 rounded-md bg-secondary/40 shrink-0 ${tone}`} aria-hidden>
          <Icon name={ROLE_ICON[role]} size={18} />
        </span>
        <div className="min-w-[9rem] flex-1">
          <h3 className="font-display font-bold uppercase text-base leading-none m-0 truncate">{t(`staff.roles.${role}`)}</h3>
          <p className={`text-sm m-0 mt-1 tabular-nums ${full ? "text-muted-foreground" : "text-chart-4"}`}>
            {t("staff.slots", { used: limit.used, max: limit.max })}
            {req && req.extra > 0 ? ` · ${t("staff.slotRequest.granted", { count: req.extra })}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!full && (
            <button type="button" className={ACTION} onClick={() => { navigate(`/transfers?tab=staff&role=${role}`); }}>
              <Icon name="search" size={16} />{t("staff.search")}
            </button>
          )}
          {full && req?.canAsk && (
            <button type="button" className={ACTION} disabled={busy} onClick={() => onAsk(role)} title={t("staff.slotRequest.help")}>
              <Icon name="user-plus" size={16} />{t("staff.slotRequest.ask")}
            </button>
          )}
          {full && req?.blocked === "cooldown" && req.cooldownUntil && (
            <span className="text-sm text-muted-foreground tabular-nums" title={t("staff.slotRequest.help")}>
              {t("staff.slotRequest.cooldown", { date: dayLabel(req.cooldownUntil) })}
            </span>
          )}
          {full && req?.blocked === "max_reached" && (
            <span className="text-sm text-muted-foreground">{t("staff.slotRequest.maxReached")}</span>
          )}
        </div>
      </header>
      <div className={`grid gap-3 ${wide ? "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5" : ""}`}>{children}</div>
    </section>
  );
}
