import { useState } from "react";
import { useTranslation } from "react-i18next";
import { formatEuros } from "@/Domain/money";
import { Button } from "@/GameInterface/ui/Button";
import { Notice } from "@/GameInterface/ui/Notice";
import { SectionTitle } from "@/GameInterface/ui/SectionTitle";
import { StaffFace } from "@/GameInterface/Components/PersonFace";
import { StaffStars } from "@/GameInterface/Staff/StaffStars";
import { ConfirmDialog } from "@/GameInterface/Components/ConfirmDialog";
import { navigate } from "@/GameInterface/router/navigation";
import { TRUSTED } from "@/Domain/staff/trustedStaff";

export interface YouthCoachCardData {
  id: string;
  name: string;
  age: number;
  nationality?: string;
  stars: number;
  until?: string;
  courseUntil?: string;
  coursePrice: number | null;
  /** The responsibility is his (Staff → Responsibilities). */
  responsibility: boolean;
  /** He runs the academy now (responsibility and at work). */
  inCharge: boolean;
  week: { u21: number; u19: number; intensity: string | null; focused: number };
  picks: { id: string; reason: "ready" | "lastYear" }[];
}

/** The youth coach on top of the academy tab (report 2026-11-16): who he is, what he did, his picks, a course. */
export function YouthCoachCard({ saveId, card, names, clubColors, onChanged }: {
  saveId: string;
  card: YouthCoachCardData | null;
  /** Academy player names by id, for the picks. */
  names: Record<string, string>;
  clubColors?: readonly string[];
  onChanged: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const day = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(i18n.language, { day: "2-digit", month: "2-digit", year: "numeric" });

  if (!card) {
    return (
      <section className="flex flex-col gap-2">
        <SectionTitle>{t("youthCoach.card.title")}</SectionTitle>
        <div className="flex flex-wrap items-center gap-4">
          <p className="text-sm text-muted-foreground m-0">{t("youthCoach.card.none")}</p>
          <Button variant="secondary" onClick={() => navigate("/transfers?tab=staff&role=youthCoach")}>{t("youthCoach.card.find")}</Button>
        </div>
      </section>
    );
  }

  async function sendOnCourse() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/saves/${saveId}/staff/course`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ memberId: card!.id }),
    }).catch(() => null);
    setBusy(false);
    setConfirm(false);
    if (res?.ok) { onChanged(); return; }
    const body = (await res?.json().catch(() => ({}))) as { error?: string } | undefined;
    setError(t(`staff.errors.${body?.error ?? "generic"}`, { defaultValue: t("staff.errors.generic") }));
  }

  const status = card.courseUntil
    ? t("youthCoach.card.onCourse", { until: day(card.courseUntil) })
    : card.inCharge ? t("youthCoach.card.inCharge") : t("youthCoach.card.manager");
  const week = card.inCharge
    ? [
        t("youthCoach.card.calls", { u21: card.week.u21, u19: card.week.u19 }),
        ...(card.week.intensity ? [t("youthCoach.card.intensity", { intensity: t(`youth.training.intensities.${card.week.intensity}`) })] : []),
        ...(card.week.focused > 0 ? [t("youthCoach.card.focused", { count: card.week.focused })] : []),
      ]
    : [];

  return (
    <section className="flex flex-col gap-3">
      <SectionTitle>{t("youthCoach.card.title")}</SectionTitle>
      <div className="flex flex-wrap items-start gap-4 rounded-md border border-border p-4">
        <StaffFace member={card} clubColors={clubColors} size={48} />
        <div className="flex flex-col gap-1 min-w-0 flex-1">
          <span className="inline-flex flex-wrap items-center gap-3">
            <span className="font-semibold">{card.name}</span>
            <StaffStars stars={card.stars} />
            {card.until && <span className="text-sm text-muted-foreground tabular-nums">{t("youthCoach.card.until", { until: day(card.until) })}</span>}
          </span>
          <p className="text-sm m-0">
            {status}
            {!card.responsibility && !card.courseUntil && (
              <> <a href="/staff?tab=responsibilities" className="text-primary hover:underline">{t("youthCoach.card.handOver")}</a></>
            )}
          </p>
          {week.length > 0 && <p className="text-sm text-muted-foreground m-0">{t("youthCoach.card.week")}: {week.join(" · ")}</p>}
          {card.picks.length > 0 && (
            <p className="text-sm m-0">
              <span className="text-muted-foreground">{t("youthCoach.card.picks")}: </span>
              {card.picks.map((p) => `${names[p.id] ?? p.id} (${t(`youthCoach.card.pick.${p.reason}`)})`).join(", ")}
            </p>
          )}
          {card.inCharge && card.picks.length === 0 && <p className="text-sm text-muted-foreground m-0">{t("youthCoach.card.noPicks")}</p>}
        </div>
        {!card.courseUntil && (
          <div className="flex flex-col items-end gap-1">
            {card.coursePrice === null
              ? <span className="text-sm text-muted-foreground">{t("staff.course.atBest")}</span>
              : (
                <>
                  <span className="text-sm text-muted-foreground tabular-nums">{t("youthCoach.card.course", { days: TRUSTED.COURSE_DAYS, price: formatEuros(card.coursePrice) })}</span>
                  <Button variant="secondary" disabled={busy} onClick={() => setConfirm(true)}>{t("staff.course.send")}</Button>
                </>
              )}
          </div>
        )}
      </div>
      {error && <Notice kind="error">{error}</Notice>}
      <ConfirmDialog
        open={confirm}
        title={t("staff.course.confirmTitle", { name: card.name })}
        body={t("staff.course.confirmBody", { days: TRUSTED.COURSE_DAYS, price: formatEuros(card.coursePrice ?? 0) })}
        confirmLabel={t("staff.course.send")}
        onConfirm={() => void sendOnCourse()}
        onClose={() => setConfirm(false)}
        busy={busy}
      />
    </section>
  );
}
