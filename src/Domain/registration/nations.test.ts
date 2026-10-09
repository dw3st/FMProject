import { describe, expect, test } from "bun:test";
import fs from "fs";
import path from "path";
import { NATION_CONFED, inGroup, normalizeNation } from "@/Domain/registration/nations";
import { REGISTRATION_RULES, RULE_BY_CONTINENT, RULE_BY_COUNTRY, MIN_REGISTERED } from "@/Domain/registration/registrationConfig";

describe("nations", () => {
  test("aliases", () => {
    expect(normalizeNation("Czechia")).toBe("Czech Republic");
    expect(normalizeNation("United States")).toBe("USA");
    expect(normalizeNation("Türkiye")).toBe("Turkey");
    expect(normalizeNation(null)).toBeNull();
  });
  test("every nationality of the world has a confederation", () => {
    const root = "src/example_data/squads";
    const missing = new Set<string>();
    for (const lg of fs.readdirSync(root)) for (const f of fs.readdirSync(path.join(root, lg))) {
      const s = JSON.parse(fs.readFileSync(path.join(root, lg, f), "utf8"));
      for (const p of s.players) {
        const n = normalizeNation(p.nationality);
        if (n && !NATION_CONFED[n]) missing.add(n);
      }
    }
    expect([...missing]).toEqual([]);
  });
  test("every country of the world has a confederation", () => {
    const countries = JSON.parse(fs.readFileSync("src/example_data/countries.json", "utf8")) as Record<string, unknown>;
    expect(Object.keys(countries).filter((c) => !NATION_CONFED[c])).toEqual([]);
  });
  test("groups", () => {
    expect(inGroup("Spain", "EU")).toBe(true);
    expect(inGroup("Switzerland", "EU")).toBe(false);
    expect(inGroup("Brazil", "ibero")).toBe(true);
    expect(inGroup("Senegal", "acp")).toBe(true);
    expect(inGroup("Japan", "acp")).toBe(false);
  });
  test("rules exist", () => {
    expect(REGISTRATION_RULES.premier_league!.maxList).toBe(25);
    expect(REGISTRATION_RULES.brazil!.maxForeignMatchday).toBe(9);
    expect(REGISTRATION_RULES.conmebol!.maxList).toBe(50);
    expect(REGISTRATION_RULES.conmebol!.minFormed).toBeUndefined();
    expect(RULE_BY_COUNTRY.England).toBe("premier_league");
    for (const c of ["Europe", "South America", "North America", "Asia", "Africa", "Oceania"]) expect(RULE_BY_CONTINENT[c]).toBeDefined();
    expect(MIN_REGISTERED).toBe(18);
  });
});
