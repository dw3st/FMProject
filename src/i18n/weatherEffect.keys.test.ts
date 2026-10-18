import { describe, expect, test } from "bun:test";
import en from "@/i18n/locales/en.json";
import pt from "@/i18n/locales/pt-BR.json";

const KEYS = ["rain", "snow", "wind", "hot", "cold", "covered"] as const;
type Block = Record<string, string> | undefined;

describe("weatherEffect keys", () => {
  test("en and pt-BR have every text", () => {
    for (const k of KEYS) {
      expect((en as { weatherEffect?: Block }).weatherEffect?.[k]).toBeTruthy();
      expect((pt as { weatherEffect?: Block }).weatherEffect?.[k]).toBeTruthy();
    }
  });
});
