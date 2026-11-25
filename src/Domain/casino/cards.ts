/**
 * Playing cards of the games hall (blackjack, poker). A card is 0..51: rank = c % 13 + 2 (2..14, 14 = ace),
 * suit = floor(c / 13) (0 spades, 1 hearts, 2 diamonds, 3 clubs).
 */
export type Card = number;

export const rankOf = (c: Card) => (c % 13) + 2;
export const suitOf = (c: Card) => Math.floor(c / 13);

/** `decks` full decks shuffled (Fisher–Yates, one rng call per position). */
export function shuffledShoe(decks: number, rng: () => number): Card[] {
  const shoe: Card[] = [];
  for (let d = 0; d < decks; d++) for (let c = 0; c < 52; c++) shoe.push(c);
  for (let i = shoe.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shoe[i], shoe[j]] = [shoe[j]!, shoe[i]!];
  }
  return shoe;
}
