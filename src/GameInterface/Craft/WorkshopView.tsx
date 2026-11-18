import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/GameInterface/ui/Button";
import { OptionChips } from "@/GameInterface/ui/OptionChips";
import { StepperField } from "@/GameInterface/ui/StepperField";
import { Icon } from "@/GameInterface/Icons";
import { StatsCell, StatsHead, StatsRow, StatsTable } from "@/GameInterface/Components/StatsTable";
import { CraftIcon } from "@/GameInterface/Craft/CraftIcon";
import { CraftBanner } from "@/GameInterface/Craft/CraftBanner";
import { RecipeLine } from "@/GameInterface/Craft/RecipeLine";
import { craftErrorKey, queueAction, queueComponent, upgradeWorkshop, type CraftView } from "@/GameInterface/Craft/craftApi";
import { useCraft } from "@/GameInterface/Craft/useCraft";
import { jobDays, materialsFor } from "@/Domain/craft/workshop";
import { materialTotal } from "@/Domain/craft/shortfall";
import { missingComponents } from "@/Domain/craft/stock";
import type { ComponentId, MaterialId } from "@/types/craftTypes";

const LABEL = "font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground";
const MAX_QTY = 500;
type SupplierPick = "auto" | "standard" | "good";
const GOOD_SHARE: Record<SupplierPick, number | undefined> = { auto: undefined, standard: 0, good: 1 };

/** Club → Workshop: level, benches at work, the queue, a new order and the workshop upgrade. */
export function WorkshopView({ saveId }: { saveId: string }) {
  const { t } = useTranslation();
  const { view, loadError, actionError, busy, run } = useCraft(saveId);
  if (loadError) return <p className="text-sm text-muted-foreground m-0">{t(craftErrorKey(loadError))}</p>;
  if (!view) return <p className="text-sm text-muted-foreground m-0">{t("financesScreen.loading")}</p>;
  return (
    <div className="flex flex-col gap-6">
      <WorkshopHeader view={view} />
      {actionError && <p className="text-sm text-destructive m-0">{t(craftErrorKey(actionError))}</p>}
      <Benches view={view} />
      <Queue view={view} busy={busy} onAction={(id, a) => void run(() => queueAction(saveId, id, a), (v) => v)} />
      <NewOrder view={view} busy={busy}
        onMake={(c, q, gs) => void run(() => queueComponent(saveId, c, q, gs), (v) => v)} />
      <Upgrade view={view} busy={busy} onUpgrade={() => void run(() => upgradeWorkshop(saveId), (v) => v)} />
    </div>
  );
}

function WorkshopHeader({ view }: { view: CraftView }) {
  const { t, i18n } = useTranslation();
  const speed = view.foremanSpeed.toLocaleString(i18n.language, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const level = Math.min(5, Math.max(1, view.workshop));
  // level 1 was repainted with the workbench: a new file name, art URLs are cached immutable
  const art = level === 1 ? "craft/workshop-lv-1b.webp" : `craft/workshop-lv-${level}.webp`;
  return (
    <CraftBanner art={art}>
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="font-display font-black uppercase text-xl leading-none m-0">{t("craft.workshop.title")}</h2>
        <span className="text-sm text-muted-foreground">{t("craft.improves.workshop")}</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm tabular-nums">
        <span className="font-semibold text-foreground">{t("craft.workshop.level", { level: view.workshop, max: view.maxLevel })}</span>
        <span className="text-muted-foreground">{t("craft.workshop.benches", { count: view.benches })}</span>
        <span className="text-muted-foreground">{t("craft.workshop.foreman", { stars: view.foremanStars, value: speed })}</span>
      </div>
    </div>
    </CraftBanner>
  );
}

function Benches({ view }: { view: CraftView }) {
  const { t } = useTranslation();
  const working = view.queue.filter((j) => j.startedOn);
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 phone:grid-cols-3 gap-3">
      {Array.from({ length: view.benches }, (_, i) => {
        const job = working[i];
        if (!job) {
          return (
            <div key={i} className="rounded-md border border-dashed border-border p-3 flex flex-col gap-1 min-h-24">
              <span className={LABEL}>{t("craft.workshop.bench", { n: i + 1 })}</span>
              <span className="text-sm text-muted-foreground">{t("craft.workshop.free")}</span>
            </div>
          );
        }
        const left = job.daysLeft ?? job.days;
        const pct = Math.round(Math.min(1, Math.max(0, (job.days - left) / Math.max(1, job.days))) * 100);
        return (
          <div key={i} className="rounded-md border border-border bg-card p-3 flex flex-col gap-2 min-h-24">
            <span className={LABEL}>{t("craft.workshop.bench", { n: i + 1 })}</span>
            <span className="flex items-center gap-2 min-w-0">
              <CraftIcon kind="component" id={job.component} />
              <span className="font-semibold text-foreground truncate">{t(`craft.component.${job.component}`)}</span>
              <span className="text-sm tabular-nums text-muted-foreground shrink-0">×{job.qty}</span>
            </span>
            <span className="flex items-center gap-2">
              <span className="h-1.5 flex-1 min-w-16 bg-border rounded overflow-hidden" aria-hidden>
                <span className="block h-full bg-primary" style={{ width: `${pct}%` }} />
              </span>
              <span className="text-sm tabular-nums text-muted-foreground shrink-0">{t("craft.workshop.daysLeft", { count: left })}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Queue({ view, busy, onAction }: {
  view: CraftView; busy: boolean; onAction: (jobId: string, action: "up" | "down" | "cancel") => void;
}) {
  const { t } = useTranslation();
  const [confirm, setConfirm] = useState<string | null>(null);
  const waiting = view.queue.filter((j) => !j.startedOn);
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-display font-black uppercase text-xl leading-none m-0">{t("craft.workshop.queue")}</h3>
        <span className="text-sm text-muted-foreground tabular-nums">{t("craft.workshop.queueCount", { count: view.queue.length, max: view.maxQueue })}</span>
      </div>
      {view.queue.length === 0 ? (
        <p className="text-sm text-muted-foreground m-0">{t("craft.workshop.queueEmpty")}</p>
      ) : (
        <StatsTable head={<>
          <StatsHead>{t("craft.workshop.component")}</StatsHead>
          <StatsHead align="center">{t("craft.workshop.qty")}</StatsHead>
          <StatsHead align="center">{t("craft.workshop.time")}</StatsHead>
          <StatsHead>{t("craft.workshop.status")}</StatsHead>
          <StatsHead align="right"><span className="sr-only">{t("craft.workshop.cancel")}</span></StatsHead>
        </>}>
          {view.queue.map((j) => {
            const w = waiting.indexOf(j);
            return (
              <StatsRow key={j.id}>
                <StatsCell>
                  <span className="flex items-center gap-2">
                    <CraftIcon kind="component" id={j.component} />
                    <span className="font-semibold text-foreground">{t(`craft.component.${j.component}`)}</span>
                  </span>
                </StatsCell>
                <StatsCell align="center" className="tabular-nums">{j.qty}</StatsCell>
                <StatsCell align="center" className="tabular-nums text-muted-foreground">{t("craft.workshop.days", { count: j.days })}</StatsCell>
                <StatsCell className="text-sm tabular-nums">
                  {j.startedOn
                    ? <span className="text-primary">{t("craft.workshop.daysLeft", { count: j.daysLeft ?? j.days })}</span>
                    : <span className="text-muted-foreground">{t("craft.workshop.waiting")}</span>}
                </StatsCell>
                <StatsCell align="right">
                  <span className="inline-flex items-center gap-1">
                    {!j.startedOn && (
                      <>
                        <Button variant="secondary" flush onClick={() => onAction(j.id, "up")} disabled={busy || w <= 0}
                          aria-label={t("craft.workshop.up")} title={t("craft.workshop.up")}>
                          <Icon name="chevron-up" size={16} />
                        </Button>
                        <Button variant="secondary" flush onClick={() => onAction(j.id, "down")} disabled={busy || w >= waiting.length - 1}
                          aria-label={t("craft.workshop.down")} title={t("craft.workshop.down")}>
                          <Icon name="chevron-down" size={16} />
                        </Button>
                      </>
                    )}
                    {confirm === j.id ? (
                      <>
                        <Button variant="danger" onClick={() => { setConfirm(null); onAction(j.id, "cancel"); }} disabled={busy}>
                          {t("craft.workshop.cancel")}
                        </Button>
                        <Button variant="secondary" onClick={() => setConfirm(null)}>{t("craft.keep")}</Button>
                      </>
                    ) : (
                      <Button variant="secondary" flush onClick={() => (j.startedOn ? setConfirm(j.id) : onAction(j.id, "cancel"))}
                        disabled={busy} aria-label={t("craft.workshop.cancel")} title={t("craft.workshop.cancel")}>
                        <Icon name="close" size={16} />
                      </Button>
                    )}
                  </span>
                </StatsCell>
              </StatsRow>
            );
          })}
        </StatsTable>
      )}
    </section>
  );
}

function NewOrder({ view, busy, onMake }: {
  view: CraftView; busy: boolean; onMake: (c: ComponentId, qty: number, goodShare: number | undefined) => void;
}) {
  const { t } = useTranslation();
  const open = view.recipes.filter((r) => !r.locked);
  const locked = view.recipes.filter((r) => r.locked);
  const [component, setComponent] = useState<ComponentId>(open[0]?.component ?? "beam");
  const [qty, setQty] = useState(5);
  const [supplier, setSupplier] = useState<SupplierPick>("auto");
  const need = materialsFor(component, qty);
  const days = jobDays(component, qty, view.workshop, view.foremanSpeed);
  const enough = (Object.entries(need) as [MaterialId, number][]).every(([m, n]) => {
    const s = view.stock.materials[m];
    if (supplier === "standard") return (s?.standard ?? 0) >= n;
    if (supplier === "good") return (s?.good ?? 0) >= n;
    return materialTotal(view.stock, m) >= n;
  });
  const full = view.queue.length >= view.maxQueue;
  return (
    <section className="card-arcade rounded-md p-4 flex flex-col gap-4">
      <h3 className="font-display font-black uppercase text-xl leading-none m-0">{t("craft.workshop.newOrder")}</h3>
      <div className="flex flex-col gap-2">
        <span className={LABEL}>{t("craft.workshop.component")}</span>
        <OptionChips
          options={open.map((r) => ({ key: r.component, label: t(`craft.component.${r.component}`) }))}
          value={component} onChange={setComponent} aria-label={t("craft.workshop.component")}
        />
        {locked.length > 0 && (
          <span className="text-sm text-muted-foreground">
            {locked.map((r) => `${t(`craft.component.${r.component}`)}: ${t("craft.recipe.lockedAt", { level: r.minLevel })}`).join(" · ")}
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-[180px_minmax(0,1fr)] gap-4">
        <div className="flex flex-col gap-2">
          <span className={LABEL}>{t("craft.workshop.qty")}</span>
          <StepperField value={qty} onChange={setQty} min={1} max={MAX_QTY} step={(v, d) => v + d}
            downLabel={t("common.decrease")} upLabel={t("common.increase")} ariaLabel={t("craft.workshop.qty")} />
        </div>
        <div className="flex flex-col gap-2 min-w-0">
          <span className={LABEL}>{t("craft.workshop.supplier")}</span>
          <OptionChips
            options={(["auto", "standard", "good"] as SupplierPick[]).map((k) => ({
              key: k, label: t(`craft.workshop.supplier${k[0]!.toUpperCase()}${k.slice(1)}`),
            }))}
            value={supplier} onChange={setSupplier} aria-label={t("craft.workshop.supplier")}
          />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <span className={LABEL}>{t("craft.workshop.uses")}</span>
        <ul className="m-0 p-0 list-none flex flex-wrap gap-2">
          {(Object.entries(need) as [MaterialId, number][]).map(([m, n]) => {
            const have = materialTotal(view.stock, m);
            return (
              <li key={m} className={`flex items-center gap-2 rounded-md border px-2 py-1 text-sm tabular-nums ${have < n ? "border-destructive/50" : "border-border"}`}>
                <CraftIcon kind="material" id={m} size={22} />
                <span className="text-foreground">{t(`craft.material.${m}`)}</span>
                <span className={`font-semibold ${have < n ? "text-destructive" : "text-primary"}`}>{t("craft.recipe.have", { have: Math.min(have, n), need: n })}</span>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground tabular-nums">
          {t("craft.workshop.time")}: {t("craft.workshop.days", { count: days })}
          {!enough && <span className="text-destructive"> · {t("craft.errors.missingMaterials")}</span>}
          {full && <span className="text-destructive"> · {t("craft.errors.queueFull")}</span>}
        </span>
        <Button onClick={() => onMake(component, qty, GOOD_SHARE[supplier])} disabled={busy || !enough || full || open.length === 0}>
          <Icon name="hammer" size={16} />
          {t("craft.workshop.make")}
        </Button>
      </div>
    </section>
  );
}

function Upgrade({ view, busy, onUpgrade }: { view: CraftView; busy: boolean; onUpgrade: () => void }) {
  const { t } = useTranslation();
  if (!view.upgrade) return <p className="text-sm text-muted-foreground m-0">{t("craft.workshop.maxed")}</p>;
  const missing = missingComponents(view.stock, view.upgrade.recipe);
  const ok = Object.keys(missing).length === 0;
  return (
    <section className="card-arcade rounded-md p-4 flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h3 className="font-display font-black uppercase text-xl leading-none m-0">{t("craft.workshop.upgrade")}</h3>
        <span className="text-sm text-muted-foreground">{t("craft.workshop.upgradeTo", { level: view.upgrade.level })}</span>
      </div>
      <RecipeLine recipe={view.upgrade.recipe} missing={missing} />
      <div className="flex justify-end">
        <Button onClick={onUpgrade} disabled={busy || !ok}>
          <Icon name="building" size={16} />
          {t("craft.workshop.upgrade")}
        </Button>
      </div>
    </section>
  );
}
