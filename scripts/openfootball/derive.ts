import type { SeedPlayer } from "@/../scripts/openfootball/types";
import type { LineFit } from "@/../scripts/openfootball/calibration";
import { gaussianFromKey, playerId, unitHash } from "@/../scripts/openfootball/ids";
import { mainRole, type MainRole, type NamePool } from "@/../scripts/openfootball/roster";
import type { RosterPlayer } from "@/types/playerTypes";

export const STAT_KEYS = [
  "passing", "vision", "finishing", "dribbling", "speed", "acceleration", "tackling",
  "pressing", "stamina", "heading", "strength", "reflex", "jump",
] as const;
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

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function derivePlayer(sp: SeedPlayer, squadId: string, coeffs: PlayerCoeffs): RosterPlayer {
  const role = mainRole(sp.position);
  const stats = {} as Record<StatKey, number>;
  for (const k of STAT_KEYS) {
    const roleFit = coeffs.byRole[role]?.[k];
    const f = roleFit && roleFit.n >= MIN_PAIRS ? roleFit : coeffs.pooled[k]!;
    const raw = f.a + f.b * sp.overall + f.sd * NOISE_SCALE * gaussianFromKey(`${sp.id}:${k}`);
    stats[k] = clamp(Math.round(raw), 0, 10);
  }
  const top = [...STAT_KEYS].sort((a, b) => stats[b] - stats[a] || a.localeCompare(b))[0]!;
  const adjective = sp.overall >= 80 ? "Elite" : sp.overall >= 70 ? "Solid" : sp.overall >= 60 ? "Capable" : "Developing";
  const roleWord = role === "GK" ? "goalkeeper" : role.toLowerCase();
  return {
    id: playerId(sp.id),
    name: sp.name,
    age: sp.age,
    squadId,
    preferredFoot: sp.foot === "L" ? "left" : "right",
    positions: [role],
    stats: stats as RosterPlayer["stats"],
    profile: {
      archetype: ARCHETYPES[role][top] ?? ARCHETYPES[role]._,
      summary: `${adjective} ${roleWord}, strongest at ${top}.`,
    },
  } as RosterPlayer;
}

export interface ClubFits { budget: LineFit; broadcasting: LineFit; commercial: LineFit; followers: LineFit; capacity: LineFit }

export function deriveClubEconomy(reputation: number, fits: ClubFits) {
  const v = (f: LineFit) => Math.round(Math.exp(f.a + f.b * reputation));
  const broadcasting = v(fits.broadcasting);
  const commercial = v(fits.commercial);
  return {
    finances: { broadcasting, commercial, total: broadcasting + commercial, budget: v(fits.budget), followers: v(fits.followers) },
    capacity: clamp(v(fits.capacity), 3000, 90000),
  };
}

export function coachName(clubSeedId: string, pool: NamePool): string {
  const first = pool.first[Math.floor(unitHash(`${clubSeedId}:coach:f`) * pool.first.length)] ?? "Carlos";
  const last = pool.last[Math.floor(unitHash(`${clubSeedId}:coach:l`) * pool.last.length)] ?? "Silva";
  return `${first} ${last}`;
}
