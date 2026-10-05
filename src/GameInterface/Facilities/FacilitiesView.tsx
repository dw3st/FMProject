import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@/GameInterface/Icons";
import { Button } from "@/GameInterface/ui/Button";
import { OptionChips } from "@/GameInterface/ui/OptionChips";
import { formatEuros } from "@/Domain/money";
import { competitionName } from "@/Domain/world/labels";
import {
  attendanceOf, boardDecision, projectProgress, seasonFraction, standUnderWorks, standWeeks,
} from "@/Domain/facilities/facilities";
import { FACILITIES } from "@/Domain/facilities/facilityConfig";
import type { Fixture } from "@/types/calendarTypes";
import type { LeagueData } from "@/types/playerTypes";
import type { FacilityKind, FacilityRequest, StandId } from "@/types/facilityTypes";
import { useFacilities, type FacilitiesViewData, type RequestOutcome } from "@/GameInterface/Facilities/facilitiesApi";

/**
 * Finances → Facilities (`.claude/rules/game/facilities.md`): the stadium drawn from above (stands
 * coloured by occupancy), the expansion panel, attendance per home game against capacity and
 * demand, training ground and academy cards, works in progress. Every request goes to the board.
 */
export function FacilitiesView({
  saveId, squadId, fixtures, leagues, currentDate,
}: {
  saveId: string;
  squadId: string;
  fixtures: Fixture[];
  leagues: LeagueData[];
  currentDate: string | null;
}) {
  const { t, i18n } = useTranslation();
  const { data, error, request } = useFacilities(saveId, currentDate);
  const [selected, setSelected] = useState<StandId | null>(null);
  const [seats, setSeats] = useState<number>(5000);
  const [outcome, setOutcome] = useState<{ kind: FacilityKind; result: RequestOutcome } | null>(null);
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

  const ask = async (req: FacilityRequest) => {
    setPending(true);
    const result = await request(req);
    setOutcome({ kind: req.kind, result });
    setPending(false);
  };

  const running = (kind: FacilityKind) => f.projects.some((p) => p.kind === kind);

  return (
    <div className="flex flex-col gap-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label={t("facilities.kpi.capacity")} value={nf(data.capacity)}
          sub={data.effectiveCapacity < data.capacity ? t("facilities.kpi.duringWorks", { seats: nf(data.effectiveCapacity) }) : undefined} />
        <Kpi label={t("facilities.kpi.avgAttendance")} value={avgAttendance === null ? "—" : nf(avgAttendance)}
          sub={avgAttendance === null ? undefined : t("facilities.kpi.occupancy", { pct: Math.round(avgOcc * 100) })} />
        <Kpi label={t("facilities.kpi.record")} value={f.record ? nf(f.record.attendance) : "—"} sub={f.record?.date} />
        <Kpi label={t("facilities.kpi.ticket")} value={`+${Math.round((data.priceMult - 1) * 100)}%`}
          sub={t("facilities.kpi.comfortLevel", { level: f.comfort })} />
      </div>

      {outcome && <OutcomeNotice outcome={outcome} onClose={() => setOutcome(null)} />}

      {/* Stadium + expansion panel */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] gap-6">
        <section className="card-arcade rounded-md p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-display font-black uppercase text-xl leading-none m-0">{t("facilities.stadium.title")}</h3>
            <span className="text-sm text-muted-foreground">{t("facilities.stadium.hint")}</span>
          </div>
          <StadiumMap data={data} avgOcc={avgOcc} selected={selected} works={works} onSelect={setSelected} nf={nf} />
          <OccupancyLegend />
        </section>

        <section className="card-arcade rounded-md p-4 flex flex-col gap-4">
          {selected ? (
            <StandPanel
              data={data} stand={selected} seats={seats} onSeats={setSeats} nf={nf}
              busy={running("stand")} pending={pending}
              onAsk={() => void ask({ kind: "stand", stand: selected, seats })}
            />
          ) : (
            <div className="flex flex-col gap-2">
              <h3 className="font-display font-black uppercase text-xl leading-none m-0">{t("facilities.stand.title")}</h3>
              <p className="text-sm text-muted-foreground m-0">{t("facilities.stand.pick")}</p>
            </div>
          )}
          <div className="border-t border-border pt-4">
            <LevelBlock
              kind="comfort" level={f.comfort} data={data} busy={running("comfort")} pending={pending}
              current={t("facilities.comfort.effect", { pct: Math.round((data.priceMult - 1) * 100) })}
              next={t("facilities.comfort.effect", { pct: Math.round((data.priceMult - 1) * 100) + FACILITIES.COMFORT_PRICE_STEP * 100 })}
              onAsk={() => void ask({ kind: "comfort" })}
            />
          </div>
        </section>
      </div>

      <AttendanceChart games={seasonGames} leagues={leagues} nf={nf} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="card-arcade rounded-md p-4">
          <LevelBlock
            kind="training" level={f.training} data={data} busy={running("training")} pending={pending}
            current={trainingText(data.effects.training.current, t)}
            next={trainingText(data.effects.training.next, t)}
            onAsk={() => void ask({ kind: "training" })}
          />
        </section>
        <section className="card-arcade rounded-md p-4">
          <LevelBlock
            kind="academy" level={f.academy} data={data} busy={running("academy")} pending={pending}
            current={academyText(data.effects.academy.current, t)}
            next={academyText(data.effects.academy.next, t)}
            onAsk={() => void ask({ kind: "academy" })}
          />
        </section>
      </div>

      <ProjectsList data={data} nf={nf} />
    </div>
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

const STAND_GEOM: Record<StandId, { x: number; y: number; w: number; h: number; label: string }> = {
  north: { x: 96, y: 14, w: 128, h: 54, label: "left-1/2 top-[10.25%] -translate-x-1/2 -translate-y-1/2" },
  south: { x: 96, y: 332, w: 128, h: 54, label: "left-1/2 top-[89.75%] -translate-x-1/2 -translate-y-1/2" },
  west: { x: 14, y: 80, w: 70, h: 240, label: "left-[15.5%] top-1/2 -translate-x-1/2 -translate-y-1/2" },
  east: { x: 236, y: 80, w: 70, h: 240, label: "left-[84.5%] top-1/2 -translate-x-1/2 -translate-y-1/2" },
};

function StadiumMap({
  data, avgOcc, selected, works, onSelect, nf,
}: {
  data: FacilitiesViewData; avgOcc: number; selected: StandId | null; works: StandId | null;
  onSelect: (s: StandId) => void; nf: (n: number) => string;
}) {
  const { t } = useTranslation();
  const occ = standOccupancy(data, avgOcc);
  return (
    <div className="relative w-full max-w-[420px] mx-auto aspect-[320/400]">
      <svg viewBox="0 0 320 400" className="absolute inset-0 w-full h-full" role="img" aria-label={t("facilities.stadium.title")}>
        <defs>
          <pattern id="fac-works" patternUnits="userSpaceOnUse" width="10" height="10" patternTransform="rotate(45)">
            <rect width="10" height="10" className="fill-chart-4/15" />
            <line x1="0" y1="0" x2="0" y2="10" className="stroke-chart-4" strokeWidth="4" />
          </pattern>
        </defs>
        {/* Bowl */}
        <rect x="6" y="6" width="308" height="388" rx="38" className="fill-secondary/40 stroke-border" strokeWidth="2" />
        {/* Pitch */}
        <rect x="92" y="76" width="136" height="248" rx="4" className="fill-foreground/[0.04] stroke-foreground/25" strokeWidth="2" />
        <line x1="92" y1="200" x2="228" y2="200" className="stroke-foreground/25" strokeWidth="2" />
        <circle cx="160" cy="200" r="20" className="fill-none stroke-foreground/25" strokeWidth="2" />
        <rect x="128" y="76" width="64" height="30" className="fill-none stroke-foreground/25" strokeWidth="2" />
        <rect x="128" y="294" width="64" height="30" className="fill-none stroke-foreground/25" strokeWidth="2" />
        {/* Stands */}
        {data.facilities.stands.map((s) => {
          const g = STAND_GEOM[s.id];
          const on = selected === s.id;
          return (
            <g key={s.id} onClick={() => onSelect(s.id)} className="cursor-pointer">
              <rect x={g.x} y={g.y} width={g.w} height={g.h} rx="8" className="fill-primary" fillOpacity={occOpacity(occ[s.id])} />
              {/* Seat rows, parallel to the pitch. */}
              {[0.25, 0.5, 0.75].map((k) => (g.w > g.h
                ? <line key={k} x1={g.x + 6} x2={g.x + g.w - 6} y1={g.y + g.h * k} y2={g.y + g.h * k} className="stroke-background/30" strokeWidth="1" />
                : <line key={k} y1={g.y + 6} y2={g.y + g.h - 6} x1={g.x + g.w * k} x2={g.x + g.w * k} className="stroke-background/30" strokeWidth="1" />))}
              {works === s.id && <rect x={g.x} y={g.y} width={g.w} height={g.h} rx="8" fill="url(#fac-works)" />}
              <rect x={g.x} y={g.y} width={g.w} height={g.h} rx="8"
                className={`fill-transparent ${on ? "stroke-foreground" : "stroke-border hover:stroke-muted-foreground"}`}
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
          className={`absolute ${STAND_GEOM[s.id].label} flex flex-col items-center gap-0 px-2 py-1 rounded bg-card/85 border-0 cursor-pointer min-h-8 ${
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

function StandPanel({
  data, stand, seats, onSeats, nf, busy, pending, onAsk,
}: {
  data: FacilitiesViewData; stand: StandId; seats: number; onSeats: (n: number) => void;
  nf: (n: number) => string; busy: boolean; pending: boolean; onAsk: () => void;
}) {
  const { t } = useTranslation();
  const current = data.facilities.stands.find((s) => s.id === stand)?.seats ?? 0;
  const cost = seats * data.seatCost;
  const weeks = standWeeks(seats);
  const options = Array.from({ length: (FACILITIES.SEATS_MAX - FACILITIES.SEATS_MIN) / FACILITIES.SEATS_STEP + 1 }, (_, i) => {
    const n = FACILITIES.SEATS_MIN + i * FACILITIES.SEATS_STEP;
    return { key: String(n), label: `+${n / 1000}K` };
  });
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="font-display font-black uppercase text-xl leading-none m-0">
          {t("facilities.stand.expand", { stand: t(`facilities.stand.${stand}`) })}
        </h3>
        <p className="text-sm text-muted-foreground mt-1 mb-0 tabular-nums">{t("facilities.stand.current", { seats: nf(current) })}</p>
      </div>
      <div className="flex flex-col gap-2">
        <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground">{t("facilities.stand.seats")}</span>
        <OptionChips options={options} value={String(seats)} onChange={(k) => onSeats(Number(k))} aria-label={t("facilities.stand.seats")} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Figure label={t("facilities.cost")} value={formatEuros(cost)} />
        <Figure label={t("facilities.duration")} value={t("facilities.weeks", { count: weeks })} />
        <Figure label={t("facilities.stand.newCapacity")} value={nf(data.capacity + seats)} />
      </div>
      <p className="text-sm text-muted-foreground m-0">{t("facilities.stand.halfDuringWorks")}</p>
      <AskRow data={data} cost={cost} busy={busy} pending={pending} onAsk={onAsk} />
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground">{label}</span>
      <span className="font-display font-bold text-lg tabular-nums text-foreground leading-none truncate">{value}</span>
    </div>
  );
}

/** Board preview + the request button. */
function AskRow({ data, cost, busy, pending, onAsk, disabled }: {
  data: FacilitiesViewData; cost: number; busy: boolean; pending: boolean; onAsk: () => void; disabled?: boolean;
}) {
  const { t } = useTranslation();
  const preview = boardDecision({ board: data.board, balance: data.balance, cost, revenue: data.revenue });
  const hint = busy
    ? t("facilities.busy")
    : preview.approved
      ? preview.boardShare > 0
        ? t("facilities.preview.funded", { pct: Math.round(preview.boardShare * 100) })
        : t("facilities.preview.approve")
      : t(`facilities.reason.${preview.reason}`);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className={`text-sm flex items-center gap-1.5 ${!busy && preview.approved ? "text-chart-2" : "text-muted-foreground"}`}>
        <Icon name={!busy && preview.approved ? "check-circle" : "alert"} size={16} />
        {hint}
      </span>
      <Button onClick={onAsk} disabled={busy || pending || disabled}>
        <Icon name="building" size={16} />
        {t("facilities.ask")}
      </Button>
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

function LevelBlock({
  kind, level, data, current, next, busy, pending, onAsk,
}: {
  kind: "comfort" | "training" | "academy"; level: number; data: FacilitiesViewData;
  current: string; next: string; busy: boolean; pending: boolean; onAsk: () => void;
}) {
  const { t } = useTranslation();
  const quote = data.quotes[kind];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display font-black uppercase text-xl leading-none m-0">{t(`facilities.kind.${kind}`)}</h3>
          <p className="text-sm text-muted-foreground mt-1 mb-0">{t(`facilities.${kind}.about`)}</p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className="font-display font-bold text-lg tabular-nums leading-none">{t("facilities.level", { level })}</span>
          <LevelMarks level={level} />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-md border border-border p-3">
          <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground">{t("facilities.now")}</span>
          <p className="text-sm text-foreground mt-1 mb-0 tabular-nums">{current}</p>
        </div>
        <div className="rounded-md border border-border p-3">
          <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground">
            {quote ? t("facilities.nextLevel", { level: quote.level }) : t("facilities.maxLevel")}
          </span>
          <p className="text-sm text-foreground mt-1 mb-0 tabular-nums">{quote ? next : "—"}</p>
        </div>
      </div>
      {quote && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Figure label={t("facilities.cost")} value={formatEuros(quote.cost)} />
            <Figure label={t("facilities.duration")} value={t("facilities.weeks", { count: quote.weeks })} />
          </div>
          <AskRow data={data} cost={quote.cost} busy={busy} pending={pending} onAsk={onAsk} />
        </>
      )}
    </div>
  );
}

type TFn = (key: string, opts?: Record<string, unknown>) => string;
const pct = (mult: number) => `${mult >= 1 ? "+" : "−"}${Math.abs(Math.round((mult - 1) * 100))}%`;

function trainingText(e: FacilitiesViewData["effects"]["training"]["current"], t: TFn): string {
  return t("facilities.training.effect", { recovery: pct(e.recoveryMult), injury: pct(e.injuryMult), dev: pct(e.devMult) });
}

function academyText(e: FacilitiesViewData["effects"]["academy"]["current"], t: TFn): string {
  const q = e.qualityBonus;
  return t("facilities.academy.effect", {
    quality: `${q >= 0 ? "+" : "−"}${Math.abs(q).toFixed(2)}`, max: e.intakeMax, promise: Math.round(e.promiseChance * 100),
  });
}

function OutcomeNotice({ outcome, onClose }: { outcome: { kind: FacilityKind; result: RequestOutcome }; onClose: () => void }) {
  const { t } = useTranslation();
  const r = outcome.result;
  const ok = r.approved;
  const text = r.approved
    ? t("facilities.outcome.approved", { what: t(`facilities.kind.${outcome.kind}`), date: r.project.end })
      + (r.boardShare > 0 ? ` ${t("facilities.preview.funded", { pct: Math.round(r.boardShare * 100) })}` : "")
    : t(`facilities.reason.${r.reason}`);
  return (
    <div className={`card-arcade rounded-md p-4 border flex items-start gap-3 ${ok ? "border-chart-2/50 bg-chart-2/10" : "border-destructive/50 bg-destructive/10"}`}>
      <Icon name={ok ? "check-circle" : "alert"} size={20} className={ok ? "text-chart-2 shrink-0" : "text-destructive shrink-0"} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground m-0">{ok ? t("facilities.outcome.approvedTitle") : t("facilities.outcome.refusedTitle")}</p>
        <p className="text-sm text-muted-foreground mt-0.5 mb-0">{text}</p>
      </div>
      <Button variant="secondary" flush onClick={onClose} aria-label={t("common.close")}>
        <Icon name="close" size={16} />
      </Button>
    </div>
  );
}

// ── Attendance chart ─────────────────────────────────────────────────────────

function AttendanceChart({ games, leagues, nf }: { games: SeasonGame[]; leagues: LeagueData[]; nf: (n: number) => string }) {
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
        <h3 className="font-display font-black uppercase text-xl leading-none m-0">{t("facilities.chart.title")}</h3>
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
              {games.map((g) => (
                <div key={`${g.date}:${g.competition}`} className="relative flex-1 h-full flex items-end group min-w-0">
                  <div
                    className={`w-full rounded-t ${g.played ? "bg-primary" : "bg-primary/15 border border-dashed border-b-0 border-primary/70"}`}
                    style={{ height: `${100 - y(g.attendance)}%` }}
                  />
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                    <div className="bg-card border border-border rounded-lg px-3 py-2 text-sm whitespace-nowrap flex flex-col gap-0.5 tabular-nums">
                      <span className="font-semibold text-foreground">{g.date} · {competitionName(g.competition, leagues, i18n.language)}</span>
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

// ── Works in progress ────────────────────────────────────────────────────────

function ProjectsList({ data, nf }: { data: FacilitiesViewData; nf: (n: number) => string }) {
  const { t } = useTranslation();
  const projects = data.facilities.projects;
  return (
    <section className="card-arcade rounded-md p-4 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-display font-black uppercase text-xl leading-none m-0">{t("facilities.projects.title")}</h3>
        {data.weeklyUpkeep > 0 && (
          <span className="text-sm text-muted-foreground tabular-nums">{t("facilities.projects.upkeep", { amount: formatEuros(data.weeklyUpkeep) })}</span>
        )}
      </div>
      {projects.length === 0 ? (
        <p className="text-sm text-muted-foreground m-0">{t("facilities.projects.none")}</p>
      ) : projects.map((p) => {
        const progress = projectProgress(p, data.date);
        const what = p.kind === "stand"
          ? t("facilities.projects.stand", { stand: t(`facilities.stand.${p.stand}`), seats: nf(p.seats ?? 0) })
          : t("facilities.projects.level", { what: t(`facilities.kind.${p.kind}`), level: p.level });
        return (
          <div key={p.id} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm font-semibold text-foreground">{what}</span>
              <span className="text-sm text-muted-foreground tabular-nums">
                {t("facilities.projects.delivery", { date: p.end })} · {formatEuros(p.cost)}
                {p.boardShare > 0 ? ` · ${t("facilities.preview.funded", { pct: Math.round(p.boardShare * 100) })}` : ""}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div className="h-1.5 bg-border rounded overflow-hidden flex-1 min-w-16">
                <div className="h-full bg-primary rounded" style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
              <span className="text-sm tabular-nums text-muted-foreground w-12 text-right">{Math.round(progress * 100)}%</span>
            </div>
          </div>
        );
      })}
    </section>
  );
}
