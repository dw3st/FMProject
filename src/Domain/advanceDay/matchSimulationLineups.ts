import type { Fixture } from "@/types/calendarTypes";
import type { MatchMarking, TacticsSave } from "@/types/tacticsTypes";
import { sanitizeSlotInstructions } from "@/Domain/tactics/slotInstructions";
import { DEFAULT_TACTICAL_STYLE } from "@/types/tacticsTypes";
import type { AiFormationRecord, Squad } from "@/types/playerTypes";
import type { TeamTactics } from "@/GameEngine/Domain/SimulateMatch";
import { aiFamiliarity, squadFamiliarityLevels } from "@/Domain/familiarity/familiarity";
import type { Formation } from "@/GameEngine/types";
import { getFormationSlots, type FormationShape } from "@/types/formationSlots";
import { DEFAULT_SIM_FORMATION_ID, formationForSimId, formationForTactics } from "@/Domain/matchFormations";
import { aiFormationRecord, aiSeasonKey, matchdayAiFormation } from "@/Domain/formation/aiFormation";
import {
  autoFillLineup,
  autoFillLineupWithFitness,
  buildSlotAlignedLineup,
  replaceUnavailableStarters,
  suggestRotation,
  applyRotation,
  type InjuredReplacement,
} from "@/Domain/lineupHelpers";
import type { RegistrationRule } from "@/types/registrationTypes";
import { limitForeignPool, matchdayPool } from "@/Domain/registration/rules";
import { isUnavailable } from "@/Domain/discipline/discipline";

/**
 * Registered players of one side for the competition of a match (`.claude/rules/game/registration.md`): the
 * lineup and the bench only come from `ids`; `rule.maxForeignMatchday` limits the foreigners named (XI + bench).
 */
export interface MatchRegistration {
  ids: Set<string>;
  rule: RegistrationRule;
  country: string;
}

/** The players an AI side may name for a match: registered, then the per-match foreign limit. */
export function registeredPool(squad: Squad, reg: MatchRegistration | undefined): Squad {
  if (!reg) return squad;
  const registered = squad.players.filter((p) => reg.ids.has(p.id));
  return { ...squad, players: limitForeignPool(registered, reg.rule, reg.country) };
}

function slotsFor(formation: Formation): ReturnType<typeof getFormationSlots> {
  return getFormationSlots(formation as unknown as FormationShape, "attacking");
}

/**
 * Resolves the lineup a human club actually takes to a match: the saved lineup when there is one,
 * otherwise the same fitness-aware auto-fill the AI uses. Exported so `/api/match-setup`
 * (`src/backend/routes.ts`) can fill in an empty saved lineup the exact same way for a LIVE match
 * — before this, a save that never touched the formation screen fell straight through to
 * `pickForRole` per slot (no fitness awareness at all) for a live match, while this headless path
 * (used when the human's fixture is resolved without the match screen) already fell back here.
 *
 * `date`, when given, excludes injured players from an auto-fill and, for a SAVED lineup, swaps out
 * any starter injured on `date` for the best eligible bench player (`replaceUnavailableStarters`) — a
 * saved lineup can go stale between the day it was saved and the day the fixture is played.
 * `injuredReplaced` lists any such swaps so a preview screen can warn the user.
 */
export interface RotationOverride {
  date: string;
  swaps: { out: string; in: string }[];
  optOut?: boolean;
}

export function resolveUserLineup(
  squad: Squad,
  formation: Formation,
  savedLineup: string[],
  date?: string,
  rotation?: { assistantRotation?: boolean; override?: RotationOverride | null },
  registration?: MatchRegistration,
): {
  lineup: string[];
  injuredReplaced: InjuredReplacement[];
  /** Tired-starter swaps NOT applied (the user may accept them on the preview). */
  rotationSuggestion: { out: string; in: string }[];
  /** Tired-starter swaps already applied (assistant on, or accepted override). */
  rotationApplied: { out: string; in: string }[];
  /** Players allowed on the team sheet (XI + bench) when registration applies; absent = everyone. */
  pool?: Set<string>;
} {
  const slots = slotsFor(formation);
  // No saved lineup (e.g. a career that never touched the formation screen) falls back to the same
  // fitness-aware auto-fill the AI uses, not the plain rating-only fill. See
  // `docs/superpowers/specs/2026-09-27-stamina-design.md` section 2.
  if (!savedLineup.length) {
    const pool = registeredPool(squad, registration);
    return {
      lineup: autoFillLineupWithFitness(slots, pool.players, date),
      injuredReplaced: [],
      rotationSuggestion: [],
      rotationApplied: [],
      ...(registration ? { pool: new Set(pool.players.map((p) => p.id)) } : {}),
    };
  }
  const aligned = buildSlotAlignedLineup(squad.players, savedLineup);
  const lineup = aligned.map((p) => p?.id ?? "");
  if (!date) return { lineup, injuredReplaced: [], rotationSuggestion: [], rotationApplied: [] };
  const swapped = replaceUnavailableStarters(slots, lineup, squad.players, date, registration?.ids);
  let fixed = swapped.lineup;
  const replaced = [...swapped.replaced];
  let poolPlayers = squad.players;
  let pool: Set<string> | undefined;
  if (registration) {
    const available = squad.players.filter((p) => registration.ids.has(p.id) && !isUnavailable(p, date));
    const day = matchdayPool(slots, fixed, available, registration.rule, registration.country);
    fixed = day.lineup;
    replaced.push(...day.replaced);
    const fixedSet = new Set(fixed.filter(Boolean));
    poolPlayers = [...squad.players.filter((p) => fixedSet.has(p.id)), ...day.bench];
    pool = new Set(poolPlayers.map((p) => p.id));
  }

  const suggestions = suggestRotation(slots, fixed, poolPlayers, date);
  const override = rotation?.override?.date === date ? rotation.override : null;
  let applied: { out: string; in: string }[] = [];
  let pending = suggestions;
  if (override) {
    applied = override.optOut ? [] : override.swaps.filter((s) => fixed.includes(s.out) && (!pool || pool.has(s.in)));
    const appliedOut = new Set(applied.map((s) => s.out));
    pending = suggestions.filter((s) => !appliedOut.has(s.out));
  } else if (rotation?.assistantRotation) {
    applied = suggestions;
    pending = [];
  }
  return {
    lineup: applyRotation(fixed, applied),
    injuredReplaced: replaced,
    rotationSuggestion: pending,
    rotationApplied: applied,
    ...(pool ? { pool } : {}),
  };
}

/** Detailed role per formation slot — index i is slot i, aligned with a slot-ordered lineup. */
export function slotRoles(formation: Formation): string[] {
  return slotsFor(formation).map((s) => s.role);
}

/**
 * autoFillLineup for a given formation's slots. `date`, when given, excludes players injured on
 * that date — omitted by `clubLevel` (`src/backend/continentalWorld.ts`, a fitness/injury-
 * independent strength rating) and by `/test`/`/lab` tooling, which compare squads on their own
 * terms regardless of any specific matchday.
 */
export function autoLineupForFormation(squad: Squad, formation: Formation, date?: string): string[] {
  return autoFillLineup(slotsFor(formation), squad.players, date);
}

/** Default 4-3-3 + autoFillLineup — same as AI opponents in league matches and /simulate. */
export function autoLineupDefaultFormation(squad: Squad, date?: string): string[] {
  return autoLineupForFormation(squad, formationForSimId(DEFAULT_SIM_FORMATION_ID), date);
}

/**
 * `autoLineupForFormation`, but resting a tired starter for a fresher bench player — see
 * `autoFillLineupWithFitness` and `docs/superpowers/specs/2026-09-27-stamina-design.md` §2. Used
 * for the AI/opponent XI actually put on the pitch for a match. NOT used by `clubLevel`
 * (`src/backend/continentalWorld.ts`) — a club's continental strength rating for qualification/pots
 * must stay fitness-independent — nor by the `/test` and `/lab` tooling (`QuickSimPanel`,
 * `SimulationScreen`, `balanceWorker`), which compare squads on their own terms. `date`, when
 * given, also excludes injured players from the whole candidate pool (starters and bench).
 */
export function autoLineupForFormationWithFitness(
  squad: Squad,
  formation: Formation,
  date?: string,
): string[] {
  return autoFillLineupWithFitness(slotsFor(formation), squad.players, date);
}

/** Default 4-3-3 + `autoFillLineupWithFitness` — the AI opponent's actual matchday XI. */
export function autoLineupDefaultFormationWithFitness(squad: Squad, date?: string): string[] {
  return autoLineupForFormationWithFitness(squad, formationForSimId(DEFAULT_SIM_FORMATION_ID), date);
}

/** An AI club's season formation record (stored one when still valid, else chosen now). */
export function aiRecordFor(squad: Squad, date: string): AiFormationRecord {
  return aiFormationRecord(squad, aiSeasonKey(squad.leagueSlug, date), DEFAULT_TACTICAL_STYLE);
}

/**
 * The formation an AI club plays against `opponent` on `date`: its season pick, or its defensive
 * shape when the opponent is much stronger (`matchdayAiFormation`). Used by the headless path and by
 * `/api/match-setup` for the live opponent, so both agree.
 */
export function aiMatchFormation(
  squad: Squad,
  opponent: Squad | null | undefined,
  date: string,
): { formation: Formation; record: AiFormationRecord } {
  const record = aiRecordFor(squad, date);
  const oppLevel = opponent ? aiRecordFor(opponent, date).level : undefined;
  return { formation: formationForSimId(matchdayAiFormation(record, oppLevel)), record };
}

/**
 * Resolves engine formations and per-slot lineups for a fixture.
 * Human club uses saved tactics + lineup; an AI club plays its own formation
 * (`src/Domain/formation/aiFormation.ts`) with the fitness-aware auto-fill.
 */
export function computeMatchSimulationLineups(
  fixture: Fixture,
  homeSquad: Squad,
  awaySquad: Squad,
  playerSquadId: string | undefined,
  tactics: TacticsSave | null,
  rotationOverride?: RotationOverride | null,
  matchMarking?: MatchMarking | null,
  registration?: { home?: MatchRegistration; away?: MatchRegistration },
): {
  homeFormation: Formation;
  homeLineup: string[];
  awayFormation: Formation;
  awayLineup: string[];
  /** Any of the human's saved-lineup starters swapped out for being injured on `fixture.date`. */
  userInjuredReplaced: InjuredReplacement[];
  userRotationApplied: { out: string; in: string }[];
  /** Tactics per engine side (A = home): the user's saved style/axes, the AI's default style. */
  tactics: { A: TeamTactics; B: TeamTactics };
  /** Season formation records of the AI sides, for the caller to store on the squads. */
  aiFormations: { home?: AiFormationRecord; away?: AiFormationRecord };
  /** Players each side may name (XI + bench) when registration applies; absent = everyone available. */
  pools: { home?: Set<string>; away?: Set<string> };
} {
  const homePool = registeredPool(homeSquad, registration?.home);
  const awayPool = registeredPool(awaySquad, registration?.away);
  const idsOf = (s: Squad) => new Set(s.players.map((p) => p.id));
  const date = fixture.date;
  // AI clubs follow the implicit familiarity rule (`src/Domain/familiarity`), nothing stored.
  const aiTactics: TeamTactics = { style: DEFAULT_TACTICAL_STYLE, familiarity: aiFamiliarity(DEFAULT_TACTICAL_STYLE) };
  const userPlays =
    Boolean(playerSquadId) && (fixture.home === playerSquadId || fixture.away === playerSquadId);

  if (!userPlays) {
    const home = aiMatchFormation(homeSquad, awaySquad, date);
    const away = aiMatchFormation(awaySquad, homeSquad, date);
    return {
      homeFormation: home.formation,
      homeLineup: autoLineupForFormationWithFitness(homePool, home.formation, date),
      awayFormation: away.formation,
      awayLineup: autoLineupForFormationWithFitness(awayPool, away.formation, date),
      userInjuredReplaced: [],
      userRotationApplied: [],
      tactics: { A: aiTactics, B: aiTactics },
      aiFormations: { home: home.record, away: away.record },
      pools: {
        ...(registration?.home ? { home: idsOf(homePool) } : {}),
        ...(registration?.away ? { away: idsOf(awayPool) } : {}),
      },
    };
  }

  const t = tactics ?? ({
    formation: DEFAULT_SIM_FORMATION_ID,
    tactical_style: DEFAULT_TACTICAL_STYLE,
    lineup: [],
  } satisfies TacticsSave);

  const userFormation = formationForTactics(t);
  const userSquad = fixture.home === playerSquadId ? homeSquad : awaySquad;
  const userTactics: TeamTactics = {
    style: t.tactical_style,
    axesOverride: t.axesOverride,
    familiarity: squadFamiliarityLevels(userSquad, t.tactical_style),
    ...(t.setPieceTakers ? { setPieceTakers: t.setPieceTakers } : {}),
    ...userInstructions(userFormation, t, matchMarking, date),
  };
  const rot = { assistantRotation: t.assistantRotation, override: rotationOverride };

  if (fixture.home === playerSquadId) {
    const user = resolveUserLineup(homeSquad, userFormation, t.lineup ?? [], date, rot, registration?.home);
    const ai = aiMatchFormation(awaySquad, homeSquad, date);
    return {
      homeFormation: userFormation,
      homeLineup: user.lineup,
      awayFormation: ai.formation,
      awayLineup: autoLineupForFormationWithFitness(awayPool, ai.formation, date),
      userInjuredReplaced: user.injuredReplaced,
      userRotationApplied: user.rotationApplied,
      tactics: { A: userTactics, B: aiTactics },
      aiFormations: { away: ai.record },
      pools: {
        ...(user.pool ? { home: user.pool } : {}),
        ...(registration?.away ? { away: idsOf(awayPool) } : {}),
      },
    };
  }

  const user = resolveUserLineup(awaySquad, userFormation, t.lineup ?? [], date, rot, registration?.away);
  const ai = aiMatchFormation(homeSquad, awaySquad, date);
  return {
    homeFormation: ai.formation,
    homeLineup: autoLineupForFormationWithFitness(homePool, ai.formation, date),
    awayFormation: userFormation,
    awayLineup: user.lineup,
    userInjuredReplaced: user.injuredReplaced,
    userRotationApplied: user.rotationApplied,
    tactics: { A: aiTactics, B: userTactics },
    aiFormations: { home: ai.record },
    pools: {
      ...(registration?.home ? { home: idsOf(homePool) } : {}),
      ...(user.pool ? { away: user.pool } : {}),
    },
  };
}

/**
 * The human side's player instructions for a fixture (`.claude/rules/game/player-instructions.md`):
 * the saved per-slot instructions (sanitized against the formation) and the match marking of
 * `date` (roster ids). The AI never gets either.
 */
function userInstructions(
  formation: Formation,
  tactics: TacticsSave,
  matchMarking: MatchMarking | null | undefined,
  date: string,
): Pick<TeamTactics, "slotInstructions" | "manMarks"> {
  const slotInstructions = sanitizeSlotInstructions(formation, tactics.slotInstructions);
  const marks = matchMarking && matchMarking.date === date ? matchMarking.marks : [];
  return {
    ...(slotInstructions.length > 0 ? { slotInstructions } : {}),
    ...(marks.length > 0 ? { manMarks: marks.map((m) => ({ slot: m.slot, targetRosterId: m.targetId })) } : {}),
  };
}
