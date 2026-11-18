// Pure: the account profile summed from the careers' snapshots
// (`docs/superpowers/specs/2026-11-18-account-profile-design.md`).
import type {
  AccountAchievementsView, AccountCareer, AccountSecretId, AccountSingleId, AccountSummary, AccountTier,
  AccountTrackId, AccountTrackView, CareerTitle,
} from "@/types/accountTypes";

export const ACCOUNT = {
  MAX_BADGES: 3,
  TRACKS: {
    league_titles: [3, 10, 25],
    cups: [2, 6, 15],
    continentals: [1, 3, 8],
    title_countries: [2, 3, 5],
    title_saves: [2, 3, 5],
    seasons: [10, 25, 50],
    clubs: [3, 6, 10],
    wins: [100, 500, 1500],
    manager_awards: [1, 5, 15],
    promotions: [1, 3, 6],
  } satisfies Record<AccountTrackId, [number, number, number]>,
  SINGLES: ["world_best", "national_title", "world_cup", "friends_champion", "up_and_champion"] as AccountSingleId[],
  SECRETS: ["treble", "two_continents", "short_fuse", "wanderer", "phoenix"] as AccountSecretId[],
  SHORT_FUSE_REDS: 10,
  WANDERER_SACKINGS: 3,
  EUROPE_CONTINENTAL: ["ucl", "uel"],
  SOUTH_AMERICA_CONTINENTAL: ["lib", "sud"],
} as const;

export const ACCOUNT_TRACK_IDS = Object.keys(ACCOUNT.TRACKS) as AccountTrackId[];

const count = (titles: CareerTitle[], kind: CareerTitle["kind"]) => titles.filter((t) => t.kind === kind).length;

function allTitles(careers: AccountCareer[]): CareerTitle[] {
  return careers.flatMap((c) => c.titles);
}

function sackings(careers: AccountCareer[]): number {
  return careers.reduce((n, c) => n + c.passages.filter((p) => p.left === "sacked").length, 0);
}

function clubCount(careers: AccountCareer[]): number {
  const set = new Set<string>();
  for (const c of careers) for (const p of c.passages) if (!p.national) set.add(`${c.saveId}:${p.squadId}`);
  return set.size;
}

export function accountSummary(careers: AccountCareer[]): AccountSummary {
  const titles = allTitles(careers);
  const matches = careers.reduce((n, c) => n + c.matches, 0);
  const wins = careers.reduce((n, c) => n + c.wins, 0);
  const awards = careers.flatMap((c) => c.awards);
  const league = count(titles, "league"), cup = count(titles, "cup"), continental = count(titles, "continental");
  const national = count(titles, "national"), promotion = count(titles, "promotion");
  return {
    careers: careers.length,
    friendsCareers: careers.filter((c) => c.mode === "friends").length,
    titles: { total: league + cup + continental + national, league, cup, continental, national, promotion },
    seasons: careers.reduce((n, c) => n + c.seasons, 0),
    clubs: clubCount(careers),
    matches,
    wins,
    winPct: matches > 0 ? Math.round((wins / matches) * 100) : 0,
    awards: {
      total: awards.length,
      league: awards.filter((a) => a.kind === "best_manager").length,
      world: awards.filter((a) => a.kind === "world_manager").length,
    },
    sackings: sackings(careers),
    cards: {
      yellow: careers.reduce((n, c) => n + c.cards.yellow, 0),
      red: careers.reduce((n, c) => n + c.cards.red, 0),
    },
  };
}

function trackValues(careers: AccountCareer[], s: AccountSummary): Record<AccountTrackId, number> {
  const leagueTitles = allTitles(careers).filter((t) => t.kind === "league");
  return {
    league_titles: s.titles.league,
    cups: s.titles.cup,
    continentals: s.titles.continental,
    title_countries: new Set(leagueTitles.map((t) => t.country).filter(Boolean)).size,
    title_saves: careers.filter((c) => c.titles.some((t) => t.kind === "league")).length,
    seasons: s.seasons,
    clubs: s.clubs,
    wins: s.wins,
    manager_awards: s.awards.total,
    promotions: s.titles.promotion,
  };
}

/** Order of two titles in time: the credit date when both have one, else the season label. */
function before(a: CareerTitle, b: CareerTitle): boolean {
  if (a.on && b.on) return a.on < b.on;
  return a.season < b.season;
}

function upAndChampion(c: AccountCareer): boolean {
  const ups = c.titles.filter((t) => t.kind === "promotion");
  return c.titles.some((t) => t.kind === "league" && ups.some((u) =>
    u.squadId === t.squadId && u.competition !== t.competition && before(u, t)));
}

function treble(c: AccountCareer): boolean {
  const key = (t: CareerTitle) => `${t.squadId}|${t.season}`;
  const by = new Map<string, Set<string>>();
  for (const t of c.titles) {
    if (t.kind !== "league" && t.kind !== "cup" && t.kind !== "continental") continue;
    const s = by.get(key(t)) ?? new Set<string>();
    s.add(t.kind);
    by.set(key(t), s);
  }
  return [...by.values()].some((s) => s.size === 3);
}

function phoenix(c: AccountCareer): boolean {
  const clubs = c.passages.filter((p) => !p.national).slice().sort((a, b) => a.from.localeCompare(b.from));
  for (let i = 0; i + 1 < clubs.length; i++) {
    if (clubs[i]!.left !== "sacked") continue;
    const next = clubs[i + 1]!;
    if (c.titles.some((t) => t.kind === "league" && t.squadId === next.squadId
      && (!t.on || (t.on >= next.from && (!next.to || t.on <= next.to))))) return true;
  }
  return false;
}

const tierOf = (value: number, th: readonly number[]): AccountTier | null =>
  value >= th[2]! ? "gold" : value >= th[1]! ? "silver" : value >= th[0]! ? "bronze" : null;

export function accountAchievements(careers: AccountCareer[], s: AccountSummary = accountSummary(careers)): AccountAchievementsView {
  const values = trackValues(careers, s);
  const tracks: AccountTrackView[] = ACCOUNT_TRACK_IDS.map((id) => {
    const thresholds = [...ACCOUNT.TRACKS[id]] as [number, number, number];
    return { id, value: values[id], thresholds, tier: tierOf(values[id], thresholds) };
  });
  const titles = allTitles(careers);
  const singleOn: Record<AccountSingleId, boolean> = {
    world_best: s.awards.world > 0,
    national_title: s.titles.national > 0,
    world_cup: titles.some((t) => t.kind === "national" && t.competition.startsWith("wc_")),
    friends_champion: careers.some((c) => c.mode === "friends" && c.titles.some((t) => t.kind === "league")),
    up_and_champion: careers.some(upAndChampion),
  };
  const conts = titles.filter((t) => t.kind === "continental").map((t) => t.competition);
  const secretOn: Record<AccountSecretId, boolean> = {
    treble: careers.some(treble),
    two_continents: conts.some((x) => (ACCOUNT.EUROPE_CONTINENTAL as readonly string[]).includes(x))
      && conts.some((x) => (ACCOUNT.SOUTH_AMERICA_CONTINENTAL as readonly string[]).includes(x)),
    short_fuse: s.cards.red >= ACCOUNT.SHORT_FUSE_REDS,
    wanderer: s.sackings >= ACCOUNT.WANDERER_SACKINGS,
    phoenix: careers.some(phoenix),
  };
  const singles = ACCOUNT.SINGLES.map((id) => ({ id, unlocked: singleOn[id] }));
  const secrets = ACCOUNT.SECRETS.map((id) => (secretOn[id] ? { id, unlocked: true as const } : { unlocked: false as const }));
  const unlocked = tracks.reduce((n, t) => n + (t.tier === "gold" ? 3 : t.tier === "silver" ? 2 : t.tier ? 1 : 0), 0)
    + singles.filter((x) => x.unlocked).length + secrets.filter((x) => x.unlocked).length;
  return { tracks, singles, secrets, unlocked, total: ACCOUNT_TRACK_IDS.length * 3 + singles.length + secrets.length };
}

/** The badges a player may show: tracks with the gold. Unknown, locked or repeated ids → null. */
export function parseBadges(input: unknown, view: AccountAchievementsView): AccountTrackId[] | null {
  if (!Array.isArray(input) || input.length > ACCOUNT.MAX_BADGES) return null;
  const gold = new Set(view.tracks.filter((t) => t.tier === "gold").map((t) => t.id));
  const out: AccountTrackId[] = [];
  for (const x of input) {
    if (typeof x !== "string" || !gold.has(x as AccountTrackId) || out.includes(x as AccountTrackId)) return null;
    out.push(x as AccountTrackId);
  }
  return out;
}

/** Saved badges that are still gold (a stored badge never shows locked). */
export function shownBadges(saved: AccountTrackId[], view: AccountAchievementsView): AccountTrackId[] {
  const gold = new Set(view.tracks.filter((t) => t.tier === "gold").map((t) => t.id));
  return saved.filter((b) => gold.has(b)).slice(0, ACCOUNT.MAX_BADGES);
}
