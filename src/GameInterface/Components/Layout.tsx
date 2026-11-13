import { ChatPopups } from "@/GameInterface/Social/ChatPopups";
import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { TopNavigation } from "@/GameInterface/Components/TopNavigation";
import { SideNavigation } from "@/GameInterface/Components/SideNavigation";
import { useNavMenu } from "@/GameInterface/Components/useNavEntries";
import { StatusBar } from "@/GameInterface/Components/StatusBar";
import { FastForwardModal, SeasonNoticeModal } from "@/GameInterface/Components/SeasonNoticeModal";
import { InboxWindow } from "@/GameInterface/Components/InboxWindow";
import { SettingsOverlay } from "@/GameInterface/SettingsScreen";
import { ChangelogModal } from "@/GameInterface/Components/ChangelogModal";
import { useAdvanceDay } from "@/GameInterface/useAdvanceDay";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { useChangelogNotice } from "@/GameInterface/changelog/useChangelogNotice";
import { useNewVersion } from "@/GameInterface/changelog/useNewVersion";
import { Button } from "@/GameInterface/ui/Button";
import { GAME_VERSION as CURRENT_VERSION } from "@/Domain/saveVersion";
import type { LeagueData } from "@/types/playerTypes";
import { NoClubScreen } from "@/GameInterface/NoClubScreen";
import { SocialProvider } from "@/GameInterface/Social/useSocial";
import { FriendsPanel } from "@/GameInterface/Social/FriendsPanel";
import { ChatDock } from "@/GameInterface/Social/ChatDock";
import { WatchWindowHost } from "@/GameInterface/Watch/WatchWindowHost";
import { useSocial } from "@/GameInterface/Social/useSocial";
import { OPEN_CHAT_MESSAGE } from "@/GameInterface/World/frameHost";
import { ReadyControl } from "@/GameInterface/World/ReadyControl";
import { READY_SLOT_ID } from "@/GameInterface/World/TurnNoticeCard";
import { GroupAdvanceProvider } from "@/GameInterface/World/GroupAdvanceProvider";
import { worldRedirect } from "@/GameInterface/World/worldNav";
import { navigate, useRoute } from "@/GameInterface/router/navigation";

/**
 * Screens that work without a club (`.claude/rules/game/jobs.md`); every other one shows "Sem clube". `/squad/` is any
 * club's squad opened from Leagues, Stats or Scout (tester report, 8.9.30: it showed "Sem clube" instead).
 */
export const NO_CLUB_PATHS = ["/inbox", "/leagues", "/stats", "/scout", "/player", "/world", "/squad/", "/manager/", "/sponsor/"];

/**
 * `chrome` (spa-shell phase 2): `full` draws the bars; `bare` drops the top bar (preview, result; the footer stays so the radio keeps playing);
 * `match` also leaves friends and chat to the live match iframe, which has its own.
 */
export function Layout({ children, chrome = "full" }: { children: ReactNode; chrome?: "full" | "bare" | "match" }) {
  const { t } = useTranslation();
  const { session, squad, save } = useGameSave();
  const { pathname } = useRoute();
  const noClub = !!save?.unemployed
    && !NO_CLUB_PATHS.some((p) => pathname.startsWith(p));
  const {
    handleAdvanceDay, advancing,
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
  const newVersion = useNewVersion();
  // The menu in a left column (the player's choice, `navMenu.ts`): only with the full chrome, never on a phone.
  const menuPosition = useNavMenu().position;
  const sideMenu = chrome === "full" && menuPosition === "left";

  // A world in the lobby only shows the league screen; a solo save has none (multiplayer part 2).
  const redirectTo = typeof window === "undefined" ? null : worldRedirect(pathname, save);
  useEffect(() => {
    if (redirectTo) navigate(redirectTo, { replace: true });
  }, [redirectTo]);

  return (
    <SocialProvider saveId={session?.saveId ?? null} seatId={session?.seatId ?? null}>
      <GroupAdvanceProvider leagues={leagues} mySquadId={mySquadId}>
      <div className="h-screen overflow-hidden bg-background">
        {chrome === "full" && <TopNavigation
          onAdvanceDay={lobby || session?.groupAdvance ? undefined : handleAdvanceDay}
          onFastForward={!lobby && !session?.groupAdvance && canFastForward ? handleFastForward : undefined}
          advancing={advancing}
          leagues={leagues}
          dayAction={!lobby && session?.groupAdvance ? <span id={READY_SLOT_ID} className="flex w-full min-w-0"><ReadyControl publicWorld={save?.world?.kind === "public"} /></span> : undefined}
        />}

        {sideMenu && <SideNavigation />}

        <main className={chrome === "full" ? `h-full pt-14 pb-12 phone:pt-11 phone:pb-9 overflow-y-auto flex flex-col ${sideMenu ? "pl-[calc(max(0px,(100vw-1488px)/2)+13rem)] phone:pl-0 [&_[data-screen-container]]:pr-[calc(max(0px,(100vw-1488px)/2)+1.5rem)] phone:[&_[data-screen-container]]:pr-3" : ""}` : chrome === "match" ? "h-full pb-12 phone:pb-9 overflow-hidden flex flex-col" : "h-full pb-12 phone:pb-9 overflow-y-auto flex flex-col"}>
          {redirectTo ? (
            <p className="px-6 py-5 text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : noClub ? <NoClubScreen /> : children}
        </main>

        {/* Always mounted: the radio lives in it, so it plays from screen to screen and through the match (8.8.10, 8.8.23). */}
        <StatusBar
          matchMode={chrome === "match"}
          onOpenInbox={() => setIsInboxOpen((v) => !v)}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenChangelog={openChangelog}
          changelogNotice={
            showChangelogNotice
              ? { version: CURRENT_VERSION, onOpen: openChangelog, onDismiss: markChangelogSeen }
              : null
          }
        />

        {newVersion && chrome === "full" && (
          <div role="status" className="fixed bottom-14 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-3 rounded-md border border-primary bg-card px-4 py-2 shadow-lg">
            <span className="text-sm">{t("changelog.reloadText")}</span>
            <Button onClick={() => window.location.reload()}>{t("changelog.reload")}</Button>
          </div>
        )}

        <FriendsPanel />
        <ChatDock />
        {chrome === "match" ? <MatchChatBridge /> : (
          <>
            <ChatPopups />
            <WatchWindowHost />
          </>
        )}

        {isInboxOpen && <InboxWindow onClose={() => setIsInboxOpen(false)} />}

        <SettingsOverlay
          open={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          onExitToMenu={() => { navigate("/start"); }}
        />

        <ChangelogModal open={isChangelogOpen} onClose={() => setIsChangelogOpen(false)} />

        {fastForward && (
          <FastForwardModal progress={fastForward} onStop={stopFastForward} onDismiss={dismissFastForward} unemployed={!!save?.unemployed} />
        )}

        {seasonNotice && !fastForward && (
          <SeasonNoticeModal
            notice={seasonNotice}
            saveId={session?.saveId ?? ""}
            leagues={leagues}
            currentLeagueName={session?.leagueName ?? ""}
            currentClubId={session?.clubId ?? ""}
            onDismiss={dismissSeasonNotice}
          />
        )}
      </div>
      </GroupAdvanceProvider>
    </SocialProvider>
  );
}

/** The live match page (in an iframe of the frame) asks to open a chat: it opens in the frame's chat windows (8.8.10). */
function MatchChatBridge() {
  const { openChat } = useSocial();
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const data = e.data as { type?: unknown; room?: unknown } | null;
      if (data?.type === OPEN_CHAT_MESSAGE && typeof data.room === "string" && data.room.length <= 120) openChat(data.room);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [openChat]);
  return null;
}
