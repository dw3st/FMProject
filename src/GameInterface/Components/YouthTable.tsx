import { positionIndex } from "@/Domain/positions/positionSort";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { positionLabel, positionLabelColor } from "@/GameInterface/positionHelpers";
import { preferredRole } from "@/Domain/positions/positionAptitude";
import { Button } from "@/GameInterface/ui/Button";
import { DataTable, type DataTableColumn } from "@/GameInterface/ui/DataTable";
import { Notice } from "@/GameInterface/ui/Notice";
import { RebornBadge } from "@/GameInterface/Components/RebornBadge";
import { LEGEND_NAME_CLASS, LegendLaurel } from "@/GameInterface/Components/LegendLaurel";
import { CreatedStar, isCreatedPlayer } from "@/GameInterface/Components/CreatedStar";
import type { RosterPlayer } from "@/types/playerTypes";
import type { YouthFocus, YouthTrainingPlan } from "@/types/youthTrainingTypes";
import type { TrainingIntensity } from "@/types/developmentTypes";
import { OptionChips } from "@/GameInterface/ui/OptionChips";
import { SectionTitle } from "@/GameInterface/ui/SectionTitle";
import { TickBox } from "@/GameInterface/ui/TickBox";
import { SelectCombobox } from "@/GameInterface/Components/SelectCombobox";
import { YouthCoachCard, type YouthCoachCardData } from "@/GameInterface/Squad/YouthCoachCard";
import { YouthGoalCell, type YouthGoalView } from "@/GameInterface/Squad/YouthGoalCell";

interface YouthRow {
  player: RosterPlayer;
  overall: number;
  potential: { low: number; high: number };
  /** Overall gained over the last 4 weeks (null without a snapshot that old). */
  trend: number | null;
  /** Development goal and where it stands (`youthGoals.ts`). */
  goal?: YouthGoalView;
}

interface YouthData {
  youth: YouthRow[];
  squadSize: number;
  squadLimit: number;
  training: YouthTrainingPlan;
  positions: string[];
  /** The youth coach is in charge of the academy's training (responsibility + one at work). */
  coach?: boolean;
  /** The youth coach card (null: no youth coach at the club). */
  coachCard?: YouthCoachCardData | null;
}

const FOCI: YouthFocus[] = ["balanced", "technical", "physical", "passing", "shooting", "defending", "goalkeeping", "setPieces"];
const INTENSITIES: TrainingIntensity[] = ["light", "normal", "heavy"];

/** Academy list of the player's club: promote to the squad or release (`/api/saves/:id/youth`). */
export function YouthTable({ callUps, clubColors }: { callUps?: ReactNode; clubColors?: readonly string[] } = {}) {
  const { t } = useTranslation();
  const { session, refresh } = useGameSave();
  const [data, setData] = useState<YouthData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmRelease, setConfirmRelease] = useState<string | null>(null);
  /** Release by a criterion: the top of the potential range, on the 0-10 scale the table shows. */
  const [minPotential, setMinPotential] = useState("7.0");
  const [confirmMany, setConfirmMany] = useState(false);
  /** Players ticked for a release together (report 2026-11-16). */
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirmPicked, setConfirmPicked] = useState(false);

  const saveId = session?.saveId;

  const load = useCallback(() => {
    if (!saveId) return;
    fetch(`/api/saves/${saveId}/youth`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("load"))))
      .then((d: YouthData) => setData(d))
      .catch(() => setError(t("youth.loadFailed")));
  }, [saveId, t]);

  useEffect(load, [load]);

  async function act(playerId: string, action: "promote" | "release") {
    if (!saveId) return;
    setBusy(playerId);
    setError(null);
    try {
      const res = await fetch(`/api/saves/${saveId}/youth/${playerId}/${action}`, { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error === "squadFull" ? t("youth.squadFull") : t("youth.actionFailed"));
      } else {
        setData((await res.json()) as YouthData);
        void refresh();
      }
    } finally {
      setBusy(null);
      setConfirmRelease(null);
    }
  }

  async function releaseMany(ids: string[]) {
    if (!saveId) return;
    setBusy("many");
    setError(null);
    try {
      const res = await fetch(`/api/saves/${saveId}/youth/release-many`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }),
      });
      if (res.ok) { setData((await res.json()) as YouthData); void refresh(); setPicked(new Set()); } else setError(t("youth.actionFailed"));
    } finally {
      setBusy(null);
      setConfirmMany(false);
      setConfirmPicked(false);
    }
  }

  async function saveTraining(plan: YouthTrainingPlan) {
    if (!saveId) return;
    setData((d) => (d ? { ...d, training: plan } : d));
    setError(null);
    const res = await fetch(`/api/saves/${saveId}/youth/training`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(plan),
    }).catch(() => null);
    if (res?.ok) setData((await res.json()) as YouthData);
    else { setError(t("youth.training.saveFailed")); load(); }
  }

  function setPlayer(id: string, patch: { focus?: YouthFocus | null; position?: string | null }) {
    if (!data) return;
    const players = { ...(data.training.players ?? {}) };
    const cur = { ...(players[id] ?? {}) };
    if (patch.focus !== undefined) { if (patch.focus) cur.focus = patch.focus; else delete cur.focus; }
    if (patch.position !== undefined) { if (patch.position) cur.position = patch.position; else delete cur.position; }
    if (cur.focus || cur.position) players[id] = cur; else delete players[id];
    void saveTraining({ ...data.training, players });
  }

  async function saveGoal(playerId: string, goal: { level: number; months: number } | null) {
    if (!saveId) return false;
    const res = await fetch(`/api/saves/${saveId}/youth/${encodeURIComponent(playerId)}/goal`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(goal),
    }).catch(() => null);
    if (!res?.ok) return false;
    setData((await res.json()) as YouthData);
    return true;
  }

  if (!data) {
    return (
      <div className="space-y-6">
        {callUps}
        <p className="text-sm text-muted-foreground">{error ?? t("youth.loading")}</p>
      </div>
    );
  }
  const picks = new Map((data.coachCard?.picks ?? []).map((p) => [p.id, p.reason]));

  const full = data.squadSize >= data.squadLimit;
  const cut = Number(minPotential.replace(",", "."));
  const below = Number.isFinite(cut) ? data.youth.filter((r) => r.potential.high < cut) : [];
  const inAcademy = new Set(data.youth.map((r) => r.player.id));
  const pickedIds = [...picked].filter((id) => inAcademy.has(id));
  const toggle = (id: string, on: boolean) => {
    setConfirmPicked(false);
    setPicked((cur) => { const next = new Set(cur); if (on) next.add(id); else next.delete(id); return next; });
  };
  const columns: DataTableColumn<YouthRow>[] = [
    {
      key: "pick",
      header: "",
      cell: (r) => (
        <TickBox checked={picked.has(r.player.id)} label={t("youth.pick.one", { player: r.player.name })} onChange={(on) => toggle(r.player.id, on)} />
      ),
    },
    {
      key: "name",
      header: t("youth.player"),
      sortValue: (r) => r.player.name,
      cell: (r) => (
        <span className="inline-flex items-center gap-1.5 font-semibold">
          <span className={r.player.reborn ? LEGEND_NAME_CLASS : undefined}>{r.player.name}</span>
          {r.player.reborn && <LegendLaurel />}
          {isCreatedPlayer(r.player.id) && <CreatedStar />}
          {r.player.reborn && <RebornBadge />}
          {picks.has(r.player.id) && (
            <span className="rounded border border-primary/50 bg-primary/10 px-2 py-0.5 text-sm text-primary font-semibold whitespace-nowrap" title={t(`youthCoach.card.pick.${picks.get(r.player.id)}`)}>
              {t("youthCoach.card.picked")}
            </span>
          )}
        </span>
      ),
    },
    {
      key: "pos",
      header: t("youth.position"),
      sortValue: (r) => positionIndex(preferredRole(r.player)),
      cell: (r) => (
        <span className={`font-display font-bold ${positionLabelColor(preferredRole(r.player), r.player.positions[0] ?? "CM")}`}>
          {positionLabel(t, preferredRole(r.player), r.player.positions[0] ?? "CM")}
        </span>
      ),
    },
    { key: "age", header: t("youth.age"), sortValue: (r) => r.player.age, cell: (r) => <span className="tabular-nums">{r.player.age}</span> },
    {
      key: "level",
      header: t("youth.level"),
      sortValue: (r) => r.overall,
      cell: (r) => <span className="font-display font-bold tabular-nums">{r.overall.toFixed(1)}</span>,
    },
    {
      key: "potential",
      header: t("youth.potential"),
      sortValue: (r) => r.potential.high,
      cell: (r) => (
        <span className="tabular-nums text-muted-foreground">
          {r.potential.low.toFixed(1)} – {r.potential.high.toFixed(1)}
        </span>
      ),
    },
    {
      key: "trend",
      header: t("youth.training.trend"),
      sortValue: (r) => r.trend,
      cell: (r) => r.trend === null
        ? <span className="text-muted-foreground">—</span>
        : <span className={`tabular-nums font-semibold ${r.trend > 0 ? "text-chart-2" : r.trend < 0 ? "text-destructive" : "text-muted-foreground"}`}>
            {r.trend > 0 ? "+" : ""}{(r.trend * 10).toFixed(0)}
          </span>,
    },
    {
      key: "goal",
      header: t("youthGoal.header"),
      sortValue: (r) => r.goal?.level ?? null,
      cell: (r) => <YouthGoalCell overall={r.overall} goal={r.goal} onSave={(g) => saveGoal(r.player.id, g)} />,
    },
    {
      key: "focus",
      header: t("youth.training.focus"),
      cell: (r) => (
        <span className="inline-flex flex-col gap-1">
          <SelectCombobox<string>
            labelId={`yt-focus-${r.player.id}`}
            floating
            className="min-w-36"
            value={data.training.players?.[r.player.id]?.focus ?? ""}
            onChange={(v) => setPlayer(r.player.id, { focus: (v || null) as YouthFocus | null })}
            options={[{ value: "", label: t("youth.training.group") }, ...FOCI.map((f) => ({ value: f, label: t(`youth.training.foci.${f}`) }))]}
          />
          {data.training.players?.[r.player.id]?.byCoach && (
            <span className="text-sm text-muted-foreground">{t("youthCoach.byCoach")}</span>
          )}
        </span>
      ),
    },
    {
      key: "trainPos",
      header: t("youth.training.position"),
      cell: (r) => (
        <SelectCombobox<string>
          labelId={`yt-pos-${r.player.id}`}
          floating
          className="min-w-32"
          value={data.training.players?.[r.player.id]?.position ?? ""}
          onChange={(v) => setPlayer(r.player.id, { position: v || null })}
          options={[{ value: "", label: t("youth.training.natural") }, ...data.positions.map((pos) => ({ value: pos, label: t(`roles.detailedAbbr.${pos}`) }))]}
        />
      ),
    },
    {
      key: "youthApps",
      header: t("youthComps.cols.apps"),
      sortValue: (r) => r.player.seasonLog?.youthCup?.appearances ?? 0,
      cell: (r) => <span className="tabular-nums text-muted-foreground">{r.player.seasonLog?.youthCup?.appearances ?? 0}</span>,
    },
    {
      key: "youthGoals",
      header: t("youthComps.cols.goals"),
      sortValue: (r) => r.player.seasonLog?.youthCup?.goals ?? 0,
      cell: (r) => <span className="tabular-nums text-muted-foreground">{r.player.seasonLog?.youthCup?.goals ?? 0}</span>,
    },
    {
      key: "actions",
      header: "",
      className: "text-right",
      cell: (r) =>
        confirmRelease === r.player.id ? (
          <span className="inline-flex items-center gap-3">
            <Button variant="danger" disabled={busy !== null} onClick={() => void act(r.player.id, "release")}>
              {t("youth.confirmRelease")}
            </Button>
            <Button variant="secondary" onClick={() => setConfirmRelease(null)}>
              {t("youth.cancel")}
            </Button>
          </span>
        ) : (
          <span className="inline-flex items-center gap-3">
            <Button disabled={busy !== null || full} onClick={() => void act(r.player.id, "promote")}>
              {t("youth.promote")}
            </Button>
            <Button variant="danger" disabled={busy !== null} onClick={() => setConfirmRelease(r.player.id)}>
              {t("youth.release")}
            </Button>
          </span>
        ),
    },
  ];

  return (
    <div className="space-y-6">
    {saveId && (
      <YouthCoachCard
        saveId={saveId}
        card={data.coachCard ?? null}
        names={Object.fromEntries(data.youth.map((r) => [r.player.id, r.player.name]))}
        clubColors={clubColors}
        onChanged={load}
      />
    )}
    {callUps}
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {t("youth.subtitle", { size: data.squadSize, limit: data.squadLimit })}
      </p>
      {error && <Notice kind="error">{error}</Notice>}
      <section className="flex flex-col gap-3">
        <SectionTitle>{t("youth.training.title")}</SectionTitle>
        {data.coach && <p className="text-sm text-muted-foreground m-0">{t("youthCoach.trainingNote")}</p>}
        <div className="flex flex-wrap gap-6">
          <div className="flex flex-col gap-1.5">
            <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground">{t("youth.training.intensity")}</span>
            <OptionChips<TrainingIntensity>
              aria-label={t("youth.training.intensity")}
              value={data.training.intensity}
              onChange={(v) => void saveTraining({ ...data.training, intensity: v })}
              options={INTENSITIES.map((k) => ({ key: k, label: t(`youth.training.intensities.${k}`) }))}
            />
            {data.training.intensityByCoach && <span className="text-sm text-muted-foreground">{t("youthCoach.byCoach")}</span>}
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground">{t("youth.training.groupFocus")}</span>
            <OptionChips<YouthFocus>
              aria-label={t("youth.training.groupFocus")}
              value={data.training.focus}
              onChange={(v) => void saveTraining({ ...data.training, focus: v })}
              options={FOCI.map((k) => ({ key: k, label: t(`youth.training.foci.${k}`) }))}
            />
          </div>
        </div>
        <p className="text-sm text-muted-foreground m-0">{t(`youth.training.effect.${data.training.intensity}`)}</p>
      </section>
      {full && data.youth.length > 0 && <Notice kind="warning">{t("youth.squadFull")}</Notice>}
      {data.youth.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("youth.empty")}</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" flush onClick={() => { setConfirmPicked(false); setPicked(pickedIds.length === data.youth.length ? new Set() : new Set(data.youth.map((r) => r.player.id))); }}>
              {pickedIds.length === data.youth.length ? t("youth.pick.none") : t("youth.pick.all")}
            </Button>
            {confirmPicked ? (
              <>
                <Button variant="danger" disabled={busy !== null} onClick={() => void releaseMany(pickedIds)}>{t("youth.pick.confirm", { count: pickedIds.length })}</Button>
                <Button variant="secondary" onClick={() => setConfirmPicked(false)}>{t("youth.cancel")}</Button>
              </>
            ) : (
              <Button variant="danger" disabled={busy !== null || pickedIds.length === 0} onClick={() => setConfirmPicked(true)}>
                {t("youth.pick.release", { count: pickedIds.length })}
              </Button>
            )}
          </div>
          <DataTable columns={columns} rows={data.youth} rowKey={(r) => r.player.id} />
          <section className="flex flex-col gap-2">
            <label htmlFor="youth-min-potential" className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground">{t("youth.bulk.label")}</label>
            <div className="flex flex-wrap items-center gap-3">
              <input
                id="youth-min-potential"
                inputMode="decimal"
                value={minPotential}
                onChange={(e) => { setMinPotential(e.target.value); setConfirmMany(false); }}
                className="w-20 rounded border border-border h-10 px-3 bg-transparent tabular-nums text-sm"
              />
              {confirmMany ? (
                <>
                  <Button variant="danger" disabled={busy !== null} onClick={() => void releaseMany(below.map((r) => r.player.id))}>{t("youth.confirmRelease")}</Button>
                  <Button variant="secondary" onClick={() => setConfirmMany(false)}>{t("youth.cancel")}</Button>
                </>
              ) : (
                <Button variant="danger" disabled={busy !== null || below.length === 0} onClick={() => setConfirmMany(true)}>
                  {t("youth.bulk.release", { count: below.length })}
                </Button>
              )}
            </div>
            {below.length > 0 && <p className="text-sm text-muted-foreground m-0">{below.map((r) => r.player.name).join(", ")}</p>}
          </section>
        </>
      )}
    </div>
    </div>
  );
}
