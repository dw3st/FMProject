import { describe, expect, test } from "bun:test";
import en from "@/i18n/locales/en.json";
import pt from "@/i18n/locales/pt-BR.json";
import { STADIUM_SYMBOLS } from "@/Domain/casino/stadiumSlot";
import type { CasinoError } from "@/types/casinoTypes";

type Tree = { [key: string]: string | Tree };

function leaves(node: string | Tree, path = ""): string[] {
  if (typeof node === "string") return [path.replace(/_(zero|one|two|few|many|other)$/, "")];
  return Object.entries(node).flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k));
}
const keys = (block: unknown) => [...new Set(leaves(block as Tree))].sort();

const ERRORS: CasinoError[] = ["invalidStake", "stakeTooHigh", "dailyLossCap", "roundsCap", "noMoney", "roundOpen", "invalidMachine", "invalidAuto", "noRound", "noClub"];

describe("casino keys", () => {
  test("en and pt-BR have the same texts; every error, game and symbol has one", () => {
    expect(keys(pt.casino)).toEqual(keys(en.casino));
    for (const lang of [en, pt]) {
      const c = lang.casino as unknown as Tree;
      for (const e of ERRORS) expect(((c.errors as Tree)[e] as string).length).toBeGreaterThan(3);
      for (const s of STADIUM_SYMBOLS) expect(((c.symbol as Tree)[s] as string).length).toBeGreaterThan(2);
      for (const g of ["classic", "stadium", "crash"]) expect((c.games as Tree)[g]).toBeTruthy();
      expect((lang.achievements.tabs as Record<string, string>).casino).toBeTruthy();
    }
  });
});
