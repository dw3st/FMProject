import type { RunStatus } from "@/lab/types";

interface Props {
  status: RunStatus;
}

export function RunQueue({ status }: Props) {
  const total = status.pairs.reduce((acc, p) => acc + p.total, 0);
  const done = status.pairs.reduce((acc, p) => acc + p.done, 0);
  const overallPct = total > 0 ? (done / total) * 100 : 0;

  return (
    <div className="space-y-4">
      <div className="bg-white/[0.03] border border-white/10 rounded p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold">{status.scenario.name}</h2>
          {status.completedAt ? (
            status.error ? (
              <span className="text-red-400 text-xs">error: {status.error}</span>
            ) : (
              <span className="text-emerald-400 text-xs">complete</span>
            )
          ) : (
            <span className="text-yellow-400 text-xs animate-pulse">running…</span>
          )}
        </div>
        <div className="h-2 bg-black/40 rounded overflow-hidden">
          <div
            className="h-full bg-emerald-500 transition-all"
            style={{ width: `${overallPct}%` }}
          />
        </div>
        <div className="text-xs text-white/50 mt-1">
          {done} / {total} matches ({overallPct.toFixed(1)}%)
        </div>
      </div>

      <div className="bg-white/[0.03] border border-white/10 rounded p-4">
        <h3 className="text-sm font-semibold mb-3">Pairs</h3>
        <ul className="space-y-1.5 text-xs">
          {status.pairs.map((p) => {
            const pct = p.total > 0 ? (p.done / p.total) * 100 : 0;
            const colorMap: Record<string, string> = {
              queued: "bg-white/10",
              running: "bg-yellow-500",
              done: "bg-emerald-500",
              error: "bg-red-500",
            };
            return (
              <li
                key={`${p.variantAId}__${p.variantBId}`}
                className="grid grid-cols-[1fr_auto_2fr_auto] gap-2 items-center"
              >
                <span className="text-white/70 truncate">
                  {p.variantAId}
                </span>
                <span className="text-white/40">vs</span>
                <span className="text-white/70 truncate">{p.variantBId}</span>
                <div className="flex items-center gap-2">
                  <div className="w-32 h-1.5 bg-black/40 rounded overflow-hidden">
                    <div
                      className={`h-full ${colorMap[p.status]} transition-all`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-white/40 w-16 text-right">
                    {p.done}/{p.total}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
