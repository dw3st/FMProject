import { useEffect, useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import type { TeamId } from "@/GameEngine/types";
import {
  HEATMAP_CELLS, HEATMAP_COLS, HEATMAP_ROWS, displayAttackDir, displayColRow, heatmapCells,
  type HeatmapWindow, type PossessionHeatmap as HeatmapAcc,
} from "@/Domain/match/possessionHeatmap";
import { PITCH_LENGTH, PITCH_WIDTH } from "@/GameEngine/Domain/pitch";
import { OptionChips } from "@/GameInterface/ui/OptionChips";
import { Icon } from "@/GameInterface/Icons";

/** How often the card re-reads the accumulator (real time). Never per tick. */
const REFRESH_MS = 1000;
const CELL_W = PITCH_LENGTH / HEATMAP_COLS;
const CELL_H = PITCH_WIDTH / HEATMAP_ROWS;
/** Per-viewer convenience: whether the card is expanded (#127). Never required: absent = open. */
const OPEN_KEY = "fm.match.heatmapOpen";

function readOpen(): boolean {
  try {
    return globalThis.localStorage?.getItem(OPEN_KEY) !== "0";
  } catch {
    return true;
  }
}

function writeOpen(open: boolean): void {
  try {
    globalThis.localStorage?.setItem(OPEN_KEY, open ? "1" : "0");
  } catch {
    // Private window / blocked storage: the choice just isn't remembered.
  }
}

/**
 * Small possession heat map of the live match (Etapa 35, #108): where the ball was while the chosen team
 * had it, in the last 10 played minutes or the whole match. Reads the accumulator the screen fills on every
 * emitted state (`src/Domain/match/possessionHeatmap.ts`) once a second; drawing only. `mirror` = the user
 * plays away: drawn like the pitch (#98), home side on the left.
 */
export function PossessionHeatmap({
  heatmap,
  mirror,
  teams = { A: "A", B: "B" },
}: {
  heatmap: RefObject<HeatmapAcc | null>;
  mirror: boolean;
  /** Which engine team is "mine" / "opponent" (the live match: A / B). */
  teams?: { A: TeamId; B: TeamId };
}) {
  const { t } = useTranslation();
  const [side, setSide] = useState<"mine" | "opponent">("mine");
  const [period, setPeriod] = useState<HeatmapWindow>("recent");
  const team = side === "mine" ? teams.A : teams.B;
  const [cells, setCells] = useState<Float64Array>(() => new Float64Array(HEATMAP_CELLS));
  const [open, setOpen] = useState<boolean>(readOpen);
  const toggle = () => {
    const next = !open;
    setOpen(next);
    writeOpen(next);
  };

  useEffect(() => {
    if (!open) return;
    const read = () => {
      const acc = heatmap.current;
      if (acc) setCells(heatmapCells(acc, team, period));
    };
    read();
    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      read();
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [heatmap, team, period, open]);

  let max = 0;
  for (const v of cells) if (v > max) max = v;
  const dir = displayAttackDir(team, mirror);
  const label = t("match.heatmap.aria", { team: t(`match.heatmap.${side}`), window: t(`match.heatmap.${period}`) });

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        title={t(open ? "match.heatmap.hide" : "match.heatmap.show")}
        className="flex min-h-8 items-center justify-between gap-2 bg-transparent border-0 p-0 cursor-pointer font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground hover:text-foreground"
      >
        {t("match.heatmap.title")}
        <Icon name={open ? "chevron-up" : "chevron-down"} size={16} />
      </button>
      {open && <>
      <OptionChips
        aria-label={t("match.heatmap.team")}
        options={[
          { key: "mine", label: t("match.heatmap.mine") },
          { key: "opponent", label: t("match.heatmap.opponent") },
        ]}
        value={side}
        onChange={setSide}
      />
      <OptionChips
        aria-label={t("match.heatmap.period")}
        options={[
          { key: "recent", label: t("match.heatmap.recent") },
          { key: "all", label: t("match.heatmap.all") },
        ]}
        value={period}
        onChange={setPeriod}
      />
      <svg
        viewBox={`0 0 ${PITCH_LENGTH} ${PITCH_WIDTH}`}
        role="img"
        aria-label={label}
        className={`w-full rounded-sm bg-secondary/30 ${side === "mine" ? "text-primary" : "text-chart-4"}`}
      >
        {max > 0 && Array.from(cells, (v, i) => {
          if (v <= 0) return null;
          const { col, row } = displayColRow(i, mirror);
          return (
            <rect
              key={i}
              x={col * CELL_W}
              y={row * CELL_H}
              width={CELL_W}
              height={CELL_H}
              fill="currentColor"
              fillOpacity={0.12 + 0.78 * (v / max)}
            />
          );
        })}
        <g fill="none" className="stroke-border" strokeWidth={0.8}>
          <rect x={0.4} y={0.4} width={PITCH_LENGTH - 0.8} height={PITCH_WIDTH - 0.8} />
          <line x1={PITCH_LENGTH / 2} y1={0} x2={PITCH_LENGTH / 2} y2={PITCH_WIDTH} />
          <circle cx={PITCH_LENGTH / 2} cy={PITCH_WIDTH / 2} r={10} />
          <rect x={0} y={PITCH_WIDTH / 2 - 22} width={18} height={44} />
          <rect x={PITCH_LENGTH - 18} y={PITCH_WIDTH / 2 - 22} width={18} height={44} />
        </g>
      </svg>
      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
        {dir === -1 && <Icon name="arrow-left" size={16} />}
        {t("match.heatmap.attack")}
        {dir === 1 && <Icon name="arrow-right" size={16} />}
      </span>
      {max === 0 && <span className="text-sm text-muted-foreground">{t("match.heatmap.empty")}</span>}
      </>}
    </div>
  );
}
