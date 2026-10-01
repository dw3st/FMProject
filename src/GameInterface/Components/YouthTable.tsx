import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { getDetailedPositionColor } from "@/GameInterface/positionHelpers";
import { Button } from "@/GameInterface/ui/Button";
import { DataTable, type DataTableColumn } from "@/GameInterface/ui/DataTable";
import { Notice } from "@/GameInterface/ui/Notice";
import type { RosterPlayer } from "@/types/playerTypes";

interface YouthRow {
  player: RosterPlayer;
  overall: number;
  potential: { low: number; high: number };
}

interface YouthData {
  youth: YouthRow[];
  squadSize: number;
  squadLimit: number;
}

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

  if (!data) {
    return <p className="text-sm text-muted-foreground">{error ?? t("youth.loading")}</p>;
  }

  const full = data.squadSize >= data.squadLimit;
  const columns: DataTableColumn<YouthRow>[] = [
    {
      key: "name",
      header: t("youth.player"),
      cell: (r) => <span className="font-semibold">{r.player.name}</span>,
    },
    {
      key: "pos",
      header: t("youth.position"),
      cell: (r) => (
        <span className={`font-display font-bold ${getDetailedPositionColor(r.player.positions[0] ?? "CM")}`}>
          {r.player.positions[0]}
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
      {full && data.youth.length > 0 && <Notice kind="warning">{t("youth.squadFull")}</Notice>}
      {data.youth.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("youth.empty")}</p>
      ) : (
        <DataTable columns={columns} rows={data.youth} rowKey={(r) => r.player.id} />
      )}
    </div>
  );
}
