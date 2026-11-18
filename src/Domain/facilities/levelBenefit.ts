import { FACILITIES as F } from "@/Domain/facilities/facilityConfig";
import { FACILITY_ITEMS, itemsOfGroup, lifeScale, wearFor } from "@/Domain/facilities/facilityItems";
import { academyEffectsAt, comfortLevelPriceMult, trainingEffectsAt } from "@/Domain/facilities/facilities";
import { clamp } from "@/Domain/math";
import type { FacilityGroup, FacilityItemId } from "@/types/facilityTypes";

/**
 * What an item's level gives the club, in the numbers the game reads (Club → Facilities, the level track).
 * Pure, no I/O. Item levels 1..10; the training ground and academy read only the mean of their items
 * (`groupLevel` = mean / 2), so those items show what their group gets with the item at that level and
 * the other items as they are.
 */

/** How a value is shown: a multiplier as ±N%, an addition (intake level), a chance, or seasons. */
export type BenefitKind = "mult" | "add" | "chance" | "seasons";

export type BenefitKey =
  | "trainingDev" | "trainingInjury" | "recovery" | "injuryDays" | "ticketPrice" | "intakeLevel" | "promise" | "life";

export interface BenefitValue {
  key: BenefitKey;
  kind: BenefitKind;
  value: number;
}

export interface BenefitContext {
  /** Levels (1..10) of the club's items now (a condemned item counts 1, as in the group level). */
  levels: Record<FacilityItemId, number>;
  /** Implied level 1..5 of the club's tier (academy and physio are relative to it). */
  impliedLevel: number;
}

/** Group level 1..5 with `id` at `level` and the other items of its group as they are. */
function groupLevelWith(g: FacilityGroup, id: FacilityItemId, level: number, ctx: BenefitContext): number {
  const ids = itemsOfGroup(g);
  return ids.reduce((s, x) => s + (x === id ? level : ctx.levels[x]), 0) / ids.length / 2;
}

/** Seasons a new item lasts until 40% in a typical season (one of each: 365 days, 25 home games, 200 sessions). */
export function lifeUntilWorn(id: FacilityItemId, level: number): number {
  return wearFor(F.WEAR.WARN_BELOW) * F.ITEMS[id].life * lifeScale(level);
}

/** Physio: × days out of a new injury by its level (the condition part is not the level's). */
function physioDays(level: number, implied: number): number {
  const w = F.WEAR;
  return clamp(1 - w.PHYSIO_DURATION_LEVEL_STEP * (level - 2 * implied), w.PHYSIO_DURATION_LEVEL_MIN, w.PHYSIO_DURATION_LEVEL_MAX);
}

/**
 * The values an item gives at `level` (the first one is the headline of the track):
 * - training pitches, gym, canteen: the training ground's training DP (and the pitches its injury risk);
 * - pool: the training ground's daily recovery; physio: recovery and the days out of a new injury;
 * - seats: the ticket price (comfort = seats level / 2);
 * - stadium pitch and structure: their level only changes how long they last (seasons until 40%);
 * - academy pitches and lodging: the academy's intake level and wonderkid chance, against the tier.
 */
export function itemLevelBenefit(id: FacilityItemId, level: number, ctx: BenefitContext): BenefitValue[] {
  const lv = clamp(Math.round(level), 1, F.ITEM_MAX_LEVEL);
  const training = () => trainingEffectsAt(groupLevelWith("training", id, lv, ctx));
  const academy = () => academyEffectsAt(F.NEUTRAL_LEVEL + groupLevelWith("academy", id, lv, ctx) - ctx.impliedLevel);
  switch (id) {
    case "trainingPitches": {
      const e = training();
      return [{ key: "trainingDev", kind: "mult", value: e.devMult }, { key: "trainingInjury", kind: "mult", value: e.injuryMult }];
    }
    case "gym":
    case "canteen":
      return [{ key: "trainingDev", kind: "mult", value: training().devMult }];
    case "pool":
      return [{ key: "recovery", kind: "mult", value: training().recoveryMult }];
    case "physio":
      return [
        { key: "recovery", kind: "mult", value: training().recoveryMult },
        { key: "injuryDays", kind: "mult", value: physioDays(lv, ctx.impliedLevel) },
      ];
    case "seats":
      return [{ key: "ticketPrice", kind: "mult", value: comfortLevelPriceMult(lv / 2) }];
    case "stadiumPitch":
    case "stadiumStructure":
      return [{ key: "life", kind: "seasons", value: lifeUntilWorn(id, lv) }];
    case "academyPitches": {
      const e = academy();
      return [{ key: "intakeLevel", kind: "add", value: e.qualityBonus }, { key: "promise", kind: "chance", value: e.promiseChance }];
    }
    case "academyLodging": {
      const e = academy();
      return [{ key: "promise", kind: "chance", value: e.promiseChance }, { key: "intakeLevel", kind: "add", value: e.qualityBonus }];
    }
  }
}

/** The track of an item: its values at every level 1..10. */
export function itemLevelTrack(id: FacilityItemId, ctx: BenefitContext): BenefitValue[][] {
  return Array.from({ length: F.ITEM_MAX_LEVEL }, (_, i) => itemLevelBenefit(id, i + 1, ctx));
}

/** Context from the club's items (level, condemned), as the group levels read them. */
export function benefitContext(
  items: Record<FacilityItemId, { level: number; condemned?: boolean }>, impliedLevel: number,
): BenefitContext {
  const levels = {} as Record<FacilityItemId, number>;
  for (const id of FACILITY_ITEMS) levels[id] = items[id].condemned ? 1 : items[id].level;
  return { levels, impliedLevel };
}

/**
 * Whether a higher value is better for the club (injury risk and days out are better lower). Used to colour a change.
 */
export const higherIsBetter = (key: BenefitKey): boolean => key !== "trainingInjury" && key !== "injuryDays";
