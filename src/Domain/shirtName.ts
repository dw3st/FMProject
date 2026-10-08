/**
 * Name printed on the shirt, used where the full name does not fit (the live match: pitch labels,
 * team panels, match events). Squads, player pages and tables keep the full name.
 *
 * - "Grady Akiobo Akiobo" → "Akiobo"; "E. Haaland" → "Haaland" (the initial goes away)
 * - Surname particles stay: "Virgil van Dijk" → "van Dijk", "Kevin De Bruyne" → "De Bruyne"
 * - Generational suffixes stay with the name before them: "Vinícius Júnior" → "Vinícius Júnior"
 * - One-token names ("Rodri") and hyphenated surnames ("Alexander-Arnold") stay as they are.
 */

const PARTICLES = new Set([
  "da", "de", "di", "do", "du", "das", "dos", "del", "della", "der", "den", "des", "van", "von",
  "ter", "ten", "le", "la", "el", "al", "bin", "ibn", "mac", "st", "st.", "y",
]);

const SUFFIXES = new Set(["jr", "jr.", "júnior", "junior", "filho", "neto", "sobrinho", "ii", "iii"]);

/** A first-name initial such as "E." or "J.-P.". */
function isInitial(token: string): boolean {
  return /^(\p{L}\.)(-?\p{L}\.)*$/u.test(token);
}

export function shirtName(name: string): string {
  const tokens = name.trim().split(/\s+/).filter(Boolean);
  if (tokens.length <= 1) return tokens[0] ?? "";

  let start = tokens.length - 1;
  // "Vinícius Júnior": the suffix goes with the token before it.
  if (SUFFIXES.has(tokens[start]!.toLowerCase()) && start > 0) start--;
  // "van der Vaart", "De Bruyne": particles before the surname belong to it.
  while (start > 0 && PARTICLES.has(tokens[start - 1]!.toLowerCase())) start--;
  // Never keep a lone initial ("E. Haaland" → "Haaland").
  while (start < tokens.length - 1 && isInitial(tokens[start]!)) start++;
  return tokens.slice(start).join(" ");
}
