import type { TFunction } from "i18next";
import { CUSTOM_FORMATION_ID, customToFormation } from "@/Domain/formation/zones";
import { FORMATION_IDS, formationForSimId } from "@/Domain/matchFormations";
import type { H2HCommand } from "@/types/h2hTypes";
import type { TacticsSave } from "@/types/tacticsTypes";
import type { UserFormation } from "@/GameInterface/SubstitutionPanel";

/**
 * The manager's own formations for the live match (tester report, 8.9.37): the saved free formation and the formation
 * of each saved lineup (A, B, C). A ready-made one is offered too when it is a saved lineup, under its slot's name.
 */
export function userFormationsOf(tactics: TacticsSave | undefined, t: TFunction): UserFormation[] {
  const out: UserFormation[] = [];
  if (tactics?.customFormation) {
    out.push({ id: "user:free", label: t("substitutionPanel.freeFormation"), formation: { ...customToFormation(tactics.customFormation), id: "user:free" }, custom: tactics.customFormation });
  }
  for (const key of ["A", "B", "C"] as const) {
    const preset = tactics?.lineupPresets?.[key];
    if (!preset) continue;
    const custom = preset.formation === CUSTOM_FORMATION_ID ? preset.customFormation : undefined;
    const base = custom ? customToFormation(custom) : formationForSimId(preset.formation);
    const name = preset.formation === CUSTOM_FORMATION_ID ? t("substitutionPanel.freeShort") : preset.formation;
    const label = preset.name
      ? t("substitutionPanel.presetNamed", { name: preset.name, formation: name })
      : t("substitutionPanel.presetFormation", { key, formation: name });
    out.push({ id: `user:${key}`, label, formation: { ...base, id: `user:${key}` }, ...(custom ? { custom } : { readyId: preset.formation }) });
  }
  return out;
}

/**
 * The formation command of a match between two managers: one of his own formations goes with its slots (a free one)
 * or by its ready-made id; anything else only when it is a ready-made formation. Null = nothing the server takes.
 */
export function h2hFormationCommand(own: UserFormation | undefined, fallbackId: string): Extract<H2HCommand, { kind: "formation" }> | null {
  if (own?.custom) return { kind: "formation", formation: own.id, custom: own.custom };
  const id = own?.readyId ?? fallbackId;
  return FORMATION_IDS.includes(id) ? { kind: "formation", formation: id } : null;
}
