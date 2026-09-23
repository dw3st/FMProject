import type { Formation } from "@/GameEngine/types";
import f343 from "@/Data/formations/3-4-3.json";
import f352 from "@/Data/formations/3-5-2.json";
import f4141 from "@/Data/formations/4-1-4-1.json";
import f4222 from "@/Data/formations/4-2-2-2.json";
import f4231 from "@/Data/formations/4-2-3-1.json";
import f4312 from "@/Data/formations/4-3-1-2.json";
import f433 from "@/Data/formations/4-3-3.json";
import f442 from "@/Data/formations/4-4-2.json";
import f451 from "@/Data/formations/4-5-1.json";
import f532 from "@/Data/formations/5-3-2.json";

/** Default formation for AI opponents and for fallbacks. */
export const DEFAULT_SIM_FORMATION_ID = "4-3-3";

const REGISTRY: Record<string, Formation> = {
  "3-4-3": f343 as Formation,
  "3-5-2": f352 as Formation,
  "4-1-4-1": f4141 as Formation,
  "4-2-2-2": f4222 as Formation,
  "4-2-3-1": f4231 as Formation,
  "4-3-1-2": f4312 as Formation,
  "4-3-3": f433 as Formation,
  "4-4-2": f442 as Formation,
  "4-5-1": f451 as Formation,
  "5-3-2": f532 as Formation,
};

/** Engine formation JSON by id (defaults to 4-3-3). */
export function formationForSimId(id: string | undefined): Formation {
  if (!id) return REGISTRY[DEFAULT_SIM_FORMATION_ID]!;
  return REGISTRY[id] ?? REGISTRY[DEFAULT_SIM_FORMATION_ID]!;
}
