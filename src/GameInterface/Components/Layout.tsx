import { useEffect, useState, type ReactNode } from "react";
import { TopNavigation } from "@/GameInterface/Components/TopNavigation";
import { StatusBar } from "@/GameInterface/Components/StatusBar";
import { DaySummaryModal } from "@/GameInterface/Components/DaySummaryModal";
import { FastForwardModal, SeasonNoticeModal } from "@/GameInterface/Components/SeasonNoticeModal";
import { Modal } from "@/GameInterface/Components/Modal";
import { InboxScreen } from "@/GameInterface/InboxScreen";
import { SettingsOverlay } from "@/GameInterface/SettingsScreen";
import { useAdvanceDay } from "@/GameInterface/useAdvanceDay";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import type { LeagueData } from "@/types/playerTypes";

export function Layout({ children }: { children: ReactNode }) {
  const { session, squad } = useGameSave();
  const {
    handleAdvanceDay, advancing, dayLog, dismissDayLog,
    canFastForward, handleFastForward, fastForward, stopFastForward, dismissFastForward,
    seasonNotice, dismissSeasonNotice,
  } = useAdvanceDay();
  const [leagues, setLeagues] = useState<LeagueData[]>([]);
  const [isInboxOpen, setIsInboxOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  useEffect(() => {
    void fetch("/api/leagues")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: LeagueData[]) => setLeagues(Array.isArray(data) ? data : []))
      .catch(() => setLeagues([]));
  }, []);

  const mySquadId = squad?.id ?? session?.clubId ?? "";

  return (
    <div className="h-screen overflow-hidden bg-background">
      <TopNavigation
        onAdvanceDay={handleAdvanceDay}
        onFastForward={canFastForward ? handleFastForward : undefined}
        advancing={advancing}
        leagues={leagues}
      />

      <main className="h-full pt-16 pb-14 overflow-y-auto flex flex-col">
        {children}
      </main>

      <StatusBar
        onOpenInbox={() => setIsInboxOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      <Modal
        open={isInboxOpen}
        onClose={() => setIsInboxOpen(false)}
        size="xl"
        panelClassName="h-[80vh] flex flex-col overflow-hidden"
      >
        <InboxScreen onClose={() => setIsInboxOpen(false)} />
      </Modal>

      <SettingsOverlay
        open={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onExitToMenu={() => { window.location.href = "/start"; }}
      />

      {dayLog && (
        <DaySummaryModal
          dayLog={dayLog}
          onDismiss={dismissDayLog}
          mySquadId={mySquadId}
          leagues={leagues}
        />
      )}

      {fastForward && (
        <FastForwardModal progress={fastForward} onStop={stopFastForward} onDismiss={dismissFastForward} />
      )}

      {/* Rendered last so it stacks above the day summary. */}
      {seasonNotice && !fastForward && (
        <SeasonNoticeModal
          notice={seasonNotice}
          leagues={leagues}
          currentLeagueName={session?.leagueName ?? ""}
          onDismiss={dismissSeasonNotice}
        />
      )}
    </div>
  );
}
