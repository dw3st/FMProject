import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ClubSidebar } from "@/GameInterface/Dashboard/ClubSidebar";
import { SquadTable } from "@/GameInterface/Dashboard/SquadTable";
import { WeekCalendar } from "@/GameInterface/Dashboard/WeekCalendar";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import type { DisplayPlayer } from "@/GameInterface/playerHelpers";
import type { LeagueData } from "@/types/playerTypes";

export function DashboardScreen() {
  const { session, squad, fixtures, restDays, loading: saveLoading, currentDate, toggleDayType } = useGameSave();

  const [selectedPlayer, setSelectedPlayer] = useState<DisplayPlayer | null>(null);
  const [leagues, setLeagues] = useState<LeagueData[]>([]);
  const [calendarCollapsed, setCalendarCollapsed] = useState<boolean>(
    () => typeof window !== "undefined" && window.localStorage.getItem("dashboard.calendarCollapsed") === "1",
  );

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("dashboard.calendarCollapsed", calendarCollapsed ? "1" : "0");
    }
  }, [calendarCollapsed]);

  useEffect(() => {
    if (!saveLoading && !session) {
      window.location.href = "/new-game";
    }
  }, [saveLoading, session]);

  useEffect(() => {
    void fetch("/api/leagues")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: LeagueData[]) => setLeagues(Array.isArray(data) ? data : []))
      .catch(() => setLeagues([]));
  }, []);

  if (saveLoading || !session) {
    return null;
  }

  const mySquadId = squad?.id ?? session.clubId;

  return (
    <div className="flex-1 flex overflow-hidden">
      <ClubSidebar
        session={session}
        squad={squad}
        selectedPlayer={selectedPlayer}
        fixtures={fixtures}
        currentDate={currentDate}
        mySquadId={mySquadId}
        leagues={leagues}
      />

      <main className="flex-1 flex flex-col p-4 gap-4 overflow-auto">
        <SquadTable
          squad={squad}
          selectedId={selectedPlayer?.id ?? ""}
          onSelectPlayer={setSelectedPlayer}
        />
      </main>

      <aside
        className={`${calendarCollapsed ? "w-16 p-2" : "w-64 p-4"} border-l border-border bg-sidebar shrink-0 overflow-y-auto transition-[width] duration-200`}
      >
        <WeekCalendar
          fixtures={fixtures}
          restDays={restDays}
          mySquadId={mySquadId}
          currentDate={currentDate}
          leagues={leagues}
          onToggleDayType={toggleDayType}
          collapsed={calendarCollapsed}
          onToggleCollapse={() => setCalendarCollapsed((c) => !c)}
        />
      </aside>
    </div>
  );
}
