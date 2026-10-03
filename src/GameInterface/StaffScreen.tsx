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
import { Tabs } from "@/GameInterface/ui/Tabs";
import { TABLE_STYLE } from "@/GameInterface/ui/leagueTableStyle";
import type { StaffEffects } from "@/Domain/staff/staff";
import { STAFF_ROLES, type StaffMember, type StaffRecord, type StaffRole } from "@/Domain/staff/staffTypes";

interface StaffResponse {
  staff: StaffRecord;
  effects: StaffEffects;
  weeklyTotal: number;
}

interface MarketResponse {
  week: string;
  candidates: Record<StaffRole, StaffMember[]>;
}

function money(value: number): string {
  if (value >= 1_000_000) return `€${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `€${Math.round(value / 1_000)}K`;
  return `€${value}`;
}

const fmt = (n: number, digits = 2) => n.toFixed(digits);

export function StaffScreen() {
  const { t } = useTranslation();
  const { session, refresh } = useGameSave();
  const saveId = session?.saveId;

  const [data, setData] = useState<StaffResponse | null>(null);
  const [market, setMarket] = useState<MarketResponse | null>(null);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState<StaffRole>("assistant");
  const [busy, setBusy] = useState(false);
  const [firing, setFiring] = useState<StaffMember | null>(null);
  const [hireError, setHireError] = useState(false);

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
    return t("staff.effects.scout", { noise: fmt(e.scoutNoise, 1) });
  };

  const columns: DataTableColumn<StaffMember>[] = [
    { key: "name", header: t("staff.roles." + tab), cell: (m) => <span className={`${TABLE_STYLE.name} text-base`}>{m.name}</span> },
    { key: "nat", header: "", cell: (m) => <span className="text-muted-foreground">{m.nationality}</span> },
    { key: "age", header: "", cell: (m) => <span className="text-muted-foreground">{t("staff.age", { age: m.age })}</span> },
    { key: "rating", header: t("staff.rating"), className: "w-48", cell: (m) => <StatBar value={m.rating} max={10} display={m.rating} /> },
    { key: "wage", header: "", className: "text-right", cell: (m) => <span className="tabular-nums">{t("staff.weeklyWage", { wage: money(m.wage) })}</span> },
    {
      key: "hire", header: "", className: "text-right",
      cell: (m) => {
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
        subtitle={t("staff.subtitle")}
        accent={t("screenTitles.staff.accent")}
        trailing={
          <div className="text-right">
            <Label>{t("staff.weeklyTotal")}</Label>
            <span className="font-display font-bold tabular-nums text-xl">{money(data.weeklyTotal)}</span>
          </div>
        }
      >
        {t("screenTitles.staff.main")}
      </ScreenTitle>

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
                  <div className="text-sm tabular-nums">{t("staff.weeklyWage", { wage: money(m.wage) })}</div>
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

      <section>
        <SectionTitle>{t("staff.market")}</SectionTitle>
        <p className="text-sm text-muted-foreground mt-2 mb-3">{t("staff.marketSubtitle")}</p>
        <Tabs
          tabs={STAFF_ROLES.map((r) => ({ key: r, label: t(`staff.roles.${r}`) }))}
          active={tab}
          onChange={setTab}
        />
        {hireError && <p className="text-sm text-destructive mt-3">{t("staff.hireFailed")}</p>}
        <DataTable
          className="mt-2"
          columns={columns}
          rows={market.candidates[tab]}
          rowKey={(m) => m.id}
        />
      </section>

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
