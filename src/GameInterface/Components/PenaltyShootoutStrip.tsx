import { useTranslation } from "react-i18next";
import type { ShootoutState } from "@/GameEngine/types";

/** One row of dots per team: green = scored, red = missed, grey = still to come (first 5). */
export function PenaltyShootoutStrip({
  shootout,
  nameA,
  nameB,
}: {
  shootout: ShootoutState;
  nameA: string;
  nameB: string;
}) {
  const { t } = useTranslation();
  const shown = shootout.kicks.slice(0, shootout.shown);
  const row = (team: "A" | "B", name: string) => {
    const kicks = shown.filter((k) => k.team === team);
    const pending = Math.max(0, 5 - kicks.length);
    return (
      <div className="flex items-center gap-2">
        <span className="w-28 truncate text-xs text-white/70">{name}</span>
        <div className="flex gap-1">
          {kicks.map((k, i) => (
            <span key={i} className={`h-3 w-3 rounded-full ${k.scored ? "bg-emerald-500" : "bg-rose-500"}`} />
          ))}
          {Array.from({ length: pending }, (_, i) => (
            <span key={`p${i}`} className="h-3 w-3 rounded-full bg-white/15" />
          ))}
        </div>
        <span className="ml-auto font-display font-black tabular-nums">{shootout.score[team]}</span>
      </div>
    );
  };
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 space-y-1 min-w-64">
      <div className="text-[10px] uppercase tracking-widest text-white/40">{t("match.penalties")}</div>
      {row("A", nameA)}
      {row("B", nameB)}
    </div>
  );
}
