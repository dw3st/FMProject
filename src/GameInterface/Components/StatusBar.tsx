import { useTranslation } from "react-i18next";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { Icon } from "@/GameInterface/Icons";
import { SCREEN_MAX_WIDTH } from "@/GameInterface/ui/ScreenContainer";
import { ChangelogNoticePill } from "@/GameInterface/Components/ChangelogNoticePill";
import { GAME_VERSION as CURRENT_VERSION } from "@/Domain/saveVersion";
import { formatEuros } from "@/Domain/money";
import { usePresence } from "@/GameInterface/usePresence";
import { FriendsButton } from "@/GameInterface/Social/FriendsButton";
import { useSocial } from "@/GameInterface/Social/useSocial";
import { MATCH_RADIO_SLOT } from "@/GameInterface/World/frameHost";
import { RadioPlayer } from "@/GameInterface/Components/RadioPlayer";

const ITEM = "flex items-center gap-2 text-base text-muted-foreground tabular-nums";
const ICON_BTN =
  "flex items-center justify-center w-10 h-10 rounded text-muted-foreground hover:text-foreground transition-colors cursor-pointer border-0 bg-transparent";

/** Between two things of the bar (tester report, 8.8.27). */
function Divider() {
  return <span aria-hidden="true" className="w-px h-5 bg-border shrink-0" />;
}

export function StatusBar({
  onOpenInbox,
  onOpenSettings,
  onOpenChangelog,
  changelogNotice,
}: {
  onOpenInbox: () => void;
  onOpenSettings: () => void;
  onOpenChangelog: () => void;
  /** Present only when there's an unseen changelog version — see .claude/rules/changelog.md. */
  changelogNotice?: { version: string; onOpen: () => void; onDismiss: () => void } | null;
}) {
  const { t } = useTranslation();
  const { session, squad, unreadInboxCount, save } = useGameSave();
  // Unemployed (Etapa 20): no club, so no club money to show.
  const noClub = !!save?.unemployed;

  const budgetLabel = session != null && !noClub ? formatEuros(session.budget) : "—";
  const playersLabel = squad != null ? String(squad.players.length) : "—";
  const unreadLabel = String(unreadInboxCount);
  // People with the game open right now (#134): only the number, never who; shown in the Friends button (8.8.15).
  // The friends socket pings while open (and answers the count); the HTTP ping is the fallback.
  const social = useSocial();
  const httpOnline = usePresence(social.connected);
  const online = social.online ?? httpOnline;

  return (
    // Full-width bar, content in the same frame as `ScreenContainer` (#62).
    <footer className="fixed bottom-0 left-0 right-0 z-50 h-12 border-t border-border bg-background px-6 overflow-hidden [scrollbar-gutter:stable]">
      <div className={`h-full w-full ${SCREEN_MAX_WIDTH} mx-auto grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-6`}>
        <div className="flex items-center gap-4">
          <span className={ITEM} title={t("status.budget")}>
            <Icon name="finances" size={18} />
            {budgetLabel}
          </span>
          <Divider />
          <button
            type="button"
            onClick={onOpenInbox}
            title={t("status.unread")}
            className={`${ITEM} border-0 bg-transparent cursor-pointer hover:text-foreground`}
          >
            <Icon name="news" size={18} />
            {unreadLabel}
          </button>
          <Divider />
          <span className={ITEM} title={t("status.players")}>
            <Icon name="staff" size={18} />
            {playersLabel}
          </span>
        </div>
        {/* The live match draws its friends' radio here (in the frame); the owner's credit lives on the login and start
            screens (user's choice, 8.8.10). */}
        <div id={MATCH_RADIO_SLOT} className="min-w-0 h-full flex items-center overflow-x-auto overflow-y-visible px-6 bg-[linear-gradient(var(--color-border),var(--color-border)),linear-gradient(var(--color-border),var(--color-border))] bg-no-repeat bg-[length:1px_20px] bg-[position:left_center,right_center] empty:bg-none" />
        <div className="flex items-center justify-end gap-4">
          <RadioPlayer />
          <Divider />
          <FriendsButton online={online} />
          <Divider />
          {/* Version (opens the changelog) and, when unseen, the "New: vX" pill next to it (#65).
              Today's date lives in the top bar's day block. */}
          <button
            type="button"
            onClick={onOpenChangelog}
            title={t("nav.changelog")}
            aria-label={`${t("nav.changelog")} · v${CURRENT_VERSION}`}
            className={`${ITEM} h-10 px-1 border-0 bg-transparent cursor-pointer hover:text-foreground whitespace-nowrap tabular-nums`}
          >
            <Icon name="sparkles" size={18} />
            v{CURRENT_VERSION}
          </button>
          {changelogNotice && (
            <ChangelogNoticePill
              version={changelogNotice.version}
              onOpen={changelogNotice.onOpen}
              onDismiss={changelogNotice.onDismiss}
            />
          )}
          <Divider />
          <button type="button" onClick={onOpenSettings} title={t("nav.settings")} aria-label={t("nav.settings")} className={ICON_BTN}>
            <Icon name="settings" size={18} />
          </button>
        </div>
      </div>
    </footer>
  );
}
