import { ACHIEVEMENTS as A } from "@/Domain/achievements/achievementsConfig";
import { renewalContract } from "@/Domain/contracts/contracts";
import { clamp } from "@/Domain/math";
import { weightedScore } from "@/Domain/playerRating";
import { generateReborn } from "@/Domain/retirement/retirement";
import { RETIREMENT } from "@/Domain/retirement/retirementConfig";
import { getMainRole } from "@/Domain/roles";
import { nationalityFlagCode } from "@/Domain/world/nationalityFlag";
import { mulberry32, seedFrom } from "@/Domain/rng";
import { normalizeForSearch } from "@/Domain/world/labels";
import { YOUTH } from "@/Domain/youth/youthConfig";
import { lineAverage, statsFor } from "@/Domain/youth/youth";
import type { DetailedRole, RetiredPlayer, RosterPlayer, Squad } from "@/types/playerTypes";
import type { AchievementsState } from "@/types/achievementTypes";

/** The final rewards bought with points (spec §5): the created player and the retired legend. */

export const CREATED_POSITIONS: readonly DetailedRole[] = [
  "GK", "CB", "LB", "RB", "LWB", "RWB", "CDM", "CM", "CAM", "LM", "RM", "LW", "RW", "ST",
];

export interface CreatedPlayerInput {
  name: string;
  position: DetailedRole;
  nationality: string;
  foot: "left" | "right";
}

/** Validates the created-player body. Throws `invalidPlayer`. */
export function parseCreatedPlayer(raw: unknown): CreatedPlayerInput {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("invalidPlayer");
  const r = raw as Record<string, unknown>;
  const name = typeof r.name === "string" ? r.name.trim().replace(/\s+/g, " ") : "";
  if (name.length < 2 || name.length > 30 || /[<>&"]/.test(name)) throw new Error("invalidPlayer");
  if (typeof r.position !== "string" || !(CREATED_POSITIONS as readonly string[]).includes(r.position)) throw new Error("invalidPlayer");
  if (typeof r.nationality !== "string" || !nationalityFlagCode(r.nationality)) throw new Error("invalidPlayer");
  if (r.foot !== "left" && r.foot !== "right") throw new Error("invalidPlayer");
  return { name, position: r.position as DetailedRole, nationality: r.nationality, foot: r.foot };
}

/**
 * A 16-year-old academy prospect of the chosen identity: level = the club's line average − 1.8 + the
 * intake's promise bonus + 0.3 (no noise), attributes shaped by the position, academy contract.
 */
export function createdPlayer(args: {
  input: CreatedPlayerInput;
  squad: Squad;
  date: string;
  nextSeasonEnd: string;
}): RosterPlayer {
  const { input, squad, date, nextSeasonEnd } = args;
  const role = getMainRole(input.position);
  const level = clamp(
    lineAverage(squad, role) - YOUTH.LEVEL_OFFSET + YOUTH.PROMISE_BONUS + A.CREATED_EXTRA_LEVEL,
    YOUTH.LEVEL_MIN, YOUTH.LEVEL_MAX,
  );
  const id = `created_${squad.id}_${date.replaceAll("-", "")}`;
  const player: RosterPlayer = {
    id,
    name: input.name,
    age: A.CREATED_AGE,
    squadId: squad.id,
    preferredFoot: input.foot,
    positions: [input.position],
    naturalPosition: input.position,
    stats: statsFor(id, input.position, level),
    profile: { summary: "Exceptional academy prospect.", archetype: "Wonderkid" },
    nationality: input.nationality,
    academyOf: squad.id,
  };
  return { ...player, contract: renewalContract(player, squad, nextSeasonEnd, YOUTH.CONTRACT_YEARS) };
}

/** Level of a retired player: the best of his career when known (`peakLevel`), at least the level he retired with. */
export function retiredLevel(r: RetiredPlayer): number {
  return Math.max(weightedScore(r.statsAtRetirement, r.positions[0] ?? "CM"), r.peakLevel ?? 0);
}

/** What he did in the game (only what is known from the start of the world on). */
export function careerInGame(r: RetiredPlayer): { apps: number; titles: number; awards: number } {
  const rows = r.history ?? [];
  return {
    apps: rows.reduce((n, h) => n + h.apps, 0),
    titles: rows.reduce((n, h) => n + h.titles.length, 0) + (r.national?.titles.length ?? 0),
    awards: rows.reduce((n, h) => n + (h.awards?.length ?? 0), 0),
  };
}

function wonTopAward(r: RetiredPlayer): boolean {
  return (r.history ?? []).some((h) => h.awards?.some((a) => a.kind === "best_player" || a.kind === "world_player"));
}

export type LegendRarity = "common" | "rare" | "super";

/** Rarity of a retiree in the shop: super rare (world class or a very high level), rare (a legend), common. */
export function legendRarity(r: RetiredPlayer): LegendRarity {
  if (r.wasWorldClass) return "super";
  if (r.real) return "rare";
  if (!isLegend(r)) return "common";
  return retiredLevel(r) >= RETIREMENT.SUPER_LEVEL[getMainRole(r.positions[0] ?? "CM")] ? "super" : "rare";
}

/** Points on top of the shop's price for a retiree of this rarity. */
export function legendExtraPrice(r: RetiredPlayer): number {
  return A.LEGEND_OFFER.EXTRA[legendRarity(r)];
}

/**
 * The legends this manager is offered this season (tester report): `SIZE` retirees drawn by a weighted
 * draw from every notable one (completed with the best others while the world has few), rarest first.
 * Only who had retired by the start of the season counts, so the list does not change as other
 * countries turn over; one taken by another manager gives his place to the next. Never one already
 * brought back or a free agent.
 */
export function legendOffer(
  retired: readonly RetiredPlayer[],
  o: { saveId: string; seatId: string; season: string; seasonStart: string },
): RetiredPlayer[] {
  const free = retired
    .filter((r) => r.rebornOffer !== "accepted" && !r.legendBy && !r.freeAgent)
    .sort((a, b) => retiredLevel(b) - retiredLevel(a) || a.id.localeCompare(b.id));
  const known = free.filter((r) => r.retiredOn <= o.seasonStart);
  const pool = known.length >= A.LEGEND_OFFER.SIZE ? known : free;
  // Only real legends are drawn (11/2026: the notable cut let hundreds of average retirees bury the few legends);
  // a young world with fewer legends than the list is completed with the best of the rest.
  const legends = pool.filter(isLegend);
  const base = legends.length >= A.LEGEND_OFFER.SIZE
    ? legends
    : [...legends, ...pool.filter((r) => !isLegend(r)).slice(0, A.LEGEND_OFFER.SIZE - legends.length)];
  // Weighted draw without replacement: the largest u^(1/weight), from each player's own stable number.
  const key = (r: RetiredPlayer) =>
    mulberry32(seedFrom(`legend:${o.saveId}:${o.seatId}:${o.season}:${r.id}`))() ** (1 / A.LEGEND_OFFER.WEIGHT[legendRarity(r)]);
  const order: Record<LegendRarity, number> = { super: 0, rare: 1, common: 2 };
  return base
    .map((r) => ({ r, k: key(r) }))
    .sort((a, b) => b.k - a.k)
    .slice(0, A.LEGEND_OFFER.SIZE)
    .map(({ r }) => r)
    .sort((a, b) => order[legendRarity(a)] - order[legendRarity(b)] || retiredLevel(b) - retiredLevel(a) || a.id.localeCompare(b.id));
}

/**
 * A legend of the retired list (`.claude/rules/game/retirement.md`), never a free agent: world class, the best of his
 * line by career-best level with a career in the game (150 games or a title), or a real career in the game (a top individual award, or titles, awards or games, with a
 * decent level). The cut is by line because defenders and keepers keep their level far longer than attackers.
 */
export function isLegend(r: RetiredPlayer): boolean {
  if (r.real) return true;
  if (r.freeAgent) return false;
  if (r.wasWorldClass) return true;
  const level = retiredLevel(r);
  const career = careerInGame(r);
  const L = RETIREMENT.LEGEND_LEVEL_CAREER;
  if (level >= RETIREMENT.LEGEND_LEVEL[getMainRole(r.positions[0] ?? "CM")] && (career.apps >= L.APPS || career.titles >= L.TITLES)) return true;
  const C = RETIREMENT.LEGEND_CAREER;
  if (level < C.MIN_LEVEL) return false;
  return wonTopAward(r) || career.titles >= C.TITLES || career.awards >= C.AWARDS || career.apps >= C.APPS;
}

/** A retiree worth listing by default: a legend, or level at retirement >= `NOTABLE_MIN_LEVEL`. */
export function isNotableRetiree(r: RetiredPlayer): boolean {
  return isLegend(r) || (!r.freeAgent && retiredLevel(r) >= RETIREMENT.NOTABLE_MIN_LEVEL);
}

/** The retired list filters: name (accents and case ignored), nationality, and only the notable ones. */
export function filterRetired(
  list: RetiredPlayer[],
  f: { q?: string; nation?: string; notable?: boolean },
): RetiredPlayer[] {
  const q = normalizeForSearch((f.q ?? "").trim());
  return list.filter((r) =>
    (!q || normalizeForSearch(r.name).includes(q))
    && (!f.nation || r.nationality === f.nation)
    && (!f.notable || isNotableRetiree(r)));
}

/** Still out of the game: never brought back as a reborn or a legend, by anyone. */
export function legendAvailable(r: RetiredPlayer): boolean {
  return isLegend(r) && r.rebornOffer !== "accepted" && !r.legendBy;
}

/** Money to bring a legend back to the academy (no points): by his level at retirement, €0.1M grid. */
export function legendHireFee(r: RetiredPlayer): number {
  const c = RETIREMENT.LEGEND_HIRE;
  const raw = c.FEE_MIN + c.FEE_PER_LEVEL * (retiredLevel(r) - c.FEE_PIVOT);
  return Math.round(Math.min(c.FEE_MAX, Math.max(c.FEE_MIN, raw)) / 100_000) * 100_000;
}

/** The legend back as a 17-year-old (the reborn rule), with its own id. */
export function legendPlayer(args: { retired: RetiredPlayer; squad: Squad; year: number; nextSeasonEnd: string }): RosterPlayer {
  const p = generateReborn(args);
  return { ...p, id: `legend_${args.retired.id}_${args.year}` };
}

// ── Purchases: once per season, the price rising with each one (tester report) ──────────────

export type ShopItem = "created" | "legend";

/** Price of the next purchase of `item`: the base plus `SHOP_STEP` per earlier purchase. */
export function shopPrice(state: AchievementsState, item: ShopItem): number {
  const count = state.bought[`${item}Count`] ?? (state.bought[item] ? 1 : 0);
  return A.SHOP[item] + A.SHOP_STEP * count;
}

/** Already bought in this season (`season` = "league:year" of the manager's league). */
export function boughtThisSeason(state: AchievementsState, item: ShopItem, season: string): boolean {
  return state.bought[`${item}Season`] === season;
}

/** The state after a purchase of `item` on `date`, in `season`: points spent, the count and the season kept. */
export function recordPurchase(
  state: AchievementsState, item: ShopItem, date: string, season: string,
  player?: { id: string; name: string; positions: string[]; fromId?: string },
  extraPrice = 0,
): AchievementsState {
  const count = state.bought[`${item}Count`] ?? (state.bought[item] ? 1 : 0);
  const price = shopPrice(state, item) + extraPrice;
  return {
    ...state,
    spent: state.spent + price,
    ...(player ? {
      purchases: [...(state.purchases ?? []), {
        item, date, playerId: player.id, name: player.name, position: player.positions[0] ?? "", price,
        ...(player.fromId ? { fromId: player.fromId } : {}),
      }],
    } : {}),
    bought: { ...state.bought, [item]: date, [`${item}Season`]: season, [`${item}Count`]: count + 1 },
  };
}
