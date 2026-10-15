import type { SaveManager } from "@/types/seatTypes";
import { parseManagerFace } from "@/Domain/faces/managerFace";
import { MANAGER_BACKGROUNDS, MANAGER_NATIONALITIES } from "@/Data/managerBackgrounds";

const NAME_MIN = 2;
const NAME_MAX = 40;

/** The manager of a `join` (the same fields as the new game); null when anything is off. */
export function parseSeatManager(raw: unknown): SaveManager | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.name !== "string" || typeof r.nationalityIso !== "string" || typeof r.backgroundId !== "string") return null;
  const name = r.name.trim();
  if (name.length < NAME_MIN || name.length > NAME_MAX) return null;
  if (!MANAGER_NATIONALITIES.some((n) => n.id === r.nationalityIso)) return null;
  if (!MANAGER_BACKGROUNDS.some((b) => b.id === r.backgroundId)) return null;
  const face = parseManagerFace(r.face);
  if (face === null) return null;
  return { name, nationalityIso: r.nationalityIso, backgroundId: r.backgroundId, ...(face ? { face } : {}) };
}
