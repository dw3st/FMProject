import { useTranslation } from "react-i18next";
import type { TeamId } from "@/GameEngine/types";
import { DEFAULT_TEAM_KIT_HEX, readableOnDark } from "@/GameInterface/matchTeamColors";

interface Props {
  scoringTeam: TeamId | null;
  score: { A: number; B: number };
  kitColorA?: string;
  kitColorB?: string;
  nameA?: string;
  nameB?: string;
}

export function GoalOverlay({ scoringTeam, score, kitColorA, kitColorB, nameA, nameB }: Props) {
  const { t } = useTranslation();
  if (!scoringTeam) return null;

  const a = readableOnDark(kitColorA ?? DEFAULT_TEAM_KIT_HEX.A);
  const b = readableOnDark(kitColorB ?? DEFAULT_TEAM_KIT_HEX.B);
  const color = scoringTeam === "A" ? a : b;
  const teamLabel = scoringTeam === "A" ? (nameA ?? "Team A") : (nameB ?? "Team B");

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
      <div
        className="relative flex flex-col items-center gap-3 px-16 py-10 rounded-md border bg-card"
        style={{
          borderColor: color,
          animation: "goal-pop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) both",
        }}
      >
        <div
          className="text-7xl font-black tracking-tight leading-none font-display"
          style={{ color }}
        >
          {t("goalOverlay.goal")}
        </div>

        <div className="text-base font-bold tracking-[0.08em] text-muted-foreground uppercase font-display">
          {t("goalOverlay.scores", { team: teamLabel })}
        </div>

        <div className="flex items-center gap-4 mt-1">
          <span className="text-4xl font-black tabular-nums" style={{ color: a }}>
            {score.A}
          </span>
          <span className="text-2xl font-bold text-muted-foreground/40">–</span>
          <span className="text-4xl font-black tabular-nums" style={{ color: b }}>
            {score.B}
          </span>
        </div>
      </div>
    </div>
  );
}
