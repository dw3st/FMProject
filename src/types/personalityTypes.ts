/**
 * Player personality (`.claude/rules/game/personality.md`). Four traits on an internal 1..20 scale,
 * derived from the player's id (never stored); `RosterPlayer.personality` is only an override.
 */
export type PersonalityTrait = "ambition" | "loyalty" | "professionalism" | "temperament";

export interface Personality {
  ambition: number;
  loyalty: number;
  professionalism: number;
  /** 20 = hot-headed, 1 = very calm. */
  temperament: number;
}

/** Five text bands shown instead of the number. */
export type TraitBand = "very_low" | "low" | "medium" | "high" | "very_high";

/** One-word summary of the trait furthest from neutral. */
export type PersonalitySummary =
  | "balanced"
  | "ambitious" | "settled"
  | "loyal" | "mercenary"
  | "professional" | "sloppy"
  | "hothead" | "calm";

/**
 * What the screens show of a personality: the (possibly blurred) value of each trait, `null` when
 * the scout cannot tell, and whether the view is uncertain.
 */
export interface PersonalityView {
  traits: Record<PersonalityTrait, number | null>;
  /** Blurred by the chief scout (noise >= the range threshold). */
  uncertain: boolean;
}
