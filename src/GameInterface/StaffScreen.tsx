import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "@/GameInterface/Components/ConfirmDialog";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { Button } from "@/GameInterface/ui/Button";
import { DataTable, type DataTableColumn } from "@/GameInterface/ui/DataTable";
import { Label } from "@/GameInterface/ui/Label";
import { ScreenTitle } from "@/GameInterface/ui/ScreenTitle";
import { ScreenContainer } from "@/GameInterface/ui/ScreenContainer";
import { SectionTitle } from "@/GameInterface/ui/SectionTitle";
import { StatBar } from "@/GameInterface/ui/StatBar";
import { SegmentedTabs } from "@/GameInterface/ui/SegmentedTabs";
import { TABLE_STYLE } from "@/GameInterface/ui/leagueTableStyle";
import type { StaffEffects } from "@/Domain/staff/staff";
import { STAFF_ROLES, type StaffMember, type StaffRecord, type StaffRole } from "@/Domain/staff/staffTypes";
import { formatEuros } from "@/Domain/money";
import { ResponsibilitiesPanel } from "@/GameInterface/Staff/ResponsibilitiesPanel";

interface StaffResponse {
  staff: StaffRecord;
  effects: StaffEffects;
  weeklyTotal: number;
}

interface MarketResponse {
  week: string;
  candidates: Record<StaffRole, StaffMember[]>;
}

/** Field scouts (`.claude/rules/game/scouting.md`): hired ones and this week's candidates. */
interface ScoutsMarketResponse {
  candidates: StaffMember[];
  scouts: StaffMember[];
  max: number;
}

type MarketTab = StaffRole | "scouts";

const fmt = (n: number, digits = 2) => n.toFixed(digits);

export function StaffScreen() {
  const { t } = useTranslation();
  const { session, refresh } = useGameSave();
  const saveId = session?.saveId;

  const [data, setData] = useState<StaffResponse | null>(null);
  const [market, setMarket] = useState<MarketResponse | null>(null);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState<MarketTab>("assistant");
  const [scouts, setScouts] = useState<ScoutsMarketResponse | null>(null);
  const [firingScout, setFiringScout] = useState<StaffMember | null>(null);
  const [busy, setBusy] = useState(false);
  const [firing, setFiring] = useState<StaffMember | null>(null);
  const [hireError, setHireError] = useState(false);
  // Page tabs: the staff | responsibilities (`?tab=responsibilities` opens it).
  const [pageTab, setPageTab] = useState<"staff" | "responsibilities">(() =>
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("tab") === "responsibilities"
      ? "responsibilities" : "staff");

  const load = useCallback(async () => {
    if (!saveId) return;
    try {
      const [s, m] = await Promise.all([
        fetch(`/api/saves/${saveId}/staff`).then((r) => (r.ok ? r.json() : Promise.reject(r))),
        fetch(`/api/saves/${saveId}/staff/market`).then((r) => (r.ok ? r.json() : Promise.reject(r))),
      ]);
      setData(s as StaffResponse);
      setMarket(m as MarketResponse);
      setError(false);
      const sc = await fetch(`/api/saves/${saveId}/staff/scouts/market`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      setScouts(sc as ScoutsMarketResponse | null);
    } catch {
      setError(true);
    }
  }, [saveId]);

  useEffect(() => { void load(); }, [load]);

  async function post(path: "hire" | "fire", body: Record<string, string>) {
    if (!saveId) return false;
    setBusy(true);
    try {
      const res = await fetch(`/api/saves/${saveId}/staff/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) return false;
      setData((await res.json()) as StaffResponse);
      void refresh();
      return true;
    } catch {
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function hire(candidate: StaffMember) {
    setHireError(false);
    const ok = await post("hire", { role: candidate.role, candidateId: candidate.id });
    if (!ok) setHireError(true);
  }

  async function confirmFire() {
    if (!firing) return;
    await post("fire", { role: firing.role });
    setFiring(null);
  }

  async function scoutsCall(path: "hire" | "fire", body: Record<string, string>) {
    if (!saveId) return false;
    setBusy(true);
    try {
      const res = await fetch(`/api/saves/${saveId}/staff/scouts/${path}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
      });
      if (!res.ok) return false;
      await load();
      void refresh();
      return true;
    } catch {
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function hireScout(candidate: StaffMember) {
    setHireError(false);
    if (!(await scoutsCall("hire", { candidateId: candidate.id }))) setHireError(true);
  }

  async function confirmFireScout() {
    if (!firingScout) return;
    await scoutsCall("fire", { scoutId: firingScout.id });
    setFiringScout(null);
  }

  if (error) {
    return <ScreenContainer><p className="text-sm text-muted-foreground m-0">{t("staff.loadFailed")}</p></ScreenContainer>;
  }
  if (!data || !market) {
    return <ScreenContainer><p className="text-sm text-muted-foreground m-0">{t("staff.loading")}</p></ScreenContainer>;
  }

  const effectLine = (role: StaffRole): string => {
    const e = data.effects;
    if (role === "assistant") return t("staff.effects.assistant", { mult: fmt(e.devMult) });
    if (role === "fitness") return t("staff.effects.fitness", { recovery: fmt(e.recoveryMult), injury: fmt(e.injuryMult) });
    return t("staff.effects.scout", { uncertainty: fmt(e.scoutUncertaintyMult), gain: fmt(e.scoutGainMult) });
  };

  const columns: DataTableColumn<StaffMember>[] = [
    { key: "name", header: tab === "scouts" ? t("staff.scouts.fieldScout") : t("staff.roles." + tab), cell: (m) => <span className={`${TABLE_STYLE.name} text-base`}>{m.name}</span> },
    { key: "nat", header: "", cell: (m) => <span className="text-muted-foreground">{m.nationality}</span> },
    { key: "age", header: "", cell: (m) => <span className="text-muted-foreground">{t("staff.age", { age: m.age })}</span> },
    { key: "rating", header: t("staff.rating"), className: "w-48", cell: (m) => <StatBar value={m.rating} max={10} display={m.rating} /> },
    { key: "wage", header: "", className: "text-right", cell: (m) => <span className="tabular-nums">{t("staff.weeklyWage", { wage: formatEuros(m.wage) })}</span> },
    {
      key: "hire", header: "", className: "text-right",
      cell: (m) => {
        if (tab === "scouts") {
          const full = (scouts?.scouts.length ?? 0) >= (scouts?.max ?? 0);
          return <Button disabled={busy || full} onClick={() => void hireScout(m)}>{t("staff.hire")}</Button>;
        }
        const current = data.staff[m.role];
        return current?.id === m.id
          ? <span className="text-muted-foreground">{t("staff.hired")}</span>
          : <Button disabled={busy} onClick={() => void hire(m)}>{t("staff.hire")}</Button>;
      },
    },
  ];

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

      {pageTab === "staff" && <>
      <section className="grid gap-6 md:grid-cols-3">
        {STAFF_ROLES.map((role) => {
          const m = data.staff[role];
          return (
            <div key={role} className="rounded-md border border-border p-3 flex flex-col gap-3">
              <Label>{t(`staff.roles.${role}`)}</Label>
              {m ? (
                <>
                  <div>
                    <div className="font-display font-black uppercase text-base leading-none">{m.name}</div>
                    <div className="text-sm text-muted-foreground mt-1">{m.nationality} · {t("staff.age", { age: m.age })}</div>
                  </div>
                  <StatBar value={m.rating} max={10} display={m.rating} label={t("staff.rating")} />
                  <div className="text-sm tabular-nums">{t("staff.weeklyWage", { wage: formatEuros(m.wage) })}</div>
                </>
              ) : (
                <div>
                  <div className="font-display font-black uppercase text-base leading-none text-muted-foreground">{t("staff.vacant")}</div>
                  <div className="text-sm text-muted-foreground mt-1">{t("staff.vacantEffect")}</div>
                </div>
              )}
              <div className="text-sm text-muted-foreground">{effectLine(role)}</div>
              {m && (
                <div>
                  <Button variant="danger" flush disabled={busy} onClick={() => setFiring(m)}>
                    {t("staff.fire")}
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </section>

      {scouts && (
        <section className="flex flex-col gap-3">
          <SectionTitle>{t("staff.scouts.title")}</SectionTitle>
          <p className="text-sm text-muted-foreground m-0 tabular-nums">{t("staff.scouts.subtitle", { count: scouts.scouts.length, max: scouts.max })}</p>
          {scouts.scouts.length > 0 && (
            <div className="grid gap-6 md:grid-cols-4">
              {scouts.scouts.map((m) => (
                <div key={m.id} className="rounded-md border border-border p-3 flex flex-col gap-3">
                  <Label>{t("staff.scouts.fieldScout")}</Label>
                  <div>
                    <div className="font-display font-black uppercase text-base leading-none">{m.name}</div>
                    <div className="text-sm text-muted-foreground mt-1">{m.nationality} · {t("staff.age", { age: m.age })}</div>
                  </div>
                  <StatBar value={m.rating} max={10} display={m.rating} label={t("staff.rating")} />
                  <div className="text-sm tabular-nums">{t("staff.weeklyWage", { wage: formatEuros(m.wage) })}</div>
                  <div>
                    <Button variant="danger" flush disabled={busy} onClick={() => setFiringScout(m)}>{t("staff.fire")}</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <section>
        <SectionTitle>{t("staff.market")}</SectionTitle>
        <p className="text-sm text-muted-foreground mt-2 mb-3">{t("staff.marketSubtitle")}</p>
        <SegmentedTabs<MarketTab>
          tabs={[
            ...STAFF_ROLES.map((r) => ({ key: r as MarketTab, label: t(`staff.roles.${r}`) })),
            ...(scouts ? [{ key: "scouts" as MarketTab, label: t("staff.scouts.tab") }] : []),
          ]}
          active={tab}
          onChange={setTab}
        />
        {hireError && <p className="text-sm text-destructive mt-3">{t("staff.hireFailed")}</p>}
        <DataTable
          className="mt-2"
          columns={columns}
          rows={tab === "scouts" ? (scouts?.candidates ?? []) : market.candidates[tab]}
          rowKey={(m) => m.id}
        />
      </section>
      </>}

      <ConfirmDialog
        open={firingScout !== null}
        title={t("staff.fireConfirmTitle", { name: firingScout?.name ?? "" })}
        body={t("staff.scouts.fireConfirmBody")}
        confirmLabel={t("staff.fire")}
        onConfirm={() => void confirmFireScout()}
        onClose={() => setFiringScout(null)}
        busy={busy}
      />

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
