import type { IconName } from "@/GameInterface/Icons";
import type { ReactionId } from "@/types/rivalsTypes";

export const REACTION_ICON: Record<ReactionId, IconName> = {
  applause: "react-applause",
  fire: "react-fire",
  laugh: "react-laugh",
  sorry: "react-sorry",
  horn: "react-horn",
  popcorn: "react-popcorn",
  dryer: "react-dryer",
  cry: "react-cry",
  chicken: "react-chicken",
  redcard: "react-redcard",
  vuvuzela: "react-vuvuzela",
  drum: "react-drum",
  trophy: "react-trophy",
  crown: "react-crown",
  wall: "react-wall",
  safe: "react-safe",
  dice: "react-dice",
};

/** Colour of each reaction (report: plain grey icons were hard to tell apart). */
export const REACTION_COLOR: Record<ReactionId, string> = {
  applause: "text-primary",
  fire: "text-chart-5",
  laugh: "text-chart-4",
  sorry: "text-destructive",
  horn: "text-chart-4",
  popcorn: "text-chart-4",
  dryer: "text-chart-5",
  cry: "text-primary",
  chicken: "text-chart-4",
  redcard: "text-foreground",
  vuvuzela: "text-chart-4",
  drum: "text-destructive",
  trophy: "text-chart-4",
  crown: "text-chart-4",
  wall: "text-muted-foreground",
  safe: "text-chart-2",
  dice: "text-foreground",
};

/** Colour of a phrase by its tone: cheering a friend, teasing him, or neutral. */
export const TONE_COLOR = { cheer: "text-primary", tease: "text-chart-4", neutral: "text-foreground" } as const;
