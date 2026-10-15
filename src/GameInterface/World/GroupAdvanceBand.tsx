import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatGameDate } from "@/GameInterface/formatDate";
import { useGroupAdvance } from "@/GameInterface/World/GroupAdvanceProvider";
import { deadlineLeft } from "@/GameInterface/World/groupAdvanceText";
import { groupAdvanceErrorKey } from "@/GameInterface/World/groupAdvanceErrors";
import { Button } from "@/GameInterface/ui/Button";
import type { GroupMemberView } from "@/types/groupAdvanceTypes";

const LABEL = "font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground";

function useNow(ms: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/** The group's date, target, who is missing and the deadline (Painel and league screen). */
export function GroupAdvanceBand() {
  const { t, i18n } = useTranslation();
  const { enabled, view, error, busy, retryAdvance } = useGroupAdvance();
  const now = useNow(60_000);
  if (!enabled || !view) return null;
  const fmt = (d: string | null) => (d ? formatGameDate(d, i18n.language, "dayMonth") : "—");
  const left = deadlineLeft(view.deadlineAt, now);

  let state: string;
  if (view.running) state = t("world.advance.running", { date: fmt(view.currentDate), target: fmt(view.target) });
  else if (view.waitingFor.length > 0) state = t("world.advance.band.waitingFor", { names: view.waitingFor.join(", ") });
  else state = t("world.advance.band.allReady");

  return (
    <section aria-label={t("world.advance.band.title")} className="border border-border rounded-md px-4 py-3 flex flex-wrap items-center gap-x-8 gap-y-2">
      <div>
        <div className={LABEL}>{t("world.advance.band.date")}</div>
        <div className="font-display font-bold tabular-nums text-xl">{fmt(view.currentDate)}</div>
      </div>
      <div>
        <div className={LABEL}>{t("world.advance.band.target")}</div>
        <div className="font-display font-bold tabular-nums text-xl">{fmt(view.target)}</div>
      </div>
      <p className="text-sm m-0 flex-1 min-w-[200px]" role="status">{state}</p>
      {!view.running && view.waitingFor.length > 0 && (
        <p className="text-sm text-muted-foreground m-0 tabular-nums">
          {view.deadlineHours === null
            ? t("world.advance.band.noDeadline")
            : left?.hours != null
              ? t("world.advance.band.deadlineHours", { count: left.hours })
              : left?.minutes != null
                ? t("world.advance.band.deadlineMinutes", { count: left.minutes })
                : t("world.advance.band.deadlineNow")}
        </p>
      )}
      {view.error && !view.running && (
        <div className="basis-full flex flex-wrap items-center gap-x-4 gap-y-2" role="alert">
          <p className="text-sm text-destructive m-0">{t(groupAdvanceErrorKey(view.error))}</p>
          {view.gaveUp ? (
            <>
              <p className="text-sm text-muted-foreground m-0">{t("world.advance.band.gaveUp")}</p>
              <Button onClick={() => void retryAdvance()} disabled={busy}>{t("world.advance.retry")}</Button>
            </>
          ) : view.nextRetryAt ? (
            <p className="text-sm text-muted-foreground m-0 tabular-nums">
              {t("world.advance.band.retryAt", {
                time: new Date(view.nextRetryAt).toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit" }),
              })}
            </p>
          ) : null}
        </div>
      )}
      {error && (
        <p className="text-sm text-destructive m-0 basis-full" role="alert">
          {t("world.advance.band.error", { error: t(groupAdvanceErrorKey(error)) })}
        </p>
      )}
    </section>
  );
}

/** One member's advance status (league screen members list). */
export function MemberAdvanceStatus({ seatId }: { seatId: string }) {
  const { t, i18n } = useTranslation();
  const { view } = useGroupAdvance();
  const m: GroupMemberView | undefined = view?.members.find((x) => x.seatId === seatId);
  if (!m) return null;
  const color = m.status === "ready" ? "text-primary" : m.status === "late" ? "text-destructive" : "text-muted-foreground";
  return (
    <span className={`text-sm font-semibold ${color} tabular-nums whitespace-nowrap`}>
      {t(`world.advance.status.${m.status}`)}
      {m.status === "ready" && m.readyUntil ? ` · ${formatGameDate(m.readyUntil, i18n.language, "dayMonth")}` : ""}
    </span>
  );
}
