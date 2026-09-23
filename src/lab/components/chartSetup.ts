/**
 * Chart.js controller registration. Imported once at the top of any chart
 * component file before rendering.
 */

import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  Filler,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  RadarController,
  RadialLinearScale,
  Title,
  Tooltip,
} from "chart.js";

let registered = false;

export function ensureChartsRegistered(): void {
  if (registered) return;
  Chart.register(
    CategoryScale,
    LinearScale,
    RadialLinearScale,
    BarController,
    BarElement,
    LineController,
    LineElement,
    PointElement,
    RadarController,
    ArcElement,
    Filler,
    Title,
    Tooltip,
    Legend,
  );
  // Dark-theme defaults that fit the app
  Chart.defaults.color = "rgba(255,255,255,0.7)";
  Chart.defaults.borderColor = "rgba(255,255,255,0.1)";
  Chart.defaults.font.size = 11;
  registered = true;
}

export const SERIES_COLORS = [
  "#10b981", "#3b82f6", "#f59e0b", "#ef4444",
  "#a855f7", "#ec4899", "#22d3ee", "#84cc16",
];
