import { describe, expect, test } from "bun:test";
import en from "@/i18n/locales/en.json";
import pt from "@/i18n/locales/pt-BR.json";
import { COMPONENTS, MATERIALS } from "@/Domain/craft/craftConfig";
import { componentUses } from "@/Domain/craft/craftHelp";

type Tree = { [key: string]: string | Tree };
const leaves = (node: string | Tree, path = ""): string[] =>
  typeof node === "string" ? [path.replace(/_(one|other)$/, "")] : Object.entries(node).flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k));
const at = (root: unknown, path: string): unknown => path.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], root);

describe("craft help keys", () => {
  test("en and pt-BR have the same craftHelp texts", () => {
    const a = [...new Set(leaves(at(en, "craftHelp") as Tree))].sort();
    const b = [...new Set(leaves(at(pt, "craftHelp") as Tree))].sort();
    expect(b).toEqual(a);
  });

  test("every name the cards show exists", () => {
    const need = [
      ...COMPONENTS.map((c) => `craft.component.${c}`),
      ...MATERIALS.map((m) => `craft.material.${m}`),
      ...COMPONENTS.flatMap((c) => componentUses(c)).map((u) => (u.kind === "item" ? `facilities.item.${u.item}` : `craftHelp.use.${u.kind}`)),
    ];
    for (const root of [en, pt]) for (const k of need) expect(typeof at(root, k)).toBe("string");
  });
});
