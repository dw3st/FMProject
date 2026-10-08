import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "@/GameInterface/Components/ConfirmDialog";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { Button } from "@/GameInterface/ui/Button";
import { Label } from "@/GameInterface/ui/Label";
import { ScreenTitle } from "@/GameInterface/ui/ScreenTitle";
import { ScreenContainer } from "@/GameInterface/ui/ScreenContainer";
import { StatBar } from "@/GameInterface/ui/StatBar";
import { SegmentedTabs } from "@/GameInterface/ui/SegmentedTabs";
import { type StaffEffects } from "@/Domain/staff/staff";
import { STAFF_ROLES, type StaffMember, type StaffRole } from "@/Domain/staff/staffTypes";
import { formatEuros } from "@/Domain/money";
import { ResponsibilitiesPanel } from "@/GameInterface/Staff/ResponsibilitiesPanel";

interface StaffResponse {
  members: (StaffMember & { stars: number })[];
  effects: StaffEffects;
  weeklyTotal: number;
}

const fmt = (n: number, digits = 2) => n.toFixed(digits);

/**
 * Technical staff (`.claude/rules/game/staff.md`). Interim screen of Etapa 31a: the members and
 * their effects; the pool search and the full staff board arrive with the rest of the stage.
 */
export function StaffScreen() {
  const { t } = useTranslation();
  const { session, refresh } = useGameSave();
  const saveId = session?.saveId;

  const [data, setData] = useState<StaffResponse | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [firing, setFiring] = useState<StaffMember | null>(null);
  // Page tabs: the staff | responsibilities (`?tab=responsibilities` opens it).
  const [pageTab, setPageTab] = useState<"staff" | "responsibilities">(() =>
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("tab") === "responsibilities"
      ? "responsibilities" : "staff");

  const load = useCallback(async () => {
    if (!saveId) return;
    try {
      const s = await fetch(`/api/saves/${saveId}/staff`).then((r) => (r.ok ? r.json() : Promise.reject(r)));
      setData(s as StaffResponse);
      setError(false);
    } catch {
      setError(true);
    }
  }, [saveId]);

  useEffect(() => { void load(); }, [load]);

  async function confirmFire() {
    if (!firing || !saveId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/saves/${saveId}/staff/fire`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ memberId: firing.id }),
      });
      if (res.ok) {
        setData((await res.json()) as StaffResponse);
        void refresh();
      }
    } finally {
      setBusy(false);
      setFiring(null);
    }
  }

  if (error) {
    return <ScreenContainer><p className="text-sm text-muted-foreground m-0">{t("staff.loadFailed")}</p></ScreenContainer>;
  }
  if (!data) {
    return <ScreenContainer><p className="text-sm text-muted-foreground m-0">{t("staff.loading")}</p></ScreenContainer>;
  }

  const effectLine = (role: StaffRole): string | null => {
    const e = data.effects;
    if (role === "assistant") return t("staff.effects.assistant", { mult: fmt(e.devMult) });
    if (role === "fitness") return t("staff.effects.fitness", { recovery: fmt(e.recoveryMult), injury: fmt(e.injuryMult) });
    if (role === "scout") return t("staff.effects.scout", { uncertainty: fmt(e.scoutUncertaintyMult), gain: fmt(e.scoutGainMult) });
    return null;
  };

  const members = [...data.members].sort((a, b) => STAFF_ROLES.indexOf(a.role) - STAFF_ROLES.indexOf(b.role));

  return (
    <ScreenContainer>
      <ScreenTitle
        trailingAlign="end"
        subtitle={t("staff.subtitle")}
        accent={t("screenTitles.staff.accent")}
        trailing={
          <div className="text-right">
            <Label>{t("staff.weeklyTotal")}</Label>
            <span className="font-display font-bold tabular-nums text-xl">{formatEuros(data.weeklyTotal)}</span>
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
        <section className="grid gap-6 md:grid-cols-3">
          {members.map((m) => {
            const stars = m.stars;
            const effect = effectLine(m.role);
            return (
              <div key={m.id} className="rounded-md border border-border p-3 flex flex-col gap-3">
                <Label>{t(`staff.roles.${m.role}`)}</Label>
                <div>
                  <div className="font-display font-black uppercase text-base leading-none">{m.name}</div>
                  <div className="text-sm text-muted-foreground mt-1">{m.nationality} · {t("staff.age", { age: m.age })}</div>
                </div>
                <StatBar value={stars} max={5} display={stars} label={t("staff.rating")} />
                {m.contract && (
                  <div className="text-sm tabular-nums">{t("staff.weeklyWage", { wage: formatEuros(m.contract.wage) })}</div>
                )}
                {effect && <div className="text-sm text-muted-foreground">{effect}</div>}
                <div>
                  <Button variant="danger" flush disabled={busy} onClick={() => setFiring(m)}>
                    {t("staff.fire")}
                  </Button>
                </div>
              </div>
            );
          })}
        </section>
      )}

      <ConfirmDialog
        open={firing !== null}
        title={t("staff.fireConfirmTitle", { name: firing?.name ?? "" })}
        body={t("staff.fireConfirmBody")}
        confirmLabel={t("staff.fire")}
        onConfirm={() => void confirmFire()}
        onClose={() => setFiring(null)}
        busy={busy}
      />
    </ScreenContainer>
  );
}
