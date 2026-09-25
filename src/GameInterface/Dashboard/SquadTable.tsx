import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ChevronUp, ChevronDown, Star } from "lucide-react";
import type { Squad } from "@/types/playerTypes";
import { comparePositions } from "@/types/positionOrder";
import { toDisplayPlayer } from "@/GameInterface/playerHelpers";
import type { DisplayPlayer, StatusLevel } from "@/GameInterface/playerHelpers";
import { getPositionColor, getMainRole, MAIN_ROLE_ABBR } from "@/GameInterface/positionHelpers";
import { AvgBadge } from "@/GameInterface/Components/AvgBadge";
import { StarBadge } from "@/GameInterface/Components/StarBadge";
import { ratingTextClass10 } from "@/GameInterface/scoreColors";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { useStarPlayers } from "@/GameInterface/useStarPlayers";

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
  const { session } = useGameSave();
  const starIds = useStarPlayers(session?.saveId);
  const [sortKey, setSortKey] = useState<string>("pos");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const columns = [
    { key: "pos", label: t("dashboard.squadTable.pos"), width: "w-24 min-w-[4.5rem]" },
    { key: "name", label: t("dashboard.squadTable.name"), width: "flex-1 min-w-[140px]" },
    { key: "age", label: t("dashboard.squadTable.age"), width: "w-12" },
    { key: "avg", label: t("dashboard.squadTable.avg"), width: "w-14" },
    { key: "energy", label: t("dashboard.squadTable.energy"), width: "w-24" },
    { key: "phase", label: t("dashboard.squadTable.phase"), width: "w-20" },
    { key: "training", label: t("dashboard.squadTable.train"), width: "w-20" },
    { key: "moral", label: t("dashboard.squadTable.moral"), width: "w-20" },
    { key: "salary", label: t("dashboard.squadTable.salary"), width: "w-20" },
    { key: "valueMillions", label: t("dashboard.squadTable.value"), width: "w-16" },
    { key: "goals", label: t("dashboard.squadTable.goals"), width: "w-10" },
    { key: "assists", label: t("dashboard.squadTable.assists"), width: "w-10" },
    { key: "avgRating", label: t("dashboard.squadTable.rating"), width: "w-20" },
  ];

  const players = useMemo<DisplayPlayer[]>(() => {
    if (!squad) return [];
    return squad.players.map((p) => toDisplayPlayer(p, squad.name));
  }, [squad]);

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
      <div className="min-w-[1040px]">
        <div className="sticky top-0 z-10 flex items-center bg-muted border-b border-border text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
          {columns.map((col) => (
            <button
              key={col.key}
              onClick={() => handleSort(col.key)}
              className={`px-3 py-3 text-left hover:text-primary transition-colors flex items-center gap-1 cursor-pointer bg-transparent border-0 ${col.width}`}
            >
              {col.label}
              {sortKey === col.key &&
                (sortDir === "asc" ? (
                  <ChevronUp className="w-3 h-3 text-primary" />
                ) : (
                  <ChevronDown className="w-3 h-3 text-primary" />
                ))}
            </button>
          ))}
          <div className="w-10 px-3 py-3" />
        </div>

        {sortedPlayers.map((player, index) => (
          <div
            key={player.id}
            onClick={() => onSelectPlayer(selectedId === player.id ? null : player)}
            className={`flex items-center text-xs border-b border-border/30 cursor-pointer transition-all ${
              selectedId === player.id
                ? "bg-primary/15 border-l-2 border-l-primary"
                : index % 2 === 0
                  ? "bg-transparent hover:bg-muted/20"
                  : "bg-muted/5 hover:bg-muted/20"
            }`}
          >
            <div className={`px-3 py-2.5 font-black text-[11px] ${getPositionColor(player.pos)} w-24 min-w-[4.5rem]`} title={player.positions.join(", ")}>
              {MAIN_ROLE_ABBR[getMainRole(player.pos)]}
            </div>
            <div className="px-3 py-2.5 flex-1 min-w-[140px] font-semibold text-foreground truncate flex items-center gap-1.5">
              <span className="truncate">{player.name}</span>
              {starIds.has(player.id) && <StarBadge />}
            </div>
            <div className="px-3 py-2.5 w-12 text-muted-foreground font-medium">{player.age}</div>
            <div className="px-3 py-2.5 w-14">
              <AvgBadge value={player.avg} />
            </div>
            <div className="px-3 py-2.5 w-24">
              <EnergyBar value={player.energy} />
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
            <div className={`px-3 py-2.5 w-16 font-bold ${ratingTextClass10(player.avg)}`}>{player.value}</div>
            <div className="px-3 py-2.5 w-10 text-foreground font-bold">{player.goals}</div>
            <div className="px-3 py-2.5 w-10 text-muted-foreground font-bold">{player.assists}</div>
            <div className="px-3 py-2.5 w-20">
              <RatingBadge value={player.avgRating} />
            </div>
            <div className="w-10 px-3 py-2.5">
              <FitStatusIcon status={player.status} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RatingBadge({ value }: { value: number }) {
  if (value === 0) {
    return <span className="text-[11px] text-muted-foreground/40 font-medium">—</span>;
  }
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-black ${ratingTextClass10(value)}`}>
      <Star className="w-3 h-3 fill-current" />
      {value.toFixed(1)}
    </span>
  );
}

function EnergyBar({ value }: { value: number }) {
  const getBarColor = () => {
    if (value >= 80) return "bg-gradient-to-r from-primary/80 to-primary";
    if (value >= 50) return "bg-gradient-to-r from-chart-4/80 to-chart-4";
    return "bg-gradient-to-r from-destructive/80 to-destructive";
  };
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-muted/30 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${getBarColor()}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-[10px] text-muted-foreground font-bold w-8">{value}%</span>
    </div>
  );
}

const statusColors: Record<StatusLevel, string> = {
  1: "bg-destructive/20 text-destructive border-destructive/40",
  2: "bg-orange-500/20 text-orange-400 border-orange-500/40",
  3: "bg-chart-4/20 text-chart-4 border-chart-4/40",
  4: "bg-blue-500/20 text-blue-400 border-blue-500/40",
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
    <span className={`inline-flex items-center justify-center w-full px-1 py-0.5 rounded text-[9px] font-bold border uppercase tracking-wide ${statusColors[level]}`}>
      {statusLabels[level]}
    </span>
  );
}

function FitStatusIcon({ status }: { status: string }) {
  const { t } = useTranslation();
  if (status === "fit") return <div className="w-3 h-3 rounded-full bg-primary glow-primary-sm" title={t("dashboard.squadTable.fit")} />;
  if (status === "injured") return <div className="w-3 h-3 rounded-full bg-destructive" title={t("dashboard.squadTable.injured")} style={{ boxShadow: "0 0 8px rgb(239 68 68 / 0.5)" }} />;
  if (status === "suspended") return <div className="w-3 h-3 rounded-full bg-chart-4" title={t("dashboard.squadTable.suspended")} style={{ boxShadow: "0 0 8px rgb(250 204 21 / 0.5)" }} />;
  return null;
}

