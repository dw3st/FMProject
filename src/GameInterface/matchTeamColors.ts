import type { CSSProperties } from "react";
import type { Squad } from "@/types/playerTypes";
import { rgbLuminance } from "@/Domain/color";
import { resolveMatchKits } from "@/Domain/matchday/matchKits";

/** Default kit hex when squad JSON has no colors (legacy / missing). */
export const FALLBACK_HOME_ACCENT = "#22c55e";
export const FALLBACK_AWAY_ACCENT = "#3b82f6";

/** Engine defaults — same hues as the legacy `TeamPanel` / Pixi pitch defaults. */
export const DEFAULT_TEAM_KIT_HEX = {
  A: "#2d6cdf",
  B: "#df3b2d",
} as const;

function hexToRgb(hex: string): { r: number; g: number; b: number } {
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

/** WCAG relative luminance (0 = black, 1 = white). */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return rgbLuminance(r, g, b);
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

/** Below this luminance a solid kit-coloured dot/marker disappears on the dark background. */
const MAX_DARK_MARKER_LUMINANCE = 0.08;

/**
 * Style for a small team-colour dot (team header, player rows). The dot keeps the real kit colour;
 * dark kits (black, navy, maroon) get a light ring so the dot stays visible on the dark background.
 */
export function kitDotStyle(hex: string): CSSProperties {
  return relativeLuminance(hex) < MAX_DARK_MARKER_LUMINANCE
    ? { background: hex, boxShadow: "0 0 0 1.5px rgba(255, 255, 255, 0.6)" }
    : { background: hex };
}

export interface TeamKitInput {
  primary: string;
  secondary: string;
}

/**
 * Resolves per-side kit colors for pitch, scoreboard, and panels. The home side keeps its shirt; when
 * the two shirts clash the away side wears its second colour, or a contrasting change kit when that
 * clashes too (`resolveMatchKits`). `home` = the engine team playing at home (default A).
 */
export function resolveMatchTeamKitColors(
  teamA: TeamKitInput | undefined,
  teamB: TeamKitInput | undefined,
  home: "A" | "B" = "A",
): { teamA: string; teamB: string } {
  const colors = (t: TeamKitInput | undefined) => (t ? [t.primary, t.secondary] : []);
  const [h, a] = home === "A" ? [teamA, teamB] : [teamB, teamA];
  const k = resolveMatchKits(colors(h), colors(a), {
    home: home === "A" ? DEFAULT_TEAM_KIT_HEX.A : DEFAULT_TEAM_KIT_HEX.B,
    away: home === "A" ? DEFAULT_TEAM_KIT_HEX.B : DEFAULT_TEAM_KIT_HEX.A,
  });
  return home === "A" ? { teamA: k.home, teamB: k.away } : { teamA: k.away, teamB: k.home };
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
