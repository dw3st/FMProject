import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { ATTRIBUTE_LABELS, type AttributeId } from "@/Domain/attributes";

/**
 * Translated attribute name and description (#118): `attributeNames.<id>` and
 * `attributeDescriptions.<id>`; the English text of `ATTRIBUTE_LABELS` (or the raw id) is only the
 * fallback. Every screen that names or explains an attribute goes through here.
 */
export function attributeText(t: TFunction, id: string): { name: string; description: string } {
  const base = ATTRIBUTE_LABELS[id as AttributeId];
  return {
    name: t(`attributeNames.${id}`, { defaultValue: base?.label ?? id }),
    description: t(`attributeDescriptions.${id}`, { defaultValue: base?.description ?? "" }),
  };
}

/** Hook form of `attributeText`. */
export function useAttributeText(): (id: string) => { name: string; description: string } {
  const { t } = useTranslation();
  return (id) => attributeText(t, id);
}
