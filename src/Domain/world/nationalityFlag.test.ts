import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { nationalityFlagCode } from "@/Domain/world/nationalityFlag";
import { flagUrl } from "@/Domain/world/flags";

describe("nationalityFlagCode", () => {
  test("maps names, the home nations and handles empty", () => {
    expect(nationalityFlagCode("Brazil")).toBe("br");
    expect(nationalityFlagCode("England")).toBe("gb-eng");
    expect(nationalityFlagCode("  Spain ")).toBe("es");
    expect(nationalityFlagCode("Côte d’Ivoire")).toBe("ci");
    expect(nationalityFlagCode("")).toBeUndefined();
    expect(nationalityFlagCode(null)).toBeUndefined();
    expect(nationalityFlagCode("Atlantis")).toBeUndefined();
  });

  test("every code is a valid flag file stem and every world nationality is covered", () => {
    const root = fileURLToPath(new URL("../../example_data/squads/", import.meta.url));
    const missing = new Set<string>();
    for (const league of readdirSync(root)) {
      for (const file of readdirSync(root + league)) {
        const squad = JSON.parse(readFileSync(`${root}${league}/${file}`, "utf8")) as { players?: { nationality?: string | null }[] };
        for (const p of squad.players ?? []) {
          if (!p.nationality) continue;
          const code = nationalityFlagCode(p.nationality);
          if (!code || !flagUrl(code)) missing.add(p.nationality);
        }
      }
    }
    expect([...missing]).toEqual([]);
  });
});
