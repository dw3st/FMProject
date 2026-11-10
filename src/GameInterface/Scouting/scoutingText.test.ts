import { describe, expect, test } from "bun:test";
import { targetLabel } from "@/GameInterface/Scouting/scoutingText";

const t = (key: string, opts?: Record<string, unknown>) => {
  if (key === "scouting.target.youthOf") return `Jovens de ${String(opts?.country)}`;
  return String(opts?.defaultValue ?? key);
};

describe("targetLabel", () => {
  test("a country target comes out in the viewer's language", () => {
    expect(targetLabel({ kind: "country", country: "Armenia" }, t, [], "pt-BR")).toBe("Armênia");
    expect(targetLabel({ kind: "youth", country: "Germany" }, t, [], "pt-BR")).toBe("Jovens de Alemanha");
  });

  test("an unknown name stays as written", () => {
    expect(targetLabel({ kind: "country", country: "Atlantis" }, t, [], "pt-BR")).toBe("Atlantis");
  });
});
