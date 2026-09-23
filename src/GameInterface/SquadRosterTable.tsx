import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ChevronUp, ChevronDown, Star, UserPlus } from "lucide-react";
import type { Squad } from "@/types/playerTypes";
import { comparePositions } from "@/types/positionOrder";
import { toDisplayPlayer } from "@/GameInterface/playerHelpers";
import type { DisplayPlayer } from "@/GameInterface/playerHelpers";
import { getPositionColor, getMainRole, MAIN_ROLE_ABBR } from "@/GameInterface/positionHelpers";
import { AvgBadge } from "@/GameInterface/Components/AvgBadge";
import { ratingTextClass10 } from "@/GameInterface/scoreColors";

export function SquadRosterTable({
  squad,
  leagueSlug,
  clubSlug,
  mySquadId,
  onOffer,
}: {
  squad: Squad;
  leagueSlug: string;
  clubSlug: string;
  mySquadId: string;
  onOffer: (player: DisplayPlayer) => void;
}) {
  const { t } = useTranslation();
  const [sortKey, setSortKey] = useState<string>("pos");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const columns = [
    { key: "pos", label: t("dashboard.squadRosterTable.pos"), width: "w-24 min-w-[4.5rem]" },
    { key: "name", label: t("dashboard.squadRosterTable.name"), width: "flex-1 min-w-[140px]" },
    { key: "age", label: t("dashboard.squadRosterTable.age"), width: "w-12" },
    { key: "avg", label: t("dashboard.squadRosterTable.avg"), width: "w-14" },
    { key: "salary", label: t("dashboard.squadRosterTable.salary"), width: "w-20" },
    { key: "valueMillions", label: t("dashboard.squadRosterTable.value"), width: "w-16" },
    { key: "goals", label: t("dashboard.squadRosterTable.goals"), width: "w-10" },
    { key: "avgRating", label: t("dashboard.squadRosterTable.rating"), width: "w-20" },
  ];

  const players = useMemo<DisplayPlayer[]>(() => {
    return squad.players.map((p) => ({
      ...toDisplayPlayer(p, squad.name, { squadCountry: squad.country }),
      leagueSlug,
      clubSlug,
    }));
  }, [squad, leagueSlug, clubSlug]);

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

  if (players.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-12">
        <p className="text-muted-foreground text-sm m-0">{t("dashboard.squadRosterTable.noPlayers")}</p>
      </div>
    );
  }

  function playerDetailHref(player: DisplayPlayer) {
    return `/player/${encodeURIComponent(leagueSlug)}/${encodeURIComponent(clubSlug)}/${encodeURIComponent(player.id)}`;
  }

  return (
    <div className="flex-1 card-arcade rounded-xl overflow-hidden flex flex-col">
      <div className="px-4 py-3 bg-muted/20 border-b border-border flex items-center justify-between">
        <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
          <span className="text-primary font-black font-display">{players.length}</span> {t("dashboard.squadRosterTable.players")}
        </span>
      </div>

      <div className="flex items-center bg-muted/30 border-b border-border text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
        {columns.map((col) => (
          <button
            key={col.key}
            type="button"
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
        <div className="w-20 px-3 py-3 text-center">{t("dashboard.squadRosterTable.action")}</div>
      </div>

      <div className="flex-1 overflow-y-auto max-h-[calc(100vh-280px)]">
        {sortedPlayers.map((player, index) => (
          <div
            key={player.id}
            onClick={() => {
              window.location.href = playerDetailHref(player);
            }}
            className={`flex items-center text-xs border-b border-border/30 cursor-pointer transition-all ${
              index % 2 === 0
                ? "bg-transparent hover:bg-muted/20"
                : "bg-muted/5 hover:bg-muted/20"
            }`}
          >
            <div
              className={`px-3 py-2.5 font-black text-[11px] ${getPositionColor(player.pos)} w-24 min-w-[4.5rem]`}
              title={player.positions.join(", ")}
            >
              {MAIN_ROLE_ABBR[getMainRole(player.pos)]}
            </div>
            <div className="px-3 py-2.5 flex-1 min-w-[140px] font-semibold text-foreground truncate">
              <a
                href={playerDetailHref(player)}
                className="text-foreground hover:text-primary hover:underline no-underline"
                onClick={(e) => {
                  e.stopPropagation();
                }}
              >
                {player.name}
              </a>
            </div>
            <div className="px-3 py-2.5 w-12 text-muted-foreground font-medium">{player.age}</div>
            <div className="px-3 py-2.5 w-14">
              <AvgBadge value={player.avg} />
            </div>
            <div className="px-3 py-2.5 w-20 text-muted-foreground font-medium">{player.salary}</div>
            <div className={`px-3 py-2.5 w-16 font-bold ${ratingTextClass10(player.avg)}`}>{player.value}</div>
            <div className="px-3 py-2.5 w-10 text-foreground font-bold">{player.goals}</div>
            <div className="px-3 py-2.5 w-20">
              <RatingBadge value={player.avgRating} />
            </div>
            <div className="w-10 px-3 py-2.5">
              <FitStatusIcon status={player.status} />
            </div>
            <div className="w-20 px-3 py-2.5 flex justify-center">
              <button
                type="button"
                disabled={!!mySquadId && player.squadId === mySquadId}
                onClick={(e) => {
                  e.stopPropagation();
                  onOffer(player);
                }}
                title={!!mySquadId && player.squadId === mySquadId ? t("dashboard.squadRosterTable.yourPlayer") : t("dashboard.squadRosterTable.makeOffer")}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider border rounded-lg transition-all ${
                  !!mySquadId && player.squadId === mySquadId
                    ? "bg-muted/30 text-muted-foreground border-border cursor-not-allowed opacity-60"
                    : "bg-primary/20 text-primary border-primary/40 hover:bg-primary hover:text-primary-foreground cursor-pointer"
                }`}
              >
                <UserPlus className="w-3 h-3" />
                {t("dashboard.squadRosterTable.offer")}
              </button>
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

function FitStatusIcon({ status }: { status: string }) {
  const { t } = useTranslation();
  if (status === "fit") return <div className="w-3 h-3 rounded-full bg-primary glow-primary-sm" title={t("dashboard.squadRosterTable.fit")} />;
  if (status === "injured")
    return <div className="w-3 h-3 rounded-full bg-destructive" title={t("dashboard.squadRosterTable.injured")} style={{ boxShadow: "0 0 8px rgb(239 68 68 / 0.5)" }} />;
  if (status === "suspended")
    return <div className="w-3 h-3 rounded-full bg-chart-4" title={t("dashboard.squadRosterTable.suspended")} style={{ boxShadow: "0 0 8px rgb(250 204 21 / 0.5)" }} />;
  return null;
}
