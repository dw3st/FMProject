import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { Squad } from "@/types/playerTypes";
import { comparePositions } from "@/types/positionOrder";
import { toDisplayPlayer, capitalizeSeverity } from "@/GameInterface/playerHelpers";
import type { DisplayPlayer, StatusLevel } from "@/GameInterface/playerHelpers";
import { positionLabel, positionLabelColor } from "@/GameInterface/positionHelpers";
import { wageFactorOf } from "@/Domain/finance/wages";
import { AvgBadge } from "@/GameInterface/Components/AvgBadge";
import { StarBadge } from "@/GameInterface/Components/StarBadge";
import { RebornBadge } from "@/GameInterface/Components/RebornBadge";
import { LoadIndicator } from "@/GameInterface/Components/LoadIndicator";
import { ratingTextClass10 } from "@/GameInterface/scoreColors";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { useStarPlayers } from "@/GameInterface/useStarPlayers";
import { Icon } from "@/GameInterface/Icons";

export function SquadTable({
  squad,
  selectedId,
  onSelectPlayer,
}: {
  squad: Squad | null;
  selectedId: string;
  onSelectPlayer: (player: DisplayPlayer | null) => void;
}) {
  const { t } = useTranslation();
  const { session, currentDate } = useGameSave();
  const starIds = useStarPlayers(session?.saveId, currentDate);
  const [sortKey, setSortKey] = useState<string>("pos");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const columns = [
    { key: "pos", label: t("dashboard.squadTable.pos"), width: "w-24 min-w-[4.5rem]" },
    { key: "name", label: t("dashboard.squadTable.name"), width: "flex-1 min-w-[140px]" },
    { key: "age", label: t("dashboard.squadTable.age"), width: "w-12" },
    { key: "avg", label: t("dashboard.squadTable.avg"), width: "w-14" },
      { key: "energy", label: t("dashboard.squadTable.energy"), width: "w-36" },
    { key: "phase", label: t("dashboard.squadTable.phase"), width: "w-20" },
    { key: "training", label: t("dashboard.squadTable.train"), width: "w-20" },
    { key: "moral", label: t("dashboard.squadTable.moral"), width: "w-20" },
    { key: "salary", label: t("dashboard.squadTable.salary"), width: "w-20" },
    { key: "contractUntil", label: t("dashboard.squadTable.contract"), width: "w-16" },
    { key: "valueMillions", label: t("dashboard.squadTable.value"), width: "w-16" },
    { key: "goals", label: t("dashboard.squadTable.goals"), width: "w-10" },
    { key: "assists", label: t("dashboard.squadTable.assists"), width: "w-10" },
    { key: "avgRating", label: t("dashboard.squadTable.rating"), width: "w-20" },
  ];

  const players = useMemo<DisplayPlayer[]>(() => {
    if (!squad) return [];
    const wageFactor = wageFactorOf(squad);
    return squad.players.map((p) => toDisplayPlayer(p, squad.name, { wageFactor, currentDate }));
  }, [squad, currentDate]);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sortedPlayers = useMemo(() => {
    return [...players].sort((a, b) => {
      const aVal = a[sortKey as keyof DisplayPlayer];
      const bVal = b[sortKey as keyof DisplayPlayer];
      if (sortKey === "pos" && typeof aVal === "string" && typeof bVal === "string") {
        const cmp = comparePositions(aVal, bVal);
        if (cmp !== 0) return sortDir === "asc" ? cmp : -cmp;
        return a.name.localeCompare(b.name);
      }
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortDir === "asc" ? aVal - bVal : bVal - aVal;
      }
      return 0;
    });
  }, [players, sortKey, sortDir]);

  if (!squad || players.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-12">
        <p className="text-muted-foreground text-sm m-0">{t("dashboard.squadTable.noSquadData")}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto max-h-[calc(100vh-240px)]">
      <div className="min-w-[1120px]">
        <div className="sticky top-0 z-10 flex items-center bg-background border-b border-border text-xs text-muted-foreground">
          {columns.map((col) => (
            <button
              key={col.key}
              onClick={() => handleSort(col.key)}
              className={`px-3 py-2 text-left font-display font-bold uppercase tracking-[0.08em] text-xs hover:text-foreground flex items-center gap-1 cursor-pointer bg-transparent border-0 ${col.width}`}
            >
              {col.label}
              {sortKey === col.key &&
                (sortDir === "asc" ? (
                  <Icon name="chevron-up" className="w-4 h-4 text-primary" />
                ) : (
                  <Icon name="chevron-down" className="w-4 h-4 text-primary" />
                ))}
            </button>
          ))}
          <div className="w-10 px-3 py-3" />
        </div>

        {sortedPlayers.map((player) => (
          <div
            key={player.id}
            onClick={() => onSelectPlayer(selectedId === player.id ? null : player)}
            className={`flex items-center text-sm min-h-10 border-t border-border cursor-pointer ${
              selectedId === player.id ? "bg-primary/10 text-primary" : "hover:bg-foreground/5"
            }`}
          >
            <div className={`px-3 py-2.5 font-bold text-sm ${positionLabelColor(player.natural, player.pos)} w-24 min-w-[4.5rem]`} title={player.positions.join(", ")}>
              {positionLabel(t, player.natural, player.pos)}
            </div>
            <div className="px-3 py-2 flex-1 min-w-[140px] font-semibold truncate flex items-center gap-1.5">
              <span className="truncate">{player.name}</span>
              {starIds.get(player.id) && <StarBadge kind={starIds.get(player.id)} />}
              {player.reborn && <RebornBadge />}
            </div>
            <div className="px-3 py-2.5 w-12 text-muted-foreground font-medium">{player.age}</div>
            <div className="px-3 py-2.5 w-14">
              <AvgBadge value={player.avg} />
            </div>
            <div className="px-3 py-2.5 w-28 flex items-center gap-1.5">
              <div className="flex-1 min-w-0">
                <EnergyBar value={player.energy} />
              </div>
              <LoadIndicator load={player.load} size={16} />
            </div>
            <div className="px-3 py-2.5 w-20">
              <StatusBadge level={player.phase} />
            </div>
            <div className="px-3 py-2.5 w-20">
              <StatusBadge level={player.training} />
            </div>
            <div className="px-3 py-2.5 w-20">
              <StatusBadge level={player.moral} />
            </div>
            <div className="px-3 py-2.5 w-20 text-muted-foreground font-medium">
              {player.salary}
            </div>
            <div className="px-3 py-2.5 w-16 text-muted-foreground font-medium">{player.contractUntil ?? "—"}</div>
            <div className={`px-3 py-2.5 w-16 font-bold ${ratingTextClass10(player.avg)}`}>{player.value}</div>
            <div className="px-3 py-2.5 w-10 text-foreground font-bold">{player.goals}</div>
            <div className="px-3 py-2.5 w-10 text-muted-foreground font-bold">{player.assists}</div>
            <div className="px-3 py-2.5 w-20">
              <RatingBadge value={player.avgRating} />
            </div>
            <div className="w-10 px-3 py-2.5">
              <FitStatusIcon status={player.status} injury={player.injury} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RatingBadge({ value }: { value: number }) {
  if (value === 0) {
    return <span className="text-sm text-muted-foreground/40 font-medium">—</span>;
  }
  return (
    <span className={`inline-flex items-center gap-1 text-sm font-black ${ratingTextClass10(value)}`}>
      <Icon name="star" className="w-3 h-3 fill-current" />
      {value.toFixed(1)}
    </span>
  );
}

function EnergyBar({ value }: { value: number }) {
  const getBarColor = () => {
    if (value >= 80) return "bg-primary";
    if (value >= 50) return "bg-chart-4";
    return "bg-destructive";
  };
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 min-w-16 h-1.5 bg-border rounded overflow-hidden">
        <div className={`h-full ${getBarColor()}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-sm text-muted-foreground tabular-nums w-10 text-right">{value}%</span>
    </div>
  );
}

const statusColors: Record<StatusLevel, string> = {
  1: "bg-destructive/20 text-destructive border-destructive/40",
  2: "bg-chart-4/20 text-chart-4 border-chart-4/40",
  3: "bg-chart-4/20 text-chart-4 border-chart-4/40",
  4: "bg-chart-3/20 text-chart-3 border-chart-3/40",
  5: "bg-primary/20 text-primary border-primary/40",
};

function StatusBadge({ level }: { level: StatusLevel }) {
  const { t } = useTranslation();
  const statusLabels: Record<StatusLevel, string> = {
    1: t("dashboard.squadTable.bad"),
    2: t("dashboard.squadTable.poor"),
    3: t("dashboard.squadTable.ok"),
    4: t("dashboard.squadTable.good"),
    5: t("dashboard.squadTable.top"),
  };
  return (
    <span className={`inline-flex items-center justify-center w-full px-2 py-0.5 rounded text-sm border ${statusColors[level]}`}>
      {statusLabels[level]}
    </span>
  );
}

function FitStatusIcon({
  status,
  injury,
}: {
  status: string;
  injury?: { severity: "light" | "medium" | "severe"; daysLeft: number };
}) {
  const { t } = useTranslation();
  if (status === "fit") return <div className="w-3 h-3 rounded-full bg-primary" title={t("dashboard.squadTable.fit")} />;
  if (status === "injured") {
    const severity = injury ? t(`dashboard.squadTable.sev${capitalizeSeverity(injury.severity)}` as never) : "";
    const title = injury
      ? injury.daysLeft > 0
        ? t("dashboard.squadTable.injuredDays", { severity, days: injury.daysLeft })
        : t("dashboard.squadTable.injuredToday", { severity })
      : t("dashboard.squadTable.injured");
    return <div className="w-3 h-3 rounded-full bg-destructive" title={title} />;
  }
  if (status === "suspended") return <div className="w-3 h-3 rounded-full bg-chart-4" title={t("dashboard.squadTable.suspended")} />;
  return null;
}

