import { useTranslation } from "react-i18next";
import type { TeamId } from "@/GameEngine/types";
import { DEFAULT_TEAM_KIT_HEX } from "@/GameInterface/matchTeamColors";

interface Props {
  scoringTeam: TeamId | null;
  score: { A: number; B: number };
  kitColorA?: string;
  kitColorB?: string;
}

export function GoalOverlay({ scoringTeam, score, kitColorA, kitColorB }: Props) {
  const { t } = useTranslation();
  if (!scoringTeam) return null;

  const a = kitColorA ?? DEFAULT_TEAM_KIT_HEX.A;
  const b = kitColorB ?? DEFAULT_TEAM_KIT_HEX.B;
  const color = scoringTeam === "A" ? a : b;
  const teamLabel = scoringTeam === "A" ? "Team A" : "Team B";

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
      <div
        className="absolute inset-0"
        style={{ background: `radial-gradient(ellipse at center, ${color}22 0%, transparent 70%)` }}
      />

      <div
        className="relative flex flex-col items-center gap-3 px-16 py-10 rounded-3xl border"
        style={{
          background: `linear-gradient(135deg, ${color}18, ${color}08)`,
          borderColor: `${color}55`,
          boxShadow: `0 0 60px ${color}44, 0 0 120px ${color}22`,
          animation: "goal-pop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) both",
        }}
      >
        <div
          className="text-8xl font-black tracking-widest leading-none font-display"
          style={{ color, textShadow: `0 0 30px ${color}, 0 0 60px ${color}88` }}
        >
          {t("goalOverlay.goal")}
        </div>

        <div className="text-base font-semibold tracking-widest text-muted-foreground uppercase">
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
