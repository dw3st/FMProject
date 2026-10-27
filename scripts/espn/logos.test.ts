import { describe, expect, test } from "bun:test";
import { buildLogoIndex } from "@/../scripts/espn/logos";

describe("buildLogoIndex", () => {
  test("native file first (by slug, then id), then ESPN, else absent", () => {
    const idx = buildLogoIndex(
      [
        { id: "33", slug: "manchester_united", nativeLeague: "premier_league" },
        { id: "127", slug: "flamengo", nativeLeague: "brazil_serie_a" },
        { id: "of_gb_coventry_city", slug: "of_gb_coventry_city", nativeLeague: null },
        { id: "of_x", slug: "of_x", nativeLeague: null },
      ],
      new Set(["premier_league/manchester_united", "brazil_serie_a/127"]),
      new Set(["33", "of_gb_coventry_city"]),
    );
    expect(idx).toEqual({
      "33": "premier_league/manchester_united",
      "127": "brazil_serie_a/127",
      "of_gb_coventry_city": "espn/of_gb_coventry_city",
    });
  });
});

describe("buildLogoIndex with TheSportsDB crests", () => {
  test("tsdb only when there is no native or ESPN crest", () => {
    const idx = buildLogoIndex(
      [
        { id: "33", slug: "manchester_united", nativeLeague: "premier_league" },
        { id: "of_a", slug: "of_a", nativeLeague: null },
        { id: "of_b", slug: "of_b", nativeLeague: null },
        { id: "of_c", slug: "of_c", nativeLeague: null },
      ],
      new Set(["premier_league/manchester_united"]),
      new Set(["of_a"]),
      new Set(["33", "of_a", "of_b"]),
    );
    expect(idx).toEqual({ "33": "premier_league/manchester_united", of_a: "espn/of_a", of_b: "tsdb/of_b" });
  });
});
