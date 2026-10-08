import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "@/GameInterface/Components/Modal";
import { ConfirmDialog } from "@/GameInterface/Components/ConfirmDialog";
import { Button } from "@/GameInterface/ui/Button";
import { Label } from "@/GameInterface/ui/Label";
import { Notice } from "@/GameInterface/ui/Notice";
import { OptionChips } from "@/GameInterface/ui/OptionChips";
import { SectionTitle } from "@/GameInterface/ui/SectionTitle";
import { StatBar } from "@/GameInterface/ui/StatBar";
import { formatWageFull } from "@/Domain/money";
import { STAFF } from "@/Domain/staff/staffConfig";
import { COACH_AREAS, ROLE_SPECIALTY, type CoachArea, type StaffMember } from "@/Domain/staff/staffTypes";
import { StaffStars } from "@/GameInterface/Staff/StaffStars";
import { contractEnd, staffCall, type StaffData, type StaffMemberView } from "@/GameInterface/Staff/staffApi";

type Years = "1" | "2" | "3";
const GENERAL = ["determination", "discipline", "adaptability", "playerReading"] as const;

export type StaffProfile = StaffMember & {
  stars: number;
  starsByArea?: Partial<Record<CoachArea, number>>;
  askingWage?: number;
} & Pick<StaffMemberView, "severance" | "renewYears" | "renewWage">;

/**
 * Profile of a professional: the five 1..20 attributes, stars per area (area coaches), contract.
 * Club mode renews (1/2/3 years, only what the route accepts) and dismisses (with the severance);
 * pool mode shows the asking wage and hands the hire over to `onHire`.
 */
export function StaffDetailModal({
  saveId, member, mode, onClose, onChanged, onHire,
}: {
  saveId: string;
  member: StaffProfile | null;
  mode: "club" | "pool";
  onClose: () => void;
  onChanged?: (next: StaffData) => void;
  onHire?: () => void;
}) {
  const { t } = useTranslation();
  const [years, setYears] = useState<Years | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmFire, setConfirmFire] = useState(false);

  useEffect(() => {
    setYears(member?.renewYears?.length ? (String(member.renewYears[0]) as Years) : null);
    setError(null);
  }, [member]);

  if (!member) return <Modal open={false} onClose={onClose}>{null}</Modal>;
  const m = member;
  const c = m.contract;
  const knowledge = m.role === "coach"
    ? Math.max(...COACH_AREAS.map((a) => m.attributes.knowledge[a] ?? STAFF.ATTR_MIN))
    : m.attributes.knowledge[ROLE_SPECIALTY[m.role]] ?? STAFF.ATTR_MIN;

  async function renew() {
    if (!years) return;
    setBusy(true);
    setError(null);
    const r = await staffCall<StaffData>(`/api/saves/${saveId}/staff/renew`, "POST", { memberId: m.id, years: Number(years) });
    setBusy(false);
    if (r.ok) { onChanged?.(r.data); onClose(); }
    else setError(t(`staff.errors.${r.error}`, { defaultValue: t("staff.errors.generic") }));
  }

  async function fire() {
    setBusy(true);
    setError(null);
    const r = await staffCall<StaffData>(`/api/saves/${saveId}/staff/fire`, "POST", { memberId: m.id });
    setBusy(false);
    setConfirmFire(false);
    if (r.ok) { onChanged?.(r.data); onClose(); }
    else setError(t(`staff.errors.${r.error}`, { defaultValue: t("staff.errors.generic") }));
  }

  return (
    <>
      <Modal open onClose={onClose} size="md">
        <div className="p-6 flex flex-col gap-5">
          <div>
            <Label>{t(`staff.roles.${m.role}`)}</Label>
            <SectionTitle className="mt-1">{m.name}</SectionTitle>
            <p className="text-sm text-muted-foreground m-0 mt-1">{m.nationality} · {t("staff.age", { age: m.age })}</p>
            <div className="mt-2"><StaffStars stars={m.stars} /></div>
          </div>

          <div className="flex flex-col gap-2">
            <Label>{t("staff.attributesTitle")}</Label>
            {[...GENERAL.map((k) => ({ key: k, value: m.attributes[k] })), { key: "knowledge" as const, value: knowledge }].map((row) => (
              <div key={row.key} className="grid grid-cols-[11rem_1fr] items-center gap-3 text-sm">
                <span className="text-muted-foreground">{t(`staff.attr.${row.key}`)}</span>
                <StatBar value={row.value} max={STAFF.ATTR_MAX} display={row.value} />
              </div>
            ))}
          </div>

          {m.role === "coach" && m.starsByArea && (
            <div className="flex flex-col gap-2">
              <Label>{t("staff.starsByArea")}</Label>
              {COACH_AREAS.map((a) => (
                <div key={a} className="flex items-center justify-between gap-3 text-sm">
                  <span>{t(`staff.area.${a}`)}</span>
                  <StaffStars stars={m.starsByArea?.[a] ?? null} />
                </div>
              ))}
            </div>
          )}

          {mode === "club" && c && (
            <div className="flex flex-col gap-3">
              <Label>{t("staff.contractTitle")}</Label>
              <p className="text-sm tabular-nums m-0">{t("staff.contractLine", { until: contractEnd(c.until), wage: formatWageFull(c.wage) })}</p>
              <div className="flex flex-col gap-2">
                <span className="text-sm text-muted-foreground">{t("staff.renewYears")}</span>
                <OptionChips<Years>
                  value={years}
                  onChange={setYears}
                  options={(["1", "2", "3"] as const).map((y) => ({
                    key: y,
                    label: t("staff.yearsN", { count: Number(y) }),
                    disabled: !m.renewYears?.includes(Number(y)),
                  }))}
                />
                {m.renewWage !== undefined && m.renewYears && m.renewYears.length > 0 && (
                  <p className="text-sm text-muted-foreground m-0 tabular-nums">{t("staff.renewWage", { wage: formatWageFull(m.renewWage) })}</p>
                )}
                {(!m.renewYears || m.renewYears.length === 0) && (
                  <p className="text-sm text-muted-foreground m-0">{t("staff.cannotRenew")}</p>
                )}
              </div>
            </div>
          )}

          {mode === "pool" && m.askingWage !== undefined && (
            <p className="text-sm tabular-nums m-0">{t("staff.askingWage", { wage: formatWageFull(m.askingWage) })}</p>
          )}

          {error && <Notice kind="error">{error}</Notice>}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button variant="secondary" flush onClick={onClose}>{t("common.close")}</Button>
            <div className="flex items-center gap-4">
              {mode === "club" && (
                <>
                  <Button variant="danger" flush disabled={busy} onClick={() => setConfirmFire(true)}>{t("staff.fire")}</Button>
                  <Button disabled={busy || !years} onClick={() => void renew()}>{t("staff.renew")}</Button>
                </>
              )}
              {mode === "pool" && onHire && <Button onClick={onHire}>{t("staffPool.hire")}</Button>}
            </div>
          </div>
        </div>
      </Modal>
      <ConfirmDialog
        open={confirmFire}
        title={t("staff.fireConfirmTitle", { name: m.name })}
        body={t("staff.fireConfirmSeverance", { amount: formatWageFull(m.severance ?? 0) })}
        confirmLabel={t("staff.fire")}
        onConfirm={() => void fire()}
        onClose={() => setConfirmFire(false)}
        busy={busy}
      />
    </>
  );
}
