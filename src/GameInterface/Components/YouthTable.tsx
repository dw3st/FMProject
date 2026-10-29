import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { positionLabel, positionLabelColor } from "@/GameInterface/positionHelpers";
import { preferredRole } from "@/Domain/positions/positionAptitude";
import { Button } from "@/GameInterface/ui/Button";
import { DataTable, type DataTableColumn } from "@/GameInterface/ui/DataTable";
import { Notice } from "@/GameInterface/ui/Notice";
import { RebornBadge } from "@/GameInterface/Components/RebornBadge";
import type { RosterPlayer } from "@/types/playerTypes";
import type { YouthFocus, YouthTrainingPlan } from "@/types/youthTrainingTypes";
import type { TrainingIntensity } from "@/types/developmentTypes";
import { OptionChips } from "@/GameInterface/ui/OptionChips";
import { SectionTitle } from "@/GameInterface/ui/SectionTitle";
import { SelectCombobox } from "@/GameInterface/Components/SelectCombobox";

interface YouthRow {
  player: RosterPlayer;
  overall: number;
  potential: { low: number; high: number };
  /** Overall gained over the last 4 weeks (null without a snapshot that old). */
  trend: number | null;
}

interface YouthData {
  youth: YouthRow[];
  squadSize: number;
  squadLimit: number;
  training: YouthTrainingPlan;
  positions: string[];
}

const FOCI: YouthFocus[] = ["balanced", "technical", "physical", "passing", "shooting", "defending", "goalkeeping", "setPieces"];
const INTENSITIES: TrainingIntensity[] = ["light", "normal", "heavy"];

/** Academy list of the player's club: promote to the squad or release (`/api/saves/:id/youth`). */
export function YouthTable() {
  const { t } = useTranslation();
  const { session, refresh } = useGameSave();
  const [data, setData] = useState<YouthData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmRelease, setConfirmRelease] = useState<string | null>(null);

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

  if (!data) {
    return <p className="text-sm text-muted-foreground">{error ?? t("youth.loading")}</p>;
  }

  const full = data.squadSize >= data.squadLimit;
  const columns: DataTableColumn<YouthRow>[] = [
    {
      key: "name",
      header: t("youth.player"),
      cell: (r) => (
        <span className="inline-flex items-center gap-1.5 font-semibold">
          {r.player.name}
          {r.player.reborn && <RebornBadge />}
        </span>
      ),
    },
    {
      key: "pos",
      header: t("youth.position"),
      cell: (r) => (
        <span className={`font-display font-bold ${positionLabelColor(preferredRole(r.player), r.player.positions[0] ?? "CM")}`}>
          {positionLabel(t, preferredRole(r.player), r.player.positions[0] ?? "CM")}
        </span>
      ),
    },
    { key: "age", header: t("youth.age"), cell: (r) => <span className="tabular-nums">{r.player.age}</span> },
    {
      key: "level",
      header: t("youth.level"),
      cell: (r) => <span className="font-display font-bold tabular-nums">{r.overall.toFixed(1)}</span>,
    },
    {
      key: "potential",
      header: t("youth.potential"),
      cell: (r) => (
        <span className="tabular-nums text-muted-foreground">
          {r.potential.low.toFixed(1)} – {r.potential.high.toFixed(1)}
        </span>
      ),
    },
    {
      key: "trend",
      header: t("youth.training.trend"),
      cell: (r) => r.trend === null
        ? <span className="text-muted-foreground">—</span>
        : <span className={`tabular-nums font-semibold ${r.trend > 0 ? "text-chart-2" : r.trend < 0 ? "text-destructive" : "text-muted-foreground"}`}>
            {r.trend > 0 ? "+" : ""}{(r.trend * 10).toFixed(0)}
          </span>,
    },
    {
      key: "focus",
      header: t("youth.training.focus"),
      cell: (r) => (
        <SelectCombobox<string>
          labelId={`yt-focus-${r.player.id}`}
          className="min-w-36"
          value={data.training.players?.[r.player.id]?.focus ?? ""}
          onChange={(v) => setPlayer(r.player.id, { focus: (v || null) as YouthFocus | null })}
          options={[{ value: "", label: t("youth.training.group") }, ...FOCI.map((f) => ({ value: f, label: t(`youth.training.foci.${f}`) }))]}
        />
      ),
    },
    {
      key: "trainPos",
      header: t("youth.training.position"),
      cell: (r) => (
        <SelectCombobox<string>
          labelId={`yt-pos-${r.player.id}`}
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
      cell: (r) => <span className="tabular-nums text-muted-foreground">{r.player.seasonLog?.youthCup?.appearances ?? 0}</span>,
    },
    {
      key: "youthGoals",
      header: t("youthComps.cols.goals"),
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
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {t("youth.subtitle", { size: data.squadSize, limit: data.squadLimit })}
      </p>
      {error && <Notice kind="error">{error}</Notice>}
      <section className="flex flex-col gap-3">
        <SectionTitle>{t("youth.training.title")}</SectionTitle>
        <div className="flex flex-wrap gap-6">
          <div className="flex flex-col gap-1.5">
            <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground">{t("youth.training.intensity")}</span>
            <OptionChips<TrainingIntensity>
              aria-label={t("youth.training.intensity")}
              value={data.training.intensity}
              onChange={(v) => void saveTraining({ ...data.training, intensity: v })}
              options={INTENSITIES.map((k) => ({ key: k, label: t(`youth.training.intensities.${k}`) }))}
            />
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
        <DataTable columns={columns} rows={data.youth} rowKey={(r) => r.player.id} />
      )}
    </div>
  );
}
