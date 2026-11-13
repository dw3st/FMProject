import { describe, expect, test } from "bun:test";
import en from "@/i18n/locales/en.json";
import pt from "@/i18n/locales/pt-BR.json";

const KEYS = ["freeFormation", "preview", "analyst", "analystMark", "predictability", "predictabilityHelp", "result"] as const;
const LEVELS = ["low", "medium", "high"] as const;
type Block = { level?: Record<string, string> } & Record<string, unknown>;

describe("study keys", () => {
  test("en and pt-BR have every text", () => {
    for (const locale of [en, pt]) {
      const block = (locale as { study?: Block }).study;
      for (const k of KEYS) expect(block?.[k]).toBeTruthy();
      for (const l of LEVELS) expect(block?.level?.[l]).toBeTruthy();
      expect((locale as { stats?: Record<string, unknown> }).stats?.studyPlans).toBeTruthy();
    }
  });
});
