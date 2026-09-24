import { useTranslation } from "react-i18next";
import { Shield, Zap, Tag, X } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import type { Squad } from "@/types/playerTypes";
import type { Fixture } from "@/types/calendarTypes";
import type { GameSession } from "@/GameInterface/gameSession";
import type { DisplayPlayer } from "@/GameInterface/playerHelpers";
import { PlayerCard } from "@/GameInterface/Dashboard/PlayerCard";
import { ClubIdentity, ClubGradientAccent } from "@/GameInterface/Components/ClubIdentity";
import { teamDisplayNameFromLeagues } from "@/GameInterface/teamDisplayName";
import type { LeagueData } from "@/types/playerTypes";
import { loadSession } from "@/GameInterface/gameSession";
import { squadLogoUrl } from "@/GameInterface/Components/ClubLogo";
import { catalogLeagueBySquadId } from "@/Domain/world/labels";

interface Props {
  session: GameSession;
  squad: Squad | null;
  selectedPlayer: DisplayPlayer | null;
  fixtures: Fixture[];
  currentDate: string;
  mySquadId: string;
  leagues: LeagueData[];
}

function parseDate(dateStr: string): number {
  // Use noon to avoid DST edge cases
  return new Date(dateStr + "T12:00:00").getTime();
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}`;
}

function getNextFixture(fixtures: Fixture[], mySquadId: string, currentDate: string): Fixture | null {
  if (!currentDate) return null;
  const now = parseDate(currentDate);

  const upcoming = fixtures
    .filter((f) => (f.home === mySquadId || f.away === mySquadId) && parseDate(f.date) >= now)
    .sort((a, b) => parseDate(a.date) - parseDate(b.date));

  return upcoming[0] ?? null;
}

export function ClubSidebar({
  session,
  squad,
  selectedPlayer,
  fixtures,
  currentDate,
  mySquadId,
  leagues,
}: Props) {
  const { t } = useTranslation();
  const money = `€${(session.budget / 1_000_000).toFixed(1)}M`;
  const playerCount = squad?.players.length ?? 0;
  const nextFixture = getNextFixture(fixtures, mySquadId, currentDate);
  const isHome = nextFixture ? nextFixture.home === mySquadId : false;
  const opponentId = nextFixture ? (isHome ? nextFixture.away : nextFixture.home) : "";
  const opponentName = nextFixture ? teamDisplayNameFromLeagues(opponentId, leagues) : "";
  // Crests are filed by the club's catalog (origin) league, not its current league.
  const catalogLeague = useMemo(() => catalogLeagueBySquadId(leagues), [leagues]);
  const crestId = mySquadId || session.clubId;
  const myLogoUrl = squadLogoUrl(crestId, catalogLeague.get(crestId) ?? session.leagueSlug, mySquadId ? undefined : session.clubId);
  const venueLabel = nextFixture ? (isHome ? t("dashboard.clubSidebar.home") : t("dashboard.clubSidebar.away")) : "";

  const [sellListIds, setSellListIds] = useState<Set<string>>(new Set());
  const [sellToggling, setSellToggling] = useState(false);

  useEffect(() => {
    const s = loadSession();
    if (!s) return;
    fetch(`/api/saves/${s.saveId}/sell-list`)
      .then((r) => r.json() as Promise<{ playerId: string }[]>)
      .then((list) => setSellListIds(new Set(list.map((c) => c.playerId))))
      .catch(() => {});
  }, []);

  async function toggleSellList() {
    if (!selectedPlayer || sellToggling) return;
    const s = loadSession();
    if (!s) return;
    setSellToggling(true);
    try {
      const res = await fetch(`/api/saves/${s.saveId}/sell-list`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ playerId: selectedPlayer.id }),
      });
      if (res.ok) {
        const { playerSellList } = await res.json() as { playerSellList: { playerId: string }[] };
        setSellListIds(new Set(playerSellList.map((c) => c.playerId)));
      }
    } finally {
      setSellToggling(false);
    }
  }

  const isListed = selectedPlayer ? sellListIds.has(selectedPlayer.id) : false;

  return (
    <aside className="w-72 border-r border-border bg-sidebar/80 backdrop-blur-sm p-4 flex flex-col gap-4 shrink-0 overflow-y-auto">
      <div className="pb-4 border-b border-sidebar-border">
        <ClubIdentity
          variant="sidebar"
          clubName={session.clubName}
          leagueName={session.leagueName}
          divisionName={session.leagueName}
          primaryColor={session.clubColors[0]}
          secondaryColor={session.clubColors[1]}
          logoUrl={myLogoUrl}
        />
        <div className="mt-2 text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest m-0">
            {t("dashboard.clubSidebar.manager")}
          </p>
          <p className="text-sm text-primary font-bold m-0 mt-0.5">
            {session.manager?.name ?? "—"}
          </p>
        </div>
        <div className="mt-2">
          <ClubGradientAccent
            primaryColor={session.clubColors[0]}
            secondaryColor={session.clubColors[1]}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <ConfidenceBar label={t("dashboard.clubSidebar.board")} value={75} />
        <ConfidenceBar label={t("dashboard.clubSidebar.fans")} value={75} />
      </div>

      {selectedPlayer && (
        <div className="space-y-2">
          <PlayerCard player={selectedPlayer} />
          <button
            type="button"
            onClick={() => void toggleSellList()}
            disabled={sellToggling}
            className={`w-full py-2.5 rounded-xl font-black uppercase tracking-wider text-xs flex items-center justify-center gap-2 transition-all border cursor-pointer ${
              isListed
                ? "bg-destructive/20 text-destructive border-destructive/40 hover:bg-destructive hover:text-destructive-foreground"
                : "bg-muted/30 text-muted-foreground border-border hover:bg-primary/20 hover:text-primary hover:border-primary/40"
            }`}
          >
            {isListed ? (
              <>
                <X className="w-3.5 h-3.5" />
                {t("dashboard.clubSidebar.removeFromSale")}
              </>
            ) : (
              <>
                <Tag className="w-3.5 h-3.5" />
                {t("dashboard.clubSidebar.listForSale")}
              </>
            )}
          </button>
        </div>
      )}

      <div className="mt-auto space-y-3">
        <div className="card-arcade rounded-xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{t("dashboard.clubSidebar.budget")}</span>
            <span className="text-lg font-black text-primary font-display">{money}</span>
          </div>
          <div className="flex items-center justify-between mt-1">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{t("dashboard.clubSidebar.squad")}</span>
            <span className="text-sm font-bold text-foreground">{playerCount} {t("dashboard.clubSidebar.players")}</span>
          </div>
        </div>

        <div className="card-arcade rounded-xl p-4 border-glow">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-4 h-4 text-primary" />
            <span className="text-xs font-black text-primary uppercase tracking-wider font-display">
              {t("dashboard.clubSidebar.nextMatch")}
            </span>
          </div>
          {!nextFixture ? (
            <div className="text-center">
              <p className="text-xs text-muted-foreground italic m-0">{t("dashboard.clubSidebar.noMatchScheduled")}</p>
            </div>
          ) : (
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-foreground m-0 truncate">
                  {isHome ? t("common.vs") + " " : "@ "}
                  {opponentName}
                </p>
                <p className="text-xs text-muted-foreground font-medium m-0">
                  {nextFixture.competition} · {t("common.round")} {nextFixture.round}
                </p>
                <p className="text-xs text-primary font-bold uppercase m-0">{venueLabel}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-xs font-black text-primary font-display m-0">
                  {formatDateLabel(nextFixture.date)}
                </p>
              </div>
            </div>
          )}
        </div>

        <a
          href={`/squad/${session.leagueSlug}/${session.clubId}`}
          className="w-full py-3.5 bg-primary text-primary-foreground rounded-xl font-black uppercase tracking-wider transition-all hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2 glow-primary cursor-pointer border-0 no-underline"
        >
          <Shield className="w-5 h-5" />
          {t("dashboard.clubSidebar.viewFullSquad")}
        </a>
      </div>
    </aside>
  );
}

function ConfidenceBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="card-arcade rounded-lg p-3">
      <div className="flex justify-between text-xs mb-2">
        <span className="text-muted-foreground font-semibold uppercase tracking-wider">
          {label}
        </span>
        <span className="text-primary font-black font-display">{value}%</span>
      </div>
      <div className="h-2 bg-muted/50 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-primary/80 to-primary rounded-full transition-all"
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

