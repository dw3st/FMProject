import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@/GameInterface/Icons";
import { Button } from "@/GameInterface/ui/Button";
import { OptionChips } from "@/GameInterface/ui/OptionChips";
import { formatEuros } from "@/Domain/money";
import { FACILITIES } from "@/Domain/facilities/facilityConfig";
import type { ItemEffect } from "@/Domain/facilities/facilityItems";
import type { FacilityGroup, FacilityProject, FacilityRequest } from "@/types/facilityTypes";
import type { FacilitiesViewData, FacilityItemView, ItemQuote } from "@/GameInterface/Facilities/facilitiesApi";
import { FacilityItemArt, type ArtTone } from "@/GameInterface/Facilities/FacilityItemArt";
import { formatGameDate } from "@/GameInterface/formatDate";
import { RunningWorks, runningWorksOf } from "@/GameInterface/Facilities/RunningWorks";

type Mode = "repair" | "rebuild" | "upgrade";
type RepairStep = "25" | "50" | "100";

const GROUPS: FacilityGroup[] = ["stadium", "training", "academy"];
const MODES: Mode[] = ["repair", "rebuild", "upgrade"];

/** Condition bar colour: fine from 40%, amber 15–39%, red below (or condemned). */
export function conditionTone(condition: number, condemned: boolean): { bar: string; text: string; art: ArtTone } {
  if (condemned || condition < FACILITIES.WEAR.CONDEMN_BELOW) return { bar: "bg-destructive", text: "text-destructive", art: "bad" };
  if (condition < FACILITIES.WEAR.WARN_BELOW) return { bar: "bg-chart-4", text: "text-chart-4", art: "warn" };
  return { bar: "bg-primary", text: "text-foreground", art: "ok" };
}

type TFn = (key: string, opts?: Record<string, unknown>) => string;

/** One line with what an item below 40% costs the club. */
export function itemEffectText(effects: ItemEffect[], t: TFn, lang: string): string {
  return effects.map((e) => {
    if (e.key === "intakeQuality") return t("facilities.effect.intakeQuality", { value: `−${Math.abs(e.value).toLocaleString(lang, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` });
    const pct = Math.round((e.value - 1) * 100);
    return t(`facilities.effect.${e.key}`, { pct: `${pct >= 0 ? "+" : "−"}${Math.abs(pct)}%` });
  }).join(" · ");
}

/** Modes with a quote for the item (repair needs a repair target below 100%). */
function modesOf(item: FacilityItemView): Mode[] {
  return MODES.filter((m) => (m === "repair" ? !item.condemned && item.quotes.repair["100"] !== null : item.quotes[m] !== null));
}

/**
 * Club → "Facilities in detail" (#132, `.claude/rules/game/facilities.md`): the ten items drawn as
 * cards by group (stadium, training ground, academy) with level ("N of 10") and condition; picking
 * one opens its panel with the drawing, the repair / rebuild / upgrade quotes and what the board
 * would say. One works at a time per group (#152); a small repair paid now does not count.
 */
export function FacilityItemsPanel({
  data, pending, onAsk,
}: {
  data: FacilitiesViewData;
  pending: boolean;
  onAsk: (req: FacilityRequest) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string | null>(null);
  const busy = new Set(data.busyGroups ?? []);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display font-black uppercase text-xl leading-none m-0">{t("facilities.items.title")}</h2>
          <p className="text-sm text-muted-foreground mt-1 mb-0">{t("facilities.items.about")}</p>
        </div>
        <span className="text-sm text-muted-foreground tabular-nums">
          {t("facilities.slots", { count: busy.size, max: GROUPS.length })}
        </span>
      </div>
      {GROUPS.map((g) => {
        const items = data.items.filter((it) => it.group === g);
        const open = items.find((it) => it.id === selected) ?? null;
        return (
          <div key={g} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground">
                {t(`facilities.items.group.${g}`)}
              </span>
              {busy.has(g) && (
                <span className="flex items-center gap-1.5 text-sm text-chart-4">
                  <Icon name="construction" size={16} />
                  {t("facilities.groupWorks")}
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
              {items.map((it) => (
                <ItemCard key={it.id} item={it} selected={selected === it.id}
                  onSelect={() => setSelected(selected === it.id ? null : it.id)} />
              ))}
            </div>
            {open && (
              <ItemDetail key={open.id} item={open} groupBusy={busy.has(g)} pending={pending}
                running={runningWorksOf(data.facilities.projects, g)} date={data.date}
                onClose={() => setSelected(null)}
                onConfirm={async (req) => { await onAsk(req); setSelected(null); }} />
            )}
          </div>
        );
      })}
    </section>
  );
}

const LABEL = "font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground";

function ItemCard({ item, selected, onSelect }: { item: FacilityItemView; selected: boolean; onSelect: () => void }) {
  const { t, i18n } = useTranslation();
  const tone = conditionTone(item.condition, item.condemned);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex flex-col gap-2 rounded-md border bg-card p-3 text-left cursor-pointer transition-colors min-w-0 ${
        selected ? "border-primary ring-1 ring-primary" : "border-border hover:border-muted-foreground"}`}
    >
      <FacilityItemArt id={item.id} tone={tone.art} closed={item.condemned} works={item.project !== null} level={item.level} />
      <span className="font-semibold text-foreground truncate">{t(`facilities.item.${item.id}`)}</span>
      <span className="flex flex-col gap-1">
        <span className="flex items-center justify-between gap-2">
          <span className={LABEL}>{t("facilities.items.level")}</span>
          <span className="flex items-center gap-2">
            <ItemLevelMarks level={item.level} />
            <span className="text-sm tabular-nums text-muted-foreground">{t("facilities.items.levelOf", { level: item.level })}</span>
          </span>
        </span>
      </span>
      <span className="flex flex-col gap-1" title={t("facilities.items.conditionHint")}>
        <span className={LABEL}>{t("facilities.items.condition")}</span>
        <ConditionLine item={item} />
      </span>
      {item.project ? (
        <span className="flex flex-col gap-1">
          <span className="flex items-center justify-between gap-2">
            <span className={LABEL}>{t("facilities.items.works", { kind: t(`facilities.kind.${item.project.kind}`) })}</span>
            <span className="text-sm tabular-nums text-muted-foreground">{t("facilities.items.delivery", { date: formatGameDate(item.project.end, i18n.language) })}</span>
          </span>
          <span className="flex items-center gap-2">
            <span className="h-1.5 flex-1 min-w-16 bg-border rounded overflow-hidden" aria-hidden>
              <span className="block h-full bg-chart-4" style={{ width: `${Math.round(item.project.progress * 100)}%` }} />
            </span>
            <span className="text-sm font-semibold tabular-nums text-chart-4">{t("facilities.items.done", { pct: Math.round(item.project.progress * 100) })}</span>
          </span>
        </span>
      ) : item.effects.length > 0 ? (
        <span className="text-sm text-muted-foreground tabular-nums">{itemEffectText(item.effects, t, i18n.language)}</span>
      ) : null}
    </button>
  );
}

function ConditionLine({ item }: { item: FacilityItemView }) {
  const { t, i18n } = useTranslation();
  const tone = conditionTone(item.condition, item.condemned);
  return (
    <span className="flex items-center gap-2">
      <span className="h-1.5 flex-1 min-w-16 bg-border rounded overflow-hidden" aria-hidden>
        <span className={`block h-full ${tone.bar}`} style={{ width: `${Math.round(item.condition)}%` }} />
      </span>
      <span className={`text-sm font-semibold tabular-nums ${tone.text}`}>
        {item.condemned ? t("facilities.items.condemned") : `${Math.round(item.condition).toLocaleString(i18n.language)}%`}
      </span>
    </span>
  );
}

function ItemLevelMarks({ level }: { level: number }) {
  return (
    <span className="flex gap-0.5" aria-hidden>
      {Array.from({ length: FACILITIES.ITEM_MAX_LEVEL }, (_, i) => (
        <span key={i} className={`h-1.5 w-2 rounded-sm ${i < level ? "bg-primary" : "bg-border"}`} />
      ))}
    </span>
  );
}

/** The item's panel: the drawing, the works it can get, cost, duration and the forecast. */
function ItemDetail({
  item, groupBusy, pending, onClose, onConfirm, running, date,
}: {
  item: FacilityItemView; groupBusy: boolean; pending: boolean; running?: FacilityProject; date: string;
  onClose: () => void; onConfirm: (req: FacilityRequest) => Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const modes = modesOf(item);
  const [mode, setMode] = useState<Mode | null>(modes.includes("upgrade") ? "upgrade" : modes[0] ?? null);
  const steps = (["25", "50", "100"] as RepairStep[]).filter((s) => item.quotes.repair[s] !== null);
  const [step, setStep] = useState<RepairStep>(steps.includes("100") ? "100" : steps[0] ?? "100");
  const tone = conditionTone(item.condition, item.condemned);
  const quote: ItemQuote | null = mode === null ? null : mode === "repair" ? item.quotes.repair[step] : item.quotes[mode];

  return (
    <div className="card-arcade rounded-md p-4 grid grid-cols-1 md:grid-cols-[minmax(0,260px)_minmax(0,1fr)] gap-5">
      <div className="flex flex-col gap-3">
        <FacilityItemArt id={item.id} tone={tone.art} closed={item.condemned} works={item.project !== null} level={item.level} />
        <span className="flex items-center justify-between gap-2">
          <span className="text-sm tabular-nums text-muted-foreground">{t("facilities.items.levelOf", { level: item.level })}</span>
          <ItemLevelMarks level={item.level} />
        </span>
        <ConditionLine item={item} />
      </div>
      <div className="flex flex-col gap-4 min-w-0">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-display font-black uppercase text-xl leading-none m-0">{t(`facilities.item.${item.id}`)}</h3>
          <Button variant="secondary" flush onClick={onClose} aria-label={t("common.close")}>
            <Icon name="close" size={16} />
          </Button>
        </div>
        {item.project ? (
          <p className="text-sm text-muted-foreground m-0 tabular-nums">
            {t(`facilities.kind.${item.project.kind}`)} · {t("facilities.projects.delivery", { date: formatGameDate(item.project.end, i18n.language) })}
            {" · "}{Math.round(item.project.progress * 100)}%
          </p>
        ) : mode === null ? (
          <p className="text-sm text-muted-foreground m-0">{t("facilities.items.full")}</p>
        ) : (
          <>
            {modes.length > 1 && (
              <OptionChips
                options={modes.map((m) => ({ key: m, label: t(`facilities.items.${m}`) }))}
                value={mode}
                onChange={setMode}
                aria-label={t("facilities.items.actions")}
              />
            )}
            {mode === "repair" && steps.length > 1 && (
              <OptionChips
                options={steps.map((s) => ({ key: s, label: t("facilities.items.to", { pct: item.quotes.repair[s]!.to }) }))}
                value={step}
                onChange={setStep}
                aria-label={t("facilities.items.repair")}
              />
            )}
            {quote && (
              <QuoteBlock item={item} mode={mode} quote={quote} groupBusy={groupBusy} pending={pending}
                running={running} date={date}
                onConfirm={() => void onConfirm(mode === "repair"
                  ? { kind: "repair", item: item.id, to: quote.to ?? 100 }
                  : { kind: mode, item: item.id })} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function QuoteBlock({
  item, mode, quote, groupBusy, pending, onConfirm, running, date,
}: {
  item: FacilityItemView; mode: Mode; quote: ItemQuote; groupBusy: boolean; pending: boolean; onConfirm: () => void;
  running?: FacilityProject; date: string;
}) {
  const { t } = useTranslation();
  const f = quote.forecast;
  // A small repair is paid now and never waits for the group's works slot.
  const blocked = groupBusy && !f.paidByClub;
  const ok = f.approved && !blocked;
  const hint = blocked
    ? t("facilities.groupBusy", { group: t(`facilities.items.group.${item.group}`) })
    : f.approved
      ? f.paidByClub
        ? t("facilities.items.paidByClub")
        : f.boardShare && f.boardShare > 0
          ? t("facilities.preview.funded", { pct: Math.round(f.boardShare * 100) })
          : t("facilities.preview.approve")
      : t(`facilities.reason.${f.reason ?? "no_money"}`);
  return (
    <>
      <p className="text-sm text-muted-foreground m-0">
        {t(`facilities.items.about${mode[0]!.toUpperCase()}${mode.slice(1)}`, { level: quote.level ?? item.level })}
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Figure label={t("facilities.cost")} value={formatEuros(quote.cost)} />
        <Figure label={t("facilities.duration")} value={t("facilities.weeks", { count: quote.weeks })} />
        <Figure label={t("facilities.items.condition")} value={`${Math.round(item.condition)}% → ${quote.to ?? 100}%`} />
        <Figure label={t("facilities.items.level")} value={quote.level !== undefined ? `${item.level} → ${quote.level}` : String(item.level)} />
      </div>
      {blocked && running && <RunningWorks project={running} date={date} />}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className={`text-sm flex items-center gap-1.5 ${ok ? "text-chart-2" : "text-muted-foreground"}`}>
          <Icon name={ok ? "check-circle" : "alert"} size={16} />
          {hint}
        </span>
        <Button onClick={onConfirm} disabled={pending || !ok}>
          <Icon name="building" size={16} />
          {f.paidByClub ? t("facilities.items.confirmPay") : t("facilities.ask")}
        </Button>
      </div>
    </>
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
