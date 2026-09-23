import { Bar } from "react-chartjs-2";
import type { ChartOptions } from "chart.js";
import { ensureChartsRegistered } from "@/lab/components/chartSetup";
import type { VariantSummary } from "@/lab/types";

ensureChartsRegistered();

interface Props {
  variants: VariantSummary[];
}

const baseOpts: ChartOptions<"bar"> = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { labels: { boxWidth: 12, padding: 16 } },
    tooltip: { backgroundColor: "rgba(20,20,20,0.95)" },
  },
  scales: {
    x: { grid: { color: "rgba(255,255,255,0.05)" } },
    y: { grid: { color: "rgba(255,255,255,0.05)" } },
  },
};

export function SummaryBars({ variants }: Props) {
  const labels = variants.map((v) => v.label);

  const resultData = {
    labels,
    datasets: [
      {
        label: "Win %",
        data: variants.map((v) => v.winRate),
        backgroundColor: "#10b981",
        stack: "result",
      },
      {
        label: "Draw %",
        data: variants.map((v) => v.drawRate),
        backgroundColor: "#a3a3a3",
        stack: "result",
      },
      {
        label: "Loss %",
        data: variants.map((v) => v.lossRate),
        backgroundColor: "#ef4444",
        stack: "result",
      },
    ],
  };

  const resultOpts: ChartOptions<"bar"> = {
    ...baseOpts,
    scales: {
      x: { stacked: true, grid: { color: "rgba(255,255,255,0.05)" } },
      y: {
        stacked: true,
        ticks: { callback: (v) => `${v}%` },
        grid: { color: "rgba(255,255,255,0.05)" },
      },
    },
  };

  const statsData = {
    labels,
    datasets: [
      { label: "Goals",          data: variants.map((v) => v.avgGoals),          backgroundColor: "#10b981" },
      { label: "Goals conceded", data: variants.map((v) => v.avgGoalsConceded), backgroundColor: "#ef4444" },
      { label: "xG",             data: variants.map((v) => v.avgXg),             backgroundColor: "#34d399" },
      { label: "xG conceded",    data: variants.map((v) => v.avgXgConceded),    backgroundColor: "#f87171" },
      { label: "Shots",          data: variants.map((v) => v.avgShots),          backgroundColor: "#3b82f6" },
    ],
  };

  return (
    <div className="space-y-6">
      <Card title="Result rates (per variant, across all matchups)">
        <div className="h-[320px]">
          <Bar data={resultData} options={resultOpts} />
        </div>
      </Card>

      <Card title="Avg goals & xG (for / against)">
        <div className="h-[320px]">
          <Bar data={statsData} options={baseOpts} />
        </div>
      </Card>

      <Card title="Variant table">
        <table className="w-full text-xs">
          <thead className="text-white/50">
            <tr>
              <th className="text-left py-1">Variant</th>
              <th className="text-right">Win %</th>
              <th className="text-right">Goals</th>
              <th className="text-right">xG</th>
              <th className="text-right">Shots</th>
              <th className="text-right">Pass acc%</th>
              <th className="text-right">Tackles</th>
              <th className="text-right">Intercep</th>
              <th className="text-right">Drib %</th>
            </tr>
          </thead>
          <tbody>
            {variants.map((v) => (
              <tr key={v.variantId} className="border-t border-white/5">
                <td className="py-1">{v.label}</td>
                <td className="text-right text-emerald-400">{v.winRate.toFixed(1)}</td>
                <td className="text-right">{v.avgGoals}</td>
                <td className="text-right">{v.avgXg}</td>
                <td className="text-right">{v.avgShots}</td>
                <td className="text-right">{v.passAccuracyPct.toFixed(1)}</td>
                <td className="text-right">{v.avgTackles}</td>
                <td className="text-right">{v.avgInterceptions}</td>
                <td className="text-right">{v.dribbleSuccessPct.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white/[0.03] border border-white/10 rounded p-4">
      <h3 className="text-sm font-semibold mb-3 text-white/80">{title}</h3>
      {children}
    </div>
  );
}
