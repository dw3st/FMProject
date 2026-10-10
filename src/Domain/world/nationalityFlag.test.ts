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
    expect(nationalityFlagCode("Curaçao")).toBe("cw");
    expect(nationalityFlagCode("South Sudan")).toBe("ss");
    expect(nationalityFlagCode("")).toBeUndefined();
    expect(nationalityFlagCode(null)).toBeUndefined();
    expect(nationalityFlagCode("Atlantis")).toBeUndefined();
  });

  test("ESPN spellings of a country also get the flag (#143)", () => {
    expect(nationalityFlagCode("Congo DR")).toBe("cd");
    expect(nationalityFlagCode("Cape Verde Islands")).toBe("cv");
    expect(nationalityFlagCode("Republic of Ireland")).toBe("ie");
    expect(nationalityFlagCode("St Lucia")).toBe("lc");
    expect(nationalityFlagCode("St Kitts and Nevis")).toBe("kn");
    expect(nationalityFlagCode("Comoros Islands")).toBe("km");
    expect(nationalityFlagCode("Palestine")).toBe("ps");
    expect(nationalityFlagCode("Congo")).toBe("cg");
    expect(nationalityFlagCode("Lesotho")).toBe("ls");
    expect(nationalityFlagCode("Malawi")).toBe("mw");
    expect(nationalityFlagCode("India")).toBe("in");
    expect(nationalityFlagCode("Grenada")).toBe("gd");
  });

  test("every ESPN citizenship of the snapshot has a flag (#143)", () => {
    const path = fileURLToPath(new URL("../../../data_process/espn/snapshot.json", import.meta.url));
    const snap = JSON.parse(readFileSync(path, "utf8")) as { leagues: { teams: { athletes?: { citizenship?: string | null }[] }[] }[] };
    const missing = new Set<string>();
    for (const l of snap.leagues) for (const t of l.teams) for (const a of t.athletes ?? []) {
      if (a.citizenship && !nationalityFlagCode(a.citizenship)) missing.add(a.citizenship);
    }
    expect([...missing]).toEqual([]);
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
  }, 30_000); // reads every squad of the world
});
