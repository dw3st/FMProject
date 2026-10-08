/**
 * Manual player corrections (`data_process/curated/playerCorrections.json`, see
 * `.claude/rules/data/espn-import.md` → "Correções manuais de jogadores"): fix a player's natural
 * position and/or his overall by hand, on top of the world the importers produce.
 *
 * Pure module — no filesystem. `scripts/applyPlayerCorrections.ts` reads and writes the squads.
 */
import { shiftToOverall } from "@/../scripts/openfootball/recalibrate";
import { bestSpecificRole, computeOverallAvg, fixedNaturalRole } from "@/Domain/playerRating";
import { DETAILED_ROLES, preferredRole } from "@/Domain/positions/positionAptitude";
import { getMainRole } from "@/Domain/roles";
import type { DetailedRole, PlayerStatsRecord, RosterPlayer } from "@/types/playerTypes";

export interface PlayerCorrection {
  /** Only for whoever reads the file; never checked against the player. */
  name?: string;
  naturalPosition?: DetailedRole;
  overall?: number;
}

export type PlayerCorrections = Record<string, PlayerCorrection>;

/** Overall already within this of the target: nothing to rescale (keeps the step idempotent). */
export const OVERALL_TOLERANCE = 0.05;

function isDetailedRole(v: unknown): v is DetailedRole {
  return typeof v === "string" && (DETAILED_ROLES as readonly string[]).includes(v);
}

/** Validates the corrections file; throws on anything unexpected (curated data must be exact). */
export function parseCorrections(raw: unknown): PlayerCorrections {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("playerCorrections: expected an object keyed by player id");
  const out: PlayerCorrections = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`playerCorrections[${id}]: expected an object`);
    const v = value as Record<string, unknown>;
    for (const k of Object.keys(v)) {
      if (!["name", "naturalPosition", "overall"].includes(k)) throw new Error(`playerCorrections[${id}]: unknown field "${k}"`);
    }
    const c: PlayerCorrection = {};
    if (v.name !== undefined) {
      if (typeof v.name !== "string") throw new Error(`playerCorrections[${id}].name: expected a string`);
      c.name = v.name;
    }
    if (v.naturalPosition !== undefined) {
      if (!isDetailedRole(v.naturalPosition)) throw new Error(`playerCorrections[${id}].naturalPosition: unknown position ${JSON.stringify(v.naturalPosition)}`);
      c.naturalPosition = v.naturalPosition;
    }
    if (v.overall !== undefined) {
      if (typeof v.overall !== "number" || !Number.isFinite(v.overall) || v.overall <= 0 || v.overall >= 10)
        throw new Error(`playerCorrections[${id}].overall: expected a number between 0 and 10`);
      c.overall = v.overall;
    }
    if (c.naturalPosition === undefined && c.overall === undefined) throw new Error(`playerCorrections[${id}]: nothing to correct`);
    out[id] = c;
  }
  return out;
}

export interface PlayerLocation { file: string; index: number }

/**
 * Finds each corrected id among the squads (`file` → players). Throws when an id is missing or
 * appears more than once (a duplicate player in the world is a broken import, not something to
 * paper over here).
 */
export function locatePlayers(
  squads: ReadonlyMap<string, readonly Pick<RosterPlayer, "id">[]>,
  ids: readonly string[],
): Map<string, PlayerLocation> {
  const wanted = new Set(ids);
  const found = new Map<string, PlayerLocation[]>();
  for (const [file, players] of squads) {
    players.forEach((p, index) => {
      if (!wanted.has(p.id)) return;
      found.set(p.id, [...(found.get(p.id) ?? []), { file, index }]);
    });
  }
  const out = new Map<string, PlayerLocation>();
  for (const id of ids) {
    const at = found.get(id) ?? [];
    if (at.length === 0) throw new Error(`playerCorrections: player ${id} not found in any squad`);
    if (at.length > 1) throw new Error(`playerCorrections: player ${id} appears in ${at.length} squads (${at.map((a) => a.file).join(", ")})`);
    out.set(id, at[0]!);
  }
  return out;
}

export type AttrWeights = Record<string, { attrWeights?: Record<string, number> }>;

export interface CorrectionResult {
  player: RosterPlayer;
  changed: boolean;
  before: { position: DetailedRole; overall: number };
  after: { position: DetailedRole; overall: number };
}

/**
 * Applies one correction: writes `naturalPosition` (must be in the player's main line) and, with
 * `overall`, rescales the attributes with the recalibration's single shift (`shiftToOverall`) on
 * the attributes weighted by the natural position until the overall hits the target. Drops the
 * cached `overallAvg` of a changed player. Idempotent: applying the result again changes nothing.
 */
export function applyCorrection(player: RosterPlayer, correction: PlayerCorrection, roles: AttrWeights): CorrectionResult {
  const before = { position: preferredRole(player), overall: computeOverallAvg(player) };
  let next: RosterPlayer = { ...player, stats: { ...player.stats } };

  if (correction.naturalPosition) {
    const line = getMainRole(player.positions[0] ?? "CM");
    next.naturalPosition = correction.naturalPosition;
    if (fixedNaturalRole(next) !== correction.naturalPosition)
      throw new Error(`playerCorrections[${player.id}]: ${correction.naturalPosition} is not a ${line} position`);
  }

  if (correction.overall !== undefined) {
    const target = correction.overall;
    next = rescaleToOverall(next, target, roles);
  }

  const changed = JSON.stringify(withoutCache(next)) !== JSON.stringify(withoutCache(player));
  if (changed) delete next.overallAvg;
  else next = player;
  return { player: next, changed, before, after: { position: preferredRole(next), overall: computeOverallAvg(next) } };
}

/**
 * Rescales the attributes so the overall hits `target`: the recalibration's single shift (`shiftToOverall`) on the
 * attributes weighted by the natural position (fixed, else the best of the line). Returns the same player when the
 * overall is already within `OVERALL_TOLERANCE` (idempotent). Shared by the manual corrections and the market
 * recalibration (`scripts/transfermarkt/apply.ts`).
 */
export function rescaleToOverall(player: RosterPlayer, target: number, roles: AttrWeights): RosterPlayer {
  if (Math.abs(computeOverallAvg(player) - target) <= OVERALL_TOLERANCE) return player;
  const role = fixedNaturalRole(player) ?? bestSpecificRole(player.stats, player.positions[0] ?? "CM");
  const weights = roles[role]?.attrWeights ?? roles.CM?.attrWeights ?? {};
  const overallOf = (s: PlayerStatsRecord) => computeOverallAvg({ ...player, stats: s });
  return { ...player, stats: shiftToOverall(player.id, player.stats, weights, target, overallOf) };
}

function withoutCache(p: RosterPlayer): RosterPlayer {
  const { overallAvg: _cached, ...rest } = p;
  return rest as RosterPlayer;
}

/**
 * Serialises a JSON file (a squad object, or a top-level array like `leagueData.json`) the way the
 * original was written (indentation, line endings and trailing newline).
 */
export function formatLike(original: string, value: unknown): string {
  const m = /^[{[]\r?\n([ \t]+)["{[]/.exec(original);
  const indent = m ? m[1]! : undefined;
  const text = indent ? JSON.stringify(value, null, indent) : JSON.stringify(value);
  const eol = original.includes("\r\n") ? "\r\n" : "\n";
  const body = indent && eol === "\r\n" ? text.replace(/\n/g, "\r\n") : text;
  return /\r?\n$/.test(original) ? body + eol : body;
}
