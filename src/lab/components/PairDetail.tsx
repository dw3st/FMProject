import { Fragment } from "react";
import { Bar } from "react-chartjs-2";
import type { ChartOptions } from "chart.js";
import { ensureChartsRegistered } from "@/lab/components/chartSetup";
import type { CongestionMatchResult, PerMatchView, ScenarioResult } from "@/lab/types";

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

  // Knockout-only rows: hidden entirely for non-knockout / quickSim runs where
  // neither side recorded any of the underlying events (all-zero on both sides).
  const knockoutRowDefs: { stat: string; key: keyof PerMatchView; gateKey: keyof PerMatchView }[] = [
    { stat: "Extra time%",       key: "extraTimePct",     gateKey: "extraTimePct" },
    { stat: "Shootout wins%",    key: "shootoutWinPct",   gateKey: "shootoutWinPct" },
    { stat: "Penalty conv%",     key: "penaltyConversionPct", gateKey: "avgPenaltiesTaken" },
  ];
  const knockoutRows = knockoutRowDefs.filter(
    (r) => Number(pair.teamA[r.gateKey]) > 0 || Number(pair.teamB[r.gateKey]) > 0,
  );

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
    ...knockoutRows,
    { stat: "Avg tackles",       key: "avgTackles" },
    { stat: "Avg intercept",     key: "avgInterceptions" },
    { stat: "Dribbles won",      key: "avgDribblesWon" },
    { stat: "Dribbles lost",     key: "avgDribblesLost" },
    { stat: "Drib success%",     key: "dribbleSuccessPct" },
    { stat: "Avg end energy",    key: "avgEndEnergy" },
    { stat: "Fatigue subs",      key: "avgFatigueSubs" },
    { stat: "Injuries",          key: "avgInjuries" },
    { stat: "Out of position",   key: "avgOutOfPosition" },
    { stat: "Morale",            key: "avgMorale" },
    { stat: "Fouls",             key: "avgFouls" },
    { stat: "Yellow cards",      key: "avgYellowCards" },
    { stat: "Red cards",         key: "avgRedCards" },
    { stat: "Penalties won",     key: "avgPenaltiesAwarded" },
    { stat: "Penalty goals",     key: "avgPenaltyGoals" },
    { stat: "Offsides",          key: "avgOffsides" },
    { stat: "Crosses",           key: "avgCrosses" },
    { stat: "Cross completion%", key: "crossCompletionPct" },
    { stat: "Aerial duels won",  key: "avgAerialDuelsWon" },
    { stat: "Header goals",      key: "avgHeaderGoals" },
    { stat: "Long balls",        key: "avgLongBalls" },
    { stat: "Corners",           key: "avgCorners" },
    { stat: "Free kicks",        key: "avgFreeKicks" },
    { stat: "Direct FK shots",   key: "avgDirectFreeKickShots" },
    { stat: "Direct FK goals",   key: "avgDirectFreeKickGoals" },
    { stat: "Set-piece goals",   key: "avgSetPieceGoals" },
    { stat: "Set-piece goal%",   key: "setPieceGoalPct" },
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

      {pair.congestion && pair.congestion.length > 0 && (
        <CongestionTable congestion={pair.congestion} labelA={labelFor(aId)} labelB={labelFor(bId)} />
      )}
    </div>
  );
}

/** Fixture-congestion breakdown — one row per match-in-sequence index (see CongestionSpec). */
function CongestionTable({
  congestion,
  labelA,
  labelB,
}: {
  congestion: CongestionMatchResult[];
  labelA: string;
  labelB: string;
}) {
  const cols: { label: string; key: keyof PerMatchView; fmt?: (v: number) => string }[] = [
    { label: "Win%",      key: "wins",        fmt: (v) => `${v.toFixed(1)}%` },
    { label: "Avg goals", key: "avgGoals" },
    { label: "Avg xG",    key: "avgXg" },
    { label: "End energy", key: "avgEndEnergy" },
    { label: "Fatigue subs", key: "avgFatigueSubs" },
    { label: "Injuries", key: "avgInjuries" },
  ];

  return (
    <div className="bg-white/[0.03] border border-white/10 rounded p-4">
      <h3 className="text-sm font-semibold mb-3 text-white/80">Fixture congestion — per match in sequence</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-white/50 text-left">
              <th className="py-1 pr-3">Match</th>
              <th className="py-1 pr-3">Side</th>
              {cols.map((c) => (
                <th key={c.label} className="py-1 pr-3 text-right">{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {congestion.map((cm) => {
              // "Win%" isn't a PerMatchView field — `wins` is a raw count, so derive the share here.
              const winPctA = (cm.teamA.wins / cm.matches) * 100;
              const winPctB = (cm.teamB.wins / cm.matches) * 100;
              const valueFor = (side: "A" | "B", key: keyof PerMatchView) =>
                key === "wins" ? (side === "A" ? winPctA : winPctB) : Number((side === "A" ? cm.teamA : cm.teamB)[key]);
              return (
                <Fragment key={cm.matchIndex}>
                  <tr className="border-t border-white/5">
                    <td className="py-1 pr-3 text-white/70" rowSpan={2}>Match {cm.matchIndex + 1}</td>
                    <td className="py-1 pr-3 text-emerald-300">{labelA}</td>
                    {cols.map((c) => (
                      <td key={c.label} className="py-1 pr-3 text-right text-white">
                        {(c.fmt ?? ((v: number) => v.toFixed(2)))(valueFor("A", c.key))}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-1 pr-3 text-rose-300">{labelB}</td>
                    {cols.map((c) => (
                      <td key={c.label} className="py-1 pr-3 text-right text-white">
                        {(c.fmt ?? ((v: number) => v.toFixed(2)))(valueFor("B", c.key))}
                      </td>
                    ))}
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
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
