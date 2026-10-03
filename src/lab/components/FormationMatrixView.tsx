import { useCallback, useEffect, useMemo, useState } from "react";
import { mirrorGoals, summarizeMatrix, type PairRaw } from "@/lab/formationMatrixSummary";

/**
 * Lab "Formation matrix" (Etapa 19, #63): every formation against a reference set with the same
 * club on both sides (full engine), edge = win% − loss% against the mean of the other formations,
 * plus the goal volume of each formation's mirror match. Target: every edge within ±8 p.p. and
 * every mirror within ±15% of the mean. Runs on the lab server (`/api/lab/matrix`), polled here.
 */

interface MatrixPlan { league: string; rows: string[]; refs: string[]; matches: number; mirror: boolean }
interface MatrixRun {
  id: string; plan: MatrixPlan; startedAt: string; completedAt?: string; error?: string;
  done: number; total: number; pairs?: PairRaw[];
}

const LEAGUES = ["premier_league", "of_championship", "bundesliga", "la_liga", "serie_a", "brazil_serie_a"];
const DEFAULT_REFS = ["4-3-3", "4-4-2", "4-2-3-1", "3-5-2"];
const EDGE_BAND = 8;
const MIRROR_BAND = 0.15;

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`${res.url} → ${res.status}`);
  return res.json() as Promise<T>;
}

const sg = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}`;

function edgeClass(edge: number): string {
  if (Math.abs(edge) <= EDGE_BAND) return "text-white/80";
  return edge > 0 ? "text-emerald-400" : "text-red-400";
}

export function FormationMatrixView() {
  const [formations, setFormations] = useState<string[]>([]);
  const [league, setLeague] = useState("premier_league");
  const [matches, setMatches] = useState(100);
  const [refs, setRefs] = useState<string[]>(DEFAULT_REFS);
  const [mirror, setMirror] = useState(true);
  const [workers, setWorkers] = useState(4);
  const [runs, setRuns] = useState<MatrixRun[]>([]);
  const [run, setRun] = useState<MatrixRun | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshRuns = useCallback(async () => {
    setRuns(await json<MatrixRun[]>(await fetch("/api/lab/matrix")));
  }, []);

  useEffect(() => {
    void fetch("/api/lab/formations").then((r) => json<{ supported: string[] }>(r)).then((c) => setFormations(c.supported));
    void refreshRuns();
  }, [refreshRuns]);

  // Poll the open run until it finishes.
  useEffect(() => {
    if (!run || run.completedAt) return;
    const t = setInterval(async () => {
      try {
        const next = await json<MatrixRun>(await fetch(`/api/lab/matrix/${run.id}`));
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
      const { id } = await json<{ id: string }>(await fetch("/api/lab/matrix", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ league, rows: formations, refs, matches, mirror, workers }),
      }));
      setRun(await json<MatrixRun>(await fetch(`/api/lab/matrix/${id}`)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const open = async (id: string) => setRun(await json<MatrixRun>(await fetch(`/api/lab/matrix/${id}`)));

  const pairs = run?.pairs ?? [];
  const summary = useMemo(() => summarizeMatrix(pairs), [pairs]);
  const mirrors = useMemo(() => mirrorGoals(pairs), [pairs]);
  const mirrorMean = mirrors.length ? mirrors.reduce((a, m) => a + m.goals, 0) / mirrors.length : 0;
  const cols = run?.plan.refs ?? refs;
  const outside = summary.filter((r) => Math.abs(r.edge) > EDGE_BAND).length;

  return (
    <div className="min-h-screen bg-background text-foreground px-6 py-5">
      <h1 className="font-display font-black uppercase tracking-tight text-3xl md:text-4xl leading-none">Formation matrix</h1>
      <p className="text-sm text-muted-foreground mt-2">
        Every formation against the references, same club on both sides. Target: edge within ±{EDGE_BAND} p.p., mirror goals within ±{MIRROR_BAND * 100}%.
      </p>

      <section className="mt-6 flex flex-wrap items-end gap-6">
        <label className="flex flex-col gap-1">
          <span className="font-display font-bold uppercase tracking-[0.08em] text-xs text-muted-foreground">League</span>
          <select value={league} onChange={(e) => setLeague(e.target.value)} className="rounded border border-border h-10 px-3 bg-transparent text-sm">
            {LEAGUES.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-display font-bold uppercase tracking-[0.08em] text-xs text-muted-foreground">Matches per pair</span>
          <input type="number" min={10} max={1000} step={10} value={matches} onChange={(e) => setMatches(Number(e.target.value))}
            className="rounded border border-border h-10 px-3 bg-transparent text-sm w-28 tabular-nums" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-display font-bold uppercase tracking-[0.08em] text-xs text-muted-foreground">Workers</span>
          <input type="number" min={1} max={4} value={workers} onChange={(e) => setWorkers(Number(e.target.value))}
            className="rounded border border-border h-10 px-3 bg-transparent text-sm w-20 tabular-nums" />
        </label>
        <label className="flex items-center gap-2 h-10 text-sm">
          <input type="checkbox" checked={mirror} onChange={(e) => setMirror(e.target.checked)} /> Mirror matches
        </label>
        <button type="button" onClick={start} disabled={formations.length === 0 || refs.length === 0 || (!!run && !run.completedAt)}
          className="bg-primary text-primary-foreground font-semibold rounded h-10 px-5 disabled:opacity-50">Run</button>
      </section>

      <section className="mt-4">
        <span className="font-display font-bold uppercase tracking-[0.08em] text-xs text-muted-foreground">References</span>
        <div className="mt-2 flex flex-wrap gap-2">
          {formations.map((f) => {
            const on = refs.includes(f);
            return (
              <button key={f} type="button" onClick={() => setRefs(on ? refs.filter((r) => r !== f) : [...refs, f])}
                className={`rounded border px-3 py-1.5 text-sm tabular-nums ${on ? "border-primary text-primary" : "border-border text-muted-foreground"}`}>
                {f}
              </button>
            );
          })}
        </div>
      </section>

      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

      {run && (
        <section className="mt-6">
          <h2 className="font-display font-black uppercase text-xl leading-none">{run.plan.league} · {run.plan.matches} per pair</h2>
          <p className="text-sm text-muted-foreground mt-1 tabular-nums">
            {run.completedAt ? (run.error ? `Failed: ${run.error}` : `Done — ${outside} formation(s) outside ±${EDGE_BAND}`) : `Running… ${run.done}/${run.total} tasks`}
          </p>
          {!run.completedAt && (
            <div className="mt-2 bg-border h-1.5 rounded w-64">
              <div className="bg-primary h-1.5 rounded" style={{ width: `${(100 * run.done) / Math.max(1, run.total)}%` }} />
            </div>
          )}

          {summary.length > 0 && (
            <table className="mt-4 text-sm tabular-nums">
              <thead>
                <tr className="font-display font-bold uppercase tracking-[0.08em] text-xs text-muted-foreground text-left">
                  <th className="pr-4 py-2">Formation</th><th className="pr-4">Matches</th><th className="pr-4">Edge</th>
                  {cols.map((c) => <th key={c} className="pr-4">vs {c}</th>)}
                  <th className="pr-4">Goals for</th><th className="pr-4">against</th><th className="pr-4">Shots for</th><th>against</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((r) => (
                  <tr key={r.formation} className="border-t border-border">
                    <td className="pr-4 py-2 font-semibold">{r.formation}</td>
                    <td className="pr-4">{r.matches}</td>
                    <td className={`pr-4 font-display font-bold ${edgeClass(r.edge)}`}>{sg(r.edge)}</td>
                    {cols.map((c) => <td key={c} className="pr-4 text-white/70">{r.edges[c] === undefined ? "—" : sg(r.edges[c]!)}</td>)}
                    <td className="pr-4">{r.goalsFor.toFixed(2)}</td><td className="pr-4">{r.goalsAgainst.toFixed(2)}</td>
                    <td className="pr-4">{r.shotsFor.toFixed(2)}</td><td>{r.shotsAgainst.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {mirrors.length > 0 && (
            <>
              <h2 className="font-display font-black uppercase text-xl leading-none mt-6">Mirror match</h2>
              <table className="mt-3 text-sm tabular-nums">
                <thead>
                  <tr className="font-display font-bold uppercase tracking-[0.08em] text-xs text-muted-foreground text-left">
                    <th className="pr-4 py-2">Formation</th><th className="pr-4">Matches</th><th className="pr-4">Goals</th><th className="pr-4">× mean</th><th>Shots</th>
                  </tr>
                </thead>
                <tbody>
                  {mirrors.map((m) => {
                    const ratio = m.goals / mirrorMean;
                    return (
                      <tr key={m.formation} className="border-t border-border">
                        <td className="pr-4 py-2 font-semibold">{m.formation}</td>
                        <td className="pr-4">{m.matches}</td>
                        <td className="pr-4">{m.goals.toFixed(2)}</td>
                        <td className={`pr-4 ${Math.abs(ratio - 1) > MIRROR_BAND ? "text-red-400" : "text-white/80"}`}>{ratio.toFixed(2)}</td>
                        <td>{m.shots.toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}
        </section>
      )}

      {runs.length > 0 && (
        <section className="mt-8">
          <h2 className="font-display font-black uppercase text-xl leading-none">Runs</h2>
          <ul className="mt-2 text-sm">
            {runs.map((r) => (
              <li key={r.id} className="border-t border-border py-2 flex gap-4 items-center">
                <button type="button" onClick={() => open(r.id)} className="text-muted-foreground hover:text-foreground">Open</button>
                <span className="tabular-nums">{r.startedAt.slice(0, 16).replace("T", " ")}</span>
                <span>{r.plan.league} · {r.plan.matches}/pair · refs {r.plan.refs.join(", ")}</span>
                <span className="text-muted-foreground">{r.completedAt ? (r.error ? "failed" : "done") : `${r.done}/${r.total}`}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
