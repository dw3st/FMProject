import type { IconName } from "@/GameInterface/Icons";
import type { ReactionId } from "@/types/rivalsTypes";

export const REACTION_ICON: Record<ReactionId, IconName> = {
  applause: "react-applause",
  fire: "react-fire",
  laugh: "react-laugh",
  sorry: "react-sorry",
};

/** Colour of each reaction (report: plain grey icons were hard to tell apart). */
export const REACTION_COLOR: Record<ReactionId, string> = {
  applause: "text-primary",
  fire: "text-chart-5",
  laugh: "text-chart-4",
  sorry: "text-destructive",
};

/** Colour of a phrase by its tone: cheering a friend, teasing him, or neutral. */
export const TONE_COLOR = { cheer: "text-primary", tease: "text-chart-4", neutral: "text-foreground" } as const;
