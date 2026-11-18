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
import { StaffRoleBlock } from "@/GameInterface/Staff/StaffRoleBlock";
import { StaffDetailModal } from "@/GameInterface/Staff/StaffDetailModal";
import { TrainingAreasPanel } from "@/GameInterface/Staff/TrainingAreasPanel";
import { STAFF } from "@/Domain/staff/staffConfig";
import { STAFF_GROUPS, formatEffect, staffCall, type StaffData, type StaffMemberView } from "@/GameInterface/Staff/staffApi";
import { navigate } from "@/GameInterface/router/navigation";

/**
 * Columns a group takes in the 6-column staff grid (xl), by its key: command (1 block) and health (2) share a row,
 * training (3) has one, scouting and facilities (2 each) share the last one.
 */
const GROUP_SPAN: Record<string, string> = {
  command: "xl:col-span-2", health: "xl:col-span-4", training: "xl:col-span-6", scouting: "xl:col-span-3", structure: "xl:col-span-3",
};
const GROUP_COLS: Record<number, string> = { 1: "xl:grid-cols-1", 2: "xl:grid-cols-2", 3: "xl:grid-cols-3" };

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
  const [openMember, setOpenMember] = useState<StaffMemberView | null>(null);
  const [slotNotice, setSlotNotice] = useState<{ ok: boolean; text: string } | null>(null);
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
    // The profile stays open on a trust or course change: it shows the professional as he is now.
    setOpenMember((cur) => (cur ? next.members.find((m) => m.id === cur.id) ?? null : null));
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

  async function askSlot(role: StaffRole) {
    if (!saveId) return;
    setBusy(true);
    setActionError(null);
    setSlotNotice(null);
    const r = await staffCall<{ approved: true; limit: number; view: StaffData }>(`/api/saves/${saveId}/staff/slot-request`, "POST", { role });
    setBusy(false);
    const roleName = t(`staff.roles.${role}`);
    if (r.ok) {
      setData(r.data.view);
      setSlotNotice({ ok: true, text: t("staff.slotRequest.approved", { role: roleName, max: r.data.limit }) });
      return;
    }
    const view = (r.body as { view?: StaffData } | undefined)?.view;
    if (view) setData(view);
    if (["board_low", "negative_balance", "max_reached"].includes(r.error)) {
      setSlotNotice({ ok: false, text: t(`staff.slotRequest.refused.${r.error}`, { role: roleName, days: STAFF.SLOT_REQUEST.COOLDOWN_DAYS }) });
    } else {
      setActionError(t(`staff.errors.${r.error}`, { defaultValue: t("staff.errors.generic") }));
    }
  }

  if (error) {
    return <ScreenContainer><p className="text-sm text-muted-foreground m-0">{t("staff.loadFailed")}</p></ScreenContainer>;
  }
  if (!data) {
    return <ScreenContainer><p className="text-sm text-muted-foreground m-0">{t("staff.loading")}</p></ScreenContainer>;
  }

  const lang = i18n.language;
  const expiring = data.members.filter((m) => m.endsInDays !== undefined);
  const roleLimits = Object.values(data.limits);
  const hired = roleLimits.reduce((n, l) => n + l.used, 0);
  const open = roleLimits.reduce((n, l) => n + Math.max(0, l.max - l.used), 0);
  const vacantSlowdown = Math.round((1 - STAFF.AREA_VACANT_MULT) * 100);
  const areaMult = (area: string) => data.areas.find((a) => a.area === area)?.mult ?? 1;
  const pct = (mult: number) => formatEffect(mult, lang, t("staff.noEffect"));
  const effectLine = (m: StaffMemberView): string => {
    const e = data.effects;
    switch (m.role) {
      case "assistant": return t("staff.effects.assistant", { value: pct(e.devMult) });
      case "fitness": return t("staff.effects.fitness", {
        area: pct(areaMult("physical")), recovery: pct(e.recoveryMult), injury: pct(e.injuryMult),
      });
      case "goalkeeping": return t("staff.effects.goalkeeping", { value: pct(areaMult("goalkeeping")) });
      case "coach": {
        const led = data.areas.filter((a) => a.memberId === m.id);
        return led.length === 0
          ? t("staff.effects.coachNoArea")
          : led.map((a) => t("staff.effects.coachArea", { area: t(`staff.area.${a.area}`), value: pct(a.mult) })).join(" · ");
      }
      case "medic": return t("staff.effects.medic", { value: pct(e.injuryDurationMult) });
      case "analyst": return t("staff.effects.analyst", { value: pct(e.familiarityMult) });
      case "scout": return t("staff.effects.scout", { uncertainty: pct(e.scoutUncertaintyMult), gain: pct(e.scoutGainMult) });
      case "fieldScout": return t("staff.effects.fieldScout");
      case "groundskeeper": return t("staff.effects.groundskeeper", { value: pct(e.pitchWearMult) });
      case "youthCoach": return t("staff.effects.youthCoach", { value: pct(e.academyDevMult) });
      case "foreman": return t("staff.effects.foreman", { value: pct(e.foremanSpeed) });
    }
  };
  const vacantEffect = (role: StaffRole): string | undefined =>
    role === "fitness" || role === "goalkeeping" ? t("staff.vacantArea", { pct: vacantSlowdown })
      // Nobody keeps the pitches: they wear 1.6× faster (`pitchWearMult` already says so).
      : role === "groundskeeper" ? t("staff.effects.groundskeeper", { value: pct(data.effects.pitchWearMult) })
      // No youth coach: the academy develops a little slower (the vacant stars are already in `academyDevMult`).
      : role === "youthCoach" ? t("staff.effects.youthCoach", { value: pct(data.effects.academyDevMult) })
      : role === "foreman" ? t("staff.effects.foreman", { value: pct(data.effects.foremanSpeed) })
      : role === "coach" || role === "fieldScout" ? undefined
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
          {expiring.length > 0 && (
            <Notice kind="warning">
              {t("staff.expiring.notice", { count: expiring.length, days: STAFF.CONTRACT.RENEW_WINDOW_DAYS, names: expiring.map((m) => m.name).join(", ") })}
            </Notice>
          )}
          <div className="flex flex-wrap items-end gap-x-8 gap-y-2">
            <div>
              <Label>{t("staff.summary.hired")}</Label>
              <span className="font-display font-bold tabular-nums text-xl">{hired}</span>
            </div>
            <div>
              <Label>{t("staff.summary.open")}</Label>
              <span className={`font-display font-bold tabular-nums text-xl ${open > 0 ? "text-chart-4" : ""}`}>{open}</span>
            </div>
            <div>
              <Label>{t("staff.summary.trusted")}</Label>
              <span className="font-display font-bold tabular-nums text-xl">{data.trusted.used}/{data.trusted.max}</span>
            </div>
            <p className="text-sm text-muted-foreground m-0 ml-auto">{t("staff.effectsHelp")}</p>
          </div>
          {slotNotice && <Notice kind={slotNotice.ok ? "info" : "warning"}>{slotNotice.text}</Notice>}
          <div className="grid gap-x-3 gap-y-6 xl:grid-cols-6">
            {STAFF_GROUPS.flatMap((group) => {
              const blockOf = (role: StaffRole) => {
                const members = data.members
                  .filter((m) => m.role === role)
                  .sort((a, b) => b.stars - a.stars || a.name.localeCompare(b.name));
                const limit = data.limits[role];
                const free = Math.max(0, limit.max - limit.used);
                return {
                  role,
                  wide: members.length >= 3,
                  node: (wide: boolean) => (
                    <StaffRoleBlock key={role} role={role} tone={group.tone} limit={limit} busy={busy} wide={wide} onAsk={(r) => void askSlot(r)}>
                      {members.map((m) => (
                        <StaffCard key={m.id} member={m} effect={effectLine(m)} onOpen={() => setOpenMember(m)} clubColors={session?.clubColors} />
                      ))}
                      {free > 0 && <VacantStaffCard free={free} effect={members.length === 0 ? vacantEffect(role) : undefined} />}
                    </StaffRoleBlock>
                  ),
                };
              };
              const blocks = group.roles.map(blockOf);
              const narrow = blocks.filter((b) => !b.wide);
              const wide = blocks.filter((b) => b.wide);
              return [
                <section key={group.key} className={`flex flex-col gap-3 ${GROUP_SPAN[group.key] ?? "xl:col-span-6"}`}>
                  <SectionTitle>{t(`staff.groups.${group.key}`)}</SectionTitle>
                  <div className={`grid gap-3 lg:grid-cols-2 ${GROUP_COLS[narrow.length] ?? ""}`}>
                    {narrow.map((b) => b.node(false))}
                    {narrow.length === 0 && wide.map((b) => b.node(true))}
                  </div>
                </section>,
                ...(narrow.length > 0 ? wide.map((b) => (
                  <div key={`${group.key}-${b.role}`} className="xl:col-span-6">{b.node(true)}</div>
                )) : []),
              ];
            })}
          </div>

          <TrainingAreasPanel data={data} busy={busy} onAssign={(area, id) => void assign(area, id)} />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm tabular-nums m-0">{t("staff.weeklyBill", { wage: formatWageFull(data.weeklyTotal) })}</p>
            <Button onClick={() => { navigate("/transfers?tab=staff"); }}>{t("staff.findProfessionals")}</Button>
          </div>
        </>
      )}

      {saveId && (
        <StaffDetailModal saveId={saveId} member={openMember} mode="club" effect={openMember ? effectLine(openMember) : undefined} trusted={data.trusted} wallet={data.wallet} clubColors={session?.clubColors} onClose={() => setOpenMember(null)} onChanged={changed} />
      )}
    </ScreenContainer>
  );
}
