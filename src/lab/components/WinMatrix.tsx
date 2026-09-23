import { useMemo } from "react";
import type { PairResult, ScenarioResult } from "@/lab/types";

interface Props {
  result: ScenarioResult;
  labelFor: (id: string) => string;
  onSelect: (aId: string, bId: string) => void;
}

/**
 * Symmetric N×N win-rate matrix.
 * Each cell (row, col) shows the row variant's win-rate against the col variant.
 * Diagonal is skipped. Pairs are stored with the lower-index variant as teamA,
 * so we look up in both directions.
 */
export function WinMatrix({ result, labelFor, onSelect }: Props) {
  const variants = result.scenario.variants;

  const lookup = useMemo(() => {
    const m = new Map<string, PairResult>();
    for (const p of result.pairs) {
      m.set(`${p.variantAId}__${p.variantBId}`, p);
      m.set(`${p.variantBId}__${p.variantAId}`, p);
    }
    return m;
  }, [result.pairs]);

  function getWinRate(rowId: string, colId: string): { winRate: number; drawPct: number; matches: number } | null {
    const p = lookup.get(`${rowId}__${colId}`);
    if (!p || p.matches === 0) return null;
    const isRowA = p.variantAId === rowId;
    const rowWins = isRowA ? p.teamA.wins : p.teamB.wins;
    return {
      winRate: (rowWins / p.matches) * 100,
      drawPct: (p.draws / p.matches) * 100,
      matches: p.matches,
    };
  }

  function colorFor(winRate: number, drawPct: number): string {
    const t = (winRate - 50) / 50; // -1..+1
    if (Math.abs(t) < 0.05) {
      return `rgba(140,140,160,${0.25 + drawPct / 200})`;
    }
    if (t > 0) return `rgba(16,185,129,${0.18 + Math.min(0.65, t * 0.65)})`;
    return `rgba(239,68,68,${0.18 + Math.min(0.65, -t * 0.65)})`;
  }

  return (
    <div className="bg-white/[0.03] border border-white/10 rounded p-4 overflow-auto">
      <p className="text-xs text-white/50 mb-3">
        Cells show each row variant's win-rate % against the column variant.
      </p>
      <div
        className="inline-grid gap-px bg-white/5 p-px rounded"
        style={{
          gridTemplateColumns: `auto repeat(${variants.length}, minmax(72px, 1fr))`,
        }}
      >
        {/* Header row */}
        <div className="px-2 py-1 text-xs text-white/40" />
        {variants.map((v) => (
          <div
            key={`h-${v.id}`}
            className="px-2 py-1 text-xs text-white/70 bg-black/30 font-medium text-center"
            title={v.id}
          >
            {labelFor(v.id)}
          </div>
        ))}

        {/* Data rows */}
        {variants.map((rowV) => (
          <>
            <div
              key={`row-${rowV.id}`}
              className="px-2 py-1 text-xs text-white/70 bg-black/30 font-medium flex items-center"
              title={rowV.id}
            >
              {labelFor(rowV.id)}
            </div>
            {variants.map((colV) => {
              if (rowV.id === colV.id) {
                return (
                  <div
                    key={`c-${rowV.id}-${colV.id}`}
                    className="bg-white/5 text-white/20 text-xs flex items-center justify-center"
                  >
                    —
                  </div>
                );
              }
              const data = getWinRate(rowV.id, colV.id);
              if (!data) {
                return (
                  <div
                    key={`c-${rowV.id}-${colV.id}`}
                    className="bg-black/20 text-white/20 text-xs flex items-center justify-center"
                  >
                    –
                  </div>
                );
              }
              const bg = colorFor(data.winRate, data.drawPct);
              // canonical pair ids for onSelect (lower-index first)
              const p = lookup.get(`${rowV.id}__${colV.id}`)!;
              return (
                <button
                  key={`c-${rowV.id}-${colV.id}`}
                  onClick={() => onSelect(p.variantAId, p.variantBId)}
                  className="px-2 py-2 text-xs hover:outline hover:outline-1 hover:outline-white/40 transition-all"
                  style={{ background: bg }}
                  title={`${labelFor(rowV.id)} ${data.winRate.toFixed(1)}% wins vs ${labelFor(colV.id)}`}
                >
                  <div className="font-bold text-white">{data.winRate.toFixed(0)}%</div>
                  <div className="text-[10px] text-white/70">D {data.drawPct.toFixed(0)}%</div>
                </button>
              );
            })}
          </>
        ))}
      </div>

      <Legend />
    </div>
  );
}

function Legend() {
  const stops = [0, 25, 50, 75, 100];
  return (
    <div className="flex items-center gap-2 mt-3 text-[10px] text-white/50">
      <span>Loses</span>
      <div className="flex">
        {stops.map((s) => {
          const t = (s - 50) / 50;
          const bg =
            Math.abs(t) < 0.05
              ? "rgba(140,140,160,0.4)"
              : t > 0
                ? `rgba(16,185,129,${0.18 + t * 0.65})`
                : `rgba(239,68,68,${0.18 - t * 0.65})`;
          return (
            <div
              key={s}
              className="w-8 h-2 first:rounded-l last:rounded-r"
              style={{ background: bg }}
            />
          );
        })}
      </div>
      <span>Wins</span>
    </div>
  );
}
