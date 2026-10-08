import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "@/GameInterface/Components/Modal";
import { Button } from "@/GameInterface/ui/Button";
import { Label } from "@/GameInterface/ui/Label";
import { Notice } from "@/GameInterface/ui/Notice";
import { OptionChips } from "@/GameInterface/ui/OptionChips";
import { SectionTitle } from "@/GameInterface/ui/SectionTitle";
import { formatWageFull } from "@/Domain/money";
import type { StaffPoolItem } from "@/Domain/staff/staffPool";
import { StaffStars } from "@/GameInterface/Staff/StaffStars";
import { staffCall, type StaffData } from "@/GameInterface/Staff/staffApi";

type Years = "1" | "2" | "3";

/**
 * Hiring a professional of the free pool (`POST /staff/hire`): contract length 1/2/3 seasons, the
 * wage frozen at today's asking wage, and the role's limit for the club (full → disabled, with why).
 */
export function HireStaffModal({
  saveId, member, staff, onClose, onHired,
}: {
  saveId: string;
  member: StaffPoolItem | null;
  /** The club's staff (null = no club). */
  staff: StaffData | null;
  onClose: () => void;
  onHired: (next: StaffData, name: string) => void;
}) {
  const { t } = useTranslation();
  const [years, setYears] = useState<Years>("2");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setYears("2"); setError(null); }, [member]);

  if (!member) return <Modal open={false} onClose={onClose}>{null}</Modal>;
  const m = member;
  const limit = staff?.limits[m.role];
  const full = !!limit && limit.used >= limit.max;
  const blocked = !staff ? t("staffPool.noClub") : full ? t("staffPool.full") : null;

  async function hire() {
    setBusy(true);
    setError(null);
    const r = await staffCall<StaffData>(`/api/saves/${saveId}/staff/hire`, "POST", { memberId: m.id, years: Number(years) });
    setBusy(false);
    if (r.ok) onHired(r.data, m.name);
    else setError(t(`staff.errors.${r.error}`, { defaultValue: t("staff.errors.generic") }));
  }

  return (
    <Modal open onClose={onClose} size="md">
      <div className="p-6 flex flex-col gap-5">
        <div>
          <Label>{t(`staff.roles.${m.role}`)}</Label>
          <SectionTitle className="mt-1">{t("staffPool.hireTitle", { name: m.name })}</SectionTitle>
          <div className="mt-2"><StaffStars stars={m.stars} /></div>
        </div>
        <div className="flex flex-col gap-2">
          <Label>{t("staffPool.years")}</Label>
          <OptionChips<Years>
            value={years}
            onChange={setYears}
            options={(["1", "2", "3"] as const).map((y) => ({ key: y, label: t("staff.yearsN", { count: Number(y) }) }))}
          />
        </div>
        <p className="text-sm tabular-nums m-0">{t("staffPool.frozenWage", { wage: formatWageFull(m.askingWage) })}</p>
        {limit && (
          <p className="text-sm tabular-nums text-muted-foreground m-0">
            {t("staffPool.limit", { role: t(`staff.roles.${m.role}`), used: limit.used, max: limit.max })}
          </p>
        )}
        {blocked && <Notice kind="warning">{blocked}</Notice>}
        {error && <Notice kind="error">{error}</Notice>}
        <div className="flex items-center justify-between gap-3">
          <Button variant="secondary" flush onClick={onClose}>{t("common.cancel")}</Button>
          <Button disabled={busy || blocked !== null} onClick={() => void hire()}>{t("staffPool.hire")}</Button>
        </div>
      </div>
    </Modal>
  );
}
