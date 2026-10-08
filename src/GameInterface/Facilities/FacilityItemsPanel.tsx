import { Fragment, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@/GameInterface/Icons";
import { Button } from "@/GameInterface/ui/Button";
import { OptionChips } from "@/GameInterface/ui/OptionChips";
import { TABLE_CELL, TABLE_STYLE } from "@/GameInterface/ui/leagueTableStyle";
import { formatEuros } from "@/Domain/money";
import { FACILITIES } from "@/Domain/facilities/facilityConfig";
import type { ItemEffect } from "@/Domain/facilities/facilityItems";
import type { FacilityGroup, FacilityRequest } from "@/types/facilityTypes";
import type { FacilitiesViewData, FacilityItemView, ItemQuote } from "@/GameInterface/Facilities/facilitiesApi";

type Mode = "repair" | "rebuild" | "upgrade";
type RepairStep = "25" | "50" | "100";

const GROUPS: FacilityGroup[] = ["stadium", "training", "academy"];

/** Condition bar colour: fine from 40%, amber 15–39%, red below (or condemned). */
export function conditionTone(condition: number, condemned: boolean): { bar: string; text: string } {
  if (condemned || condition < FACILITIES.WEAR.CONDEMN_BELOW) return { bar: "bg-destructive", text: "text-destructive" };
  if (condition < FACILITIES.WEAR.WARN_BELOW) return { bar: "bg-chart-4", text: "text-chart-4" };
  return { bar: "bg-primary", text: "text-foreground" };
}

type TFn = (key: string, opts?: Record<string, unknown>) => string;

/** One line with what an item below 40% costs the club. */
export function itemEffectText(effects: ItemEffect[], t: TFn): string {
  return effects.map((e) => {
    if (e.key === "intakeQuality") return t("facilities.effect.intakeQuality", { value: `−${Math.abs(e.value).toFixed(2)}` });
    const pct = Math.round((e.value - 1) * 100);
    return t(`facilities.effect.${e.key}`, { pct: `${pct >= 0 ? "+" : "−"}${Math.abs(pct)}%` });
  }).join(" · ");
}

/**
 * Club → "Facilities in detail" (`.claude/rules/game/facilities.md`): the ten items by group with
 * level ("N of 10"), condition, what they cost below 40%, works under way, and the repair, rebuild
 * and upgrade requests (a small repair is paid by the club; the rest goes to the board).
 */
export function FacilityItemsPanel({
  data, pending, onAsk,
}: {
  data: FacilitiesViewData;
  pending: boolean;
  onAsk: (req: FacilityRequest) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<{ id: string; mode: Mode } | null>(null);

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="font-display font-black uppercase text-xl leading-none m-0">{t("facilities.items.title")}</h2>
        <p className="text-sm text-muted-foreground mt-1 mb-0">{t("facilities.items.about")}</p>
      </div>
      {GROUPS.map((g) => (
        <div key={g} className="flex flex-col gap-2">
          <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground">
            {t(`facilities.items.group.${g}`)}
          </span>
          <div className={`${TABLE_STYLE.shell} overflow-x-auto`}>
            <table className="w-full border-collapse min-w-[720px]">
              <thead className={TABLE_STYLE.head}>
                <tr>
                  <th className={`${TABLE_CELL.head} text-left`}>{t("facilities.items.item")}</th>
                  <th className={`${TABLE_CELL.head} text-left w-40`}>{t("facilities.items.level")}</th>
                  <th className={`${TABLE_CELL.head} text-left w-44`}>{t("facilities.items.condition")}</th>
                  <th className={`${TABLE_CELL.head} text-right`}>{t("facilities.items.actions")}</th>
                </tr>
              </thead>
              <tbody className={TABLE_STYLE.body}>
                {data.items.filter((it) => it.group === g).map((it) => (
                  <Fragment key={it.id}>
                    <ItemRow item={it} open={open?.id === it.id ? open.mode : null}
                      onOpen={(mode) => setOpen(open?.id === it.id && open.mode === mode ? null : { id: it.id, mode })} />
                    {open?.id === it.id && (
                      <tr>
                        <td colSpan={4} className="px-4 py-3 bg-secondary/20">
                          <RepairPanel item={it} mode={open.mode} pending={pending}
                            onCancel={() => setOpen(null)}
                            onConfirm={async (req) => { await onAsk(req); setOpen(null); }} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </section>
  );
}

function ItemRow({ item, open, onOpen }: { item: FacilityItemView; open: Mode | null; onOpen: (m: Mode) => void }) {
  const { t, i18n } = useTranslation();
  const tone = conditionTone(item.condition, item.condemned);
  const busy = item.project !== null;
  const repairable = !item.condemned && item.quotes.repair["100"] !== null;
  const action = (mode: Mode, enabled: boolean, why: string | undefined) => (
    <Button variant="secondary" className="h-8 px-2" disabled={busy || !enabled} title={busy ? t("facilities.busy") : why}
      aria-pressed={open === mode} onClick={() => onOpen(mode)}>
      {t(`facilities.items.${mode}`)}
    </Button>
  );
  return (
    <tr className={TABLE_STYLE.row}>
      <td className={TABLE_CELL.body}>
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className={TABLE_STYLE.name}>{t(`facilities.item.${item.id}`)}</span>
          {item.project ? (
            <span className="flex items-center gap-2 text-sm text-muted-foreground tabular-nums">
              <span className="h-1.5 w-16 bg-border rounded overflow-hidden shrink-0">
                <span className="block h-full bg-primary" style={{ width: `${Math.round(item.project.progress * 100)}%` }} />
              </span>
              {t(`facilities.kind.${item.project.kind}`)} · {t("facilities.projects.delivery", { date: item.project.end })}
            </span>
          ) : item.effects.length > 0 ? (
            <span className="text-sm text-muted-foreground tabular-nums">{itemEffectText(item.effects, t)}</span>
          ) : null}
        </div>
      </td>
      <td className={TABLE_CELL.body}>
        <div className="flex flex-col gap-1">
          <span className="text-sm tabular-nums text-foreground">{t("facilities.items.levelOf", { level: item.level })}</span>
          <ItemLevelMarks level={item.level} />
        </div>
      </td>
      <td className={TABLE_CELL.body}>
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-20 bg-border rounded overflow-hidden shrink-0" aria-hidden>
            <span className={`block h-full ${tone.bar}`} style={{ width: `${Math.round(item.condition)}%` }} />
          </span>
          <span className={`text-sm font-semibold tabular-nums ${tone.text}`}>
            {item.condemned ? t("facilities.items.condemned") : `${Math.round(item.condition).toLocaleString(i18n.language)}%`}
          </span>
        </div>
      </td>
      <td className={`${TABLE_CELL.body} text-right whitespace-nowrap`}>
        {action("repair", repairable, item.condemned ? t("facilities.items.onlyRebuild") : t("facilities.items.full"))}
        {action("rebuild", item.quotes.rebuild !== null, t("facilities.items.rebuildBelow"))}
        {action("upgrade", item.quotes.upgrade !== null, t("facilities.reason.maxLevel"))}
      </td>
    </tr>
  );
}

function ItemLevelMarks({ level }: { level: number }) {
  return (
    <span className="flex gap-0.5" aria-hidden>
      {Array.from({ length: FACILITIES.ITEM_MAX_LEVEL }, (_, i) => (
        <span key={i} className={`h-1.5 w-2.5 rounded-sm ${i < level ? "bg-primary" : "bg-border"}`} />
      ))}
    </span>
  );
}

function RepairPanel({
  item, mode, pending, onCancel, onConfirm,
}: {
  item: FacilityItemView; mode: Mode; pending: boolean;
  onCancel: () => void; onConfirm: (req: FacilityRequest) => Promise<void>;
}) {
  const { t } = useTranslation();
  const steps = (["25", "50", "100"] as RepairStep[]).filter((s) => item.quotes.repair[s] !== null);
  const [step, setStep] = useState<RepairStep>(steps.includes("100") ? "100" : steps[0] ?? "100");
  const quote: ItemQuote | null = mode === "repair" ? item.quotes.repair[step] : item.quotes[mode];
  if (!quote) return null;
  const f = quote.forecast;
  const hint = f.approved
    ? f.paidByClub
      ? t("facilities.items.paidByClub")
      : f.boardShare && f.boardShare > 0
        ? t("facilities.preview.funded", { pct: Math.round(f.boardShare * 100) })
        : t("facilities.preview.approve")
    : t(`facilities.reason.${f.reason ?? "no_money"}`);
  const request: FacilityRequest = mode === "repair"
    ? { kind: "repair", item: item.id, to: quote.to ?? 100 }
    : { kind: mode, item: item.id };
  return (
    <div className="flex flex-col gap-3">
      <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground">
        {t(`facilities.kind.${mode}`)} · {t(`facilities.item.${item.id}`)}
      </span>
      {mode === "repair" && steps.length > 1 && (
        <OptionChips
          options={steps.map((s) => ({ key: s, label: t("facilities.items.to", { pct: item.quotes.repair[s]!.to }) }))}
          value={step}
          onChange={setStep}
          aria-label={t("facilities.items.repair")}
        />
      )}
      <p className="text-sm text-muted-foreground m-0">{t(`facilities.items.about${mode[0]!.toUpperCase()}${mode.slice(1)}`, { level: quote.level ?? item.level })}</p>
      <div className="flex flex-wrap gap-6">
        <Figure label={t("facilities.cost")} value={formatEuros(quote.cost)} />
        <Figure label={t("facilities.duration")} value={t("facilities.weeks", { count: quote.weeks })} />
        <Figure label={t("facilities.items.condition")} value={`${Math.round(item.condition)}% → ${quote.to ?? 100}%`} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className={`text-sm flex items-center gap-1.5 ${f.approved ? "text-chart-2" : "text-muted-foreground"}`}>
          <Icon name={f.approved ? "check-circle" : "alert"} size={16} />
          {hint}
        </span>
        <span className="flex items-center gap-2">
          <Button variant="secondary" onClick={onCancel}>{t("common.cancel")}</Button>
          <Button onClick={() => void onConfirm(request)} disabled={pending || !f.approved}>
            <Icon name="building" size={16} />
            {f.paidByClub ? t("facilities.items.confirmPay") : t("facilities.ask")}
          </Button>
        </span>
      </div>
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground">{label}</span>
      <span className="font-display font-bold text-lg tabular-nums text-foreground leading-none">{value}</span>
    </div>
  );
}
