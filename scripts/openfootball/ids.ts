const toId = (s: string) => `of_${s.replace(/-/g, "_")}`;
export const leagueSlug = (seedSlug: string) => toId(seedSlug);
export const clubId = (seedClubId: string) => toId(seedClubId);
export const playerId = (seedPlayerId: string) => toId(seedPlayerId);

export function normName(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ı/g, "i")
    .toLowerCase()
    .replace(/[^a-z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** FNV-1a + fmix32 avalanche → [0, 1). Deterministic per key. */
export function unitHash(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Standard normal from a key (Box–Muller on two hashes). */
export function gaussianFromKey(key: string): number {
  const u1 = Math.max(unitHash(`${key}#1`), 1e-12);
  const u2 = unitHash(`${key}#2`);
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}
