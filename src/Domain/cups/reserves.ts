/**
 * Reserve / B sides ("Real Sociedad B", "Zenit 2", "Jong Ajax II"): a name ending in II / B / 2 whose stem is the name
 * of another club of the same country. They play their league but never the national cup (report: Copa del Rey
 * against Real Sociedad B). "Willem II" stays in: no club is called just "Willem".
 */
const RESERVE_SUFFIX_RE = /\s+(?:II|B|2)$/i;

const norm = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function reserveClubIds(clubs: ReadonlyArray<{ id: string; name: string }>): Set<string> {
  const names = new Set(clubs.map(c => norm(c.name)));
  const out = new Set<string>();
  for (const c of clubs) {
    const m = RESERVE_SUFFIX_RE.exec(c.name);
    if (m && names.has(norm(c.name.slice(0, m.index)))) out.add(c.id);
  }
  return out;
}
