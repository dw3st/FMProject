import { Radar } from "react-chartjs-2";
import type { ChartOptions } from "chart.js";
import { ensureChartsRegistered, SERIES_COLORS } from "@/lab/components/chartSetup";
import type { VariantSummary } from "@/lab/types";

ensureChartsRegistered();

interface Props {
  variants: VariantSummary[];
}

/**
 * Stat fingerprint per variant. Each axis is normalised 0..100 across the
 * full set so values are directly comparable.
 */
export function StatRadar({ variants }: Props) {
  if (variants.length === 0) return null;

  const axes: { key: keyof VariantSummary; label: string; invert?: boolean }[] = [
    { key: "winRate",            label: "Win %" },
    { key: "avgGoals",           label: "Goals" },
    { key: "avgXg",              label: "xG" },
    { key: "avgShots",           label: "Shots" },
    { key: "passAccuracyPct",    label: "Pass acc%" },
    { key: "avgTackles",         label: "Tackles" },
    { key: "avgInterceptions",   label: "Intercep" },
    { key: "dribbleSuccessPct",  label: "Drib %" },
    { key: "avgGoalsConceded",   label: "Goals conceded", invert: true },
  ];

  const maxByAxis = axes.map((axis) => {
    const vals = variants.map((v) => Number(v[axis.key] ?? 0));
    return Math.max(...vals, 0.01);
  });

  const data = {
    labels: axes.map((a) => a.label),
    datasets: variants.map((v, i) => {
      const colour = SERIES_COLORS[i % SERIES_COLORS.length];
      return {
        label: v.label,
        data: axes.map((axis, ai) => {
          const max = maxByAxis[ai] ?? 1;
          const raw = Number(v[axis.key] ?? 0);
          const norm = max > 0 ? (raw / max) * 100 : 0;
          return axis.invert ? 100 - norm : norm;
        }),
        borderColor: colour,
        backgroundColor: `${colour}33`, // ~20% alpha
        pointBackgroundColor: colour,
        borderWidth: 1.5,
      };
    }),
  };

  const options: ChartOptions<"radar"> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: "bottom", labels: { boxWidth: 12, padding: 12 } },
      tooltip: { backgroundColor: "rgba(20,20,20,0.95)" },
    },
    scales: {
      r: {
        suggestedMin: 0,
        suggestedMax: 100,
        angleLines: { color: "rgba(255,255,255,0.1)" },
        grid: { color: "rgba(255,255,255,0.1)" },
        pointLabels: { color: "rgba(255,255,255,0.8)", font: { size: 11 } },
        ticks: {
          color: "rgba(255,255,255,0.4)",
          backdropColor: "transparent",
          showLabelBackdrop: false,
          stepSize: 25,
        },
      },
    },
  };

  return (
    <div className="bg-white/[0.03] border border-white/10 rounded p-4">
      <h3 className="text-sm font-semibold mb-3 text-white/80">
        Stat fingerprint (each axis normalised across variants; "goals conceded" inverted so larger = better)
      </h3>
      <div className="h-[520px]">
        <Radar data={data} options={options} />
      </div>
    </div>
  );
}
