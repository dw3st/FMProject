import { useTranslation } from "react-i18next";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { Icon } from "@/GameInterface/Icons";
import { SCREEN_MAX_WIDTH } from "@/GameInterface/ui/ScreenContainer";
import { ChangelogNoticePill } from "@/GameInterface/Components/ChangelogNoticePill";
import { CURRENT_VERSION } from "@/GameInterface/changelog/changelog";

function formatBudgetShort(value: number) {
  // The balance can go negative now (see .claude/rules/game/finances.md): abbreviate |value|, keep the sign.
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(0)}K`;
  return `${sign}${abs}`;
}

const ITEM = "flex items-center gap-1.5 text-sm text-muted-foreground";
const ICON_BTN =
  "flex items-center justify-center w-8 h-8 rounded text-muted-foreground hover:text-foreground transition-colors cursor-pointer border-0 bg-transparent";

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
  const { session, squad, unreadInboxCount } = useGameSave();

  const budgetLabel = session != null ? `€${formatBudgetShort(session.budget)}` : "—";
  const playersLabel = squad != null ? String(squad.players.length) : "—";
  const unreadLabel = String(unreadInboxCount);

  return (
    // Full-width bar, content in the same frame as `ScreenContainer` (#62).
    <footer className="fixed bottom-0 left-0 right-0 z-50 h-9 border-t border-border bg-background px-6 overflow-hidden [scrollbar-gutter:stable]">
      <div className={`h-full w-full ${SCREEN_MAX_WIDTH} mx-auto flex items-center justify-between`}>
        <div className="flex items-center gap-5">
          <span className={ITEM} title={t("status.budget")}>
            <Icon name="finances" size={14} />
            {budgetLabel}
          </span>
          <button
            type="button"
            onClick={onOpenInbox}
            title={t("status.unread")}
            className={`${ITEM} border-0 bg-transparent cursor-pointer hover:text-foreground`}
          >
            <Icon name="news" size={14} />
            {unreadLabel}
          </button>
          <span className={ITEM} title={t("status.players")}>
            <Icon name="staff" size={14} />
            {playersLabel}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {/* Version (opens the changelog) and, when unseen, the "New: vX" pill next to it (#65).
              Today's date lives in the top bar's day block. */}
          <button
            type="button"
            onClick={onOpenChangelog}
            title={t("nav.changelog")}
            aria-label={`${t("nav.changelog")} · v${CURRENT_VERSION}`}
            className={`${ITEM} h-8 px-1 border-0 bg-transparent cursor-pointer hover:text-foreground whitespace-nowrap tabular-nums`}
          >
            <Icon name="sparkles" size={16} />
            v{CURRENT_VERSION}
          </button>
          {changelogNotice && (
            <ChangelogNoticePill
              version={changelogNotice.version}
              onOpen={changelogNotice.onOpen}
              onDismiss={changelogNotice.onDismiss}
            />
          )}
          <button type="button" onClick={onOpenSettings} title={t("nav.settings")} aria-label={t("nav.settings")} className={ICON_BTN}>
            <Icon name="settings" size={16} />
          </button>
        </div>
      </div>
    </footer>
  );
}
