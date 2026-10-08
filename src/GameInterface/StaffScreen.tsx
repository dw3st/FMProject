import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { Button } from "@/GameInterface/ui/Button";
import { Label } from "@/GameInterface/ui/Label";
import { Notice } from "@/GameInterface/ui/Notice";
import { ScreenTitle } from "@/GameInterface/ui/ScreenTitle";
import { ScreenContainer } from "@/GameInterface/ui/ScreenContainer";
import { SectionTitle } from "@/GameInterface/ui/SectionTitle";
import { SegmentedTabs } from "@/GameInterface/ui/SegmentedTabs";
import { formatWageFull } from "@/Domain/money";
import type { CoachArea, StaffRole } from "@/Domain/staff/staffTypes";
import { ResponsibilitiesPanel } from "@/GameInterface/Staff/ResponsibilitiesPanel";
import { StaffCard, VacantStaffCard } from "@/GameInterface/Staff/StaffCard";
import { StaffDetailModal } from "@/GameInterface/Staff/StaffDetailModal";
import { TrainingAreasPanel } from "@/GameInterface/Staff/TrainingAreasPanel";
import { STAFF_GROUPS, formatMult, staffCall, type StaffData, type StaffMemberView } from "@/GameInterface/Staff/staffApi";

/**
 * Coaching staff (`.claude/rules/game/staff.md`): one card per professional grouped by function,
 * the seven training areas with their coach, the profile (renew / dismiss) and the weekly bill.
 * New professionals come from the free pool (Transfers → Staff).
 */
export function StaffScreen() {
  const { t, i18n } = useTranslation();
  const { session, refresh } = useGameSave();
  const saveId = session?.saveId;

  const [data, setData] = useState<StaffData | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [open, setOpen] = useState<StaffMemberView | null>(null);
  // Page tabs: the staff | responsibilities (`?tab=responsibilities` opens it).
  const [pageTab, setPageTab] = useState<"staff" | "responsibilities">(() =>
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("tab") === "responsibilities"
      ? "responsibilities" : "staff");

  const load = useCallback(async () => {
    if (!saveId) return;
    const r = await staffCall<StaffData>(`/api/saves/${saveId}/staff`);
    if (r.ok) { setData(r.data); setError(false); }
    else setError(true);
  }, [saveId]);

  useEffect(() => { void load(); }, [load]);

  function changed(next: StaffData) {
    setData(next);
    void refresh();
  }

  async function assign(area: CoachArea, memberId: string | null) {
    if (!saveId) return;
    setBusy(true);
    setActionError(null);
    const r = await staffCall<StaffData>(`/api/saves/${saveId}/staff/areas`, "PUT", { [area]: memberId });
    setBusy(false);
    if (r.ok) setData(r.data);
    else setActionError(t(`staff.errors.${r.error}`, { defaultValue: t("staff.errors.generic") }));
  }

  if (error) {
    return <ScreenContainer><p className="text-sm text-muted-foreground m-0">{t("staff.loadFailed")}</p></ScreenContainer>;
  }
  if (!data) {
    return <ScreenContainer><p className="text-sm text-muted-foreground m-0">{t("staff.loading")}</p></ScreenContainer>;
  }

  const lang = i18n.language;
  const areaMult = (area: string) => data.areas.find((a) => a.area === area)?.mult ?? 1;
  const effectLine = (m: StaffMemberView): string => {
    const e = data.effects;
    switch (m.role) {
      case "assistant": return t("staff.effects.assistant", { mult: formatMult(e.devMult, lang) });
      case "fitness": return t("staff.effects.fitness", {
        area: formatMult(areaMult("physical"), lang), recovery: formatMult(e.recoveryMult, lang), injury: formatMult(e.injuryMult, lang),
      });
      case "goalkeeping": return t("staff.effects.goalkeeping", { mult: formatMult(areaMult("goalkeeping"), lang) });
      case "coach": {
        const led = data.areas.filter((a) => a.memberId === m.id);
        return led.length === 0
          ? t("staff.effects.coachNoArea")
          : led.map((a) => `${t(`staff.area.${a.area}`)} ${formatMult(a.mult, lang)}`).join(" · ");
      }
      case "medic": return t("staff.effects.medic", { mult: formatMult(e.injuryDurationMult, lang) });
      case "analyst": return t("staff.effects.analyst", { mult: formatMult(e.familiarityMult, lang) });
      case "scout": return t("staff.effects.scout", { uncertainty: formatMult(e.scoutUncertaintyMult, lang), gain: formatMult(e.scoutGainMult, lang) });
      case "fieldScout": return t("staff.effects.fieldScout");
      case "groundskeeper": return t("staff.effects.groundskeeper");
    }
  };
  const vacantEffect = (role: StaffRole): string | undefined =>
    role === "fitness" || role === "goalkeeping" ? t("staff.vacantArea")
      : role === "coach" || role === "fieldScout" || role === "groundskeeper" ? undefined
        : t("staff.vacantEffect");

  return (
    <ScreenContainer>
      <ScreenTitle
        trailingAlign="end"
        subtitle={t("staff.subtitle")}
        accent={t("screenTitles.staff.accent")}
        trailing={
          <div className="text-right">
            <Label>{t("staff.weeklyTotal")}</Label>
            <span className="font-display font-bold tabular-nums text-xl">{formatWageFull(data.weeklyTotal)}</span>
          </div>
        }
      >
        {t("screenTitles.staff.main")}
      </ScreenTitle>

      <SegmentedTabs<"staff" | "responsibilities">
        tabs={[
          { key: "staff", label: t("staff.tabStaff") },
          { key: "responsibilities", label: t("staff.tabResponsibilities") },
        ]}
        active={pageTab}
        onChange={setPageTab}
        aria-label={t("screenTitles.staff.main")}
      />

      {pageTab === "responsibilities" && saveId && <ResponsibilitiesPanel saveId={saveId} />}

      {pageTab === "staff" && (
        <>
          {actionError && <Notice kind="error">{actionError}</Notice>}
          {STAFF_GROUPS.map((group) => (
            <section key={group.key} className="flex flex-col gap-3">
              <SectionTitle>{t(`staff.groups.${group.key}`)}</SectionTitle>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {group.roles.flatMap((role) => {
                  const members = data.members
                    .filter((m) => m.role === role)
                    .sort((a, b) => b.stars - a.stars || a.name.localeCompare(b.name));
                  const limit = data.limits[role];
                  const cards = members.map((m) => (
                    <StaffCard key={m.id} member={m} effect={effectLine(m)} onOpen={() => setOpen(m)} clubColors={session?.clubColors} />
                  ));
                  if (limit && limit.used < limit.max) {
                    cards.push(<VacantStaffCard key={`vacant-${role}`} role={role} used={limit.used} max={limit.max} effect={vacantEffect(role)} />);
                  }
                  return cards;
                })}
              </div>
            </section>
          ))}

          <TrainingAreasPanel data={data} busy={busy} onAssign={(area, id) => void assign(area, id)} />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm tabular-nums m-0">{t("staff.weeklyBill", { wage: formatWageFull(data.weeklyTotal) })}</p>
            <Button onClick={() => { window.location.href = "/transfers?tab=staff"; }}>{t("staff.findProfessionals")}</Button>
          </div>
        </>
      )}

      {saveId && (
        <StaffDetailModal saveId={saveId} member={open} mode="club" clubColors={session?.clubColors} onClose={() => setOpen(null)} onChanged={changed} />
      )}
    </ScreenContainer>
  );
}
