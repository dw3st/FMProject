import { describe, expect, test } from "bun:test";
import en from "@/i18n/locales/en.json";
import pt from "@/i18n/locales/pt-BR.json";
import { BET_MARKETS, ODDS_BANDS } from "@/Domain/bets/betStats";

type Tree = { [key: string]: string | Tree };

function leaves(node: string | Tree, path = ""): string[] {
  if (typeof node === "string") return [path.replace(/_(zero|one|two|few|many|other)$/, "")];
  return Object.entries(node).flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k));
}
const keys = (block: unknown) => [...new Set(leaves(block as Tree))].sort();

describe("bets keys", () => {
  test("en and pt-BR have the same texts; every odds band and market has one", () => {
    expect(keys(pt.bets)).toEqual(keys(en.bets));
    for (const lang of [en, pt]) {
      const b = lang.bets as unknown as Tree;
      for (const band of ODDS_BANDS) expect((((b.stats as Tree).bands as Tree)[band.key] as string).length).toBeGreaterThan(3);
      for (const m of BET_MARKETS) expect(((b.market as Tree)[m] as string).length).toBeGreaterThan(3);
      for (const d of ["tomorrow", "three", "week"]) expect((b.days as Tree)[d]).toBeTruthy();
    }
  });
});
