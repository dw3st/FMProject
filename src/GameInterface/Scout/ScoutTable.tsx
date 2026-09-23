import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ChevronUp, ChevronDown, UserPlus, Tag } from "lucide-react";
import type { ScoutFilterState } from "@/GameInterface/Scout/scoutFilterState";
import type { DisplayPlayer, StatusLevel } from "@/GameInterface/playerHelpers";
import { ATTRIBUTE_LIST } from "@/GameInterface/AttributeLabels";
import { getPositionColor, getMainRole, MAIN_ROLE_ABBR } from "@/GameInterface/positionHelpers";
import { AvgBadge } from "@/GameInterface/Components/AvgBadge";
import { ratingTextClass10 } from "@/GameInterface/scoreColors";

const columns = [
  { key: "pos", label: "Pos", width: "w-14" },
  { key: "name", label: "Name", width: "flex-1 min-w-[140px]" },
  { key: "age", label: "Age", width: "w-12" },
  { key: "club", label: "Club", width: "w-32" },
  { key: "avg", label: "Avg", width: "w-14" },
  { key: "phase", label: "Phase", width: "w-16" },
  { key: "training", label: "Train", width: "w-16" },
  { key: "moral", label: "Moral", width: "w-16" },
  { key: "salary", label: "Salary", width: "w-20" },
  { key: "valueMillions", label: "Value", width: "w-16" },
];

interface Props {
  filters: ScoutFilterState;
  players: DisplayPlayer[];
  loading: boolean;
  filtering?: boolean;
  mySquadId?: string;
  onOffer?: (player: DisplayPlayer) => void;
  sellListedIds?: Set<string>;
}

export function ScoutTable({ filters, players, loading, filtering, mySquadId, onOffer, sellListedIds = new Set() }: Props) {
  const { t } = useTranslation();
  const [sortKey, setSortKey] = useState<string>("avg");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const filteredPlayers = useMemo(() => {
    return players.filter((player) => {
      if (filters.onlyForSale && !sellListedIds.has(player.id)) return false;
      if (filters.name && !player.name.toLowerCase().includes(filters.name.toLowerCase())) return false;
      if (filters.position !== "all" && getMainRole(player.pos) !== filters.position) return false;
      if (player.age < filters.minAge || player.age > filters.maxAge) return false;
      if (player.avg < filters.minAvg || player.avg > filters.maxAvg) return false;
      if (player.valueMillions < filters.minPriceM || player.valueMillions > filters.maxPriceM)
        return false;
      if (filters.league !== "all" && player.leagueSlug !== filters.league) return false;
      if (filters.nationality !== "all" && player.nationality !== filters.nationality) return false;
      for (const attr of ATTRIBUTE_LIST) {
        const range = filters.attributeRanges[attr.id];
        if (!range) continue;
        if (range.min <= 0 && range.max >= 10) continue;
        const v = player.stats[attr.id];
        if (v < range.min || v > range.max) return false;
      }
      return true;
    });
  }, [filters, players, sellListedIds]);

  const sortedPlayers = useMemo(() => {
    return [...filteredPlayers].sort((a, b) => {
      const aVal = a[sortKey as keyof DisplayPlayer];
      const bVal = b[sortKey as keyof DisplayPlayer];
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortDir === "asc" ? aVal - bVal : bVal - aVal;
      }
      return 0;
    });
  }, [filteredPlayers, sortKey, sortDir]);

  if (loading) {
    return (
      <div className="flex-1 card-arcade rounded-xl flex items-center justify-center p-12">
        <p className="text-muted-foreground text-sm m-0">{t("scout.table.loadingPlayers")}</p>
      </div>
    );
  }

  if (filtering) {
    return (
      <div className="flex-1 card-arcade rounded-xl flex flex-col items-center justify-center gap-3 p-12">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        <p className="text-muted-foreground text-sm m-0">{t("scout.table.applyingFilters")}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 card-arcade rounded-xl overflow-hidden flex flex-col">
      <div className="px-4 py-3 bg-muted/20 border-b border-border flex items-center justify-between">
        <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
          {t("scout.table.foundPlayers", { count: filteredPlayers.length })}
        </span>
      </div>

      <div className="flex items-center bg-muted/30 border-b border-border text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
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
        <div className="w-20 px-3 py-3 text-center">{t("scout.table.action")}</div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {sortedPlayers.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-sm font-medium">
            {t("scout.table.noPlayersFound")}
          </div>
        ) : (
          sortedPlayers.map((player, index) => (
            <div
              key={player.id}
              className={`flex items-center text-xs border-b border-border/30 transition-all ${
                index % 2 === 0
                  ? "bg-transparent hover:bg-muted/20"
                  : "bg-muted/5 hover:bg-muted/20"
              }`}
            >
              {/** Disable offer for your own squad */ }
              {/** (we still show your players in the scout DB) */ }
              <div className={`px-3 py-2.5 font-black ${getPositionColor(player.pos)} w-14`}>
                {MAIN_ROLE_ABBR[getMainRole(player.pos)]}
              </div>
              <div className="px-3 py-2.5 flex-1 min-w-[140px] font-semibold truncate flex items-center gap-1.5">
                {sellListedIds.has(player.id) && (
                  <Tag className="w-3 h-3 text-primary shrink-0" title={t("scout.table.forSale")} />
                )}
                {player.leagueSlug && player.clubSlug ? (
                  <a
                    href={`/player/${encodeURIComponent(player.leagueSlug)}/${encodeURIComponent(player.clubSlug)}/${encodeURIComponent(player.id)}`}
                    className="text-foreground hover:text-primary hover:underline no-underline truncate"
                  >
                    {player.name}
                  </a>
                ) : (
                  <span className="text-foreground truncate">{player.name}</span>
                )}
              </div>
              <div className="px-3 py-2.5 w-12 text-muted-foreground font-medium">{player.age}</div>
              <div className="px-3 py-2.5 w-32 truncate font-medium">
                {player.leagueSlug && player.clubSlug ? (
                  <a
                    href={`/squad/${encodeURIComponent(player.leagueSlug)}/${encodeURIComponent(player.clubSlug)}`}
                    className="text-foreground hover:text-primary hover:underline no-underline"
                  >
                    {player.club}
                  </a>
                ) : (
                  <span className="text-muted-foreground">{player.club}</span>
                )}
              </div>
              <div className="px-3 py-2.5 w-14">
                <AvgBadge value={player.avg} />
              </div>
              <div className="px-3 py-2.5 w-16">
                <StatusBadge level={player.phase} />
              </div>
              <div className="px-3 py-2.5 w-16">
                <StatusBadge level={player.training} />
              </div>
              <div className="px-3 py-2.5 w-16">
                <StatusBadge level={player.moral} />
              </div>
              <div className="px-3 py-2.5 w-20 text-muted-foreground font-medium">
                {player.salary}
              </div>
              <div className={`px-3 py-2.5 w-16 font-bold ${ratingTextClass10(player.avg)}`}>
                {player.value}
              </div>
              <div className="w-20 px-3 py-2.5 flex justify-center">
                <button
                  type="button"
                  disabled={!!mySquadId && player.squadId === mySquadId}
                  onClick={(e) => {
                    e.stopPropagation();
                    onOffer?.(player);
                  }}
                  title={!!mySquadId && player.squadId === mySquadId ? t("scout.table.yourPlayer") : t("scout.table.makeAnOffer")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider border rounded-lg transition-all ${
                    !!mySquadId && player.squadId === mySquadId
                      ? "bg-muted/30 text-muted-foreground border-border cursor-not-allowed opacity-60"
                      : "bg-primary/20 text-primary border-primary/40 hover:bg-primary hover:text-primary-foreground cursor-pointer"
                  }`}
                >
                  <UserPlus className="w-3 h-3" />
                  {t("scout.table.offer")}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// Note: These strings are not translated here because this is a helper outside the React component.
// For production, consider moving this to a helper function that accepts `t` as parameter.
const statusLabels: Record<StatusLevel, string> = { 1: "Bad", 2: "Poor", 3: "OK", 4: "Good", 5: "Top" };
const statusColors: Record<StatusLevel, string> = {
  1: "bg-destructive/20 text-destructive border-destructive/40",
  2: "bg-orange-500/20 text-orange-400 border-orange-500/40",
  3: "bg-chart-4/20 text-chart-4 border-chart-4/40",
  4: "bg-blue-500/20 text-blue-400 border-blue-500/40",
  5: "bg-primary/20 text-primary border-primary/40",
};

function StatusBadge({ level }: { level: StatusLevel }) {
  return (
    <span className={`inline-flex items-center justify-center w-full px-1 py-0.5 rounded text-[9px] font-bold border uppercase tracking-wide ${statusColors[level]}`}>
      {statusLabels[level]}
    </span>
  );
}

