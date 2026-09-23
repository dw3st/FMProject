import type { SeedPlayer } from "@/../scripts/openfootball/types";
import type { LineFit } from "@/../scripts/openfootball/calibration";
import { gaussianFromKey, playerId, unitHash } from "@/../scripts/openfootball/ids";
import { mainRole, type MainRole, type NamePool } from "@/../scripts/openfootball/roster";
import type { PlayerStatsRecord, RosterPlayer } from "@/types/playerTypes";

export const STAT_KEYS = [
  "passing", "vision", "finishing", "dribbling", "speed", "acceleration", "tackling",
  "pressing", "stamina", "heading", "strength", "reflex", "jump",
] as const satisfies ReadonlyArray<keyof PlayerStatsRecord>;
export type StatKey = (typeof STAT_KEYS)[number];

export interface PlayerCoeffs {
  byRole: Record<MainRole, Record<string, LineFit>>;
  pooled: Record<string, LineFit>;
}

export const NOISE_SCALE = 1;
export const MIN_PAIRS = 30;

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

const finiteFit = (f: LineFit | undefined): f is LineFit =>
  !!f && Number.isFinite(f.a) && Number.isFinite(f.b) && Number.isFinite(f.sd);

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });

/**
 * English country name for a seed ISO 3166 alpha-2 code. TL squads store `nationality` as a
 * country name ("Brazil", "Spain"), which `toDisplayPlayer` shows as-is. Unknown codes give
 * undefined, and the UI then falls back to the club country. The seed's "gb" becomes "United Kingdom".
 */
function nationalityFor(code: string): string | undefined {
  if (!/^[a-z]{2}$/i.test(code)) return undefined;
  try {
    const name = regionNames.of(code.toUpperCase());
    return name && name !== code.toUpperCase() ? name : undefined;
  } catch {
    return undefined;
  }
}

export function derivePlayer(sp: SeedPlayer, squadId: string, coeffs: PlayerCoeffs): RosterPlayer {
  const role = mainRole(sp.position);
  const statOf = (k: StatKey): number => {
    const roleFit = coeffs.byRole[role]?.[k];
    const pooledFit = coeffs.pooled[k];
    const f = finiteFit(roleFit) && roleFit.n >= MIN_PAIRS ? roleFit : finiteFit(pooledFit) ? pooledFit : undefined;
    if (!f) throw new Error(`derivePlayer: missing/non-finite fit for ${role}.${k}`);
    const raw = f.a + f.b * sp.overall + f.sd * NOISE_SCALE * gaussianFromKey(`${sp.id}:${k}`);
    return clamp(Math.round(raw), 0, 10);
  };
  const stats: PlayerStatsRecord = {
    passing: statOf("passing"), vision: statOf("vision"), finishing: statOf("finishing"),
    dribbling: statOf("dribbling"), speed: statOf("speed"), acceleration: statOf("acceleration"),
    tackling: statOf("tackling"), pressing: statOf("pressing"), stamina: statOf("stamina"),
    heading: statOf("heading"), strength: statOf("strength"), reflex: statOf("reflex"), jump: statOf("jump"),
  };
  const top = [...STAT_KEYS].sort((a, b) => stats[b] - stats[a] || a.localeCompare(b))[0]!;
  const adjective = sp.overall >= 80 ? "Elite" : sp.overall >= 70 ? "Solid" : sp.overall >= 60 ? "Capable" : "Developing";
  const roleWord = role === "GK" ? "goalkeeper" : role.toLowerCase();
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
    profile: {
      archetype: ARCHETYPES[role][top] ?? ARCHETYPES[role]._,
      summary: `${adjective} ${roleWord}, strongest at ${top}.`,
    },
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

/**
 * Tier multipliers from TL Brazil, computed separately for every field:
 *   mult[2] = median(TL Série B) / median(fit prediction at the seed's brazilian-serie-b reputations)
 *   mult[3] = mult[2] × median(TL Série C) / median(TL Série B)
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
    out[k] = { 1: 1, 2: m2, 3: (m2 * tlC) / tlB };
  }
  return out;
}

export function coachName(clubSeedId: string, pool: NamePool): string {
  const first = pool.first[Math.floor(unitHash(`${clubSeedId}:coach:f`) * pool.first.length)] ?? "Carlos";
  const last = pool.last[Math.floor(unitHash(`${clubSeedId}:coach:l`) * pool.last.length)] ?? "Silva";
  return `${first} ${last}`;
}
