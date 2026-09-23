import { Bar } from "react-chartjs-2";
import type { ChartOptions } from "chart.js";
import { ensureChartsRegistered } from "@/lab/components/chartSetup";
import type { PerMatchView, ScenarioResult } from "@/lab/types";

ensureChartsRegistered();

interface Props {
  result: ScenarioResult;
  aId: string;
  bId: string;
  labelFor: (id: string) => string;
}

export function PairDetail({ result, aId, bId, labelFor }: Props) {
  const pair = result.pairs.find((p) => p.variantAId === aId && p.variantBId === bId);
  if (!pair) {
    return (
      <div className="text-white/50 text-sm bg-white/[0.03] border border-white/10 rounded p-4">
        No data for {labelFor(aId)} vs {labelFor(bId)}.
      </div>
    );
  }

  const winA = (pair.teamA.wins / pair.matches) * 100;
  const winB = (pair.teamB.wins / pair.matches) * 100;
  const drawPct = (pair.draws / pair.matches) * 100;

  const rows: { stat: string; key: keyof PerMatchView }[] = [
    { stat: "Avg goals",         key: "avgGoals" },
    { stat: "Avg xG",            key: "avgXg" },
    { stat: "Avg shots",         key: "avgShots" },
    { stat: "Shot conv%",        key: "shotConversionPct" },
    { stat: "Avg assists",       key: "avgAssists" },
    { stat: "Pass attempts",     key: "avgPassesAttempted" },
    { stat: "Pass acc%",         key: "passAccuracyPct" },
    { stat: "Through balls",     key: "avgThroughBalls" },
    { stat: "TB completion%",    key: "throughBallCompletionPct" },
    { stat: "Loose balls won",   key: "avgLooseBallsWon" },
    { stat: "Switch passes",     key: "avgSwitchPlays" },
    { stat: "Avg tackles",       key: "avgTackles" },
    { stat: "Avg intercept",     key: "avgInterceptions" },
    { stat: "Dribbles won",      key: "avgDribblesWon" },
    { stat: "Dribbles lost",     key: "avgDribblesLost" },
    { stat: "Drib success%",     key: "dribbleSuccessPct" },
  ];

  const data = {
    labels: rows.map((r) => r.stat),
    datasets: [
      {
        label: labelFor(aId),
        data: rows.map((r) => Number(pair.teamA[r.key])),
        backgroundColor: "#10b981",
      },
      {
        label: labelFor(bId),
        data: rows.map((r) => Number(pair.teamB[r.key])),
        backgroundColor: "#ef4444",
      },
    ],
  };

  const options: ChartOptions<"bar"> = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: "y",
    plugins: {
      legend: { labels: { boxWidth: 12, padding: 12 } },
      tooltip: { backgroundColor: "rgba(20,20,20,0.95)" },
    },
    scales: {
      x: { grid: { color: "rgba(255,255,255,0.05)" } },
      y: { grid: { color: "rgba(255,255,255,0.05)" } },
    },
  };

  return (
    <div className="space-y-4">
      <div className="bg-white/[0.03] border border-white/10 rounded p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">
            {labelFor(aId)} <span className="text-white/40">vs</span> {labelFor(bId)}
          </h3>
          <div className="text-xs text-white/50">{pair.matches} matches</div>
        </div>
        <div className="grid grid-cols-3 gap-4 text-center">
          <ResultBadge label={labelFor(aId)} pct={winA} colour="emerald" />
          <ResultBadge label="Draw"            pct={drawPct} colour="gray" />
          <ResultBadge label={labelFor(bId)} pct={winB} colour="rose" />
        </div>
      </div>

      <div className="bg-white/[0.03] border border-white/10 rounded p-4">
        <h3 className="text-sm font-semibold mb-3 text-white/80">Side-by-side stats</h3>
        <div className="h-[460px]">
          <Bar data={data} options={options} />
        </div>
      </div>
    </div>
  );
}

function ResultBadge({
  label,
  pct,
  colour,
}: {
  label: string;
  pct: number;
  colour: "emerald" | "gray" | "rose";
}) {
  const styles: Record<string, string> = {
    emerald: "bg-emerald-500/15 border-emerald-500/40 text-emerald-300",
    gray:    "bg-white/10 border-white/20 text-white/70",
    rose:    "bg-rose-500/15 border-rose-500/40 text-rose-300",
  };
  return (
    <div className={`rounded border ${styles[colour]} py-3`}>
      <div className="text-xs uppercase tracking-wide opacity-70">{label}</div>
      <div className="text-2xl font-bold">{pct.toFixed(1)}%</div>
    </div>
  );
}
