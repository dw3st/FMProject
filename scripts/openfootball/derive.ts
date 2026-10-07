import type { SeedPlayer } from "@/../scripts/openfootball/types";
import type { LineFit, PlaneFit } from "@/../scripts/openfootball/calibration";
import { gaussianFromKey, playerId, unitHash } from "@/../scripts/openfootball/ids";
import { mainRole, type MainRole, type NamePool } from "@/../scripts/openfootball/roster";
import { fitLevelPredictor, predictLevel, type LevelPair, type LevelPlaneFit } from "@/../scripts/openfootball/recalibrate";
import { roundAttr } from "@/Domain/attributes";
import { computeOverallAvg } from "@/Domain/playerRating";
import type { PlayerStatsRecord, RosterPlayer } from "@/types/playerTypes";

export const STAT_KEYS = [
  "passing", "vision", "finishing", "dribbling", "speed", "acceleration", "tackling",
  "pressing", "stamina", "heading", "strength", "reflex", "jump",
] as const satisfies ReadonlyArray<keyof PlayerStatsRecord>;
export type StatKey = (typeof STAT_KEYS)[number];

export interface PlayerCoeffs {
  byRole: Record<MainRole, Record<string, PlaneFit>>;
  pooled: Record<string, PlaneFit>;
  /** League reputation (/1000) range seen in calibration. */
  repMin: number;
  repMax: number;
}

export const NOISE_SCALE = 1;
export const MIN_PAIRS = 30;
/** How far below the lowest calibration league reputation (/1000) the fit may extrapolate. */
export const REP_FLOOR_MARGIN = 3;

/**
 * #3 — a single luck factor per player instead of an independent gaussian per attribute. A
 * player who "got lucky" once (LUCK_WEIGHT) tends to be a bit above/below their line on every
 * attribute together, but a per-attribute jitter (JITTER_WEIGHT) still keeps some spread between
 * attributes. Weights are chosen so `sqrt(LUCK_WEIGHT² + JITTER_WEIGHT²) = 1`, i.e. the combined
 * noise has the same magnitude as the old independent-per-attribute noise (NOISE_SCALE unchanged).
 */
export const LUCK_WEIGHT = 0.8;
export const JITTER_WEIGHT = Math.sqrt(1 - LUCK_WEIGHT * LUCK_WEIGHT);

/**
 * #3 soft cap — a player whose derived overall (`computeOverallAvg`) lands more than
 * SOFT_CAP_SD standard deviations above the level predicted for their seedOverall/leagueRep
 * (fit from `buildRoleLevelPredictor`, same shape as the native recalibration predictor in
 * `recalibrate.ts`) has their noise shrunk by SOFT_CAP_SHRINK and is re-derived, up to
 * SOFT_CAP_MAX_ITER times. This only pulls back lucky *upward* outliers — an unlucky player
 * below the line is left alone.
 */
export const SOFT_CAP_SD = 1.2;
export const SOFT_CAP_SHRINK = 0.5;
export const SOFT_CAP_MAX_ITER = 6;

/**
 * #3 re-centring — the quadratic-mean weighted score (`computeOverallAvg`/`scoreForRole`) is
 * convex, so independent per-attribute noise (the old scheme) pushed a role's *average* derived
 * overall up (Jensen's inequality). The single-luck-factor scheme has less independent per-
 * attribute variance (attributes move together), so it doesn't inflate the mean the same way —
 * left alone, every `of_*` league's mean overall would quietly drop versus the pre-#3 world.
 * `buildLevelCorrection` finds, per role, the flat additive offset (added to every attribute's
 * raw value, same spot as the league-rep covariable) that makes the new scheme's average overall
 * (over a seedOverall/leagueRep grid, many noise draws) match what the OLD scheme produced on the
 * same grid. Applied unconditionally (including the noiseless baseline used by the soft-cap
 * predictor), so the predictor and the real derivation always agree on what "average" means.
 */
const CORRECTION_OVERALL_SAMPLES = [50, 60, 70, 80, 90];
const CORRECTION_DRAWS = 24;
const CORRECTION_ITERATIONS = 30;
const CORRECTION_BOUNDS: [number, number] = [-1, 3];

/**
 * Sample points used to fit each role's level predictor (seedOverall × leagueRep grid).
 * `PREDICTOR_DRAWS` noisy samples are drawn per grid point (see `buildRoleLevelPredictor`) so the
 * fit's `sd` reflects the real *population* scatter of noisy derived overalls around the
 * predicted line — not the near-zero curvature residual of a deterministic (noiseless) curve.
 * A predictor fit on noiseless samples has essentially no spread, so the soft cap's `predicted +
 * SOFT_CAP_SD·sd` threshold would be far too tight and re-shrink almost every player's noise —
 * exactly the bug that dragged every `of_*` league's mean down after the #3 noise change.
 */
const PREDICTOR_OVERALL_SAMPLES = [40, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 99];
const PREDICTOR_DRAWS = 30;
const ALL_MAIN_ROLES: MainRole[] = ["GK", "Defender", "Midfielder", "Forward"];

function repSamplesOf(coeffs: PlayerCoeffs): number[] {
  return [...new Set([coeffs.repMin, (coeffs.repMin + coeffs.repMax) / 2, coeffs.repMax])];
}

const ARCHETYPES: Record<MainRole, Partial<Record<StatKey, string>> & { _: string }> = {
  GK:         { _: "Goalkeeper", reflex: "Shot-stopper", passing: "Sweeper-keeper", jump: "Commanding keeper" },
  Defender:   { _: "Defender", tackling: "Ball-winning defender", heading: "Aerial defender", speed: "Recovery defender", passing: "Ball-playing defender" },
  Midfielder: { _: "Midfielder", passing: "Playmaker", vision: "Deep-lying playmaker", tackling: "Ball-winning midfielder", stamina: "Box-to-box midfielder", dribbling: "Creative midfielder" },
  Forward:    { _: "Forward", finishing: "Poacher", speed: "Pacey forward", dribbling: "Inside forward", heading: "Target forward", strength: "Target forward" },
};

function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) throw new Error(`clamp: non-finite value ${v}`);
  return Math.max(lo, Math.min(hi, v));
}

const finiteFit = (f: PlaneFit | undefined): f is PlaneFit =>
  !!f && Number.isFinite(f.a) && Number.isFinite(f.b) && Number.isFinite(f.c) && Number.isFinite(f.sd);

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });

/**
 * English country name for a seed ISO 3166 alpha-2 code. TL squads store `nationality` as a
 * country name ("Brazil", "Spain"), which `toDisplayPlayer` shows as-is. Unknown codes give
 * undefined, and the UI then falls back to the club country. The seed's "gb" is England, as in TL.
 */
function nationalityFor(code: string): string | undefined {
  if (!/^[a-z]{2}$/i.test(code)) return undefined;
  if (code.toLowerCase() === "gb") return "England";
  try {
    const name = regionNames.of(code.toUpperCase());
    return name && name !== code.toUpperCase() ? name : undefined;
  } catch {
    return undefined;
  }
}

/** Archetype from the strongest stat, and a one-line summary ("Solid defender, strongest at tackling."). */
export function playerProfile(role: MainRole, stats: PlayerStatsRecord, adjective: string): RosterPlayer["profile"] {
  const top = [...STAT_KEYS].sort((a, b) => stats[b] - stats[a] || a.localeCompare(b))[0]!;
  const roleWord = role === "GK" ? "goalkeeper" : role.toLowerCase();
  return { archetype: ARCHETYPES[role][top] ?? ARCHETYPES[role]._, summary: `${adjective} ${roleWord}, strongest at ${top}.` };
}

/** Picks the fit to use for one attribute — role fit if it has enough pairs, else the pooled fit. */
function pickFit(coeffs: PlayerCoeffs, role: MainRole, k: StatKey): PlaneFit {
  const roleFit = coeffs.byRole[role]?.[k];
  const pooledFit = coeffs.pooled[k];
  const f = finiteFit(roleFit) && roleFit.n >= MIN_PAIRS ? roleFit : finiteFit(pooledFit) ? pooledFit : undefined;
  if (!f) throw new Error(`derivePlayer: missing/non-finite fit for ${role}.${k}`);
  return f;
}

/**
 * Derives one player's stats at a given noise magnitude (`noiseScale`) and level `correction`
 * (see `buildLevelCorrection`, added regardless of `noiseScale`). `noiseScale = 0` gives the
 * deterministic (+correction) baseline — used both for real players (after the soft cap shrinks
 * it) and for the synthetic samples that build the level predictor.
 */
function deriveStats(
  sp: SeedPlayer, coeffs: PlayerCoeffs, rep: number, role: MainRole, noiseScale: number, correction = 0,
): PlayerStatsRecord {
  const luck = gaussianFromKey(`${sp.id}:luck`);
  const statOf = (k: StatKey): number => {
    const f = pickFit(coeffs, role, k);
    const jitter = gaussianFromKey(`${sp.id}:${k}:jitter`);
    const noise = f.sd * noiseScale * (LUCK_WEIGHT * luck + JITTER_WEIGHT * jitter);
    const raw = f.a + f.b * sp.overall + f.c * rep + correction + noise;
    return roundAttr(clamp(raw, 0, 10));
  };
  return {
    passing: statOf("passing"), vision: statOf("vision"), finishing: statOf("finishing"),
    dribbling: statOf("dribbling"), speed: statOf("speed"), acceleration: statOf("acceleration"),
    tackling: statOf("tackling"), pressing: statOf("pressing"), stamina: statOf("stamina"),
    heading: statOf("heading"), strength: statOf("strength"), reflex: statOf("reflex"), jump: statOf("jump"),
  };
}

/** The pre-#3 formula (independent per-attribute noise) — used only to calibrate `buildLevelCorrection`. */
function deriveStatsLegacy(sp: SeedPlayer, coeffs: PlayerCoeffs, rep: number, role: MainRole): PlayerStatsRecord {
  const statOf = (k: StatKey): number => {
    const f = pickFit(coeffs, role, k);
    const raw = f.a + f.b * sp.overall + f.c * rep + f.sd * NOISE_SCALE * gaussianFromKey(`${sp.id}:${k}`);
    return roundAttr(clamp(raw, 0, 10));
  };
  return {
    passing: statOf("passing"), vision: statOf("vision"), finishing: statOf("finishing"),
    dribbling: statOf("dribbling"), speed: statOf("speed"), acceleration: statOf("acceleration"),
    tackling: statOf("tackling"), pressing: statOf("pressing"), stamina: statOf("stamina"),
    heading: statOf("heading"), strength: statOf("strength"), reflex: statOf("reflex"), jump: statOf("jump"),
  };
}

/** Mean `computeOverallAvg` over a seedOverall × leagueRep × draw grid, for one role. */
function meanOverallOver(
  coeffs: PlayerCoeffs, role: MainRole, repSamples: number[],
  deriveFn: (sp: SeedPlayer, coeffs: PlayerCoeffs, rep: number, role: MainRole) => PlayerStatsRecord,
): number {
  let sum = 0;
  let n = 0;
  for (const overall of CORRECTION_OVERALL_SAMPLES) {
    for (const rep of repSamples) {
      for (let i = 0; i < CORRECTION_DRAWS; i++) {
        const sp: SeedPlayer = {
          id: `correction-sample-${role}-${overall}-${rep}-${i}`, name: "", position: "ATT",
          overall, potential: overall, age: 25, country: "us", foot: "R", value: 0, clubId: "sample",
        };
        const stats = deriveFn(sp, coeffs, rep, role);
        sum += computeOverallAvg({ positions: [role], stats } as unknown as RosterPlayer);
        n++;
      }
    }
  }
  return sum / n;
}

/**
 * A small predictor fit purely for calibrating `buildLevelCorrection` — same shape as
 * `buildRoleLevelPredictor`'s official one, but on the (much smaller) correction grid, so the
 * correction search can see the SAME soft-cap suppression a real derivation would apply at a
 * given candidate `correction` without paying for the full-resolution official grid on every
 * bisection step.
 */
function calibrationPredictorAt(coeffs: PlayerCoeffs, role: MainRole, repSamples: number[], correction: number): LevelPlaneFit {
  const pairs: LevelPair[] = [];
  for (const overall of CORRECTION_OVERALL_SAMPLES) {
    for (const rep of repSamples) {
      for (let i = 0; i < CORRECTION_DRAWS; i++) {
        const sp: SeedPlayer = {
          id: `calib-predictor-${role}-${overall}-${rep}-${i}`, name: "", position: "ATT",
          overall, potential: overall, age: 25, country: "us", foot: "R", value: 0, clubId: "sample",
        };
        const stats = deriveStats(sp, coeffs, rep, role, NOISE_SCALE, correction);
        const nativeOverall = computeOverallAvg({ positions: [role], stats } as unknown as RosterPlayer);
        pairs.push({ role, seedOverall: overall, leagueRep: rep, nativeOverall });
      }
    }
  }
  return fitLevelPredictor(pairs)[role]!;
}

/**
 * Average overall a candidate `correction` produces INCLUDING the soft cap — mirrors
 * `derivePlayer`'s own noise/cap loop exactly (same `SOFT_CAP_SD`/`SOFT_CAP_SHRINK`/
 * `SOFT_CAP_MAX_ITER`), using a predictor built fresh at this `correction`
 * (`calibrationPredictorAt`) so the cap's suppression at this candidate is captured, not just the
 * uncapped noise's inflation.
 */
function meanOverallCapped(coeffs: PlayerCoeffs, role: MainRole, repSamples: number[], correction: number): number {
  const fit = calibrationPredictorAt(coeffs, role, repSamples, correction);
  let sum = 0;
  let n = 0;
  for (const overall of CORRECTION_OVERALL_SAMPLES) {
    for (const rep of repSamples) {
      for (let i = 0; i < CORRECTION_DRAWS; i++) {
        const sp: SeedPlayer = {
          id: `capped-mean-${role}-${overall}-${rep}-${i}`, name: "", position: "ATT",
          overall, potential: overall, age: 25, country: "us", foot: "R", value: 0, clubId: "sample",
        };
        let noiseScale = NOISE_SCALE;
        let stats = deriveStats(sp, coeffs, rep, role, noiseScale, correction);
        for (let iter = 0; iter < SOFT_CAP_MAX_ITER; iter++) {
          const ov = computeOverallAvg({ positions: [role], stats } as unknown as RosterPlayer);
          const predicted = predictLevel(fit, overall, rep);
          if (ov <= predicted + SOFT_CAP_SD * fit.sd) break;
          noiseScale *= SOFT_CAP_SHRINK;
          stats = deriveStats(sp, coeffs, rep, role, noiseScale, correction);
        }
        sum += computeOverallAvg({ positions: [role], stats } as unknown as RosterPlayer);
        n++;
      }
    }
  }
  return sum / n;
}

const levelCorrectionCache = new WeakMap<PlayerCoeffs, Record<MainRole, number>>();

/**
 * #3 re-centring — see the constant block above `CORRECTION_OVERALL_SAMPLES`. Bisects, per role,
 * the flat offset `c` so that the FULL noisy+capped scheme's average overall
 * (`meanOverallCapped`, i.e. what `derivePlayer` actually produces at this correction) matches
 * `deriveStatsLegacy(...)`'s average (the pre-#3 scheme, uncapped — it never had one). Including
 * the cap in the candidate-side evaluation matters: the soft cap only trims the upper tail, so it
 * pulls the mean down a little on its own, and a correction calibrated ignoring that (i.e. against
 * the uncapped scheme) under-corrects once the real cap is applied. Memoized per `coeffs` object.
 */
export function buildLevelCorrection(coeffs: PlayerCoeffs): Record<MainRole, number> {
  const cached = levelCorrectionCache.get(coeffs);
  if (cached) return cached;
  const repSamples = repSamplesOf(coeffs);
  const out = {} as Record<MainRole, number>;
  for (const role of ALL_MAIN_ROLES) {
    const target = meanOverallOver(coeffs, role, repSamples, deriveStatsLegacy);
    let [lo, hi] = CORRECTION_BOUNDS;
    for (let i = 0; i < CORRECTION_ITERATIONS; i++) {
      const mid = (lo + hi) / 2;
      const mean = meanOverallCapped(coeffs, role, repSamples, mid);
      if (mean < target) lo = mid; else hi = mid;
    }
    out[role] = (lo + hi) / 2;
  }
  levelCorrectionCache.set(coeffs, out);
  return out;
}

const rolePredictorCache = new WeakMap<PlayerCoeffs, Partial<Record<MainRole, LevelPlaneFit>>>();

/**
 * #3 — builds a per-role level predictor (`z = a + b·seedOverall + c·leagueRep`) from synthetic
 * samples derived under `coeffs` **with noise and the level correction applied**, `PREDICTOR_DRAWS`
 * draws per grid point: the same shape as `recalibrate.ts`'s native-player predictor, but fitted
 * against `of_*`'s own (simulated) noisy population instead of real native players' game overall.
 * Fitting on noisy draws (not a deterministic baseline) is what gives `fit.sd` a real population
 * spread for the soft cap to compare against — see the comment above `PREDICTOR_OVERALL_SAMPLES`.
 * Memoized per `coeffs` object (one build per importer run).
 */
export function buildRoleLevelPredictor(coeffs: PlayerCoeffs): Partial<Record<MainRole, LevelPlaneFit>> {
  const cached = rolePredictorCache.get(coeffs);
  if (cached) return cached;
  const repSamples = repSamplesOf(coeffs);
  const correction = buildLevelCorrection(coeffs);
  const pairs: LevelPair[] = [];
  for (const role of ALL_MAIN_ROLES) {
    for (const overall of PREDICTOR_OVERALL_SAMPLES) {
      for (const rep of repSamples) {
        for (let i = 0; i < PREDICTOR_DRAWS; i++) {
          const sp: SeedPlayer = {
            id: `predictor-sample-${role}-${overall}-${rep}-${i}`, name: "", position: "ATT",
            overall, potential: overall, age: 25, country: "us", foot: "R", value: 0, clubId: "sample",
          };
          const stats = deriveStats(sp, coeffs, rep, role, NOISE_SCALE, correction[role]);
          const nativeOverall = computeOverallAvg({ positions: [role], stats } as unknown as RosterPlayer);
          pairs.push({ role, seedOverall: overall, leagueRep: rep, nativeOverall });
        }
      }
    }
  }
  const fit = fitLevelPredictor(pairs);
  rolePredictorCache.set(coeffs, fit);
  return fit;
}

/**
 * `leagueRep` is the seed league reputation / 1000. It is clamped to
 * [coeffs.repMin − REP_FLOOR_MARGIN, coeffs.repMax] so the plane never extrapolates wildly.
 *
 * #3: noise is a per-player luck factor + per-attribute jitter (see `deriveStats`), with a soft
 * cap — if the resulting overall lands more than `SOFT_CAP_SD` standard deviations above the
 * level predicted for this seedOverall/leagueRep, the noise is shrunk and the player re-derived,
 * up to `SOFT_CAP_MAX_ITER` times — plus a flat per-role level correction (`buildLevelCorrection`)
 * so the population's average overall matches the pre-#3 (independent-noise) scheme.
 */
export function derivePlayer(sp: SeedPlayer, squadId: string, coeffs: PlayerCoeffs, leagueRep: number): RosterPlayer {
  const role = mainRole(sp.position);
  const rep = clamp(leagueRep, coeffs.repMin - REP_FLOOR_MARGIN, coeffs.repMax);
  const correction = buildLevelCorrection(coeffs)[role] ?? 0;

  let noiseScale = NOISE_SCALE;
  let stats = deriveStats(sp, coeffs, rep, role, noiseScale, correction);
  const fit = buildRoleLevelPredictor(coeffs)[role];
  if (fit) {
    for (let i = 0; i < SOFT_CAP_MAX_ITER; i++) {
      const overall = computeOverallAvg({ positions: [role], stats } as unknown as RosterPlayer);
      const predicted = predictLevel(fit, sp.overall, rep);
      if (overall <= predicted + SOFT_CAP_SD * fit.sd) break;
      noiseScale *= SOFT_CAP_SHRINK;
      stats = deriveStats(sp, coeffs, rep, role, noiseScale, correction);
    }
  }

  const adjective = sp.overall >= 80 ? "Elite" : sp.overall >= 70 ? "Solid" : sp.overall >= 60 ? "Capable" : "Developing";
  const player: RosterPlayer = {
    id: playerId(sp.id),
    name: sp.name,
    age: sp.age,
    squadId,
    // RosterPlayer only has "left" | "right". Two-footed ("B") players map to "right", the
    // majority foot, so they don't all show up as left-footers.
    preferredFoot: sp.foot === "L" ? "left" : "right",
    positions: [role],
    stats,
    profile: playerProfile(role, stats, adjective),
  };
  const nationality = nationalityFor(sp.country);
  if (nationality) player.nationality = nationality;
  return player;
}

export interface ClubFits {
  budget: LineFit; broadcasting: LineFit; commercial: LineFit; followers: LineFit; capacity: LineFit;
  /** Highest reputation seen in calibration. Inputs are clamped to it so the fit never extrapolates upward. */
  repMax: number;
}

export const ECON_FIELDS = ["budget", "broadcasting", "commercial", "followers", "capacity"] as const;
export type EconField = (typeof ECON_FIELDS)[number];
export type EconSample = Record<EconField, number>;

/** Per-field multiplier by league tier (tier → factor). Tier 1 is always 1. */
export type TierMultipliers = Record<EconField, Record<number, number>>;

/** Tier 1 → 1; a tier missing from the map uses the deepest defined tier. */
function tierFactor(byTier: Record<number, number>, tier: number): number {
  if (tier <= 1) return 1;
  const hit = byTier[tier];
  if (hit !== undefined) return hit;
  const tiers = Object.keys(byTier).map(Number).filter((t) => t > 1);
  return tiers.length === 0 ? 1 : byTier[Math.max(...tiers)]!;
}

function assertFits(fits: ClubFits) {
  if (!Number.isFinite(fits.repMax)) throw new Error("deriveClubEconomy: non-finite repMax");
  for (const k of ECON_FIELDS) {
    const f = fits[k];
    if (!f || !Number.isFinite(f.a) || !Number.isFinite(f.b)) throw new Error(`deriveClubEconomy: non-finite fit for ${k}`);
  }
}

/** Raw log-line prediction at a reputation (clamped to repMax), before tier scaling and rounding. */
export function predictEconomy(reputation: number, fits: ClubFits): EconSample {
  assertFits(fits);
  const rep = Math.min(reputation, fits.repMax);
  const out = {} as EconSample;
  for (const k of ECON_FIELDS) out[k] = Math.exp(fits[k].a + fits[k].b * rep);
  return out;
}

export function deriveClubEconomy(reputation: number, tier: number, fits: ClubFits, tierMult: TierMultipliers) {
  const raw = predictEconomy(reputation, fits);
  const v = (k: EconField) => {
    const out = raw[k] * tierFactor(tierMult[k], tier);
    if (!Number.isFinite(out)) throw new Error(`deriveClubEconomy: non-finite ${k}`);
    return Math.round(out);
  };
  const broadcasting = v("broadcasting");
  const commercial = v("commercial");
  return {
    finances: { broadcasting, commercial, total: broadcasting + commercial, budget: v("budget"), followers: v("followers") },
    capacity: clamp(v("capacity"), 3000, 90000),
  };
}

function median(xs: number[], label: string): number {
  if (xs.length === 0) throw new Error(`computeTierMultipliers: no values for ${label}`);
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  const m = s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
  if (!Number.isFinite(m) || m <= 0) throw new Error(`computeTierMultipliers: non-positive median for ${label}`);
  return m;
}

export const MONEY_MULT_CAP = 1;
export const CAPACITY_MULT_CAP = 1.2;

/**
 * Tier multipliers from TL Brazil, computed separately for every field:
 *   mult[2] = median(TL Série B) / median(fit prediction at the seed's brazilian-serie-b reputations)
 *   mult[3] = mult[2] × median(TL Série C) / median(TL Série B)
 * then capped: money fields (budget, broadcasting, commercial, followers) at MONEY_MULT_CAP, so a lower
 * division never earns more than the top-flight fit; capacity at CAPACITY_MULT_CAP.
 */
export function computeTierMultipliers(input: {
  fits: ClubFits;
  seedSerieBReputations: number[];
  tlSerieB: EconSample[];
  tlSerieC: EconSample[];
}): TierMultipliers {
  const predicted = input.seedSerieBReputations.map((r) => predictEconomy(r, input.fits));
  const out = {} as TierMultipliers;
  for (const k of ECON_FIELDS) {
    const tlB = median(input.tlSerieB.map((x) => x[k]), `serie_b.${k}`);
    const tlC = median(input.tlSerieC.map((x) => x[k]), `serie_c.${k}`);
    const m2 = tlB / median(predicted.map((x) => x[k]), `predicted.${k}`);
    const cap = k === "capacity" ? CAPACITY_MULT_CAP : MONEY_MULT_CAP;
    out[k] = { 1: 1, 2: Math.min(cap, m2), 3: Math.min(cap, (m2 * tlC) / tlB) };
  }
  return out;
}

export function coachName(clubSeedId: string, pool: NamePool): string {
  const first = pool.first[Math.floor(unitHash(`${clubSeedId}:coach:f`) * pool.first.length)] ?? "Carlos";
  const last = pool.last[Math.floor(unitHash(`${clubSeedId}:coach:l`) * pool.last.length)] ?? "Silva";
  return `${first} ${last}`;
}
