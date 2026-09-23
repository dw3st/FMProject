import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  Easing,
} from "remotion";

const eo = Easing.bezier(0.16, 1, 0.3, 1);

const STATS = [
  { value: "7 MIN", label: "Match Length" },
  { value: "11 v 11", label: "Engine" },
  { value: "5", label: "Top Leagues" },
  { value: "HYPER", label: "Speed" },
];

export const HeroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Wordmark letter-by-letter.
  const word = "TOUCHLINES";
  const letterDelay = 3;

  // Background pulse / rings.
  const bgPulse = interpolate(frame, [0, fps * 2.2], [0.25, 1.05], {
    extrapolateRight: "clamp",
    easing: eo,
  });

  // Hero badge.
  const badgeIn = interpolate(frame, [fps * 0.3, fps * 0.8], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: eo,
  });
  const badgeY = interpolate(frame, [fps * 0.3, fps * 0.8], [-12, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: eo,
  });

  // Tagline.
  const taglineIn = interpolate(frame, [fps * 1.1, fps * 1.6], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: eo,
  });

  // Stats strip.
  const statsIn = interpolate(frame, [fps * 1.6, fps * 2.0], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: eo,
  });

  // Accent lines.
  const lineProgress = interpolate(frame, [fps * 0.4, fps * 1.2], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: eo,
  });

  // Scene exit.
  const exitOpacity = interpolate(frame, [fps * 2.5, fps * 3.0], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      data-team="green"
      className="bg-background"
      style={{ opacity: exitOpacity, overflow: "hidden" }}
    >
      {/* Radial background */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, oklch(0.18 0.04 var(--team-hue)) 0%, oklch(0.08 0.02 var(--team-hue)) 70%)",
        }}
      />

      {/* Expanding ring */}
      <div
        className="absolute top-1/2 left-1/2 rounded-full"
        style={{
          width: 1100 * bgPulse,
          height: 1100 * bgPulse,
          marginLeft: -550 * bgPulse,
          marginTop: -550 * bgPulse,
          border: "1px solid oklch(0.75 0.18 var(--team-hue) / 0.18)",
          opacity: interpolate(bgPulse, [0.25, 1.05], [0, 0.6]),
        }}
      />
      <div
        className="absolute top-1/2 left-1/2 rounded-full"
        style={{
          width: 700 * bgPulse,
          height: 700 * bgPulse,
          marginLeft: -350 * bgPulse,
          marginTop: -350 * bgPulse,
          background:
            "radial-gradient(circle, oklch(0.75 0.18 var(--team-hue) / 0.10) 0%, transparent 70%)",
        }}
      />

      <AbsoluteFill className="flex flex-col items-center justify-center gap-6">
        {/* Hero badge */}
        <div
          className="px-5 py-2 rounded-full border border-primary/30 bg-primary/10 backdrop-blur-sm flex items-center gap-2"
          style={{ opacity: badgeIn, transform: `translateY(${badgeY}px)` }}
        >
          <div className="w-2 h-2 rounded-full bg-primary glow-primary-sm" />
          <span className="text-[11px] uppercase tracking-[0.4em] text-primary glow-text font-display font-bold">
            The Football Management Arcade
          </span>
        </div>

        {/* Top accent line */}
        <div
          className="h-px"
          style={{
            width: 700 * lineProgress,
            background:
              "linear-gradient(90deg, transparent, oklch(0.75 0.18 var(--team-hue)), transparent)",
          }}
        />

        {/* Wordmark — matches in-app TopNavigation style: TOUCH + LINES (accent) */}
        <div className="flex items-baseline font-display font-black tracking-tight"
             style={{ fontSize: 160, lineHeight: 1 }}>
          {word.split("").map((ch, i) => {
            const start = i * letterDelay;
            const o = interpolate(frame, [start, start + 14], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: eo,
            });
            const y = interpolate(frame, [start, start + 14], [40, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: eo,
            });
            // "TOUCH" = indices 0..4, "LINES" = indices 5..9 — accent
            const isAccent = i >= 5;
            return (
              <span
                key={i}
                style={{
                  display: "inline-block",
                  opacity: o,
                  transform: `translateY(${y}px)`,
                  color: isAccent
                    ? "oklch(0.75 0.18 var(--team-hue))"
                    : "oklch(0.95 0 0)",
                  textShadow: isAccent
                    ? "0 0 30px oklch(0.75 0.18 var(--team-hue) / 0.6), 0 0 60px oklch(0.75 0.18 var(--team-hue) / 0.3)"
                    : "none",
                }}
              >
                {ch}
              </span>
            );
          })}
        </div>

        {/* Bottom accent line */}
        <div
          className="h-px"
          style={{
            width: 700 * lineProgress,
            background:
              "linear-gradient(90deg, transparent, oklch(0.75 0.18 var(--team-hue)), transparent)",
          }}
        />

        {/* Subtitle */}
        <div
          className="text-muted-foreground font-display tracking-wider text-center max-w-2xl"
          style={{ opacity: taglineIn * 0.9, fontSize: 22 }}
        >
          Pick a club. Pick a tactic. Hit play.
        </div>

        {/* Stats strip */}
        <div
          className="flex items-center gap-10 mt-8"
          style={{ opacity: statsIn }}
        >
          {STATS.map((s, i) => (
            <React.Fragment key={s.label}>
              {i > 0 && <div className="w-px h-10 bg-border" />}
              <div className="flex flex-col items-center gap-1">
                <span className="text-2xl font-display font-black text-primary glow-text tabular-nums">
                  {s.value}
                </span>
                <span className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                  {s.label}
                </span>
              </div>
            </React.Fragment>
          ))}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
