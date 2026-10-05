import { useCallback, useEffect, useMemo, useState } from "react";
import { mergeInstrPairs, rel, summarizeInstr, type InstrPairRaw } from "@/lab/instructionMatrixSummary";

/**
 * Lab "/matrix" — Instructions mode (Etapa 27, `player-instructions.md`): every role variant on the
 * symmetric slots of its role in its natural formation against the default, same club on both
 * sides; pressing, the random package and man-marking. Targets: edge within ±5 p.p., mirror goals
 * and shots within ±5% of the default mirror. Runs on the lab server (`/api/lab/instr-matrix`).
 */

interface InstrRun {
  id: string; startedAt: string; completedAt?: string; error?: string;
  done: number; total: number; pairs?: InstrPairRaw[];
}

const PARTS = ["variants", "press", "random", "marking", "base"] as const;
const EDGE_BAND = 5;
const VOLUME_BAND = 0.05;

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`${res.url} → ${res.status}`);
  return res.json() as Promise<T>;
}

const sg = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}`;
const pc = (n: number) => `${n >= 0 ? "+" : ""}${(100 * n).toFixed(0)}%`;

export function InstructionMatrixView() {
  const [parts, setParts] = useState<string[]>([...PARTS]);
  const [matches, setMatches] = useState(100);
  const [mirrorMatches, setMirrorMatches] = useState(50);
  const [baseMatches, setBaseMatches] = useState(100);
  const [workers, setWorkers] = useState(3);
  const [runs, setRuns] = useState<InstrRun[]>([]);
  const [run, setRun] = useState<InstrRun | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshRuns = useCallback(async () => {
    setRuns(await json<InstrRun[]>(await fetch("/api/lab/instr-matrix")));
  }, []);
  useEffect(() => { void refreshRuns(); }, [refreshRuns]);

  useEffect(() => {
    if (!run || run.completedAt) return;
    const t = setInterval(async () => {
      try {
        const next = await json<InstrRun>(await fetch(`/api/lab/instr-matrix/${run.id}`));
        setRun(next);
        if (next.completedAt) void refreshRuns();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    }, 3000);
    return () => clearInterval(t);
  }, [run, refreshRuns]);

  const start = async () => {
    setError(null);
    try {
      const { id } = await json<{ id: string }>(await fetch("/api/lab/instr-matrix", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ league: "premier_league", parts, matches, mirrorMatches, baseMatches, workers }),
      }));
      setRun(await json<InstrRun>(await fetch(`/api/lab/instr-matrix/${id}`)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const summary = useMemo(() => mergeInstrPairs(run?.pairs ?? []).map(summarizeInstr), [run]);
  const base = new Map(summary.filter((s) => s.kind === "base" && s.key === "default").map((s) => [s.formation, s]));
  const mirrors = new Map(summary.filter((s) => s.kind === "mirror").map((s) => [s.key, s]));
  const edges = summary.filter((s) => s.kind === "edge").sort((a, b) => a.key.localeCompare(b.key));

  return (
    <div className="min-h-screen bg-background text-foreground px-6 py-5">
      <h1 className="font-display font-black uppercase tracking-tight text-3xl md:text-4xl leading-none">Instruction matrix</h1>
      <p className="text-sm text-muted-foreground mt-2">
        Role variants, pressing and man-marking against the default, same club on both sides (premier_league, fitness 88).
        Target: edge within ±{EDGE_BAND} p.p., mirror goals/shots within ±{VOLUME_BAND * 100}% of the default mirror.
      </p>

      <section className="mt-6 flex flex-wrap items-end gap-6">
        <div className="flex flex-col gap-1">
          <span className="font-display font-bold uppercase tracking-[0.08em] text-xs text-muted-foreground">Parts</span>
          <div className="flex gap-3 h-10 items-center text-sm">
            {PARTS.map((p) => (
              <label key={p} className="flex items-center gap-1">
                <input type="checkbox" checked={parts.includes(p)} onChange={(e) => setParts(e.target.checked ? [...parts, p] : parts.filter((x) => x !== p))} /> {p}
              </label>
            ))}
          </div>
        </div>
        {([
          ["Edge matches", matches, setMatches],
          ["Mirror matches", mirrorMatches, setMirrorMatches],
          ["Base matches", baseMatches, setBaseMatches],
          ["Workers", workers, setWorkers],
        ] as const).map(([label, value, set]) => (
          <label key={label} className="flex flex-col gap-1">
            <span className="font-display font-bold uppercase tracking-[0.08em] text-xs text-muted-foreground">{label}</span>
            <input type="number" min={0} max={label === "Workers" ? 3 : 1200} value={value} onChange={(e) => set(Number(e.target.value))}
              className="rounded border border-border h-10 px-3 bg-transparent text-sm w-24 tabular-nums" />
          </label>
        ))}
        <button type="button" onClick={start} disabled={parts.length === 0 || (!!run && !run.completedAt)}
          className="bg-primary text-primary-foreground font-semibold rounded h-10 px-5 disabled:opacity-50">Run</button>
      </section>

      {error && <p className="text-sm text-destructive mt-3">{error}</p>}
      {run && (
        <p className="text-sm text-muted-foreground mt-3 tabular-nums">
          {run.id} · {run.done}/{run.total} tasks{run.completedAt ? " · done" : ""}{run.error ? ` · ${run.error}` : ""}
        </p>
      )}

      {edges.length > 0 && (
        <table className="mt-6 w-full text-sm tabular-nums">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-1 pr-3">Set</th><th className="py-1 pr-3">Formation</th><th className="py-1 pr-3 text-right">Matches</th>
              <th className="py-1 pr-3 text-right">Edge</th><th className="py-1 pr-3 text-right">Goals X/Y</th><th className="py-1 pr-3 text-right">Shots X/Y</th>
              <th className="py-1 pr-3 text-right">Mirror goals</th><th className="py-1 pr-3 text-right">Mirror shots</th>
            </tr>
          </thead>
          <tbody>
            {edges.map((s) => {
              const m = mirrors.get(s.key);
              const b = base.get(s.formation);
              return (
                <tr key={`${s.key}-${s.formation}`} className="border-t border-border/50">
                  <td className="py-1 pr-3">{s.key}</td>
                  <td className="py-1 pr-3 text-muted-foreground">{s.formation}</td>
                  <td className="py-1 pr-3 text-right">{s.matches}</td>
                  <td className={`py-1 pr-3 text-right ${Math.abs(s.edge) > EDGE_BAND ? "text-red-400" : ""}`}>{sg(s.edge)}</td>
                  <td className="py-1 pr-3 text-right">{s.goalsX.toFixed(2)}/{s.goalsY.toFixed(2)}</td>
                  <td className="py-1 pr-3 text-right">{s.shotsX.toFixed(2)}/{s.shotsY.toFixed(2)}</td>
                  <td className="py-1 pr-3 text-right">{m && b ? pc(rel(m.goals, b.goals)) : "—"}</td>
                  <td className="py-1 pr-3 text-right">{m && b ? pc(rel(m.shots, b.shots)) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <section className="mt-8">
        <h2 className="font-display font-black uppercase text-xl leading-none">Saved runs</h2>
        <ul className="mt-3 space-y-1 text-sm">
          {runs.map((r) => (
            <li key={r.id}>
              <button type="button" className="text-primary" onClick={async () => setRun(await json<InstrRun>(await fetch(`/api/lab/instr-matrix/${r.id}`)))}>
                {r.id}
              </button>{" "}
              <span className="text-muted-foreground">{r.done}/{r.total}{r.completedAt ? "" : " (running)"}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
