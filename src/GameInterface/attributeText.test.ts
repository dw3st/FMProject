import { describe, expect, test } from "bun:test";
import { ATTRIBUTE_LABELS } from "@/Domain/attributes";
import en from "@/i18n/locales/en.json";
import ptBR from "@/i18n/locales/pt-BR.json";

describe("attribute texts (#118)", () => {
  for (const [lang, locale] of [["en", en], ["pt-BR", ptBR]] as const) {
    test(`${lang} names and describes every attribute`, () => {
      const names = locale.attributeNames as Record<string, string>;
      const descriptions = locale.attributeDescriptions as Record<string, string>;
      for (const id of Object.keys(ATTRIBUTE_LABELS)) {
        expect(names[id]?.trim().length ?? 0).toBeGreaterThan(0);
        expect(descriptions[id]?.trim().length ?? 0).toBeGreaterThan(0);
      }
    });
  }

  test("pt-BR descriptions are not the English ones", () => {
    const descriptions = ptBR.attributeDescriptions as Record<string, string>;
    for (const [id, attr] of Object.entries(ATTRIBUTE_LABELS)) {
      expect(descriptions[id]).not.toBe(attr.description);
    }
  });
});
