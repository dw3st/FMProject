import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@/GameInterface/Icons";
import { OptionChips } from "@/GameInterface/ui/OptionChips";
import { CraftIcon } from "@/GameInterface/Craft/CraftIcon";
import { BuildActions } from "@/GameInterface/Craft/RecipeLine";
import { CancelWorks, conditionTone } from "@/GameInterface/Facilities/FacilityItemsPanel";
import { FacilityItemArt } from "@/GameInterface/Facilities/FacilityItemArt";
import { RunningWorks, runningWorksOf } from "@/GameInterface/Facilities/RunningWorks";
import type { FacilitiesViewData, FacilityItemView, ItemQuote } from "@/GameInterface/Facilities/facilitiesApi";
import { CLUB_MAP_FILE, ITEM_POS, STAND_POS } from "@/GameInterface/Facilities/clubMapLayout";
import { formatGameDate, formatSigned } from "@/GameInterface/formatDate";
import { gameArtUrl, newVisualOn, paintedFacility } from "@/Domain/art/paintedFaces";
import { FACILITIES } from "@/Domain/facilities/facilityConfig";
import {
  benefitContext, higherIsBetter, itemLevelBenefit, itemLevelTrack, type BenefitValue,
} from "@/Domain/facilities/levelBenefit";
import { CRAFT, MATERIALS } from "@/Domain/craft/craftConfig";
import { craftableMissing, materialTotal, materialsNeeded } from "@/Domain/craft/shortfall";
import type { ComponentCounts, ComponentId, CraftStock, MaterialId } from "@/types/craftTypes";
import type { FacilityGroup, FacilityItemId, FacilityRequest } from "@/types/facilityTypes";

type Mode = "upgrade" | "repair" | "rebuild";
type RepairStep = "25" | "50" | "100";
type Upgrade = "ready" | "missing" | null;
type TFn = (key: string, opts?: Record<string, unknown>) => string;

const GROUPS: FacilityGroup[] = ["stadium", "training", "academy"];
const LABEL = "font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground";

/** "+" of an item: green = the next level can be built from the stock now, amber = components missing, none = max level or the area busy. */
export function upgradeState(item: FacilityItemView, groupBusy: boolean): Upgrade {
  const q = item.quotes.upgrade;
  if (!q || groupBusy || item.project) return null;
  return q.build.canBuild ? "ready" : "missing";
}

/** Condition dot: green from 70%, amber 40–69%, red below. */
const conditionDot = (it: FacilityItemView) =>
  it.condemned || it.condition < FACILITIES.WEAR.WARN_BELOW ? "bg-destructive" : it.condition < 70 ? "bg-chart-4" : "bg-star-green";

const upgradeTone = (u: Upgrade) => (u === "ready" ? "bg-star-green" : "bg-chart-4");

/** One benefit value in the units the game reads: ±N%, an intake level, a chance, seasons. */
export function benefitText(v: BenefitValue, t: TFn, lang: string): string {
  const n = (x: number, d = 1) => x.toLocaleString(lang, { maximumFractionDigits: d });
  switch (v.kind) {
    case "mult": {
      const p = (v.value - 1) * 100;
      const r = Math.round(p * 10) / 10;
      return r === 0 ? "0%" : `${r > 0 ? "+" : "−"}${n(Math.abs(r))}%`;
    }
    case "add": return formatSigned(v.value, lang);
    case "chance": return `${n(v.value * 100)}%`;
    case "seasons": return t("facilities.benefit.seasons", { count: Math.round(v.value * 10) / 10, value: n(v.value) });
  }
}

/** Upgrade marker of every item (the area's works blocks it). */
function useUpgrades(data: FacilitiesViewData) {
  const busy = useMemo(() => new Set(data.busyGroups ?? []), [data.busyGroups]);
  const upgrades = useMemo(
    () => Object.fromEntries(data.items.map((it) => [it.id, upgradeState(it, busy.has(it.group))])) as Record<FacilityItemId, Upgrade>,
    [data.items, busy],
  );
  return { busy, upgrades };
}

/** The item the screen opens on: one ready to upgrade, else one missing components, else the first. */
export function defaultItem(data: FacilitiesViewData): FacilityItemId {
  const busy = new Set(data.busyGroups ?? []);
  const state = (it: FacilityItemView) => upgradeState(it, busy.has(it.group));
  return data.items.find((it) => state(it) === "ready")?.id
    ?? data.items.find((it) => state(it) === "missing")?.id ?? data.items[0]?.id ?? "stadiumPitch";
}

/**
 * Club → Facilities (craft, mocks B + A of 2026-11-18; own tab since 12.21): the painted club complex with each item's
 * level, an upgrade marker and its condition, and next to it the picked item's panel (next level's components, the
 * materials to make the missing ones, its real benefit, the works); below, its level track 1..10. Without the new
 * visual the area cards take the map's place.
 */
export function ClubFacilitiesHub({
  data, selected, onSelect, pending, onAsk, onCancel,
}: {
  data: FacilitiesViewData;
  selected: FacilityItemId;
  onSelect: (id: FacilityItemId) => void;
  pending: boolean;
  onAsk: (req: FacilityRequest) => Promise<void>;
  onCancel: (projectId: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const { busy, upgrades } = useUpgrades(data);
  const setSelected = onSelect;
  const [mapFailed, setMapFailed] = useState(false);
  const item = data.items.find((it) => it.id === selected) ?? data.items[0];
  const ctx = useMemo(
    () => benefitContext(Object.fromEntries(data.items.map((it) => [it.id, it])) as Record<FacilityItemId, FacilityItemView>,
      data.impliedLevel ?? FACILITIES.NEUTRAL_LEVEL),
    [data.items, data.impliedLevel],
  );
  if (!item) return null;
  const map = newVisualOn() && !mapFailed;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground m-0">{t(map ? "facilities.map.hint" : "facilities.map.hintCards")}</p>
        <MapLegend />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-6 items-start">
        {map ? (
          /* The map and, under it, the picked item's level track in two rows: the tab fits one screen. */
          <div className="flex flex-col gap-4 min-w-0">
            <ClubMap data={data} selected={item.id} upgrades={upgrades} onSelect={setSelected} onFail={() => setMapFailed(true)} />
            <LevelTrack item={item} ctx={ctx} compact />
          </div>
        ) : (
          <AreaCardsGrid data={data} selected={item.id} upgrades={upgrades} busy={busy} onSelect={setSelected} />
        )}
        <ItemPanel key={item.id} item={item} data={data} ctx={ctx} groupBusy={busy.has(item.group)}
          pending={pending} onAsk={onAsk} onCancel={onCancel} />
      </div>
      {!map && <LevelTrack item={item} ctx={ctx} />}
    </div>
  );
}

// ── Legend ────────────────────────────────────────────────────────────────────

function PlusMark({ tone, size = 24 }: { tone: string; size?: number }) {
  return (
    <span aria-hidden className={`inline-flex items-center justify-center rounded-full border-2 border-background text-background ${tone}`}
      style={{ width: size, height: size }}>
      <Icon name="plus" size={16} />
    </span>
  );
}

function MapLegend() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
      <span className="flex items-center gap-1.5 text-foreground"><PlusMark tone="bg-star-green" size={20} />{t("facilities.map.ready")}</span>
      <span className="flex items-center gap-1.5 text-foreground"><PlusMark tone="bg-chart-4" size={20} />{t("facilities.map.missing")}</span>
      <span className="flex items-center gap-2 text-muted-foreground">
        {t("facilities.map.condition")}
        {(["bg-star-green", "bg-chart-4", "bg-destructive"] as const).map((c, i) => (
          <span key={c} className="flex items-center gap-1">
            <span className={`h-2.5 w-2.5 rounded-full ${c}`} aria-hidden />
            {t(`facilities.map.cond${i}`)}
          </span>
        ))}
      </span>
    </div>
  );
}

// ── Map ───────────────────────────────────────────────────────────────────────

function ClubMap({ data, selected, upgrades, onSelect, onFail }: {
  data: FacilitiesViewData; selected: FacilityItemId; upgrades: Record<FacilityItemId, Upgrade>;
  onSelect: (id: FacilityItemId) => void; onFail: () => void;
}) {
  const { t, i18n } = useTranslation();
  const nf = (n: number) => Math.round(n).toLocaleString(i18n.language);
  return (
    <div className="relative w-full aspect-[16/7] overflow-hidden rounded-md border border-border bg-secondary/30">
      <img src={gameArtUrl(CLUB_MAP_FILE)} alt="" aria-hidden onError={onFail} draggable={false}
        className="absolute inset-0 w-full h-full object-cover select-none pointer-events-none" />
      {data.facilities.stands.map((s) => (
        <span key={s.id} style={{ left: `${STAND_POS[s.id].left}%`, top: `${STAND_POS[s.id].top}%` }}
          className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-border bg-background/80 px-2.5 py-0.5 whitespace-nowrap pointer-events-none">
          <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground tabular-nums">
            {t(`facilities.stand.${s.id}`)} · {nf(s.seats)}
          </span>
        </span>
      ))}
      {data.items.map((it) => {
        const on = it.id === selected;
        const up = upgrades[it.id];
        return (
          <button
            key={it.id}
            type="button"
            onClick={() => onSelect(it.id)}
            aria-pressed={on}
            aria-label={t("facilities.map.badge", { item: t(`facilities.item.${it.id}`), level: it.level, cond: Math.round(it.condition) })}
            title={t(`facilities.item.${it.id}`)}
            style={{ left: `${ITEM_POS[it.id].left}%`, top: `${ITEM_POS[it.id].top}%` }}
            className={`absolute -translate-x-1/2 -translate-y-1/2 h-10 w-10 rounded-full flex items-center justify-center cursor-pointer bg-background/90 ${
              on ? "border-[3px] border-primary ring-4 ring-primary/40" : "border-2 border-muted-foreground/70 hover:border-foreground"}`}
          >
            <span className="font-display font-bold text-base tabular-nums text-foreground leading-none">{t("facilities.map.level", { level: it.level })}</span>
            <span aria-hidden className={`absolute -left-1 -bottom-0.5 h-3 w-3 rounded-full border-2 border-background ${conditionDot(it)}`} />
            {up && <span className="absolute -right-3 -top-3"><PlusMark tone={upgradeTone(up)} /></span>}
            {it.project && (
              <span aria-hidden className="absolute -right-3 -top-3 h-6 w-6 rounded-full border-2 border-background bg-chart-4 text-background flex items-center justify-center">
                <Icon name="construction" size={16} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Item panel ────────────────────────────────────────────────────────────────

function modesOf(item: FacilityItemView): Mode[] {
  return (["upgrade", "repair", "rebuild"] as Mode[]).filter((m) =>
    m === "repair" ? !item.condemned && item.quotes.repair["100"] !== null : item.quotes[m] !== null);
}

function ItemThumb({ id, level, tone, className = "" }: { id: FacilityItemId; level: number; tone: "ok" | "warn" | "bad"; className?: string }) {
  const url = paintedFacility(id, level);
  const [failed, setFailed] = useState(false);
  if (url && !failed) {
    return <img src={url} alt="" aria-hidden draggable={false} onError={() => setFailed(true)}
      className={`object-cover rounded select-none ${className}`} />;
  }
  return <div className={`overflow-hidden rounded ${className}`}><FacilityItemArt id={id} tone={tone} level={level} /></div>;
}

function ItemPanel({ item, data, ctx, groupBusy, pending, onAsk, onCancel }: {
  item: FacilityItemView; data: FacilitiesViewData; ctx: ReturnType<typeof benefitContext>; groupBusy: boolean; pending: boolean;
  onAsk: (req: FacilityRequest) => Promise<void>; onCancel: (projectId: string) => Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const modes = modesOf(item);
  const [mode, setMode] = useState<Mode | null>(modes[0] ?? null);
  const steps = (["25", "50", "100"] as RepairStep[]).filter((s) => item.quotes.repair[s] !== null);
  const [step, setStep] = useState<RepairStep>(steps.includes("100") ? "100" : steps[0] ?? "100");
  const tone = conditionTone(item.condition, item.condemned);
  const quote: ItemQuote | null = mode === null ? null : mode === "repair" ? item.quotes.repair[step] : item.quotes[mode];
  const running = runningWorksOf(data.facilities.projects, item.group);
  const workshop = data.facilities.craft?.workshop ?? 1;
  const now = itemLevelBenefit(item.id, item.level, ctx);
  const next = mode === "upgrade" && quote?.level !== undefined ? itemLevelBenefit(item.id, quote.level, ctx) : null;

  const ask = () => {
    if (!mode || !quote) return;
    void onAsk(mode === "repair" ? { kind: "repair", item: item.id, to: quote.to ?? 100 } : { kind: mode, item: item.id });
  };

  return (
    <section className="card-arcade rounded-md p-4 flex flex-col gap-4 min-w-0">
      <div className="flex items-center gap-4 min-w-0">
        <ItemThumb id={item.id} level={item.level} tone={tone.art} className="w-28 h-[70px] shrink-0" />
        <div className="flex flex-col gap-1 min-w-0">
          <h3 className="font-display font-black uppercase text-xl leading-none m-0 truncate">{t(`facilities.item.${item.id}`)}</h3>
          <span className="text-sm text-muted-foreground">{t(`facilities.items.group.${item.group}`)}</span>
          <span className="text-sm text-muted-foreground tabular-nums">
            {t("facilities.map.levelCond", { level: item.level, cond: Math.round(item.condition) })}
            {item.quality ? ` · ${t("craft.qualityOf", { quality: t(`craft.quality.${item.quality}`) })}` : ""}
          </span>
        </div>
      </div>

      {item.project ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground m-0 tabular-nums">
            {t(`facilities.kind.${item.project.kind}`)} · {t("facilities.projects.delivery", { date: formatGameDate(item.project.end, i18n.language) })}
            {" · "}{Math.round(item.project.progress * 100)}%
          </p>
          {item.project.craft && <CancelWorks pending={pending} onCancel={() => onCancel(item.project!.id)} />}
        </div>
      ) : mode === null || !quote ? (
        <p className="text-sm text-muted-foreground m-0">{t("facilities.map.maxLevel")}</p>
      ) : (
        <>
          {modes.length > 1 && (
            <OptionChips options={modes.map((m) => ({ key: m, label: t(`facilities.items.${m}`) }))}
              value={mode} onChange={setMode} aria-label={t("facilities.items.actions")} />
          )}
          {mode === "repair" && steps.length > 1 && (
            <OptionChips options={steps.map((s) => ({ key: s, label: t("facilities.items.to", { pct: item.quotes.repair[s]!.to }) }))}
              value={step} onChange={setStep} aria-label={t("facilities.items.repair")} />
          )}
          <div className="flex flex-col gap-2">
            <span className={LABEL}>
              {mode === "upgrade" ? t("facilities.map.recipeOf", { level: quote.level }) : t(`facilities.map.recipe.${mode}`)}
            </span>
            <RecipeChips recipe={quote.build.recipe} missing={quote.build.missing} locked={quote.build.locked} />
          </div>
          <MaterialsForMissing missing={quote.build.missing} stock={data.stock} workshop={workshop} />
          <div className="flex flex-col gap-2">
            {next
              ? now.map((v, i) => <BenefitRow key={v.key} now={v} next={next[i]!} />)
              : <ChangeRow label={t("facilities.items.condition")} from={`${Math.round(item.condition)}%`} to={`${quote.to ?? 100}%`} better />}
            <ChangeRow label={t("facilities.duration")} to={t("facilities.weeks", { count: quote.weeks })} />
          </div>
          {groupBusy && running && <RunningWorks project={running} date={data.date} />}
          <BuildActions hideRecipe build={quote.build} stock={data.stock} workshop={workshop} pending={pending} onBuild={ask}
            blockedHint={groupBusy ? t("facilities.groupBusy", { group: t(`facilities.items.group.${item.group}`) }) : null} />
        </>
      )}
    </section>
  );
}

function RecipeChips({ recipe, missing, locked }: { recipe: ComponentCounts; missing: ComponentCounts; locked: ComponentId[] }) {
  const { t } = useTranslation();
  const entries = (Object.entries(recipe) as [ComponentId, number][]).filter(([, n]) => n > 0);
  return (
    <ul className="m-0 p-0 list-none grid grid-cols-1 sm:grid-cols-2 gap-2">
      {entries.map(([id, need]) => {
        const short = missing[id] ?? 0;
        const have = need - short;
        return (
          <li key={id} className={`flex items-center gap-3 rounded-md border bg-secondary/20 p-2 min-w-0 ${short > 0 ? "border-chart-4/60" : "border-star-green/50"}`}>
            <CraftIcon kind="component" id={id} size={40} />
            <span className="flex flex-col min-w-0 flex-1">
              <span className="text-sm font-semibold text-foreground truncate">{t(`craft.component.${id}`)}</span>
              <span className="flex items-baseline gap-2 tabular-nums">
                <span className={`font-display font-bold text-lg leading-none ${short > 0 ? "text-chart-4" : "text-star-green"}`}>
                  {t("craft.recipe.have", { have, need })}
                </span>
                {short > 0 && <span className="text-sm text-chart-4">{t("craft.recipe.missing", { count: short })}</span>}
              </span>
              {locked.includes(id) && <span className="text-sm text-chart-4">{t("craft.recipe.lockedAt", { level: CRAFT.RECIPES[id].minLevel })}</span>}
            </span>
            {short === 0 && <Icon name="check-circle" size={20} className="text-star-green shrink-0" />}
          </li>
        );
      })}
    </ul>
  );
}

/** The materials the workshop needs for the missing components it can make, against the stock ("Aço 12/18"). */
function MaterialsForMissing({ missing, stock, workshop }: { missing: ComponentCounts; stock: CraftStock | undefined; workshop: number }) {
  const { t, i18n } = useTranslation();
  const need = materialsNeeded(craftableMissing(missing, workshop));
  const entries = MATERIALS.filter((m) => (need[m] ?? 0) > 0).map((m): [MaterialId, number] => [m, need[m] ?? 0]);
  if (entries.length === 0) return null;
  const nf = (n: number) => n.toLocaleString(i18n.language);
  return (
    <div className="flex flex-col gap-2">
      <span className={LABEL}>{t("facilities.map.materials")}</span>
      <ul className="m-0 p-0 list-none flex flex-wrap gap-2">
        {entries.map(([m, n]) => {
          const have = Math.min(n, stock ? materialTotal(stock, m) : 0);
          const ok = have >= n;
          return (
            <li key={m} className={`flex items-center gap-2 rounded-md border px-2 py-1 text-sm tabular-nums ${ok ? "border-star-green/50" : "border-chart-4/60"}`}>
              <CraftIcon kind="material" id={m} size={24} />
              <span className="text-foreground">{t(`craft.material.${m}`)}</span>
              <span className={`font-semibold ${ok ? "text-star-green" : "text-chart-4"}`}>{nf(have)}/{nf(n)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ChangeRow({ label, from, to, better }: { label: string; from?: string; to: string; better?: boolean }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <span className="text-sm text-muted-foreground">{label}</span>
      {from !== undefined && (
        <>
          <span className="font-display font-bold text-lg tabular-nums text-muted-foreground leading-none">{from}</span>
          <Icon name="arrow-right" size={16} className="text-foreground self-center" />
        </>
      )}
      <span className={`font-display font-bold text-lg tabular-nums leading-none ${better ? "text-star-green" : "text-foreground"}`}>{to}</span>
    </div>
  );
}

function BenefitRow({ now, next }: { now: BenefitValue; next: BenefitValue }) {
  const { t, i18n } = useTranslation();
  const gain = next.value - now.value;
  const better = higherIsBetter(now.key) ? gain > 0 : gain < 0;
  return <ChangeRow label={t(`facilities.benefit.${now.key}`)} from={benefitText(now, t, i18n.language)}
    to={benefitText(next, t, i18n.language)} better={better} />;
}

// ── Level track ───────────────────────────────────────────────────────────────

function LevelTrack({ item, ctx, compact = false }: { item: FacilityItemView; ctx: ReturnType<typeof benefitContext>; compact?: boolean }) {
  const { t, i18n } = useTranslation();
  const track = itemLevelTrack(item.id, ctx);
  const key = track[0]![0]!.key;
  const tone = conditionTone(item.condition, item.condemned).art;
  return (
    <section className="card-arcade rounded-md p-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display font-black uppercase text-xl leading-none m-0">
          {t("facilities.track.title", { item: t(`facilities.item.${item.id}`) })}
        </h3>
        <span className="text-sm text-muted-foreground">{t(`facilities.track.note.${item.group === "stadium" ? item.id : item.group}`)}</span>
      </div>
      <div className="relative">
        {!compact && <span aria-hidden className="hidden xl:block absolute left-[5%] right-[5%] top-9 h-0.5 bg-border" />}
        <ol className={`relative m-0 p-0 list-none grid grid-cols-2 sm:grid-cols-5 gap-2 ${compact ? "" : "xl:grid-cols-10"}`}>
          {track.map((values, i) => {
            const lv = i + 1;
            const state = lv < item.level ? "done" : lv === item.level ? "current" : lv === item.level + 1 ? "next" : "locked";
            const box = {
              done: "border-star-green/50",
              current: "border-primary ring-1 ring-primary",
              next: "border-chart-4 bg-chart-4/10",
              locked: "border-border opacity-50",
            }[state];
            const tag = { done: "text-star-green", current: "text-primary", next: "text-chart-4", locked: "text-muted-foreground" }[state];
            return (
              <li key={lv} className={`relative flex flex-col items-center rounded-md border bg-card min-w-0 ${compact ? "gap-1 p-1.5" : "gap-1.5 p-2"} ${box}`}>
                <ItemThumb id={item.id} level={lv} tone={tone} className={`w-full ${compact ? "h-8" : "h-14"} ${state === "locked" ? "grayscale" : ""}`} />
                {state === "done" && (
                  <span className="absolute right-1 top-1 rounded-full bg-background">
                    <Icon name="check-circle" size={18} className="text-star-green" />
                  </span>
                )}
                <span className={LABEL}>{t("facilities.track.level", { level: lv })}</span>
                <span className={`font-display font-bold text-xl tabular-nums leading-none ${state === "next" ? "text-chart-4" : "text-foreground"}`}>
                  {benefitText(values[0]!, t, i18n.language)}
                </span>
                {!compact && <span className="text-sm text-muted-foreground text-center leading-tight">{t(`facilities.benefitShort.${key}`)}</span>}
                <span className={`font-display font-bold uppercase tracking-[0.08em] text-[13px] ${tag}`}>{t(`facilities.track.${state}`)}</span>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

// ── Area cards ────────────────────────────────────────────────────────────────

/** The three areas with every item (condition bar, level, marker); picking one calls `onSelect`. */
export function AreaCards({ data, selected, onSelect }: {
  data: FacilitiesViewData; selected: FacilityItemId | null; onSelect: (id: FacilityItemId) => void;
}) {
  const { busy, upgrades } = useUpgrades(data);
  return <AreaCardsGrid data={data} selected={selected} upgrades={upgrades} busy={busy} onSelect={onSelect} />;
}

function AreaCardsGrid({ data, selected, upgrades, busy, onSelect }: {
  data: FacilitiesViewData; selected: FacilityItemId | null; upgrades: Record<FacilityItemId, Upgrade>; busy: Set<FacilityGroup>;
  onSelect: (id: FacilityItemId) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {GROUPS.map((g) => (
        <section key={g} className="card-arcade rounded-md p-4 flex flex-col gap-2 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-display font-black uppercase text-xl leading-none m-0">{t(`facilities.items.group.${g}`)}</h3>
            {busy.has(g) && (
              <span className="flex items-center gap-1.5 text-sm text-chart-4">
                <Icon name="construction" size={16} />{t("facilities.groupWorks")}
              </span>
            )}
          </div>
          <ul className="m-0 p-0 list-none flex flex-col gap-1">
            {data.items.filter((it) => it.group === g).map((it) => {
              const tone = conditionTone(it.condition, it.condemned);
              const up = upgrades[it.id];
              return (
                <li key={it.id}>
                  <button type="button" onClick={() => onSelect(it.id)} aria-pressed={it.id === selected}
                    className={`w-full flex items-center gap-3 rounded-md border-0 px-2 py-1.5 text-left cursor-pointer min-h-10 ${
                      it.id === selected ? "bg-primary/10" : "bg-transparent hover:bg-secondary/30"}`}>
                    <span className="flex flex-col gap-1 flex-1 min-w-0">
                      <span className={`text-sm font-semibold truncate ${it.id === selected ? "text-primary" : "text-foreground"}`}>{t(`facilities.item.${it.id}`)}</span>
                      <span className="flex items-center gap-2">
                        <span className="h-1.5 flex-1 max-w-32 bg-border rounded overflow-hidden" aria-hidden>
                          <span className={`block h-full ${conditionDot(it)}`} style={{ width: `${Math.round(it.condition)}%` }} />
                        </span>
                        <span className={`text-sm tabular-nums ${tone.text}`}>
                          {it.condemned ? t("facilities.items.condemned") : `${Math.round(it.condition)}%`}
                        </span>
                      </span>
                    </span>
                    <span className="font-display font-bold text-base tabular-nums text-foreground">{t("facilities.map.level", { level: it.level })}</span>
                    <span className="w-6 h-6 shrink-0 flex items-center justify-center">
                      {up && <PlusMark tone={upgradeTone(up)} />}
                      {it.project && <Icon name="construction" size={16} className="text-chart-4" />}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
