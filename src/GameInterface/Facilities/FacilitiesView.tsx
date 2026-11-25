import { paintedStands, stadiumMapGeom, type MapRect } from "@/GameInterface/Facilities/stadiumMapGeom";
import { TicketPriceControl } from "@/GameInterface/OwnClub/TicketPriceControl";
import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@/GameInterface/Icons";
import { Button } from "@/GameInterface/ui/Button";
import { OptionChips } from "@/GameInterface/ui/OptionChips";
import { formatEuros } from "@/Domain/money";
import { competitionName } from "@/Domain/world/labels";
import { attendanceOf, projectProgress, seasonFraction, standUnderWorks, standWeeks } from "@/Domain/facilities/facilities";
import { FACILITIES } from "@/Domain/facilities/facilityConfig";
import { MOWING_PATTERNS } from "@/Domain/facilities/turf";
import type { Fixture } from "@/types/calendarTypes";
import type { LeagueData } from "@/types/playerTypes";
import type { MaterialCounts } from "@/types/craftTypes";
import type { FacilityKind, FacilityRequest, StandId } from "@/types/facilityTypes";
import { useFacilities, type FacilitiesViewData, type RequestOutcome } from "@/GameInterface/Facilities/facilitiesApi";
import { itemEffectText } from "@/GameInterface/Facilities/FacilityItemsPanel";
import { SelectCombobox } from "@/GameInterface/Components/SelectCombobox";
import { PitchSurfaceSvg } from "@/GameInterface/Components/PitchSurfaceSvg";
import { ClubOverview } from "@/GameInterface/Facilities/ClubOverview";
import { OUTLINE, WorksTab } from "@/GameInterface/Facilities/WorksTab";
import { levelText, standBuild } from "@/GameInterface/Facilities/worksHelpers";
import { useCraft } from "@/GameInterface/Craft/useCraft";
import { formatGameDate } from "@/GameInterface/formatDate";
import { runningWorksOf, projectLabel } from "@/GameInterface/Facilities/RunningWorks";
import { gameArtUrl, newVisualOn } from "@/Domain/art/paintedFaces";
import { STADIUM_ART_ITEMS, stadiumArtLevel, stadiumMapFile } from "@/Domain/facilities/stadiumArt";
import { clubTodo, itemJob, type WorksJob } from "@/Domain/facilities/clubTabs";

/** The Club tabs this view draws (they share one data load); Materials is drawn by the screen. */
export type FacilitiesSection = "overview" | "stadium" | "works";

const LABEL = "font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground";

/**
 * Club → Overview, Stadium and Works (spec 2026-11-19-club-tab-redesign, `.claude/rules/game/facilities.md`), one data
 * load for the three: the club map and the to-do list; the stands, comfort, turf, crowd and the stadium sponsors; the
 * works queue, picker and the chosen works in three steps. Every works is built from the workshop's stock (craft).
 */
export function FacilitiesView({
  saveId, squadId, fixtures, leagues, currentDate, section, onSection, job, onJob, onBuy, sponsors,
}: {
  saveId: string;
  squadId: string;
  fixtures: Fixture[];
  leagues: LeagueData[];
  currentDate: string | null;
  section: FacilitiesSection;
  onSection: (s: FacilitiesSection) => void;
  /** The works picked in the Works tab (null: the first of the to-do list). */
  job: WorksJob | null;
  /** Picks a works (and opens the Works tab when `open`). */
  onJob: (job: WorksJob, open?: boolean) => void;
  /** "Buy what is missing": Materials with this cart. */
  onBuy: (cart: MaterialCounts) => void;
  /** The club's sponsors, shown on the stadium tab. */
  sponsors?: ReactNode;
}) {
  const { t, i18n } = useTranslation();
  const [reload, setReload] = useState(0);
  const { data, error, request, cancel, setMowing } = useFacilities(saveId, `${currentDate}:${reload}`);
  const craft = useCraft(saveId);
  const [selected, setSelected] = useState<StandId | null>(null);
  const [seats, setSeats] = useState<number>(5000);
  const [outcome, setOutcome] = useState<{ kind: FacilityKind; result: RequestOutcome } | { cancelled: boolean } | null>(null);
  const [pending, setPending] = useState(false);

  const seasonGames = useMemo(() => buildSeasonGames(data, fixtures, squadId, currentDate), [data, fixtures, squadId, currentDate]);

  if (error) return <p className="text-sm text-muted-foreground">{t("warnings.errors.loadFailed")}</p>;
  if (!data) return <p className="text-sm text-muted-foreground">{t("financesScreen.loading")}</p>;

  const f = data.facilities;
  const nf = (n: number) => Math.round(n).toLocaleString(i18n.language);
  const played = seasonGames.filter((g) => g.played);
  const avgOcc = played.length > 0
    ? played.reduce((s, g) => s + g.attendance / Math.max(1, g.capacity), 0) / played.length
    : seasonGames[0] ? seasonGames[0].attendance / Math.max(1, seasonGames[0].capacity) : 0;
  const avgAttendance = played.length > 0 ? played.reduce((s, g) => s + g.attendance, 0) / played.length : null;
  const works = standUnderWorks(f);
  const stand: StandId = selected ?? "east";
  const todo = clubTodo(data.items, data.busyGroups ?? []);
  const shownJob: WorksJob = job ?? todo.repair[0]?.job ?? todo.improve[0]?.job ?? itemJob(data.items[0]!);

  const ask = async (req: FacilityRequest) => {
    setPending(true);
    const result = await request(req);
    setOutcome({ kind: req.kind, result });
    setPending(false);
    if (result.built) craft.reload();
  };

  const stop = async (projectId: string) => {
    setPending(true);
    const ok = await cancel(projectId);
    setOutcome({ cancelled: ok });
    setPending(false);
    if (ok) craft.reload();
  };

  const stockChanged = () => setReload((n) => n + 1);

  return (
    <div className="flex flex-col gap-6">
      {outcome && <OutcomeNotice outcome={outcome} onClose={() => setOutcome(null)} />}

      {section === "overview" && (
        <ClubOverview data={data} craft={craft.view} avgAttendance={avgAttendance} pending={pending} onAsk={ask}
          onOpen={(j) => onJob(j, true)} onStadium={() => onSection("stadium")} />
      )}

      {/* The stands seen from above and their expansion; the crowd, comfort, turf and the stadium sponsors. */}
      {section === "stadium" && (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] gap-6 items-start">
          <section className="card-arcade rounded-md p-4 flex flex-col gap-4 min-w-0">
            <div className="flex items-baseline justify-between gap-3">
              <span className={LABEL}>{t("clubTabs.stadium.stands")}</span>
              <span className="text-sm text-muted-foreground">{t("facilities.stadium.hint")}</span>
            </div>
            <StadiumMap data={data} avgOcc={avgOcc} selected={selected} works={works} onSelect={setSelected} nf={nf} />
            <StandExpansion data={data} stand={stand} seats={seats} onSeats={setSeats} nf={nf}
              onOpen={() => { setSelected(stand); onJob({ kind: "stand" }, true); }} />
          </section>

          <div className="flex flex-col gap-6 min-w-0">
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
              <Kpi label={t("facilities.kpi.capacity")} value={nf(data.capacity)}
                sub={data.effectiveCapacity < data.capacity ? t("facilities.kpi.duringWorks", { seats: nf(data.effectiveCapacity) }) : undefined} />
              <Kpi label={t("facilities.kpi.avgAttendance")} value={avgAttendance === null ? "—" : nf(avgAttendance)}
                sub={avgAttendance === null ? undefined : t("facilities.kpi.occupancy", { pct: Math.round(avgOcc * 100) })} />
              <Kpi label={t("facilities.kpi.record")} value={f.record ? nf(f.record.attendance) : "—"} sub={f.record ? formatGameDate(f.record.date, i18n.language) : undefined} />
              <Kpi label={t("facilities.kpi.ticket")} value={`+${Math.round((data.priceMult - 1) * 100)}%`}
                sub={t("facilities.kpi.comfortLevel", { level: levelText(data.levels.comfort, i18n.language) })} />
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <ComfortCard data={data} onOpen={() => onJob({ kind: "comfort" }, true)} />
              <TurfSummary data={data} ground={squadId} onRepair={() => onJob({ kind: "item", mode: "repair", item: "stadiumPitch" }, true)}
                onChange={() => onJob({ kind: "turf" }, true)} onMowing={(m) => void setMowing(m)} />
            </div>
            <TicketPriceControl saveId={saveId} />
            <AttendanceChart games={seasonGames} leagues={leagues} nf={nf}
              sub={avgAttendance === null ? null : t("clubTabs.stadium.chartSub", { avg: nf(avgAttendance), pct: Math.round(avgOcc * 100) })} />
            {sponsors}
          </div>
        </div>
      )}

      {section === "works" && (
        <>
          <WorksTab
            saveId={saveId} data={data} craft={craft.view} craftBusy={craft.busy} craftError={craft.actionError} runCraft={craft.run}
            job={shownJob} onJob={(j) => onJob(j)} stand={stand} onStand={setSelected} seats={seats} onSeats={setSeats}
            pending={pending} onAsk={ask} onCancel={stop} onBuy={onBuy} onStockChanged={stockChanged}
          />
          {data.weeklyUpkeep > 0 && (
            <p className="text-sm text-muted-foreground m-0 tabular-nums">{t("facilities.projects.upkeep", { amount: formatEuros(data.weeklyUpkeep) })}</p>
          )}
        </>
      )}
    </div>
  );
}

/** Stadium tab: the picked stand's expansion (seats, weeks, parts) and the stadium works under way; the works itself is in Works. */
function StandExpansion({ data, stand, seats, onSeats, nf, onOpen }: {
  data: FacilitiesViewData; stand: StandId; seats: number; onSeats: (n: number) => void; nf: (n: number) => string; onOpen: () => void;
}) {
  const { t, i18n } = useTranslation();
  const options = Array.from({ length: (FACILITIES.SEATS_MAX - FACILITIES.SEATS_MIN) / FACILITIES.SEATS_STEP + 1 }, (_, i) => {
    const n = FACILITIES.SEATS_MIN + i * FACILITIES.SEATS_STEP;
    return { key: String(n), label: `+${n / 1000}K` };
  });
  const build = standBuild(data, Math.round(seats * data.seatCost));
  const parts = (Object.keys(build.recipe) as (keyof typeof build.recipe)[]).map((id) => t(`craft.component.${id}`).toLowerCase()).join(", ");
  const running = runningWorksOf(data.facilities.projects, "stadium");
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <span className={LABEL}>{t("clubTabs.stadium.expand", { stand: t(`facilities.stand.${stand}`) })}</span>
        <OptionChips options={options} value={String(seats)} onChange={(k) => onSeats(Number(k))} aria-label={t("facilities.stand.seats")} />
        <span className="text-sm text-muted-foreground tabular-nums">
          {t("clubTabs.stadium.expandSummary", { seats: nf(seats), weeks: standWeeks(seats), parts })}
        </span>
        <div>
          <Button variant="secondary" className={OUTLINE} onClick={onOpen}>{t("clubTabs.todo.open")}</Button>
        </div>
      </div>
      {running && (
        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <span className={LABEL}>{t("clubTabs.stadium.underWorks")}</span>
          <span className="text-sm font-semibold text-foreground">{projectLabel(running, t, nf)}</span>
          <span className="flex items-center gap-3 text-sm tabular-nums">
            <span className="h-1.5 flex-1 min-w-16 bg-border rounded overflow-hidden" aria-hidden>
              <span className="block h-full bg-primary" style={{ width: `${Math.round(projectProgress(running, data.date) * 100)}%` }} />
            </span>
            <span className="text-muted-foreground">
              {Math.round(projectProgress(running, data.date) * 100)}% · {t("facilities.projects.delivery", { date: formatGameDate(running.end, i18n.language) })}
            </span>
          </span>
        </div>
      )}
    </div>
  );
}

function ComfortCard({ data, onOpen }: { data: FacilitiesViewData; onOpen: () => void }) {
  const { t, i18n } = useTranslation();
  const now = Math.round((data.priceMult - 1) * 100);
  const q = data.quotes.comfort;
  return (
    <section className="card-arcade rounded-md p-4 flex flex-col gap-3 min-w-0">
      <span className={LABEL}>{t("facilities.kind.comfort")}</span>
      <span className="font-display font-black uppercase text-xl leading-none">{t("clubTabs.stadium.levelOf", { level: levelText(data.levels.comfort, i18n.language), max: FACILITIES.MAX_LEVEL })}</span>
      <LevelMarks level={data.levels.comfort} />
      <span className="text-sm text-muted-foreground tabular-nums">
        {q
          ? t("clubTabs.stadium.comfortNext", { now, next: now + FACILITIES.COMFORT_PRICE_STEP * 100 })
          : t("facilities.comfort.effect", { pct: now })}
      </span>
      {q && (
        <div className="flex justify-end mt-auto">
          <Button variant="secondary" className={OUTLINE} onClick={onOpen}>{t("facilities.items.upgrade")}</Button>
        </div>
      )}
    </section>
  );
}

function TurfSummary({ data, ground, onRepair, onChange, onMowing }: {
  data: FacilitiesViewData; ground: string; onRepair: () => void; onChange: () => void; onMowing: (m: (typeof MOWING_PATTERNS)[number]) => void;
}) {
  const { t, i18n } = useTranslation();
  const pitch = data.items.find((i) => i.id === "stadiumPitch");
  const condition = Math.round(pitch?.condition ?? 100);
  const bad = condition < FACILITIES.WEAR.WARN_BELOW;
  const effect = pitch && pitch.effects.length > 0 ? itemEffectText(pitch.effects, t, i18n.language) : null;
  const repair = pitch?.quotes.repair["100"];
  return (
    <section className="card-arcade rounded-md p-4 flex flex-col sm:flex-row gap-4 min-w-0">
      <PitchSurfaceSvg condition={condition} turf={data.turf} mowing={data.mowing} seed="club" ground={ground}
        className="w-full sm:w-36 h-auto rounded border border-border shrink-0 self-start" />
      <div className="flex flex-col gap-2 min-w-0 flex-1">
        <span className={LABEL}>{t("facilities.turf.title")}</span>
        <span className="font-display font-black uppercase text-xl leading-none">
          {t(`facilities.turf.type.${data.turf}`)} · {t(`facilities.mowing.${data.mowing}`)}
        </span>
        <span className="flex items-center gap-3 text-sm tabular-nums">
          <span className="h-1.5 flex-1 min-w-16 bg-border rounded overflow-hidden" aria-hidden>
            <span className={`block h-full ${bad ? "bg-destructive" : condition < 70 ? "bg-chart-4" : "bg-star-green"}`} style={{ width: `${condition}%` }} />
          </span>
          <span className={`font-semibold ${bad ? "text-destructive" : "text-foreground"}`}>{condition}%</span>
        </span>
        {effect && <span className="text-sm text-muted-foreground">{effect}</span>}
        <SelectCombobox label={t("facilities.mowing.label")} value={data.mowing} onChange={onMowing} floating
          options={MOWING_PATTERNS.map((m) => ({ value: m, label: t(`facilities.mowing.${m}`) }))} />
        <div className="flex flex-wrap justify-end gap-2 mt-auto">
          <Button variant="secondary" className={OUTLINE} onClick={onChange}>{t("clubTabs.stadium.changeGrass")}</Button>
          {repair && (
            <Button onClick={onRepair} className="tabular-nums">
              {repair.cost > 0 ? t("clubTabs.stadium.repairCost", { cost: formatEuros(repair.cost) }) : t("facilities.items.repair")}
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}

// ── Season games (played rows + estimates of the coming ones) ────────────────

interface SeasonGame {
  date: string;
  competition: string;
  attendance: number;
  capacity: number;
  demand: number;
  played: boolean;
}

function buildSeasonGames(data: FacilitiesViewData | null, fixtures: Fixture[], squadId: string, today: string | null): SeasonGame[] {
  if (!data) return [];
  const start = data.season?.start ?? "0000-00-00";
  const played: SeasonGame[] = data.facilities.attendance
    .filter((r) => r.date >= start)
    .map((r) => ({ ...r, played: true }));
  const playedDates = new Set(played.map((g) => `${g.date}:${g.competition}`));
  const upcoming: SeasonGame[] = fixtures
    .filter((fx) => fx.home === squadId && !fx.neutral && !fx.played && fx.date >= (today ?? ""))
    .filter((fx) => !playedDates.has(`${fx.date}:${fx.competition}`))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((fx) => {
      const a = attendanceOf(data.facilities, {
        ...data.demandInput,
        ...(data.season ? { fraction: seasonFraction(fx.date, data.season.start, data.season.end) } : {}),
        date: fx.date,
        ...(data.importanceByFixture?.[fx.id] !== undefined ? { importance: data.importanceByFixture[fx.id] } : {}),
      });
      return { date: fx.date, competition: fx.competition, attendance: a.attendance, capacity: a.capacity, demand: a.demand, played: false };
    });
  return [...played, ...upcoming];
}

// ── Pieces ────────────────────────────────────────────────────────────────────

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card-arcade rounded-md p-4 flex flex-col gap-1 min-w-0">
      <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground">{label}</span>
      <span className="font-display font-bold text-2xl tabular-nums leading-none text-foreground">{value}</span>
      {sub && <span className="text-sm text-muted-foreground tabular-nums truncate">{sub}</span>}
    </div>
  );
}

/** Fill opacity of a stand from its occupancy (0..1). */
const occOpacity = (occ: number) => 0.18 + 0.82 * Math.max(0, Math.min(1, occ));
/** Over the painted stadium: a light primary tint that grows with the occupancy, empty seats darkened. */
/**
 * Per-stand occupancy for display: the season average spread over the stands with a mild
 * preference for the main (west) stand, the seat-weighted mean equal to the average, capped at 100%.
 */
function standOccupancy(data: FacilitiesViewData, avg: number): Record<StandId, number> {
  const w: Record<StandId, number> = { west: 1.06, east: 1, north: 0.95, south: 0.95 };
  const seats = data.facilities.stands;
  const total = seats.reduce((s, x) => s + x.seats, 0) || 1;
  const norm = seats.reduce((s, x) => s + x.seats * w[x.id], 0) / total;
  const out = {} as Record<StandId, number>;
  for (const s of seats) out[s.id] = Math.min(1, (avg * w[s.id]) / norm);
  return out;
}

const stadiumItemLevels = (data: FacilitiesViewData) => data.items.filter((i) => STADIUM_ART_ITEMS.includes(i.id)).map((i) => i.level);

/** Label of a stand, in % of the drawing: the stand's centre. */
const labelPos = (r: MapRect) => ({ left: `${((r.x + r.w / 2) / 320) * 100}%`, top: `${((r.y + r.h / 2) / 400) * 100}%` });

function StadiumMap({
  data, avgOcc, selected, works, onSelect, nf,
}: {
  data: FacilitiesViewData; avgOcc: number; selected: StandId | null; works: StandId | null;
  onSelect: (s: StandId) => void; nf: (n: number) => string;
}) {
  const { t } = useTranslation();
  const occ = standOccupancy(data, avgOcc);
  const [imgFailed, setImgFailed] = useState(false);
  // The ground as the live match draws it (tester report): its shape and each stand as deep as its seats.
  const geom = stadiumMapGeom(data.stadium?.shape, data.stadium?.depths);
  // New visual: one generic painted ground per phase of the stadium items (8.8.26); the numbers on the labels are the club's.
  const painted = newVisualOn() && !imgFailed;
  const level = stadiumArtLevel(stadiumItemLevels(data));
  const p = painted ? paintedStands(level) : geom.stands;
  return (
    <>
    <div className="relative w-full max-w-[480px] mx-auto aspect-[320/400]">
      {painted && (
        <img src={gameArtUrl(stadiumMapFile(level))} alt="" aria-hidden onError={() => setImgFailed(true)}
          className="absolute inset-0 w-full h-full rounded-lg select-none pointer-events-none" draggable={false} />
      )}
      <svg viewBox="0 0 320 400" className="absolute inset-0 w-full h-full" role="img" aria-label={t("facilities.stadium.title")}>
        <defs>
          <pattern id="fac-works" patternUnits="userSpaceOnUse" width="10" height="10" patternTransform="rotate(45)">
            <rect width="10" height="10" className="fill-chart-4/15" />
            <line x1="0" y1="0" x2="0" y2="10" className="stroke-chart-4" strokeWidth="4" />
          </pattern>
        </defs>
        {!painted && (
          <>
            {/* Bowl in the ground's shape (none for separate stands) */}
            {geom.bowl && (
              <rect x={geom.bowl.x} y={geom.bowl.y} width={geom.bowl.w} height={geom.bowl.h} rx={geom.bowl.rx} ry={geom.bowl.ry}
                className="fill-secondary/40 stroke-border" strokeWidth="2" />
            )}
            {/* Pitch */}
            <rect x="92" y="76" width="136" height="248" rx="4" className="fill-foreground/[0.04] stroke-foreground/25" strokeWidth="2" />
            <line x1="92" y1="200" x2="228" y2="200" className="stroke-foreground/25" strokeWidth="2" />
            <circle cx="160" cy="200" r="20" className="fill-none stroke-foreground/25" strokeWidth="2" />
            <rect x="128" y="76" width="64" height="30" className="fill-none stroke-foreground/25" strokeWidth="2" />
            <rect x="128" y="294" width="64" height="30" className="fill-none stroke-foreground/25" strokeWidth="2" />
          </>
        )}
        {/* Stands */}
        {data.facilities.stands.map((s) => {
          const g = p[s.id];
          const on = selected === s.id;
          return (
            <g key={s.id} onClick={() => onSelect(s.id)} className="cursor-pointer">
              {!painted && <rect x={g.x} y={g.y} width={g.w} height={g.h} rx="8" className="fill-primary" fillOpacity={occOpacity(occ[s.id])} />}
              {/* Seat rows, parallel to the pitch (the painted stadium has its own). */}
              {!painted && [0.25, 0.5, 0.75].map((k) => (g.w > g.h
                ? <line key={k} x1={g.x + 6} x2={g.x + g.w - 6} y1={g.y + g.h * k} y2={g.y + g.h * k} className="stroke-background/30" strokeWidth="1" />
                : <line key={k} y1={g.y + 6} y2={g.y + g.h - 6} x1={g.x + g.w * k} x2={g.x + g.w * k} className="stroke-background/30" strokeWidth="1" />))}
              {works === s.id && <rect x={g.x} y={g.y} width={g.w} height={g.h} rx="8" fill="url(#fac-works)" />}
              <rect x={g.x} y={g.y} width={g.w} height={g.h} rx="8"
                className={`fill-transparent ${on ? "stroke-foreground" : painted ? "stroke-transparent hover:stroke-muted-foreground" : "stroke-border hover:stroke-muted-foreground"}`}
                strokeWidth={on ? 3 : 1.5} />
            </g>
          );
        })}
      </svg>
      {/* Labels in HTML over the drawing (no SVG text). */}
      {data.facilities.stands.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => onSelect(s.id)}
          aria-pressed={selected === s.id}
          style={labelPos(p[s.id])}
          className={`absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-0 px-2 py-1 rounded bg-card/85 border-0 cursor-pointer min-h-8 ${
            selected === s.id ? "ring-1 ring-foreground" : ""}`}
        >
          <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground leading-tight">
            {t(`facilities.stand.${s.id}`)}
          </span>
          <span className="font-display font-bold text-base tabular-nums text-foreground leading-tight">{nf(s.seats)}</span>
          <span className="text-sm tabular-nums text-muted-foreground leading-tight">
            {works === s.id ? t("facilities.stand.works") : `${Math.round(occ[s.id] * 100)}%`}
          </span>
        </button>
      ))}
    </div>
    {!painted && <OccupancyLegend />}
    </>
  );
}

function OccupancyLegend() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
      <span className="flex items-center gap-2">
        <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px]">{t("facilities.stadium.occupancy")}</span>
        <span className="tabular-nums">0%</span>
        <span className="flex gap-0.5" aria-hidden>
          {["bg-primary/20", "bg-primary/40", "bg-primary/60", "bg-primary/80", "bg-primary"].map((c) => (
            <span key={c} className={`h-2.5 w-5 rounded-sm ${c}`} />
          ))}
        </span>
        <span className="tabular-nums">100%</span>
      </span>
      <span className="flex items-center gap-2">
        <span className="h-3 w-3 rounded-sm bg-chart-4/60" aria-hidden />
        {t("facilities.stand.works")}
      </span>
    </div>
  );
}


function LevelMarks({ level }: { level: number }) {
  return (
    <div className="flex gap-1.5" aria-hidden>
      {Array.from({ length: FACILITIES.MAX_LEVEL }, (_, i) => (
        <span key={i} className={`h-2 w-8 rounded ${i < level ? "bg-primary" : "bg-border"}`} />
      ))}
    </div>
  );
}

/** Tooltip anchor of bar `i` of `n`: left edge in the first third, right edge in the last, centred in between. */
function tooltipAnchor(i: number, n: number): string {
  if (i < n / 3) return "left-0";
  if (i >= (2 * n) / 3) return "right-0";
  return "left-1/2 -translate-x-1/2";
}
function OutcomeNotice({ outcome, onClose }: {
  outcome: { kind: FacilityKind; result: RequestOutcome } | { cancelled: boolean }; onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  let ok: boolean;
  let title: string;
  let text: string;
  if ("cancelled" in outcome) {
    ok = outcome.cancelled;
    title = ok ? t("craft.cancelWorks") : t("craft.outcome.refusedTitle");
    text = ok ? t("craft.cancelDone") : t("craft.errors.generic");
  } else {
    const r = outcome.result;
    ok = r.built;
    title = ok ? t("craft.outcome.builtTitle") : t("craft.outcome.refusedTitle");
    if (r.built) {
      const what = r.project.item
        ? `${t(`facilities.kind.${outcome.kind}`)}: ${t(`facilities.item.${r.project.item}`)}`
        : t(`facilities.kind.${outcome.kind}`);
      text = `${t("facilities.outcome.approved", { what, date: formatGameDate(r.project.end, i18n.language) })} ${
        t("craft.outcome.quality", { quality: t(`craft.quality.${r.quality}`) })}`;
    } else if (r.reason === "busy" && r.group) {
      text = t("facilities.groupBusy", { group: t(`facilities.items.group.${r.group}`) });
    } else {
      text = r.reason === "missing_components" ? t("craft.errors.missingComponents") : t(`facilities.reason.${r.reason}`);
    }
  }
  return (
    <div className={`card-arcade rounded-md p-4 border flex items-start gap-3 ${ok ? "border-chart-2/50 bg-chart-2/10" : "border-destructive/50 bg-destructive/10"}`}>
      <Icon name={ok ? "check-circle" : "alert"} size={20} className={ok ? "text-chart-2 shrink-0" : "text-destructive shrink-0"} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground m-0">{title}</p>
        <p className="text-sm text-muted-foreground mt-0.5 mb-0">{text}</p>
      </div>
      <Button variant="secondary" flush onClick={onClose} aria-label={t("common.close")}>
        <Icon name="close" size={16} />
      </Button>
    </div>
  );
}

// ── Attendance chart ─────────────────────────────────────────────────────────

function AttendanceChart({ games, leagues, nf, sub }: { games: SeasonGame[]; leagues: LeagueData[]; nf: (n: number) => string; sub?: string | null }) {
  const { t, i18n } = useTranslation();
  const max = Math.max(1, ...games.map((g) => Math.max(g.capacity, g.demand))) * 1.08;
  const y = (v: number) => 100 - (v / max) * 100;
  const n = games.length;
  // Capacity as a step line and demand as a dashed line, in a 0..100 box stretched over the bars.
  const step = (i: number) => (i / Math.max(1, n)) * 100;
  const capacityPath = games.map((g, i) => `${i === 0 ? "M" : "L"}${step(i)},${y(g.capacity)} L${step(i + 1)},${y(g.capacity)}`).join(" ");
  const demandPath = games.map((g, i) => `${i === 0 ? "M" : "L"}${step(i + 0.5)},${y(g.demand)}`).join(" ");
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  return (
    <section className="card-arcade rounded-md p-4 flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="font-display font-black uppercase text-xl leading-none m-0">{t("facilities.chart.title")}</h3>
          {sub && <span className="text-sm text-muted-foreground tabular-nums">{sub}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          <Legend swatch={<span className="h-3 w-3 rounded-sm bg-primary" />} label={t("facilities.chart.played")} />
          <Legend swatch={<span className="h-3 w-3 rounded-sm bg-primary/15 border border-dashed border-primary/70" />} label={t("facilities.chart.estimated")} />
          <Legend swatch={<span className="h-0.5 w-4 bg-foreground" />} label={t("facilities.chart.capacity")} />
          <Legend swatch={<span className="h-0 w-4 border-t-2 border-dashed border-chart-4" />} label={t("facilities.chart.demand")} />
        </div>
      </div>
      {n === 0 ? (
        <p className="text-sm text-muted-foreground m-0">{t("facilities.chart.empty")}</p>
      ) : (
        <div className="flex gap-2">
          {/* Y axis */}
          <div className="relative w-14 h-56 shrink-0">
            {ticks.map((v) => (
              <span key={v} className="absolute right-0 -translate-y-1/2 text-sm tabular-nums text-muted-foreground"
                style={{ top: `${y(v)}%` }}>
                {v >= 1000 ? `${Math.round(v / 1000)}K` : Math.round(v)}
              </span>
            ))}
          </div>
          <div className="relative flex-1 h-56 min-w-0">
            {ticks.map((v) => (
              <div key={v} className="absolute inset-x-0 border-t border-border/50" style={{ top: `${y(v)}%` }} aria-hidden />
            ))}
            <div className="absolute inset-0 flex items-end gap-1">
              {games.map((g, i) => (
                <div key={`${g.date}:${g.competition}`} className="relative flex-1 h-full flex items-end group min-w-0">
                  <div
                    className={`w-full rounded-t ${g.played ? "bg-primary" : "bg-primary/15 border border-dashed border-b-0 border-primary/70"}`}
                    style={{ height: `${100 - y(g.attendance)}%` }}
                  />
                  {/* Out of the layout until hovered and anchored inward at the edges, so the last bar never makes the page scroll sideways (#154). */}
                  <div className={`absolute bottom-full mb-1 hidden group-hover:block pointer-events-none z-10 ${tooltipAnchor(i, n)}`}>
                    <div className="bg-card border border-border rounded-lg px-3 py-2 text-sm whitespace-nowrap flex flex-col gap-0.5 tabular-nums">
                      <span className="font-semibold text-foreground">{formatGameDate(g.date, i18n.language)} · {competitionName(g.competition, leagues, i18n.language)}</span>
                      <span className="text-muted-foreground">
                        {g.played ? t("facilities.chart.played") : t("facilities.chart.estimated")}: <span className="text-foreground">{nf(g.attendance)}</span>
                      </span>
                      <span className="text-muted-foreground">{t("facilities.chart.capacity")}: <span className="text-foreground">{nf(g.capacity)}</span></span>
                      <span className="text-muted-foreground">{t("facilities.chart.demand")}: <span className="text-foreground">{nf(g.demand)}</span></span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden>
              <path d={capacityPath} className="fill-none stroke-foreground" strokeWidth="2" vectorEffect="non-scaling-stroke" />
              <path d={demandPath} className="fill-none stroke-chart-4" strokeWidth="2" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
            </svg>
          </div>
        </div>
      )}
    </section>
  );
}

function Legend({ swatch, label }: { swatch: React.ReactNode; label: string }) {
  return <span className="flex items-center gap-1.5">{swatch}{label}</span>;
}

