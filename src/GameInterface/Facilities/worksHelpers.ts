import { CRAFT } from "@/Domain/craft/craftConfig";
import { recipeFor } from "@/Domain/craft/recipes";
import { missingComponents } from "@/Domain/craft/stock";
import type { AcademyEffects, TrainingGroundEffects } from "@/Domain/facilities/facilities";
import type { ComponentId } from "@/types/craftTypes";
import type { RecipeBuild } from "@/GameInterface/Craft/RecipeLine";
import type { FacilitiesViewData } from "@/GameInterface/Facilities/facilitiesApi";
import { formatSigned } from "@/GameInterface/formatDate";

type TFn = (key: string, opts?: Record<string, unknown>) => string;

/** What a stand expansion takes from the stock: priced like the server's quote (seats × seat cost), its mix. */
export function standBuild(data: FacilitiesViewData, cost: number): RecipeBuild {
  const recipe = recipeFor({ kind: "stand" }, cost, data.revenue);
  const missing = data.stock ? missingComponents(data.stock, recipe) : recipe;
  const workshop = data.facilities.craft?.workshop ?? 1;
  const locked = (Object.keys(recipe) as ComponentId[]).filter((id) => CRAFT.RECIPES[id].minLevel > workshop);
  return { recipe, missing, locked, canBuild: Object.keys(missing).length === 0 };
}

/** A derived group level (mean of the item levels / 2) with at most one decimal. */
export function levelText(level: number, lang?: string): string {
  return (Math.round(level * 10) / 10).toLocaleString(lang);
}

const pct = (mult: number) => `${mult >= 1 ? "+" : "−"}${Math.abs(Math.round((mult - 1) * 100))}%`;

export function trainingText(e: TrainingGroundEffects, t: TFn): string {
  return t("facilities.training.effect", { recovery: pct(e.recoveryMult), injury: pct(e.injuryMult), dev: pct(e.devMult) });
}

export function academyText(e: AcademyEffects, t: TFn, lang: string): string {
  return t("facilities.academy.effect", {
    quality: formatSigned(e.qualityBonus, lang), max: e.intakeMax, promise: Math.round(e.promiseChance * 100),
  });
}
