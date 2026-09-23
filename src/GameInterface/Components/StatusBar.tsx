import { DollarSign, Newspaper, Users, Calendar, Settings } from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import { useTranslation } from "react-i18next";
import { useGameSave } from "@/GameInterface/GameSaveProvider";

function formatBudgetShort(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
  return value.toString();
}

function formatSimDate(dateStr: string): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T12:00:00");
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function StatusBar({
  onOpenInbox,
  onOpenSettings,
}: {
  onOpenInbox: () => void;
  onOpenSettings: () => void;
}) {
  const { t } = useTranslation();
  const { session, squad, currentDate, unreadInboxCount } = useGameSave();

  const budgetLabel = session != null ? `€${formatBudgetShort(session.budget)}` : "—";
  const playersLabel = squad != null ? String(squad.players.length) : "—";
  const dateLabel = formatSimDate(currentDate);
  const unreadLabel = String(unreadInboxCount);

  return (
    <footer className="fixed bottom-0 left-0 right-0 z-50 h-14 border-t border-border bg-card/90 backdrop-blur-md px-4">
      <div className="h-full flex items-center justify-between">
        <div className="flex items-center gap-6">
          <StatusItem icon={DollarSign} label={budgetLabel} sublabel={t("status.budget")} color="text-primary" />
          <button
            type="button"
            onClick={onOpenInbox}
            className="rounded-lg transition-colors hover:bg-white/5 px-1 -mx-1 border-0 bg-transparent cursor-pointer"
          >
            <StatusItem
              icon={Newspaper}
              label={unreadLabel}
              sublabel={t("status.unread")}
              color="text-chart-4"
            />
          </button>
          <StatusItem icon={Users} label={playersLabel} sublabel={t("status.players")} color="text-accent" />
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm font-bold text-primary bg-primary/10 px-4 py-2 rounded-lg border border-primary/20 font-display tracking-wider">
            <Calendar className="w-4 h-4 shrink-0" />
            {dateLabel}
          </div>
          <button
            type="button"
            onClick={onOpenSettings}
            title={t("nav.settings")}
            aria-label={t("nav.settings")}
            className="flex items-center justify-center w-9 h-9 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors cursor-pointer border-0 bg-transparent"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>
    </footer>
  );
}

function StatusItem({
  icon: Icon,
  label,
  sublabel,
  color,
  highlight = false,
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  sublabel: string;
  color: string;
  highlight?: boolean;
}) {
  return (
    <div className={`flex items-center gap-3 ${highlight ? "animate-pulse" : ""}`}>
      <div className={`w-9 h-9 rounded-lg ${color.replace("text-", "bg-")}/20 flex items-center justify-center`}>
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
      <div className="flex flex-col">
        <span className="text-sm font-black text-foreground font-display">{label}</span>
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">{sublabel}</span>
      </div>
    </div>
  );
}
