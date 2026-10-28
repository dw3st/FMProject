import { ACHIEVEMENTS as A } from "@/Domain/achievements/achievementsConfig";
import { renewalContract } from "@/Domain/contracts/contracts";
import { clamp } from "@/Domain/math";
import { weightedScore } from "@/Domain/playerRating";
import { generateReborn } from "@/Domain/retirement/retirement";
import { RETIREMENT } from "@/Domain/retirement/retirementConfig";
import { mulberry32, seedFrom, shuffle } from "@/Domain/rng";
import { getMainRole } from "@/Domain/roles";
import { nationalityFlagCode } from "@/Domain/world/nationalityFlag";
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

/** Level of a retired player at retirement (his best position's weighted score). */
export function retiredLevel(r: RetiredPlayer): number {
  return weightedScore(r.statsAtRetirement, r.positions[0] ?? "CM");
}

/**
 * Three retired stars to choose from: world class first, then the best level at retirement; never one
 * already brought back (reborn offer accepted, or a legend of any seat). Deterministic per save + date (+ the seat
 * in a world of seats, `.claude/rules/game/multiplayer.md`).
 */
export function legendOptions(retired: readonly RetiredPlayer[], saveId: string, date: string, seatId?: string): string[] {
  const pool = retired.filter((r) => r.rebornOffer !== "accepted" && !r.legendBy && !r.freeAgent);
  const ranked = [...pool].sort((a, b) =>
    Number(b.wasWorldClass) - Number(a.wasWorldClass) || retiredLevel(b) - retiredLevel(a) || a.id.localeCompare(b.id));
  const top = ranked.slice(0, Math.max(A.LEGEND_OPTIONS, 12));
  const seed = seatId ? `legend:${saveId}:${seatId}:${date}` : `legend:${saveId}:${date}`;
  return shuffle(top, mulberry32(seedFrom(seed))).slice(0, A.LEGEND_OPTIONS).map((r) => r.id);
}

/** A legend of the retired list: world class at retirement, not a free agent (`.claude/rules/game/retirement.md`). */
export function isLegend(r: RetiredPlayer): boolean {
  return r.wasWorldClass && !r.freeAgent;
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
): AchievementsState {
  const count = state.bought[`${item}Count`] ?? (state.bought[item] ? 1 : 0);
  const price = shopPrice(state, item);
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
