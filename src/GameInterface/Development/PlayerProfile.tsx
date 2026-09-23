import { useTranslation } from "react-i18next";
import { User, TrendingUp, TrendingDown, Minus } from "lucide-react";

export type AgePhase = "developing" | "approachingPeak" | "atPeak" | "declining";
export type DevStatus = "improving" | "stable" | "declining";

interface PlayerProfileProps {
  player: {
    name: string;
    age: number;
    role: string;
    agePhase: AgePhase;
    developmentStatus: DevStatus;
  };
}

/** Shared with Development squad list — age band (not DP-based improving/stable). */
export const getAgePhaseDisplay = (t: (key: string) => string): Record<AgePhase, { label: string; color: string }> => ({
  developing:         { label: t("developmentScreen.agePhases.developing"),      color: "text-blue-400" },
  approachingPeak:    { label: t("developmentScreen.agePhases.approachingPeak"), color: "text-yellow-400" },
  atPeak:             { label: t("developmentScreen.agePhases.atPeak"),          color: "text-muted-foreground" },
  declining:          { label: t("developmentScreen.agePhases.declining"),       color: "text-red-400" },
});

const getStatusConfig = (t: (key: string) => string): Record<DevStatus, { label: string; icon: typeof TrendingUp; color: string }> => ({
  improving: { label: t("development.statusLabels.improving"), icon: TrendingUp,  color: "text-green-400" },
  stable:    { label: t("development.statusLabels.stable"),    icon: Minus,       color: "text-muted-foreground" },
  declining: { label: t("development.statusLabels.declining"), icon: TrendingDown, color: "text-red-400" },
});

export function PlayerProfile({ player }: PlayerProfileProps) {
  const { t } = useTranslation();
  const agePhaseDisplay = getAgePhaseDisplay(t);
  const phase = agePhaseDisplay[player.agePhase];
  const statusConfig = getStatusConfig(t);
  const status = statusConfig[player.developmentStatus];
  const StatusIcon = status.icon;

  return (
    <div className="card-arcade rounded-xl p-5">
      <div className="flex items-center gap-4 mb-5">
        <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-primary/30 to-primary/10 border border-primary/30 flex items-center justify-center">
          <User className="w-8 h-8 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-bold font-display tracking-wide m-0">{player.name}</h2>
          <p className="text-muted-foreground m-0">{player.role}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-background/50 rounded-lg p-3 border border-border/30">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1 m-0">{t("development.profileAge")}</p>
          <p className="text-2xl font-bold font-display m-0">{player.age}</p>
        </div>
        <div className="bg-background/50 rounded-lg p-3 border border-border/30">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1 m-0">{t("development.profilePhase")}</p>
          <p className={`text-sm font-bold m-0 ${phase.color}`}>{phase.label}</p>
        </div>
      </div>

      <div className="mt-4 rounded-lg p-4 bg-background/50 border border-border/30">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1 m-0">{t("development.profileStatus")}</p>
            <p className={`text-lg font-bold m-0 ${status.color}`}>{status.label}</p>
          </div>
          <div className="w-12 h-12 rounded-full border border-border/40 bg-muted/20 flex items-center justify-center">
            <StatusIcon className={`w-6 h-6 ${status.color}`} />
          </div>
        </div>
      </div>
    </div>
  );
}
