import { useTranslation } from "react-i18next";
import { ChevronUp, ChevronDown, UserPlus, Tag } from "lucide-react";
import { Icon } from "@/GameInterface/Icons";
import type { DisplayPlayer, StatusLevel } from "@/GameInterface/playerHelpers";
import { getPositionColor, getMainRole, MAIN_ROLE_ABBR } from "@/GameInterface/positionHelpers";
import { AvgBadge } from "@/GameInterface/Components/AvgBadge";
import { StarBadge } from "@/GameInterface/Components/StarBadge";
import { ratingTextClass10 } from "@/GameInterface/scoreColors";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { useStarPlayers } from "@/GameInterface/useStarPlayers";

const columns = [
  { key: "pos", label: "Pos", width: "w-14" },
  { key: "name", label: "Name", width: "flex-1 min-w-[140px]" },
  { key: "age", label: "Age", width: "w-12" },
  { key: "club", label: "Club", width: "w-32" },
  { key: "avg", label: "OVR", width: "w-14" },
  { key: "phase", label: "Phase", width: "w-16" },
  { key: "training", label: "Train", width: "w-16" },
  { key: "moral", label: "Moral", width: "w-16" },
  { key: "salary", label: "Salary", width: "w-20" },
  { key: "valueMillions", label: "Value", width: "w-16" },
];

interface Props {
  /** Current page of already filtered + sorted rows (server-side scout search). */
  rows: DisplayPlayer[];
  total: number;
  /** 0-based page index. */
  page: number;
  pageSize: number;
  sortKey: string;
  sortDir: "asc" | "desc";
  onSort: (key: string) => void;
  onPageChange: (page: number) => void;
  loading: boolean;
  filtering?: boolean;
  mySquadId?: string;
  onOffer?: (player: DisplayPlayer) => void;
  /** Sell-listed ids among `rows`. */
  sellListedIds?: Set<string>;
  /** True when the last search request failed (server error, network error, non-OK response). */
  error?: boolean;
  /** Called when the user clicks the retry button in the error state. */
  onRetry?: () => void;
}

export function ScoutTable({
  rows, total, page, pageSize, sortKey, sortDir, onSort, onPageChange,
  loading, filtering, mySquadId, onOffer, sellListedIds = new Set(), error, onRetry,
}: Props) {
  const { t } = useTranslation();
  const { session } = useGameSave();
  const starIds = useStarPlayers(session?.saveId);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  if (loading) {
    return (
      <div className="flex-1 card-arcade rounded-xl flex items-center justify-center p-12">
        <p className="text-muted-foreground text-sm m-0">{t("scout.table.loadingPlayers")}</p>
      </div>
    );
  }

  const showUpdating = filtering && rows.length > 0;

  return (
    <div className="flex-1 card-arcade rounded-xl overflow-hidden flex flex-col">
      <div className="px-4 py-3 bg-muted/20 border-b border-border flex items-center justify-between">
        <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
          {t("scout.table.foundPlayers", { count: total })}
        </span>
        {showUpdating && (
          <span
            className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-semibold uppercase tracking-wider"
            title={t("scout.table.applyingFilters")}
          >
            <span className="w-3 h-3 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            {t("scout.table.applyingFilters")}
          </span>
        )}
      </div>

      <div className="flex items-center bg-muted/30 border-b border-border text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
        {columns.map((col) => (
          <button
            key={col.key}
            onClick={() => onSort(col.key)}
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

      <div className={`flex-1 overflow-y-auto transition-opacity ${showUpdating ? "opacity-50 pointer-events-none" : ""}`}>
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-3 text-muted-foreground text-sm font-medium">
            {error ? (
              <>
                <span>{t("scout.table.loadError")}</span>
                <button
                  type="button"
                  onClick={onRetry}
                  className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider border rounded-lg transition-all bg-muted/20 text-muted-foreground border-border hover:text-primary hover:border-primary/40 cursor-pointer"
                >
                  {t("scout.table.retry")}
                </button>
              </>
            ) : (
              !filtering && t("scout.table.noPlayersFound")
            )}
          </div>
        ) : (
          rows.map((player, index) => (
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
                  <span title={t("scout.table.forSale")} className="shrink-0"><Tag className="w-3 h-3 text-primary" /></span>
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
                {starIds.has(player.id) && <StarBadge />}
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

      <div className="px-4 py-2.5 bg-muted/20 border-t border-border flex items-center justify-between gap-3">
        <button
          type="button"
          disabled={page <= 0}
          onClick={() => onPageChange(page - 1)}
          className="flex items-center gap-1 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider border rounded-lg transition-all bg-muted/20 text-muted-foreground border-border enabled:hover:text-primary enabled:hover:border-primary/40 enabled:cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Icon name="chevron-left" size={12} />
          {t("scout.table.previousPage")}
        </button>
        <span className="text-xs text-muted-foreground font-semibold">
          {t("scout.table.pageOf", { page: page + 1, pages: pageCount })}
        </span>
        <button
          type="button"
          disabled={page + 1 >= pageCount}
          onClick={() => onPageChange(page + 1)}
          className="flex items-center gap-1 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider border rounded-lg transition-all bg-muted/20 text-muted-foreground border-border enabled:hover:text-primary enabled:hover:border-primary/40 enabled:cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {t("scout.table.nextPage")}
          <Icon name="chevron-right" size={12} />
        </button>
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

