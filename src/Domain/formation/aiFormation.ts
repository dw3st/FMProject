/**
 * AI formation choice (Etapa 18, #59). Pure and deterministic: an AI club picks one of the 17
 * ready-made formations per season from what its squad can field, its tactical style and a seeded
 * per-club identity; against a much stronger opponent it drops into a defensive shape.
 * See `.claude/rules/game/formations.md`.
 */
import type { AiFormationRecord, RosterPlayer, Squad } from "@/types/playerTypes";
import type { TacticalStyle } from "@/types/tacticsTypes";
import { DEFAULT_TACTICAL_STYLE } from "@/types/tacticsTypes";
import { FORMATION_IDS, formationForSimId } from "@/Domain/matchFormations";
import { autoFillLineup } from "@/Domain/lineupHelpers";
import { getFormationSlots, type FormationShape } from "@/types/formationSlots";
import { aptitudeFor, slotValue } from "@/Domain/positions/positionAptitude";
import { seedFrom } from "@/Domain/cups/cupIds";
import { LEAGUE_SCHEDULE_CONFIGS } from "@/Domain/season/leagueScheduleConfig";
import { AI_FORMATION } from "@/Domain/formation/aiFormationConfig";

export interface AiFormationScore {
  id: string;
  /** Mean slot value of the auto XI for this formation. */
  fit: number;
  /** False when the XI is incomplete or has an `unsuitable` starter. */
  eligible: boolean;
  /** fit − baseline + prior − openness + style + jitter (only meaningful when eligible). */
  score: number;
}

/**
 * Season key for the seed: the league's season start year. Cross-year leagues (and unknown slugs)
 * roll in July, calendar-year leagues in January.
 */
export function aiSeasonKey(leagueSlug: string | undefined, date: string): string {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const cfg = leagueSlug ? LEAGUE_SCHEDULE_CONFIGS.find((c) => c.slug === leagueSlug) : undefined;
  if (cfg && !cfg.crossYear) return String(year);
  return String(month >= 7 ? year : year - 1);
}

/** Order-independent fingerprint of the roster ids. */
export function rosterSignature(players: RosterPlayer[]): number {
  return seedFrom(players.map((p) => p.id).sort().join("|"));
}

function jitter(squadId: string, season: string, formation: string): number {
  return (seedFrom(`${squadId}:${season}:${formation}:formation`) / 0x1_0000_0000) * AI_FORMATION.JITTER;
}

/** Every formation scored for `squad` (injury- and fitness-independent: the whole roster). */
export function aiFormationScores(
  squad: Squad,
  season: string,
  style: TacticalStyle = DEFAULT_TACTICAL_STYLE,
): AiFormationScore[] {
  const byId = new Map(squad.players.map((p) => [p.id, p]));
  const styled = new Set(AI_FORMATION.STYLE_FORMATIONS[style] ?? []);
  return FORMATION_IDS.map((id) => {
    const slots = getFormationSlots(formationForSimId(id) as unknown as FormationShape, "attacking");
    const xi = autoFillLineup(slots, squad.players);
    let sum = 0;
    let eligible = xi.length === 11;
    xi.forEach((pid, i) => {
      const p = pid ? byId.get(pid) : undefined;
      const role = slots[i]!.role;
      if (!p) { eligible = false; return; }
      if (aptitudeFor(p, role) === "unsuitable") eligible = false;
      sum += slotValue(p, role);
    });
    const fit = sum / 11;
    const score =
      fit - (AI_FORMATION.BASELINE[id] ?? fit) + (AI_FORMATION.PRIOR[id] ?? 0) +
      (styled.has(id) ? AI_FORMATION.STYLE_BONUS : 0) + jitter(squad.id, season, id);
    return { id, fit, eligible, score };
  });
}

/** The season's formation for an AI club, plus its underdog shape. */
export function chooseAiFormation(
  squad: Squad,
  season: string,
  style: TacticalStyle = DEFAULT_TACTICAL_STYLE,
): AiFormationRecord {
  const scores = aiFormationScores(squad, season, style).filter((s) => s.eligible);
  const roster = rosterSignature(squad.players);
  const best = scores.reduce<AiFormationScore | null>((b, s) => (!b || s.score > b.score ? s : b), null);
  if (!best) {
    const fb = aiFormationScores(squad, season, style).find((s) => s.id === AI_FORMATION.FALLBACK)!;
    return { id: AI_FORMATION.FALLBACK, season, roster, level: fb.fit };
  }
  const record: AiFormationRecord = { id: best.id, season, roster, level: best.fit };
  if (!AI_FORMATION.DEFENSIVE.includes(best.id)) {
    const def = scores
      .filter((s) => AI_FORMATION.DEFENSIVE.includes(s.id) && s.score >= best.score - AI_FORMATION.UNDERDOG_MARGIN)
      .reduce<AiFormationScore | null>((b, s) => (!b || s.score > b.score ? s : b), null);
    if (def) record.defensive = def.id;
  }
  return record;
}

/** The stored record when it is still valid for this season and roster, else a fresh choice. */
export function aiFormationRecord(
  squad: Squad,
  season: string,
  style: TacticalStyle = DEFAULT_TACTICAL_STYLE,
): AiFormationRecord {
  const r = squad.aiFormation;
  if (r && r.season === season && r.roster === rosterSignature(squad.players) && FORMATION_IDS.includes(r.id)) return r;
  return chooseAiFormation(squad, season, style);
}

/** Formation for one match: the season pick, or the defensive shape against a much stronger side. */
export function matchdayAiFormation(record: AiFormationRecord, opponentLevel: number | undefined): string {
  if (opponentLevel !== undefined && record.defensive && opponentLevel - record.level >= AI_FORMATION.UNDERDOG_GAP) {
    return record.defensive;
  }
  return record.id;
}
