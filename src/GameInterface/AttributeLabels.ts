/**
 * Central definitions for player attribute labels and descriptions.
 * Use these in the UI for tooltips, stat panels, player cards, etc.
 *
 * For localized strings, prefer `useAttributeLabel(id)` / `useAttributeDescription(id)`
 * which read from i18next. The constants below remain as English fallback.
 */

export type AttributeId =
  | "passing"
  | "vision"
  | "finishing"
  | "dribbling"
  | "speed"
  | "acceleration"
  | "tackling"
  | "pressing"
  | "stamina"
  | "heading"
  | "strength"
  | "reflex"
  | "jump";

export interface AttributeLabel {
  id: AttributeId;
  label: string;
  description: string;
}

export const ATTRIBUTE_LABELS: Record<AttributeId, AttributeLabel> = {
  passing: {
    id: "passing",
    label: "Passing",
    description: "How accurately the player delivers short and medium passes.",
  },
  vision: {
    id: "vision",
    label: "Vision",
    description: "How well the player sees options, especially forward or difficult passes.",
  },
  finishing: {
    id: "finishing",
    label: "Finishing",
    description: "How accurate the player is when shooting at goal.",
  },
  dribbling: {
    id: "dribbling",
    label: "Dribbling",
    description: "How well the player carries the ball and beats pressure while moving.",
  },
  speed: {
    id: "speed",
    label: "Speed",
    description: "Top movement speed.",
  },
  acceleration: {
    id: "acceleration",
    label: "Acceleration",
    description: "How quickly the player reaches speed and reacts to movement changes.",
  },
  tackling: {
    id: "tackling",
    label: "Tackling",
    description: "How well the player wins the ball in challenges.",
  },
  pressing: {
    id: "pressing",
    label: "Pressing",
    description: "How effectively the player closes down opponents and applies pressure.",
  },
  stamina: {
    id: "stamina",
    label: "Stamina",
    description: "How well the player maintains performance across 90 minutes.",
  },
  heading: {
    id: "heading",
    label: "Heading",
    description: "How effectively the player wins and directs aerial duels.",
  },
  strength: {
    id: "strength",
    label: "Strength",
    description: "Physical power in duels, holding up play, and shot force.",
  },
  reflex: {
    id: "reflex",
    label: "Reflex",
    description: "Goalkeeper reaction ability for close-range and fast shots.",
  },
  jump: {
    id: "jump",
    label: "Jump",
    description: "Goalkeeper reach and extension for high balls and long-range efforts.",
  },
};

/** Attribute ids hidden from UI displays (still in the type for data compatibility). */
const HIDDEN_ATTRIBUTES: ReadonlySet<AttributeId> = new Set(["heading"]);

/** All attribute entries in a stable order for listing in the UI. */
export const ATTRIBUTE_LIST: AttributeLabel[] = Object.values(ATTRIBUTE_LABELS).filter(
  (a) => !HIDDEN_ATTRIBUTES.has(a.id),
);

