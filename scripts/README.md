# scripts/

Long-running or one-off scripts. Run with `bun scripts/<name>.ts`.

---

## Current scripts

| Script | Purpose | Status |
|---|---|---|
| `formation-balance.ts` | Runs N matches for each formation pair (currently 4-3-3 / 4-4-2 / 3-5-2). Spawns one Bun Worker per pair, runs **in parallel**. | Working |
| `formation-balance-worker.ts` | Spawned by the parent via `new Worker()`. Runs N matches for a single pair, posts progress + result via `postMessage`. | Working |
| `_bench.ts` | Quick per-match timing benchmark. `bun scripts/_bench.ts [matches]` | Working (~42 ms/match) |
| `testSim.ts` | Sanity check: loads a real save's squads, runs one match, prints result. | Working |
| `migrateSquadFinances.ts` | One-off save migration. | Working |

---

## formation-balance architecture

```
bun scripts/formation-balance.ts --matches 200 --out results.json --pretty
```

Three Bun Workers run concurrently (one per formation pair). Each Worker has its
own module registry, so the `Statistics` / `PlayerRating` singletons in the
engine don't collide across parallel simulations. The parent fans out with
`Promise.all(pairs.map(runPair))` and aggregates results as each worker posts
back.

Typical runtime: 200 matches × 3 pairs ≈ **10 s** (vs ~27 s sequential).

### Why Workers (and not child processes)

An earlier version used `Bun.spawn()` child processes, sequentially, as a
workaround for two bugs that are now fixed:

1. **`assignMarkTargets` infinite loop** — a defensive-positioning 2-opt swap
   loop could oscillate forever under certain mark/threat distributions.
   Fixed in `DefensivePositioning.ts`.
2. **Match-level hang** — reproduced as "child stalls at ~125/200 with 100% CPU
   and no progress output." Same root cause: the infinite loop was eating the
   match tick inside the child.

With the loop fixed, Workers work reliably on macOS arm64 and give real parallel
throughput. The child-process scaffolding (`formation-balance-child.ts`) was
removed.

---

## Do NOT re-add

Deleted during cleanup — these were diagnostic scaffolding that duplicated each
other and made the folder unreadable:

- `sim-hang-hunt.ts`
- `sim-child-minimal.ts`
- `sim-child-exact.ts`
- `sim-profile.ts`
- `sim-profile-node.ts`
- `sim-tick-probe.ts`
- `sim-wrapper-probe.ts`
- `worker-probe.ts`
- `formation-balance-child.ts`

If diagnostics are needed again, add them to `SimulateMatch.ts` (gated by an env
var) rather than creating a new script.
