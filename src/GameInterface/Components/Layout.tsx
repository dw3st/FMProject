import { ChatPopups } from "@/GameInterface/Social/ChatPopups";
import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { TopNavigation } from "@/GameInterface/Components/TopNavigation";
import { StatusBar } from "@/GameInterface/Components/StatusBar";
import { DaySummaryModal } from "@/GameInterface/Components/DaySummaryModal";
import { FastForwardModal, SeasonNoticeModal } from "@/GameInterface/Components/SeasonNoticeModal";
import { Modal } from "@/GameInterface/Components/Modal";
import { InboxScreen } from "@/GameInterface/InboxScreen";
import { SettingsOverlay } from "@/GameInterface/SettingsScreen";
import { ChangelogModal } from "@/GameInterface/Components/ChangelogModal";
import { useAdvanceDay } from "@/GameInterface/useAdvanceDay";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { useChangelogNotice } from "@/GameInterface/changelog/useChangelogNotice";
import { GAME_VERSION as CURRENT_VERSION } from "@/Domain/saveVersion";
import type { LeagueData } from "@/types/playerTypes";
import { NoClubScreen } from "@/GameInterface/NoClubScreen";
import { SocialProvider } from "@/GameInterface/Social/useSocial";
import { FriendsPanel } from "@/GameInterface/Social/FriendsPanel";
import { ChatDock } from "@/GameInterface/Social/ChatDock";
import { ReadyControl } from "@/GameInterface/World/ReadyControl";
import { GroupAdvanceProvider } from "@/GameInterface/World/GroupAdvanceProvider";
import { worldRedirect } from "@/GameInterface/World/worldNav";

/** Screens that work without a club (`.claude/rules/game/jobs.md`); every other one shows "Sem clube". */
const NO_CLUB_PATHS = ["/inbox", "/leagues", "/stats", "/scout", "/player", "/world"];

export function Layout({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { session, squad, save } = useGameSave();
  const noClub = !!save?.unemployed
    && !(typeof window !== "undefined" && NO_CLUB_PATHS.some((p) => window.location.pathname.startsWith(p)));
  const {
    handleAdvanceDay, advancing, dayLog, dismissDayLog,
    canFastForward, handleFastForward, fastForward, stopFastForward, dismissFastForward,
    seasonNotice, dismissSeasonNotice,
  } = useAdvanceDay();
  const [leagues, setLeagues] = useState<LeagueData[]>([]);
  const [isInboxOpen, setIsInboxOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isChangelogOpen, setIsChangelogOpen] = useState(false);
  const { showNotice: showChangelogNotice, markSeen: markChangelogSeen } = useChangelogNotice();

  function openChangelog() {
    setIsChangelogOpen(true);
    markChangelogSeen();
  }

  useEffect(() => {
    void fetch("/api/leagues")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: LeagueData[]) => setLeagues(Array.isArray(data) ? data : []))
      .catch(() => setLeagues([]));
  }, []);

  const mySquadId = squad?.id ?? session?.clubId ?? "";
  const lobby = save?.world?.phase === "lobby";

  // A world in the lobby only shows the league screen; a solo save has none (multiplayer part 2).
  const redirectTo = typeof window === "undefined" ? null : worldRedirect(window.location.pathname, save);
  useEffect(() => {
    if (redirectTo) window.location.replace(redirectTo);
  }, [redirectTo]);

  return (
    <SocialProvider saveId={session?.saveId ?? null} seatId={session?.seatId ?? null}>
      <GroupAdvanceProvider leagues={leagues} mySquadId={mySquadId}>
      <div className="h-screen overflow-hidden bg-background">
        <TopNavigation
          onAdvanceDay={lobby || session?.groupAdvance ? undefined : handleAdvanceDay}
          onFastForward={!lobby && !session?.groupAdvance && canFastForward ? handleFastForward : undefined}
          advancing={advancing}
          leagues={leagues}
          dayAction={!lobby && session?.groupAdvance ? <ReadyControl publicWorld={save?.world?.kind === "public"} /> : undefined}
        />

        <main className="h-full pt-14 pb-12 overflow-y-auto flex flex-col">
          {redirectTo ? (
            <p className="px-6 py-5 text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : noClub ? <NoClubScreen /> : children}
        </main>

        <StatusBar
          onOpenInbox={() => setIsInboxOpen(true)}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenChangelog={openChangelog}
          changelogNotice={
            showChangelogNotice
              ? { version: CURRENT_VERSION, onOpen: openChangelog, onDismiss: markChangelogSeen }
              : null
          }
        />

        <FriendsPanel />
        <ChatDock />
        <ChatPopups />

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

        <ChangelogModal open={isChangelogOpen} onClose={() => setIsChangelogOpen(false)} />

        {dayLog && (
          <DaySummaryModal
            dayLog={dayLog}
            onDismiss={dismissDayLog}
            mySquadId={mySquadId}
            leagues={leagues}
          />
        )}

        {fastForward && (
          <FastForwardModal progress={fastForward} onStop={stopFastForward} onDismiss={dismissFastForward} unemployed={!!save?.unemployed} />
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
      </GroupAdvanceProvider>
    </SocialProvider>
  );
}
