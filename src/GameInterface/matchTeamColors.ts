import type { CSSProperties } from "react";
import type { Squad } from "@/types/playerTypes";

/** Default kit hex when squad JSON has no colors (legacy / missing). */
export const FALLBACK_HOME_ACCENT = "#22c55e";
export const FALLBACK_AWAY_ACCENT = "#3b82f6";

/** Engine defaults — same hues as the legacy `TeamPanel` / Pixi pitch defaults. */
export const DEFAULT_TEAM_KIT_HEX = {
  A: "#2d6cdf",
  B: "#df3b2d",
} as const;

export type TeamKitSide = keyof typeof DEFAULT_TEAM_KIT_HEX;

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let h = hex.replace("#", "");
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const num = parseInt(h, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

export function colorDistance(hex1: string, hex2: string): number {
  const c1 = hexToRgb(hex1);
  const c2 = hexToRgb(hex2);
  const dr = c1.r - c2.r;
  const dg = c1.g - c2.g;
  const db = c1.b - c2.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

const MAX_RGB_DISTANCE = Math.sqrt(255 * 255 * 3);

export function colorSimilarity(hex1: string, hex2: string): number {
  const distance = colorDistance(hex1, hex2);
  return 1 - distance / MAX_RGB_DISTANCE;
}

/** WCAG relative luminance (0 = black, 1 = white). */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Minimum luminance for team-coloured text on the dark app background (~4.5:1 contrast). */
const MIN_TEXT_LUMINANCE_ON_DARK = 0.2;

/**
 * Team colour for text/glow on the dark background. Dark kits (black, navy, maroon) are lifted
 * toward white until they reach a readable luminance; light kits come back unchanged.
 */
export function readableOnDark(hex: string): string {
  if (relativeLuminance(hex) >= MIN_TEXT_LUMINANCE_ON_DARK) return hex;
  const { r, g, b } = hexToRgb(hex);
  for (let t = 0.05; t < 1; t += 0.05) {
    const mixed = {
      r: Math.round(r + (255 - r) * t),
      g: Math.round(g + (255 - g) * t),
      b: Math.round(b + (255 - b) * t),
    };
    const out = `#${((1 << 24) | (mixed.r << 16) | (mixed.g << 8) | mixed.b).toString(16).slice(1)}`;
    if (relativeLuminance(out) >= MIN_TEXT_LUMINANCE_ON_DARK) return out;
  }
  return "#ffffff";
}

/** If home primary and away primary are this similar or more, away kit uses secondary instead. */
const KIT_COLOR_SIMILARITY_TOO_CLOSE = 0.88;

export interface TeamKitInput {
  primary: string;
  secondary: string;
}

function pickColor(s: string | undefined, fallback: string): string {
  return typeof s === "string" && s.length > 0 ? s : fallback;
}

/**
 * Resolves per-side kit colors for pitch, scoreboard, and panels.
 * When the two primaries are too close in RGB space, team B uses its secondary color so kits stay distinct.
 */
export function resolveMatchTeamKitColors(
  teamA: TeamKitInput | undefined,
  teamB: TeamKitInput | undefined,
): { teamA: string; teamB: string } {
  const primaryA = pickColor(teamA?.primary, DEFAULT_TEAM_KIT_HEX.A);
  const secondaryA = pickColor(teamA?.secondary, primaryA);
  const primaryB = pickColor(teamB?.primary, DEFAULT_TEAM_KIT_HEX.B);
  const secondaryB = pickColor(teamB?.secondary, primaryB);

  const teamAKit = primaryA;

  if (colorSimilarity(primaryA, primaryB) < KIT_COLOR_SIMILARITY_TOO_CLOSE) {
    return { teamA: teamAKit, teamB: primaryB };
  }

  const awayCandidate = secondaryB;
  if (colorSimilarity(primaryA, awayCandidate) < KIT_COLOR_SIMILARITY_TOO_CLOSE) {
    return { teamA: teamAKit, teamB: awayCandidate };
  }

  return { teamA: teamAKit, teamB: DEFAULT_TEAM_KIT_HEX.B };
}

export function squadPrimaryColor(squad: Squad | null, fallback: string): string {
  const c = squad?.colors?.[0];
  return typeof c === "string" && c.length > 0 ? c : fallback;
}

export function squadSecondaryColor(squad: Squad | null, fallback: string): string {
  const c = squad?.colors?.[1];
  return typeof c === "string" && c.length > 0 ? c : fallback;
}

/** Subtle pill background using team color. */
export function tacticPillStyle(accentHex: string): CSSProperties {
  return {
    color: accentHex,
    backgroundColor: `color-mix(in srgb, ${accentHex} 18%, transparent)`,
    borderColor: `color-mix(in srgb, ${accentHex} 45%, transparent)`,
  };
}
