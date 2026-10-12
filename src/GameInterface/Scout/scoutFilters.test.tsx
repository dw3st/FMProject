import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ScoutFilters } from "@/GameInterface/Scout/ScoutFilters";
import { InterestBadge } from "@/GameInterface/Scout/InterestBadge";
import { createDefaultScoutFilters } from "@/Domain/scout/scoutFilterState";

const noop = () => {};

describe("scout search filters (#147, #123)", () => {
  const html = renderToStaticMarkup(
    <ScoutFilters
      filters={{
        ...createDefaultScoutFilters(),
        onlyAffordable: true,
        attributeRanges: { ...createDefaultScoutFilters().attributeRanges, speed: { min: 60, max: 100 } },
      }}
      setFilters={noop}
      leagueOptions={[]}
      nationalityOptions={[]}
      onSearch={noop}
      dirty
      saved={[{ name: "Laterais rápidos", filters: createDefaultScoutFilters() }]}
      onSave={noop}
      onLoadSaved={noop}
      onRemoveSaved={noop}
    />,
  );

  test("the search runs from a form (button and Enter)", () => {
    expect(html).toContain("<form");
    expect(html).toContain('type="submit"');
    expect(html).toContain("scout.filters.changed");
  });

  test("attributes in four groups with typed bounds", () => {
    for (const g of ["physical", "attack", "defense", "goalkeeper"]) {
      expect(html).toContain(`scout.attributeFilters.groups.${g}`);
    }
    expect(html).toContain('type="number"');
    expect(html).toContain("60–100");
  });

  test("saved filters and the budget chip", () => {
    expect(html).toContain("Laterais rápidos");
    expect(html).toContain("scout.filters.affordableOnly");
    expect(html).toContain('aria-pressed="true"');
  });

  test("interest badge carries the scout's reading in its title", () => {
    const b = renderToStaticMarkup(<InterestBadge interest="not_coming" />);
    expect(b).toContain("scout.interest.not_coming");
    expect(b).toContain('title="scout.interest.not_comingHint"');
  });
});
