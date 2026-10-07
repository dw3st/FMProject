import { useTranslation } from "react-i18next";
import type { ShootoutState } from "@/GameEngine/types";

/** One row of dots per team: green = scored, red = missed, grey = still to come (first 5). */
export function PenaltyShootoutStrip({
  shootout,
  nameA,
  nameB,
  order = ["A", "B"],
}: {
  shootout: ShootoutState;
  nameA: string;
  nameB: string;
  /** Row order, top first (#98: home side on top when the user plays away). */
  order?: readonly ["A" | "B", "A" | "B"];
}) {
  const { t } = useTranslation();
  const shown = shootout.kicks.slice(0, shootout.shown);
  const complete = shootout.shown === shootout.kicks.length;
  const row = (team: "A" | "B", name: string) => {
    const kicks = shown.filter((k) => k.team === team);
    const pending = complete ? 0 : Math.max(0, 5 - kicks.length);
    return (
      <div className="flex items-center gap-2">
        <span className="w-28 truncate text-sm text-foreground">{name}</span>
        <div className="flex flex-wrap gap-1">
          {kicks.map((k, i) => (
            <span key={i} className={`h-3 w-3 rounded-full ${k.scored ? "bg-chart-2" : "bg-destructive"}`} />
          ))}
          {Array.from({ length: pending }, (_, i) => (
            <span key={`p${i}`} className="h-3 w-3 rounded-full bg-foreground/15" />
          ))}
        </div>
        <span className="ml-auto font-display font-black tabular-nums">{shootout.score[team]}</span>
      </div>
    );
  };
  return (
    <div className="rounded-lg border border-border bg-foreground/5 px-3 py-2 space-y-1 min-w-64">
      <div className="text-[13px] uppercase tracking-[0.08em] text-muted-foreground font-display font-bold">{t("match.penalties")}</div>
      {order.map((team) => (
        <div key={team}>{row(team, team === "A" ? nameA : nameB)}</div>
      ))}
    </div>
  );
}
