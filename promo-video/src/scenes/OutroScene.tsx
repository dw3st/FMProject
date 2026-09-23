import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  Easing,
} from "remotion";
import { Gamepad2, ChevronRight } from "lucide-react";

const eo = Easing.bezier(0.16, 1, 0.3, 1);

export const OutroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const wordmarkIn = interpolate(frame, [0, fps * 0.6], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: eo,
  });
  const wordmarkScale = interpolate(frame, [0, fps * 0.6], [1.1, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: eo,
  });

  const ctaIn = interpolate(frame, [fps * 0.9, fps * 1.4], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: eo,
  });

  const pulse = 0.5 + Math.sin(frame / 7) * 0.5;

  const bgZoom = interpolate(frame, [0, fps * 3.5], [1, 1.08], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill data-team="green" className="bg-background overflow-hidden">
      {/* Radial */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse at center, oklch(0.18 0.04 var(--team-hue)) 0%, oklch(0.06 0.02 var(--team-hue)) 70%)",
          transform: `scale(${bgZoom})`,
        }}
      />

      {/* Decorative diagonal sweep */}
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(120deg, transparent 40%, oklch(0.75 0.18 var(--team-hue) / 0.06) 50%, transparent 60%)",
        }}
      />

      <AbsoluteFill className="flex flex-col items-center justify-center gap-7">
        {/* Top accent */}
        <div
          className="h-px"
          style={{
            width: 600,
            background:
              "linear-gradient(90deg, transparent, oklch(0.75 0.18 var(--team-hue)), transparent)",
            opacity: wordmarkIn,
          }}
        />

        {/* Wordmark */}
        <div
          className="flex items-baseline font-display font-black tracking-tight"
          style={{
            fontSize: 180,
            lineHeight: 1,
            opacity: wordmarkIn,
            transform: `scale(${wordmarkScale})`,
          }}
        >
          <span style={{ color: "oklch(0.95 0 0)" }}>TOUCH</span>
          <span
            style={{
              color: "oklch(0.75 0.18 var(--team-hue))",
              textShadow:
                "0 0 40px oklch(0.75 0.18 var(--team-hue) / 0.7), 0 0 100px oklch(0.75 0.18 var(--team-hue) / 0.4)",
            }}
          >
            LINES
          </span>
        </div>

        {/* Bottom accent */}
        <div
          className="h-px"
          style={{
            width: 600,
            background:
              "linear-gradient(90deg, transparent, oklch(0.75 0.18 var(--team-hue)), transparent)",
            opacity: wordmarkIn,
          }}
        />

        {/* CTA button — same shape as Continue button in the real top nav */}
        <div
          className="flex items-center gap-2 px-10 py-4 rounded-lg bg-primary text-primary-foreground text-xl font-display font-black uppercase tracking-wider glow-primary"
          style={{
            opacity: ctaIn,
            boxShadow: `0 0 ${30 + pulse * 40}px oklch(0.75 0.18 var(--team-hue) / ${
              0.4 + pulse * 0.4
            })`,
          }}
        >
          <Gamepad2 className="w-6 h-6" />
          Play Now
          <ChevronRight className="w-6 h-6" />
        </div>

        {/* Footer */}
        <div
          className="absolute bottom-10 left-0 right-0 text-center text-xs uppercase tracking-[0.3em] text-muted-foreground"
          style={{ opacity: ctaIn * 0.7 }}
        >
          The Football Management Arcade · Forget the spreadsheets · Skip the 90-min wait
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
