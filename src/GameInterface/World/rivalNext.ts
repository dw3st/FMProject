import type { TFunction } from "i18next";
import { nationalityDisplayName } from "@/Domain/world/labels";
import type { RivalNextMatch } from "@/types/rivalsTypes";

/** The opponent text of a rival's next game: a club, or "Serbia × Germany" for a game of his national team. */
export function rivalNextOpponent(next: RivalNextMatch, lang: string, t: TFunction): string {
  if (!next.national) return next.opponentName;
  const nation = (n: string) => nationalityDisplayName(n, lang, t);
  return `${nation(next.national)} × ${nation(next.opponentName)}`;
}

/** The national team a rival also coaches, as shown next to his club, or null. */
export function rivalNation(nation: string | null | undefined, lang: string, t: TFunction): string | null {
  return nation ? nationalityDisplayName(nation, lang, t) : null;
}
