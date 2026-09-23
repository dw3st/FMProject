// Shared visual theme for the TouchLines promo.

export const THEME = {
  bg: "#0a0e1a",
  bgDeep: "#05070d",
  pitch: "#0d3b1f",
  pitchDark: "#082716",
  pitchLine: "rgba(255,255,255,0.78)",
  pitchLineDim: "rgba(255,255,255,0.25)",
  teamA: "#3b82f6", // blue
  teamAGlow: "#60a5fa",
  teamB: "#ef4444", // red
  teamBGlow: "#f87171",
  ball: "#ffffff",
  ballGlow: "#fde68a",
  accent: "#facc15", // gold
  accentSoft: "#fde68a",
  text: "#f8fafc",
  textMuted: "rgba(248,250,252,0.65)",
} as const;

// Pitch dimensions match the TouchLines engine: 115 × 74 yards.
export const PITCH = {
  lengthYd: 115,
  widthYd: 74,
  // Centered pitch within a 1920x1080 canvas.
  scale: 14, // pixels per yard
  // pitch displayed = 115*14 x 74*14 = 1610 x 1036
} as const;

export const pitchDimsPx = () => ({
  w: PITCH.lengthYd * PITCH.scale,
  h: PITCH.widthYd * PITCH.scale,
});
