import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/GameInterface/ui/Button";
import { OptionChips } from "@/GameInterface/ui/OptionChips";
import { Icon } from "@/GameInterface/Icons";
import { CraftIcon } from "@/GameInterface/Craft/CraftIcon";
import { NewOrder, Queue } from "@/GameInterface/Craft/WorkshopView";
import { ComponentHelp, MaterialHelp, scrollIntoPane } from "@/GameInterface/Craft/CraftHelp";
import { queueAction, queueComponent, upgradeWorkshop, craftErrorKey, type CraftView } from "@/GameInterface/Craft/craftApi";
import type { RecipeBuild } from "@/GameInterface/Craft/RecipeLine";
import type { FacilitiesViewData, FacilityItemView, ItemQuote } from "@/GameInterface/Facilities/facilitiesApi";
import { CancelWorks, conditionTone } from "@/GameInterface/Facilities/FacilityItemsPanel";
import { ItemThumb, LevelTrack, benefitText } from "@/GameInterface/Facilities/ClubFacilitiesHub";
import { projectLabel, runningWorksOf } from "@/GameInterface/Facilities/RunningWorks";
import { academyText, levelText, standBuild, trainingText } from "@/GameInterface/Facilities/worksHelpers";
import { formatGameDate } from "@/GameInterface/formatDate";
import { addDays } from "@/Domain/dates";
import { formatEuros } from "@/Domain/money";
import { CRAFT } from "@/Domain/craft/craftConfig";
import { craftableMissing, materialTotal, materialsNeeded, materialsShort } from "@/Domain/craft/shortfall";
import { missingComponents } from "@/Domain/craft/stock";
import { jobDays } from "@/Domain/craft/workshop";
import { FACILITIES } from "@/Domain/facilities/facilityConfig";
import { projectProgress, standWeeks } from "@/Domain/facilities/facilities";
import { benefitContext, itemLevelBenefit } from "@/Domain/facilities/levelBenefit";
import { TURF_TYPES } from "@/Domain/facilities/turf";
import { itemJob, jobGroup, jobKey, partsOf, type ItemJobMode, type WorksJob } from "@/Domain/facilities/clubTabs";
import type { ComponentId, MaterialCounts, MaterialId } from "@/types/craftTypes";
import type { FacilityGroup, FacilityItemId, FacilityProject, FacilityRequest, StandId, TurfType } from "@/types/facilityTypes";

/** A bordered secondary button (the mock's "Make", "Buy", "Open works"). */
export const OUTLINE = "!border !border-solid !border-border !bg-card !text-foreground hover:!border-primary";
const LABEL = "font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground";
const GROUPS: FacilityGroup[] = ["stadium", "training", "academy"];
const NEW_ORDER_ID = "works-new-order";
const REPAIR_STEPS = ["25", "50", "100"] as const;
type TFn = (key: string, opts?: Record<string, unknown>) => string;

/** One craft action of the screen (queue the missing parts, upgrade the workshop, move a job): answers with the new view. */
export type CraftRun = <T>(action: () => Promise<{ ok: true; data: T } | { ok: false; error: string }>, pick: (d: T) => CraftView) => Promise<T | null>;

/**
 * Club → Works (spec 2026-11-19): the queue on top (the workshop benches and one works per area), the works picker
 * grouped by area on the left and the chosen works in three steps: its parts, make or buy what is missing, start.
 */
export function WorksTab({
  saveId, data, craft, craftBusy, craftError, runCraft, job, onJob, stand, onStand, seats, onSeats, pending, onAsk, onCancel, onBuy,
  onStockChanged,
}: {
  saveId: string;
  data: FacilitiesViewData;
  craft: CraftView | null;
  craftBusy: boolean;
  craftError: string | null;
  runCraft: CraftRun;
  job: WorksJob;
  onJob: (job: WorksJob) => void;
  stand: StandId;
  onStand: (s: StandId) => void;
  seats: number;
  onSeats: (n: number) => void;
  pending: boolean;
  onAsk: (req: FacilityRequest) => Promise<void>;
  onCancel: (projectId: string) => Promise<void>;
  /** "Buy what is missing": Materials with the cart filled. */
  onBuy: (cart: MaterialCounts) => void;
  /** After a craft action that changed the stock (the facilities view reads it again). */
  onStockChanged: () => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <QueueRow data={data} craft={craft} onJob={onJob} />
      <div className="grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)] gap-6 items-start">
        <JobPicker data={data} craft={craft} job={job} onJob={onJob} />
        <JobPanel
          key={jobKey(job)}
          saveId={saveId} data={data} craft={craft} craftBusy={craftBusy} craftError={craftError} runCraft={runCraft}
          job={job} onJob={onJob} stand={stand} onStand={onStand} seats={seats} onSeats={onSeats}
          pending={pending} onAsk={onAsk} onCancel={onCancel} onBuy={onBuy} onStockChanged={onStockChanged}
        />
      </div>
    </div>
  );
}

// ── Queue ─────────────────────────────────────────────────────────────────────

/** The job a running works opens: its item's works, else the stand, comfort, grass change or group works. */
export function jobOfProject(p: FacilityProject): WorksJob {
  if (p.item && (p.kind === "repair" || p.kind === "rebuild" || p.kind === "upgrade")) return { kind: "item", mode: p.kind, item: p.item };
  if (p.kind === "turf") return { kind: "turf" };
  if (p.kind === "stand" || p.kind === "comfort" || p.kind === "training" || p.kind === "academy") return { kind: p.kind };
  return { kind: "stand" };
}

function QueueRow({ data, craft, onJob }: { data: FacilitiesViewData; craft: CraftView | null; onJob: (j: WorksJob) => void }) {
  const { t, i18n } = useTranslation();
  const nf = (n: number) => Math.round(n).toLocaleString(i18n.language);
  const working = craft?.queue.filter((j) => j.startedOn) ?? [];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      <div className="card-arcade rounded-md p-4 flex flex-col gap-2 min-w-0 hover:border-primary/60">
      <button type="button" onClick={() => onJob({ kind: "workshop" })}
        className="flex flex-col gap-2 text-left cursor-pointer min-w-0 bg-transparent border-0 p-0">
        <span className="flex items-baseline justify-between gap-2">
          <span className={LABEL}>{t("clubTabs.works.workshop")}</span>
          {craft && <span className="text-sm text-foreground tabular-nums">{t("craft.workshop.benches", { count: craft.benches })}</span>}
        </span>
        {working.length === 0 ? (
          <span className="text-sm text-muted-foreground">{t("clubTabs.works.benchesFree")}</span>
        ) : working.slice(0, 3).map((j) => {
          const left = j.daysLeft ?? j.days;
          const pct = Math.round(Math.min(1, Math.max(0, (j.days - left) / Math.max(1, j.days))) * 100);
          return (
            <span key={j.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-3 text-sm tabular-nums">
              <span className="text-foreground truncate">{j.qty} {t(`craft.component.${j.component}`)}</span>
              <span className="h-1.5 bg-border rounded overflow-hidden min-w-16" aria-hidden>
                <span className="block h-full bg-primary" style={{ width: `${pct}%` }} />
              </span>
              <span className="text-muted-foreground">{formatGameDate(addDays(data.date, left), i18n.language)}</span>
            </span>
          );
        })}
      </button>
      <Button variant="secondary" className={`${OUTLINE} mt-auto self-start`} onClick={() => {
        onJob({ kind: "workshop" });
        // the order sits under the queue of the workshop's works: bring it into view once it is drawn
        setTimeout(() => scrollIntoPane(NEW_ORDER_ID), 60);
      }}>
        <Icon name="hammer" size={16} />{t("craft.workshop.newOrder")}
      </Button>
      </div>
      {GROUPS.map((g) => {
        const running = runningWorksOf(data.facilities.projects, g);
        const pct = running ? Math.round(projectProgress(running, data.date) * 100) : 0;
        return (
          <button key={g} type="button" onClick={() => running && onJob(jobOfProject(running))} disabled={!running}
            className="card-arcade rounded-md p-4 flex flex-col gap-2 text-left min-w-0 enabled:cursor-pointer enabled:hover:border-primary/60 disabled:cursor-default">
            <span className="flex items-baseline justify-between gap-2 min-w-0">
              <span className={LABEL}>{t(`clubTabs.area.${g}`)}</span>
              {running
                ? <span className="text-sm text-foreground truncate">{projectLabel(running, t, nf)}</span>
                : <span className="text-sm text-star-green">{t("clubTabs.works.free")}</span>}
            </span>
            {running ? (
              <span className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 text-sm tabular-nums">
                <span className="text-foreground">{t("clubTabs.works.underWay")}</span>
                <span className="h-1.5 bg-border rounded overflow-hidden min-w-16" aria-hidden>
                  <span className="block h-full bg-primary" style={{ width: `${pct}%` }} />
                </span>
                <span className="text-muted-foreground">{formatGameDate(running.end, i18n.language)}</span>
              </span>
            ) : (
              <>
                <span className="text-sm text-muted-foreground">{t(`clubTabs.works.noneIn.${g}`)}</span>
                <span className="text-sm text-primary">{t("clubTabs.works.pickBeside")}</span>
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Picker ────────────────────────────────────────────────────────────────────

interface PickRow { job: WorksJob; label: string; sub: string; on: boolean }

function itemSub(it: FacilityItemView, t: TFn): string {
  const j = itemJob(it);
  if (j.kind !== "item") return "";
  if (j.mode === "rebuild") return t("clubTabs.pick.rebuild");
  if (j.mode === "repair") return t("clubTabs.pick.repair", { pct: Math.round(it.condition) });
  return it.quotes.upgrade ? t("clubTabs.pick.levelUp", { from: it.level, to: it.level + 1 }) : t("clubTabs.pick.max");
}

function sameJob(a: WorksJob, b: WorksJob): boolean {
  if (a.kind === "item" && b.kind === "item") return a.item === b.item;
  return a.kind === b.kind;
}

function JobPicker({ data, craft, job, onJob }: { data: FacilitiesViewData; craft: CraftView | null; job: WorksJob; onJob: (j: WorksJob) => void }) {
  const { t, i18n } = useTranslation();
  const busy = new Set(data.busyGroups ?? []);
  const groupLevel = (k: "comfort" | "training" | "academy") => {
    const q = data.quotes[k];
    return q ? t("clubTabs.pick.levelUp", { from: levelText(data.levels[k], i18n.language), to: q.level }) : t("clubTabs.pick.max");
  };
  const rows = (g: FacilityGroup): PickRow[] => {
    const items = data.items.filter((it) => it.group === g).map((it): PickRow => {
      const j = itemJob(it);
      return { job: j, label: t(`facilities.item.${it.id}`), sub: it.project ? t("clubTabs.pick.running") : itemSub(it, t), on: sameJob(j, job) };
    });
    const mk = (j: WorksJob, label: string, sub: string): PickRow => ({ job: j, label, sub, on: sameJob(j, job) });
    if (g === "stadium") {
      return [
        mk({ kind: "stand" }, t("clubTabs.pick.stand"), t("clubTabs.pick.seats")),
        mk({ kind: "comfort" }, t("facilities.kind.comfort"), groupLevel("comfort")),
        ...items,
        mk({ kind: "turf" }, t("clubTabs.pick.turf"), t(`facilities.turf.type.${data.turf}`)),
      ];
    }
    if (g === "training") {
      return [
        ...items,
        mk({ kind: "training" }, t("clubTabs.pick.trainingAll"), groupLevel("training")),
        mk({ kind: "workshop" }, t("clubTabs.works.workshop"),
          craft?.upgrade ? t("clubTabs.pick.levelUp", { from: craft.workshop, to: craft.upgrade.level }) : t("clubTabs.pick.max")),
      ];
    }
    return [...items, mk({ kind: "academy" }, t("clubTabs.pick.academyAll"), groupLevel("academy"))];
  };
  return (
    <section className="card-arcade rounded-md p-4 flex flex-col gap-3 min-w-0" aria-label={t("clubTabs.pick.title")}>
      <h3 className="font-display font-black uppercase text-xl leading-none m-0">{t("clubTabs.pick.title")}</h3>
      {GROUPS.map((g) => (
        <div key={g} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className={LABEL}>{t(`clubTabs.area.${g}`)}</span>
            <span className={`text-sm ${busy.has(g) ? "text-chart-4" : "text-muted-foreground"}`}>
              {busy.has(g) ? t("clubTabs.pick.areaBusy") : t("clubTabs.pick.areaFree")}
            </span>
          </div>
          <ul className="m-0 p-0 list-none flex flex-col">
            {rows(g).map((r) => (
              <li key={jobKey(r.job)}>
                <button type="button" onClick={() => onJob(r.job)} aria-pressed={r.on}
                  className={`w-full flex items-center justify-between gap-3 rounded-md px-2 min-h-9 text-left cursor-pointer border ${
                    r.on ? "border-primary bg-primary/10" : "border-transparent bg-transparent hover:bg-secondary/30"}`}>
                  <span className={`text-sm font-semibold truncate ${r.on ? "text-primary" : "text-foreground"}`}>{r.label}</span>
                  <span className="text-sm text-muted-foreground tabular-nums shrink-0">{r.sub}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

// ── The chosen works ──────────────────────────────────────────────────────────

interface Resolved {
  group: FacilityGroup | null;
  label: string;
  title: string;
  about: string | null;
  weeks: number | null;
  build: RecipeBuild | null;
  request: FacilityRequest | null;
  item: FacilityItemView | null;
  /** The works already running on this item. */
  running: (FacilityProject & { progress: number }) | null;
}

function JobPanel({
  saveId, data, craft, craftBusy, craftError, runCraft, job, onJob, stand, onStand, seats, onSeats, pending, onAsk, onCancel, onBuy,
  onStockChanged,
}: {
  saveId: string; data: FacilitiesViewData; craft: CraftView | null; craftBusy: boolean; craftError: string | null; runCraft: CraftRun;
  job: WorksJob; onJob: (j: WorksJob) => void; stand: StandId; onStand: (s: StandId) => void; seats: number; onSeats: (n: number) => void;
  pending: boolean; onAsk: (req: FacilityRequest) => Promise<void>; onCancel: (projectId: string) => Promise<void>;
  onBuy: (cart: MaterialCounts) => void; onStockChanged: () => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const nf = (n: number) => Math.round(n).toLocaleString(lang);
  const [step, setStep] = useState<(typeof REPAIR_STEPS)[number]>("100");
  const otherTurfs = TURF_TYPES.filter((tp) => tp !== data.turf);
  const [turf, setTurf] = useState<TurfType>(otherTurfs[0] ?? "hybrid");
  const ctx = useMemo(
    () => benefitContext(Object.fromEntries(data.items.map((it) => [it.id, it])) as Record<FacilityItemId, FacilityItemView>,
      data.impliedLevel ?? FACILITIES.NEUTRAL_LEVEL),
    [data.items, data.impliedLevel],
  );
  const busy = new Set(data.busyGroups ?? []);
  const workshop = data.facilities.craft?.workshop ?? 1;

  const r = resolve();
  function resolve(): Resolved {
    const area = jobGroup(job);
    const base = { group: area, item: null, running: null };
    if (job.kind === "item") {
      const it = data.items.find((x) => x.id === job.item)!;
      const mode = job.mode;
      const quote: ItemQuote | null = mode === "repair"
        ? it.quotes.repair[it.quotes.repair[step] ? step : "100"] : it.quotes[mode];
      const label = `${t(`clubTabs.area.${it.group}`)} · ${t(`facilities.item.${it.id}`)}`;
      let title: string;
      let about: string | null = null;
      if (mode === "upgrade") {
        title = quote ? t("clubTabs.job.upgradeTo", { level: quote.level }) : t("clubTabs.job.maxLevel");
        if (quote?.level !== undefined) {
          const now = itemLevelBenefit(it.id, it.level, ctx);
          const next = itemLevelBenefit(it.id, quote.level, ctx);
          about = now.map((v, i) => `${t(`facilities.benefit.${v.key}`)} ${benefitText(v, t, lang)} → ${benefitText(next[i]!, t, lang)}`).join(" · ");
        }
      } else if (mode === "repair") {
        title = t("clubTabs.job.repairTo", { pct: quote?.to ?? 100 });
        about = t("clubTabs.job.conditionFrom", { from: Math.round(it.condition), to: quote?.to ?? 100 });
      } else {
        title = t("clubTabs.job.rebuild");
        about = t("facilities.items.aboutRebuild");
      }
      return {
        ...base, item: it, running: it.project, label, title, about, weeks: quote?.weeks ?? null, build: quote?.build ?? null,
        request: !quote ? null : mode === "repair" ? { kind: "repair", item: it.id, to: quote.to ?? 100 } : { kind: mode, item: it.id },
      };
    }
    if (job.kind === "stand") {
      const cost = Math.round(seats * data.seatCost);
      const current = data.facilities.stands.find((s) => s.id === stand)?.seats ?? 0;
      return {
        ...base, label: `${t("clubTabs.area.stadium")} · ${t(`facilities.stand.${stand}`)}`,
        title: t("clubTabs.job.stand", { seats: nf(seats) }),
        about: t("clubTabs.job.standAbout", { now: nf(current), capacity: nf(data.capacity + seats) }),
        weeks: standWeeks(seats), build: standBuild(data, cost), request: { kind: "stand", stand, seats },
      };
    }
    if (job.kind === "turf") {
      const q = data.turfQuotes[turf];
      return {
        ...base, label: `${t("clubTabs.area.stadium")} · ${t("clubTabs.pick.turf")}`,
        title: t("clubTabs.job.turf", { turf: t(`facilities.turf.type.${turf}`) }),
        about: t(`facilities.turf.about.${turf}`), weeks: q?.weeks ?? null, build: q?.build ?? null,
        request: q ? { kind: "turf", turf } : null,
      };
    }
    if (job.kind === "workshop") {
      const up = craft?.upgrade ?? null;
      const recipe = up?.recipe ?? {};
      const missing = up && craft ? missingComponents(craft.stock, recipe) : {};
      return {
        ...base, label: t("clubTabs.works.workshop"),
        title: up ? t("clubTabs.job.upgradeTo", { level: up.level }) : t("clubTabs.job.maxLevel"),
        about: t("craft.improves.workshop"), weeks: null,
        build: up ? { recipe, missing, locked: [], canBuild: Object.keys(missing).length === 0 } : null, request: null,
      };
    }
    // comfort, training, academy: the next group level
    const k = job.kind;
    const q = data.quotes[k];
    const about = !q ? null : k === "comfort"
      ? t("facilities.comfort.effect", { pct: Math.round((data.priceMult - 1) * 100) + FACILITIES.COMFORT_PRICE_STEP * 100 })
      : k === "training" ? trainingText(data.effects.training.next, t) : academyText(data.effects.academy.next, t, lang);
    return {
      ...base, label: `${t(`clubTabs.area.${k === "comfort" ? "stadium" : k}`)} · ${t(`facilities.kind.${k}`)}`,
      title: q ? t("clubTabs.job.levelTo", { level: q.level }) : t("clubTabs.job.maxLevel"),
      about, weeks: q?.weeks ?? null, build: q?.build ?? null, request: q ? { kind: k } : null,
    };
  }

  const areaBusy = r.group !== null && busy.has(r.group) && !r.running;
  const running = r.group ? runningWorksOf(data.facilities.projects, r.group) : undefined;
  const tone = r.item ? conditionTone(r.item.condition, r.item.condemned).art : "ok";
  const modes: ItemJobMode[] = r.item
    ? (["upgrade", "repair", "rebuild"] as ItemJobMode[]).filter((m) =>
      m === "repair" ? !r.item!.condemned && r.item!.quotes.repair["100"] !== null : r.item!.quotes[m] !== null)
    : [];
  const steps = r.item ? REPAIR_STEPS.filter((s) => r.item!.quotes.repair[s] !== null) : [];

  const start = async () => {
    if (job.kind === "workshop") {
      const ok = await runCraft(() => upgradeWorkshop(saveId), (v) => v);
      if (ok) onStockChanged();
      return;
    }
    if (!r.request) return;
    await onAsk(r.request);
  };

  return (
    <div className="flex flex-col gap-6 min-w-0">
      <section className="card-arcade rounded-md p-4 flex flex-col gap-4 min-w-0">
        <div className="flex flex-col sm:flex-row gap-4 min-w-0">
          {r.item && <ItemThumb id={r.item.id} level={r.item.level} tone={tone} className="w-full sm:w-60 h-36 shrink-0" />}
          <div className="flex flex-col gap-2 min-w-0">
            <span className={LABEL}>{r.label}</span>
            <h3 className="font-display font-black uppercase text-2xl leading-none m-0">{r.title}</h3>
            {(r.about || r.weeks !== null) && (
              <p className="text-sm text-muted-foreground m-0 tabular-nums">
                {[r.about, r.weeks !== null ? t("clubTabs.job.weeks", { count: r.weeks }) : null].filter(Boolean).join(" · ")}
              </p>
            )}
            {r.group && (
              <span className="flex flex-wrap gap-2">
                <span className={`rounded border px-2 py-0.5 text-sm ${areaBusy ? "border-chart-4/60 text-chart-4" : "border-star-green/60 text-star-green"}`}>
                  {areaBusy ? t("clubTabs.job.areaBusy") : t("clubTabs.job.areaFree")}
                </span>
              </span>
            )}
          </div>
        </div>

        {/* The works' own choices: the mode of an item, the repair target, the stand and seats, the grass. */}
        {r.item && modes.length > 1 && !r.running && (
          <OptionChips options={modes.map((m) => ({ key: m, label: t(`facilities.items.${m}`) }))}
            value={job.kind === "item" ? job.mode : null}
            onChange={(m) => onJob({ kind: "item", mode: m, item: r.item!.id })} aria-label={t("facilities.items.actions")} />
        )}
        {job.kind === "item" && job.mode === "repair" && steps.length > 1 && !r.running && (
          <OptionChips options={steps.map((s) => ({ key: s, label: t("facilities.items.to", { pct: r.item!.quotes.repair[s]!.to }) }))}
            value={step} onChange={setStep} aria-label={t("facilities.items.repair")} />
        )}
        {job.kind === "stand" && (
          <div className="flex flex-col gap-3">
            <OptionChips options={data.facilities.stands.map((s) => ({ key: s.id, label: t(`facilities.stand.${s.id}`) }))}
              value={stand} onChange={onStand} aria-label={t("facilities.stand.title")} />
            <OptionChips options={seatOptions()} value={String(seats)} onChange={(k) => onSeats(Number(k))} aria-label={t("facilities.stand.seats")} />
          </div>
        )}
        {job.kind === "turf" && (
          <OptionChips options={otherTurfs.map((tp) => ({ key: tp, label: t(`facilities.turf.type.${tp}`) }))}
            value={turf} onChange={setTurf} aria-label={t("facilities.turf.change")} />
        )}

        {r.running ? (
          <RunningBlock project={r.running} date={data.date} pending={pending} onCancel={onCancel} />
        ) : r.build === null ? (
          <p className="text-sm text-muted-foreground m-0">{t("clubTabs.job.nothing")}</p>
        ) : (
          <Steps
            saveId={saveId} build={r.build} data={data} craft={craft} craftBusy={craftBusy} runCraft={runCraft} workshop={job.kind === "workshop" ? craft?.workshop ?? 1 : workshop}
            weeks={r.weeks} group={r.group} areaBusy={areaBusy} runningLabel={running ? projectLabel(running, t, nf) : null}
            pending={pending} onStart={() => void start()} onBuy={onBuy} onStockChanged={onStockChanged}
          />
        )}
        {craftError && <p className="text-sm text-destructive m-0">{t(craftErrorKey(craftError))}</p>}
      </section>

      {r.item && job.kind === "item" && job.mode === "upgrade" && <LevelTrack item={r.item} ctx={ctx} />}
      {job.kind === "workshop" && craft && (
        <>
          <Queue view={craft} busy={craftBusy} onAction={(id, a) => void runCraft(() => queueAction(saveId, id, a), (v) => v)} />
          <NewOrder id={NEW_ORDER_ID} view={craft} busy={craftBusy}
            onMake={(c, q, gs) => void runCraft(() => queueComponent(saveId, c, q, gs), (v) => v).then((v) => { if (v) onStockChanged(); })} />
        </>
      )}
    </div>
  );

  function seatOptions() {
    return Array.from({ length: (FACILITIES.SEATS_MAX - FACILITIES.SEATS_MIN) / FACILITIES.SEATS_STEP + 1 }, (_, i) => {
      const n = FACILITIES.SEATS_MIN + i * FACILITIES.SEATS_STEP;
      return { key: String(n), label: `+${n / 1000}K` };
    });
  }
}

function RunningBlock({ project, date, pending, onCancel }: {
  project: FacilityProject & { progress?: number }; date: string; pending: boolean; onCancel: (id: string) => Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const pct = Math.round(projectProgress(project, date) * 100);
  return (
    <div className="flex flex-col gap-3 rounded-md border border-border p-4">
      <span className={LABEL}>{t("facilities.projects.running")}</span>
      <div className="flex items-center gap-3">
        <div className="h-1.5 bg-border rounded overflow-hidden flex-1 min-w-16">
          <div className="h-full bg-primary rounded" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-sm tabular-nums font-semibold text-foreground w-12 text-right">{pct}%</span>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground tabular-nums">
          {t("facilities.projects.delivery", { date: formatGameDate(project.end, i18n.language) })}
        </span>
        {project.craft && <CancelWorks pending={pending} onCancel={() => onCancel(project.id)} />}
      </div>
    </div>
  );
}

function StepCard({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-md border border-border bg-secondary/10 p-4 flex flex-col gap-3 min-w-0">
      <h4 className="flex items-center gap-2 m-0">
        <span className="h-7 w-7 shrink-0 rounded-full bg-primary text-primary-foreground font-display font-bold text-base flex items-center justify-center">{n}</span>
        <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-foreground">{title}</span>
      </h4>
      {children}
    </section>
  );
}

function Steps({
  saveId, build, data, craft, craftBusy, runCraft, workshop, weeks, group, areaBusy, runningLabel, pending, onStart, onBuy, onStockChanged,
}: {
  saveId: string; build: RecipeBuild; data: FacilitiesViewData; craft: CraftView | null; craftBusy: boolean; runCraft: CraftRun; workshop: number;
  weeks: number | null; group: FacilityGroup | null; areaBusy: boolean; runningLabel: string | null; pending: boolean;
  onStart: () => void; onBuy: (cart: MaterialCounts) => void; onStockChanged: () => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [note, setNote] = useState<string | null>(null);
  const parts = partsOf(build.recipe, build.missing);
  const stock = craft?.stock ?? data.stock;
  const craftable = craftableMissing(build.missing, workshop);
  const craftableIds = Object.keys(craftable) as ComponentId[];
  const need = materialsNeeded(craftable);
  const short = stock ? materialsShort(craftable, stock) : need;
  const shortIds = Object.keys(short) as MaterialId[];
  const locked = (Object.keys(build.missing) as ComponentId[]).filter((id) => CRAFT.RECIPES[id].minLevel > workshop);
  const price = new Map((craft?.shop ?? []).map((s) => [s.material, s.standard]));
  const buyCost = shortIds.reduce((s, m) => s + (short[m] ?? 0) * (price.get(m) ?? 0), 0);
  const days = craft ? Math.max(0, ...craftableIds.map((id) => jobDays(id, craftable[id] ?? 0, craft.workshop, craft.foremanSpeed))) : 0;
  const canMake = craftableIds.length > 0 && shortIds.length === 0;

  const make = async () => {
    let done = 0;
    for (const id of craftableIds) {
      const res = await runCraft(() => queueComponent(saveId, id, craftable[id] ?? 0), (v) => v);
      if (!res) return;
      done++;
    }
    setNote(t("craft.craftQueued", { count: done }));
    onStockChanged();
  };

  const reason = areaBusy
    ? t("clubTabs.job.whyBusy", { area: t(`clubTabs.area.${group}`), works: runningLabel ?? "" })
    : !parts.ready ? t("clubTabs.job.whyParts", { count: parts.short }) : null;
  const makeLabel = craftableIds.length === 1
    ? t("clubTabs.job.makeN", { count: craftable[craftableIds[0]!] ?? 0, what: t(`craft.component.${craftableIds[0]!}`) })
    : t("craft.craftMissing");

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-stretch">
      <StepCard n={1} title={t("clubTabs.job.step1")}>
        <ul className="m-0 p-0 list-none flex flex-col gap-3">
          {parts.rows.map((p) => (
            <li key={p.id} className="flex items-center gap-3 min-w-0">
              <CraftIcon kind="component" id={p.id} size={40} />
              <span className="flex flex-col flex-1 min-w-0">
                <ComponentHelp id={p.id} stock={stock ?? null} workshop={workshop}>
                  <span className="text-sm font-semibold text-foreground truncate">{t(`craft.component.${p.id}`)}</span>
                </ComponentHelp>
                <span className="text-sm text-muted-foreground tabular-nums">{t("clubTabs.job.needHave", { need: p.need, have: p.have })}</span>
              </span>
              {p.short > 0
                ? <span className="rounded border border-chart-4/60 px-2 py-0.5 text-sm text-chart-4 tabular-nums shrink-0">{t("craft.recipe.missing", { count: p.short })}</span>
                : <Icon name="check" size={18} className="text-star-green shrink-0" />}
            </li>
          ))}
        </ul>
        <p className={`text-sm m-0 mt-auto border-t border-border pt-3 ${parts.ready ? "text-star-green" : "text-chart-4"}`}>
          {parts.ready ? t("craft.recipe.ready") : t("clubTabs.job.shortParts", { count: parts.short })}
        </p>
      </StepCard>

      <StepCard n={2} title={t("clubTabs.job.step2")}>
        {parts.ready ? (
          <p className="text-sm text-muted-foreground m-0">{t("clubTabs.job.nothingToMake")}</p>
        ) : (
          <>
            {craftableIds.length > 0 && (
              <>
                <span className="text-sm text-muted-foreground">{t("clubTabs.job.makingUses")}</span>
                <ul className="m-0 p-0 list-none flex flex-col gap-3">
                  {(Object.entries(need) as [MaterialId, number][]).map(([m, n]) => {
                    const have = stock ? materialTotal(stock, m) : 0;
                    const lack = Math.max(0, n - have);
                    return (
                      <li key={m} className="flex items-center gap-3 min-w-0">
                        <CraftIcon kind="material" id={m} size={36} />
                        <span className="flex flex-col flex-1 min-w-0">
                          <MaterialHelp id={m} stock={stock ?? null}>
                            <span className="text-sm font-semibold text-foreground truncate">{t(`craft.material.${m}`)}</span>
                          </MaterialHelp>
                          <span className="text-sm text-muted-foreground tabular-nums">{t("clubTabs.job.needHave", { need: n, have })}</span>
                        </span>
                        {lack > 0
                          ? <span className="rounded border border-chart-4/60 px-2 py-0.5 text-sm text-chart-4 tabular-nums shrink-0">{t("craft.recipe.missing", { count: lack })}</span>
                          : <Icon name="check" size={18} className="text-star-green shrink-0" />}
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
            {locked.length > 0 && (
              <p className="text-sm text-chart-4 m-0">
                {locked.map((id) => `${t(`craft.component.${id}`)}: ${t("craft.recipe.lockedAt", { level: CRAFT.RECIPES[id].minLevel })}`).join(" · ")}
              </p>
            )}
            {craftableIds.length === 0 ? (
              <p className="text-sm text-muted-foreground m-0 mt-auto">{t("clubTabs.job.noBench")}</p>
            ) : (
            <div className="flex flex-col gap-1 mt-auto">
              <Button variant="secondary" className={OUTLINE} onClick={() => void make()} disabled={!canMake || craftBusy || pending}>
                <Icon name="hammer" size={16} />{makeLabel}
              </Button>
              <span className="text-sm text-muted-foreground text-center tabular-nums">
                {shortIds.length > 0 ? t("clubTabs.job.benchShort", { count: days }) : t("clubTabs.job.bench", { count: days })}
              </span>
            </div>
            )}
            {shortIds.length > 0 && (
              <div className="flex flex-col gap-1">
                <Button variant="secondary" className={`${OUTLINE} tabular-nums`} onClick={() => onBuy(short)} disabled={pending}>
                  <Icon name="store" size={16} />
                  {buyCost > 0 ? t("clubTabs.job.buyCost", { cost: formatEuros(buyCost) }) : t("clubTabs.job.buy")}
                </Button>
                <span className="text-sm text-muted-foreground text-center">{t("clubTabs.job.buyHint")}</span>
              </div>
            )}
            {note && <p className="text-sm text-chart-2 m-0">{note}</p>}
          </>
        )}
      </StepCard>

      <StepCard n={3} title={t("clubTabs.job.step3")}>
        <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-3 items-baseline">
          {weeks !== null && (
            <>
              <dt className={LABEL}>{t("clubTabs.job.deadline")}</dt>
              <dd className="m-0 text-right text-sm font-semibold text-foreground tabular-nums">{t("facilities.weeks", { count: weeks })}</dd>
              <dt className={LABEL}>{t("clubTabs.job.delivery")}</dt>
              <dd className="m-0 text-right text-sm font-semibold text-foreground tabular-nums">{formatGameDate(addDays(data.date, weeks * 7), lang)}</dd>
            </>
          )}
          {group && (
            <>
              <dt className={LABEL}>{t("clubTabs.job.area")}</dt>
              <dd className={`m-0 text-right text-sm font-semibold ${areaBusy ? "text-chart-4" : "text-foreground"}`}>
                {t(areaBusy ? "clubTabs.job.areaBusyOf" : "clubTabs.job.areaFreeOf", { area: t(`clubTabs.area.${group}`) })}
              </dd>
            </>
          )}
        </dl>
        <Button onClick={onStart} disabled={pending || craftBusy || reason !== null} className="w-full mt-auto">
          <Icon name="building" size={16} />{t("clubTabs.job.start")}
        </Button>
        {reason ? (
          <div className="rounded-md border border-chart-4/60 bg-chart-4/10 p-3 flex flex-col gap-1">
            <span className="text-sm font-semibold text-chart-4">{t("clubTabs.job.cannotYet")}</span>
            <span className="text-sm text-foreground">{reason}</span>
          </div>
        ) : null}
        <p className="text-sm text-muted-foreground m-0">{t("clubTabs.job.startNote")}</p>
      </StepCard>
    </div>
  );
}
