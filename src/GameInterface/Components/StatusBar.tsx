import { useTranslation } from "react-i18next";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { Icon } from "@/GameInterface/Icons";
import { SCREEN_MAX_WIDTH } from "@/GameInterface/ui/ScreenContainer";
import { ChangelogNoticePill } from "@/GameInterface/Components/ChangelogNoticePill";
import { CURRENT_VERSION } from "@/GameInterface/changelog/changelog";
import { LanguageSwitch } from "@/GameInterface/Components/LanguageSwitch";
import { formatEuros } from "@/Domain/money";
import { usePresence } from "@/GameInterface/usePresence";

const ITEM = "flex items-center gap-2 text-base text-muted-foreground tabular-nums";
const ICON_BTN =
  "flex items-center justify-center w-10 h-10 rounded text-muted-foreground hover:text-foreground transition-colors cursor-pointer border-0 bg-transparent";

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
  // People with the game open right now (#134): only the number, never who.
  const online = usePresence();

  return (
    // Full-width bar, content in the same frame as `ScreenContainer` (#62).
    <footer className="fixed bottom-0 left-0 right-0 z-50 h-12 border-t border-border bg-background px-6 overflow-hidden [scrollbar-gutter:stable]">
      <div className={`h-full w-full ${SCREEN_MAX_WIDTH} mx-auto grid grid-cols-[1fr_auto_1fr] items-center gap-6`}>
        <div className="flex items-center gap-7">
          <span className={ITEM} title={t("status.budget")}>
            <Icon name="finances" size={18} />
            {budgetLabel}
          </span>
          <button
            type="button"
            onClick={onOpenInbox}
            title={t("status.unread")}
            className={`${ITEM} border-0 bg-transparent cursor-pointer hover:text-foreground`}
          >
            <Icon name="news" size={18} />
            {unreadLabel}
          </button>
          <span className={ITEM} title={t("status.players")}>
            <Icon name="staff" size={18} />
            {playersLabel}
          </span>
          {online !== null && (
            <span className={ITEM} title={t("status.online", { count: online })} aria-label={t("status.online", { count: online })}>
              <span className="w-2 h-2 rounded-full bg-chart-2 shrink-0" aria-hidden="true" />
              {t("status.onlineShort", { count: online })}
            </span>
          )}
        </div>
        {/* Owner's credit, required in the footer of every public project (global rule). */}
        <span className="hidden md:inline text-sm text-muted-foreground whitespace-nowrap">
          {t("landing.developedBy")}{" "}
          <a
            href="https://westlab.dev"
            target="_blank"
            rel="noopener"
            className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            westlab.dev
          </a>
        </span>
        <div className="flex items-center justify-end gap-4">
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
          <LanguageSwitch className="!p-0.5" />
          <button type="button" onClick={onOpenSettings} title={t("nav.settings")} aria-label={t("nav.settings")} className={ICON_BTN}>
            <Icon name="settings" size={18} />
          </button>
        </div>
      </div>
    </footer>
  );
}
