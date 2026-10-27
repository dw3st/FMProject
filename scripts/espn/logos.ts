export const ESPN_LOGO_DIR = "espn";
/** TheSportsDB crests (scripts/fetchTheSportsDBBadges.ts) for clubs with neither a native nor an ESPN crest. */
export const TSDB_LOGO_DIR = "tsdb";

export interface LogoSquadRef {
  id: string;
  slug: string;
  /** Native league folder the club came from (its logos/ folder), or null for of_* / new clubs. */
  nativeLeague: string | null;
}

/**
 * squadId → "{folder}/{stem}" for every club with a crest. A native file (logos/{nativeLeague}/{slug|id})
 * wins over the ESPN crest (logos/espn/{id}.png), which wins over the TheSportsDB crest (logos/tsdb/{id}.png);
 * clubs with none are left out. `nativeFiles` holds "folder/stem" entries without extension; `espnIds` the
 * squads with a downloaded ESPN crest; `tsdbIds` the squads with a file in logos/tsdb/.
 */
export function buildLogoIndex(squads: LogoSquadRef[], nativeFiles: Set<string>, espnIds: Set<string>, tsdbIds: Set<string> = new Set()): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of [...squads].sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }))) {
    const native = s.nativeLeague
      ? [`${s.nativeLeague}/${s.slug}`, `${s.nativeLeague}/${s.id}`].find((k) => nativeFiles.has(k))
      : undefined;
    if (native) out[s.id] = native;
    else if (espnIds.has(s.id)) out[s.id] = `${ESPN_LOGO_DIR}/${s.id}`;
    else if (tsdbIds.has(s.id)) out[s.id] = `${TSDB_LOGO_DIR}/${s.id}`;
  }
  return out;
}
