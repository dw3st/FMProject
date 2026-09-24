/**
 * Promo scenario registry. Built-in scenarios are imported as JSON and can be
 * augmented at runtime by user-saved scenarios in localStorage.
 */
import type { GameState } from "@/GameEngine/types";
import elClasicoRaw from "./el-clasico.json";

/**
 * Stripped-of-meta scenario record. The `_meta` block is the only addition
 * we make on top of the real GameState shape.
 */
export interface ScenarioMeta {
  id: string;
  label: string;
  description?: string;
  homeName?: string;
  awayName?: string;
  /** Only true for user-saved scenarios — built-ins cannot be deleted. */
  custom?: boolean;
}

export interface Scenario {
  meta: ScenarioMeta;
  state: GameState;
}

const STORAGE_KEY = "fmproject-promo-scenarios";

function splitMeta(raw: unknown): Scenario {
  const obj = raw as Record<string, unknown> & {
    _meta?: ScenarioMeta;
    [k: string]: unknown;
  };
  const meta = (obj._meta ?? { id: "unknown", label: "Unnamed" }) as ScenarioMeta;
  const stateClone: Record<string, unknown> = { ...obj };
  delete stateClone._meta;
  return { meta, state: stateClone as unknown as GameState };
}

const BUILT_IN: Scenario[] = [splitMeta(elClasicoRaw)];

/** Returns all available scenarios — built-ins first, then localStorage saves. */
export function listScenarios(): Scenario[] {
  const customs: Scenario[] = [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      for (const entry of Object.values(parsed)) {
        try {
          const s = splitMeta(entry);
          s.meta.custom = true;
          customs.push(s);
        } catch {
          // skip malformed entry
        }
      }
    }
  } catch {
    // localStorage unavailable
  }
  return [...BUILT_IN, ...customs];
}

/** Lookup by id. Returns first match (built-in beats custom on id collision). */
export function getScenario(id: string): Scenario | null {
  const all = listScenarios();
  return all.find((s) => s.meta.id === id) ?? null;
}

/** Save a custom scenario (or overwrite). Built-in ids are not protected — saving
 *  with the same id as a built-in produces a custom override that takes precedence
 *  on the picker UI.
 */
export function saveCustomScenario(meta: ScenarioMeta, state: GameState): void {
  const raw = localStorage.getItem(STORAGE_KEY);
  const parsed: Record<string, unknown> = raw ? JSON.parse(raw) : {};
  parsed[meta.id] = { _meta: { ...meta, custom: true }, ...state };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
}

/** Delete a custom scenario by id. Returns true if removed. */
export function deleteCustomScenario(id: string): boolean {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return false;
  const parsed: Record<string, unknown> = JSON.parse(raw);
  if (!(id in parsed)) return false;
  delete parsed[id];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
  return true;
}

/** Parse a pasted GameState (with optional _meta header) and validate the shape. */
export function parseScenario(json: string): Scenario {
  const raw = JSON.parse(json) as Record<string, unknown>;
  if (!Array.isArray(raw.players)) {
    throw new Error("Invalid scenario: missing players[]");
  }
  if (!raw.formationA || !raw.formationB) {
    throw new Error("Invalid scenario: missing formationA / formationB");
  }
  if (typeof raw.matchPhase !== "string") {
    throw new Error("Invalid scenario: missing matchPhase");
  }
  return splitMeta(raw);
}

/** Serialize a Scenario back to pretty JSON (with _meta at top). */
export function serializeScenario(scenario: Scenario): string {
  return JSON.stringify({ _meta: scenario.meta, ...scenario.state }, null, 2);
}

export const DEFAULT_SCENARIO_ID = BUILT_IN[0]!.meta.id;
