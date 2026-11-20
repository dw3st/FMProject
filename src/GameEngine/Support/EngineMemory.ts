/**
 * Engine memory (engine rebuild stage 19, `live-modes.md`): the engine state that lives in module variables, outside
 * `GameState` — the per-team tactic configs, the decision caches with hysteresis (defensive and off-ball intents), the
 * held actions, the shoulder runs, the highlight tracker's last shot. A mid-match snapshot (`LiveSnapshot`) needs it so
 * a match restored from the snapshot (the highlights worker, a resumed page) plays exactly as the one it was taken from.
 *
 * Each module registers its own part where the variable is declared (`registerEngineMemory`); this file is a leaf (no
 * engine imports), so registering never makes an import cycle. A module that adds cross-tick state registers it too,
 * or the highlights mode (`Support/ForecastCore.ts`) drifts from the live match.
 */

interface MemoryPart {
  export(): unknown;
  import(value: unknown): void;
}

const parts = new Map<string, MemoryPart>();

/** Registers a module's cross-tick state under `name` (one name per module part). */
export function registerEngineMemory(name: string, part: MemoryPart): void {
  parts.set(name, part);
}

/** A record keyed by team (or any object of plain data) restored in place. */
export function recordPart(obj: Record<string, unknown>): MemoryPart {
  return {
    export: () => structuredClone(obj),
    import: (v) => {
      for (const k of Object.keys(obj)) delete obj[k];
      Object.assign(obj, structuredClone(v as Record<string, unknown>));
    },
  };
}

/** A Map restored in place. */
export function mapPart<K, V>(map: Map<K, V>): MemoryPart {
  return {
    export: () => structuredClone([...map]),
    import: (v) => {
      map.clear();
      for (const [k, val] of structuredClone(v as Array<[K, V]>)) map.set(k, val);
    },
  };
}

export type EngineMemory = Record<string, unknown>;

/** Plain-data copy of every registered part (structured-cloneable: it crosses to a Worker). */
export function exportEngineMemory(): EngineMemory {
  const out: EngineMemory = {};
  for (const [name, part] of parts) out[name] = part.export();
  return out;
}

/** Restores every part present in `mem` (a part missing from an older snapshot keeps its current value). */
export function importEngineMemory(mem: EngineMemory): void {
  for (const [name, part] of parts) if (name in mem) part.import(mem[name]);
}

/** Names registered (tests). */
export function engineMemoryParts(): string[] {
  return [...parts.keys()];
}
