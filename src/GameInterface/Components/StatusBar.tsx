import { useTranslation } from "react-i18next";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { Icon } from "@/GameInterface/Icons";
import { SCREEN_MAX_WIDTH } from "@/GameInterface/ui/ScreenContainer";

function formatBudgetShort(value: number) {
  // The balance can go negative now (see .claude/rules/game/finances.md): abbreviate |value|, keep the sign.
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(0)}K`;
  return `${sign}${abs}`;
}

function formatSimDate(dateStr: string): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T12:00:00");
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const ITEM = "flex items-center gap-1.5 text-sm text-muted-foreground";
const ICON_BTN =
  "flex items-center justify-center w-8 h-8 rounded text-muted-foreground hover:text-foreground transition-colors cursor-pointer border-0 bg-transparent";

export function StatusBar({
  onOpenInbox,
  onOpenSettings,
  onOpenChangelog,
}: {
  onOpenInbox: () => void;
  onOpenSettings: () => void;
  onOpenChangelog: () => void;
}) {
  const { t } = useTranslation();
  const { session, squad, currentDate, unreadInboxCount } = useGameSave();

  const budgetLabel = session != null ? `€${formatBudgetShort(session.budget)}` : "—";
  const playersLabel = squad != null ? String(squad.players.length) : "—";
  const dateLabel = formatSimDate(currentDate);
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
          <span className={ITEM}>
            <Icon name="calendar" size={14} />
            {dateLabel}
          </span>
          <button type="button" onClick={onOpenChangelog} title={t("nav.changelog")} aria-label={t("nav.changelog")} className={ICON_BTN}>
            <Icon name="sparkles" size={16} />
          </button>
          <button type="button" onClick={onOpenSettings} title={t("nav.settings")} aria-label={t("nav.settings")} className={ICON_BTN}>
            <Icon name="settings" size={16} />
          </button>
        </div>
      </div>
    </footer>
  );
}
