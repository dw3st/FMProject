import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/GameInterface/ui/Button";
import type { CraftView } from "@/GameInterface/Craft/craftApi";
import type { FacilitiesViewData, FacilityItemView } from "@/GameInterface/Facilities/facilitiesApi";
import { conditionTone, itemEffectText } from "@/GameInterface/Facilities/FacilityItemsPanel";
import {
  AreaCardsGrid, ClubMap, ItemThumb, MapLegend, benefitText, useUpgrades,
} from "@/GameInterface/Facilities/ClubFacilitiesHub";
import { projectLabel } from "@/GameInterface/Facilities/RunningWorks";
import { OUTLINE, jobOfProject } from "@/GameInterface/Facilities/WorksTab";
import { levelText } from "@/GameInterface/Facilities/worksHelpers";
import { formatGameDate } from "@/GameInterface/formatDate";
import { gameArtUrl, newVisualOn } from "@/Domain/art/paintedFaces";
import { addDays } from "@/Domain/dates";
import { formatEuros } from "@/Domain/money";
import { FACILITIES } from "@/Domain/facilities/facilityConfig";
import { itemEffects } from "@/Domain/facilities/facilityItems";
import { projectProgress } from "@/Domain/facilities/facilities";
import { benefitContext, itemLevelBenefit } from "@/Domain/facilities/levelBenefit";
import { STADIUM_ART_ITEMS, stadiumArtFile, stadiumArtLevel } from "@/Domain/facilities/stadiumArt";
import { clubTodo, itemJob, type WorksJob } from "@/Domain/facilities/clubTabs";
import type { FacilityItemId, FacilityRequest } from "@/types/facilityTypes";

const LABEL = "font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground";

/**
 * Club → Overview (spec 2026-11-19): the club map with each item's level and condition, under it the stadium card, and
 * next to them "To do": what to repair, what to upgrade, what is under way. Every row opens the works in the Works tab.
 */
export function ClubOverview({ data, craft, avgAttendance, pending, onAsk, onOpen, onStadium }: {
  data: FacilitiesViewData;
  craft: CraftView | null;
  avgAttendance: number | null;
  pending: boolean;
  onAsk: (req: FacilityRequest) => Promise<void>;
  /** Opens the Works tab with this works picked. */
  onOpen: (job: WorksJob) => void;
  onStadium: () => void;
}) {
  const { busy, upgrades } = useUpgrades(data);
  const [mapFailed, setMapFailed] = useState(false);
  const map = newVisualOn() && !mapFailed;
  const byId = (id: FacilityItemId) => data.items.find((it) => it.id === id)!;
  const open = (id: FacilityItemId) => onOpen(itemJob(byId(id)));
  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] gap-6 items-start">
      <div className="flex flex-col gap-4 min-w-0">
        {map
          ? <ClubMap data={data} selected={null} upgrades={upgrades} onSelect={open} onFail={() => setMapFailed(true)} />
          : <AreaCardsGrid data={data} selected={null} upgrades={upgrades} busy={busy} onSelect={open} />}
        <MapLegend />
        <StadiumCard data={data} avgAttendance={avgAttendance} onStadium={onStadium} />
      </div>
      <TodoList data={data} craft={craft} pending={pending} onAsk={onAsk} onOpen={onOpen} />
    </div>
  );
}

function StadiumCard({ data, avgAttendance, onStadium }: { data: FacilitiesViewData; avgAttendance: number | null; onStadium: () => void }) {
  const { t, i18n } = useTranslation();
  const nf = (n: number) => Math.round(n).toLocaleString(i18n.language);
  const [failed, setFailed] = useState(false);
  const items = data.items.filter((i) => STADIUM_ART_ITEMS.includes(i.id));
  const art = newVisualOn() && !failed;
  const f = data.facilities;
  return (
    <section className="card-arcade rounded-md overflow-hidden grid grid-cols-1 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] min-w-0">
      {art && (
        <img src={gameArtUrl(stadiumArtFile(stadiumArtLevel(items.map((i) => i.level))))} alt="" aria-hidden draggable={false}
          onError={() => setFailed(true)} className="w-full h-full min-h-48 object-cover select-none" />
      )}
      <div className={`p-4 flex flex-col gap-3 min-w-0 ${art ? "" : "sm:col-span-2"}`}>
        <span className={LABEL}>{t("clubTabs.overview.stadium")}</span>
        <h3 className="font-display font-black uppercase text-2xl leading-none m-0 truncate">{data.stadium?.name ?? t("facilities.stadium.title")}</h3>
        <span className="text-sm text-muted-foreground tabular-nums">
          {t("clubTabs.overview.seats", { seats: nf(data.capacity) })}
          {avgAttendance !== null ? ` · ${t("clubTabs.overview.avg", { avg: nf(avgAttendance) })}` : ""}
        </span>
        <ul className="m-0 p-0 list-none flex flex-col gap-2">
          {items.map((it) => {
            const tone = conditionTone(it.condition, it.condemned);
            const pct = it.condemned ? 0 : Math.round(it.condition);
            return (
              <li key={it.id} className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)_3rem] items-center gap-3 text-sm">
                <span className="text-foreground truncate">{t(`clubTabs.overview.short.${it.id}`)}</span>
                <span className="h-1.5 bg-border rounded overflow-hidden min-w-16" aria-hidden>
                  <span className={`block h-full ${barTone(it)}`} style={{ width: `${pct}%` }} />
                </span>
                <span className={`text-right tabular-nums font-semibold ${tone.text}`}>{pct}%</span>
              </li>
            );
          })}
        </ul>
        <span className="text-sm text-muted-foreground tabular-nums">
          {[
            t("clubTabs.overview.comfort", { level: levelText(data.levels.comfort) }),
            t(`facilities.turf.type.${data.turf}`),
            f.record ? t("clubTabs.overview.record", { n: nf(f.record.attendance) }) : null,
          ].filter(Boolean).join(" · ")}
        </span>
        <div className="mt-auto">
          <Button variant="secondary" className={OUTLINE} onClick={onStadium}>{t("clubTabs.overview.seeStadium")}</Button>
        </div>
      </div>
    </section>
  );
}

/** Bar colour of a condition: green from 70%, amber 40–69%, red below. */
const barTone = (it: Pick<FacilityItemView, "condition" | "condemned">) =>
  it.condemned || it.condition < FACILITIES.WEAR.WARN_BELOW ? "bg-destructive" : it.condition < 70 ? "bg-chart-4" : "bg-star-green";

function TodoList({ data, craft, pending, onAsk, onOpen }: {
  data: FacilitiesViewData; craft: CraftView | null; pending: boolean;
  onAsk: (req: FacilityRequest) => Promise<void>; onOpen: (job: WorksJob) => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const nf = (n: number) => Math.round(n).toLocaleString(lang);
  const todo = useMemo(() => clubTodo(data.items, data.busyGroups ?? []), [data.items, data.busyGroups]);
  const ctx = useMemo(
    () => benefitContext(Object.fromEntries(data.items.map((it) => [it.id, it])) as Record<FacilityItemId, FacilityItemView>,
      data.impliedLevel ?? FACILITIES.NEUTRAL_LEVEL),
    [data.items, data.impliedLevel],
  );
  const running = data.facilities.projects.filter((p) => !p.paidNow);
  const benches = craft?.queue.filter((j) => j.startedOn) ?? [];
  const count = todo.repair.length + todo.improve.length + running.length + (benches.length > 0 ? 1 : 0);
  const byId = (id: FacilityItemId) => data.items.find((it) => it.id === id)!;

  return (
    <section className="card-arcade rounded-md p-4 flex flex-col gap-4 min-w-0" aria-label={t("clubTabs.todo.title")}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-display font-black uppercase text-xl leading-none m-0">{t("clubTabs.todo.title")}</h3>
        <span className="text-sm text-muted-foreground tabular-nums">{t("clubTabs.todo.count", { count })}</span>
      </div>
      {count === 0 && <p className="text-sm text-muted-foreground m-0">{t("clubTabs.todo.empty")}</p>}

      {todo.repair.length > 0 && (
        <TodoGroup dot="bg-destructive" label={t("clubTabs.todo.repair", { count: todo.repair.length })}>
          {todo.repair.map((r) => {
            const it = byId(r.item);
            const pct = r.condemned ? 0 : Math.round(r.condition);
            const tone = conditionTone(it.condition, it.condemned);
            const effects = it.effects.length > 0
              ? itemEffectText(it.effects, t, lang)
              : t("clubTabs.todo.below40", { effect: itemEffectText(itemEffects(it.id, 0), t, lang) });
            const req: FacilityRequest = { kind: "repair", item: it.id, to: 100 };
            return (
              <TodoRow key={r.item} item={it}
                title={t(`facilities.item.${it.id}`)}
                aside={r.cost > 0 ? <span className="text-sm text-foreground tabular-nums">{formatEuros(r.cost)}</span> : null}
                line={(
                  <span className="flex items-center gap-2 min-w-0 text-sm tabular-nums">
                    <span className="h-1.5 w-16 shrink-0 bg-border rounded overflow-hidden" aria-hidden>
                      <span className={`block h-full ${barTone(it)}`} style={{ width: `${pct}%` }} />
                    </span>
                    <span className={`font-semibold ${tone.text}`}>{r.condemned ? t("facilities.items.condemned") : `${pct}%`}</span>
                    <span className="text-muted-foreground truncate">{effects}</span>
                  </span>
                )}
                actions={(
                  <>
                    {r.quick && (
                      <Button onClick={() => void onAsk(req)} disabled={pending} className="h-9 px-3">{t("clubTabs.todo.repairNow")}</Button>
                    )}
                    <OpenButton onClick={() => onOpen(r.job)} />
                  </>
                )}
              />
            );
          })}
        </TodoGroup>
      )}

      {todo.improve.length > 0 && (
        <TodoGroup dot="bg-star-green" label={t("clubTabs.todo.improve", { count: todo.improve.length })}>
          {todo.improve.map((u) => {
            const it = byId(u.item);
            const now = itemLevelBenefit(it.id, it.level, ctx)[0];
            const next = itemLevelBenefit(it.id, it.level + 1, ctx)[0];
            return (
              <TodoRow key={u.item} item={it}
                title={t(`facilities.item.${it.id}`)}
                line={(
                  <span className="flex items-center gap-2 min-w-0 text-sm tabular-nums">
                    <span className="text-foreground">{t("clubTabs.todo.levels", { from: it.level, to: it.level + 1 })}</span>
                    {now && next && (
                      <span className="text-muted-foreground truncate">
                        {t(`facilities.benefitShort.${now.key}`)} {benefitText(now, t, lang)} → {benefitText(next, t, lang)}
                      </span>
                    )}
                  </span>
                )}
                actions={(
                  <>
                    <span className={`rounded border px-2 py-1 text-sm whitespace-nowrap ${u.ready ? "border-star-green/60 text-star-green" : "border-chart-4/60 text-chart-4"}`}>
                      {u.ready ? t("facilities.map.ready") : t("clubTabs.todo.missing", { count: u.missing })}
                    </span>
                    <OpenButton onClick={() => onOpen(u.job)} />
                  </>
                )}
              />
            );
          })}
        </TodoGroup>
      )}

      {(running.length > 0 || benches.length > 0) && (
        <TodoGroup dot="bg-primary" label={t("clubTabs.todo.running", { count: running.length + (benches.length > 0 ? 1 : 0) })}>
          {running.map((p) => {
            const pct = Math.round(projectProgress(p, data.date) * 100);
            const job = jobOfProject(p);
            const item = p.item ? byId(p.item) : null;
            return (
              <TodoRow key={p.id} item={item}
                title={projectLabel(p, t, nf)}
                line={<Progress pct={pct} text={t("facilities.projects.delivery", { date: formatGameDate(p.end, lang) })} />}
                actions={<OpenButton onClick={() => onOpen(job)} />}
              />
            );
          })}
          {benches.length > 0 && craft && (() => {
            const first = benches[0]!;
            const pct = Math.round(Math.min(1, Math.max(0, (first.days - (first.daysLeft ?? first.days)) / Math.max(1, first.days))) * 100);
            const lastDay = Math.max(...benches.map((j) => j.daysLeft ?? j.days));
            return (
              <TodoRow item={null}
                title={`${t("clubTabs.works.workshop")} · ${benches.map((j) => `${j.qty} ${t(`craft.component.${j.component}`)}`).join(", ")}`}
                line={<Progress pct={pct} text={t("clubTabs.todo.readyOn", { date: formatGameDate(addDays(data.date, lastDay), lang) })} />}
                actions={<OpenButton onClick={() => onOpen({ kind: "workshop" })} />}
              />
            );
          })()}
        </TodoGroup>
      )}
    </section>
  );
}

function TodoGroup({ dot, label, children }: { dot: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${dot}`} aria-hidden />
        <span className={`${LABEL} !text-foreground`}>{label}</span>
      </span>
      <ul className="m-0 p-0 list-none flex flex-col divide-y divide-border/50">{children}</ul>
    </div>
  );
}

function TodoRow({ item, title, aside, line, actions }: {
  item: FacilityItemView | null; title: string; aside?: React.ReactNode; line: React.ReactNode; actions: React.ReactNode;
}) {
  return (
    <li className="flex items-center gap-3 py-2.5 min-w-0">
      {item
        ? <ItemThumb id={item.id} level={item.level} tone={conditionTone(item.condition, item.condemned).art} className="w-[72px] h-11 shrink-0" />
        : <span className="w-[72px] h-11 shrink-0 rounded bg-secondary/40" aria-hidden />}
      <span className="flex flex-col gap-1 flex-1 min-w-0">
        <span className="flex items-baseline justify-between gap-3 min-w-0">
          <span className="font-semibold text-foreground truncate">{title}</span>
          {aside}
        </span>
        {line}
      </span>
      <span className="flex items-center gap-2 shrink-0">{actions}</span>
    </li>
  );
}

function Progress({ pct, text }: { pct: number; text: string }) {
  return (
    <span className="flex items-center gap-3 min-w-0 text-sm tabular-nums">
      <span className="h-1.5 w-28 shrink-0 bg-border rounded overflow-hidden" aria-hidden>
        <span className="block h-full bg-primary" style={{ width: `${pct}%` }} />
      </span>
      <span className="font-semibold text-foreground">{pct}%</span>
      <span className="text-muted-foreground truncate">{text}</span>
    </span>
  );
}

function OpenButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  return <Button variant="secondary" className={`${OUTLINE} h-9 px-3`} onClick={onClick}>{t("clubTabs.todo.open")}</Button>;
}
