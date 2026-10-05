import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { HighlightsCard } from "@/GameInterface/Dashboard/HomeCards";
import type { Highlight } from "@/GameInterface/Dashboard/dashboardData";
import type { RosterPlayer } from "@/types/playerTypes";

function highlight(id: string, name: string): Highlight {
  const player = { id, name, age: 30, nationality: "England", positions: ["Forward"] } as unknown as RosterPlayer;
  return { player, appearances: 0, goals: 0, assists: 0, rating: 0, overall: 7 };
}

describe("HighlightsCard stars (#70)", () => {
  test("shows the same star the player profile shows", () => {
    const html = renderToStaticMarkup(
      <HighlightsCard
        mode="overall"
        items={[highlight("p1", "Kane"), highlight("p2", "Other")]}
        clubColors={["#ff0000", "#ffffff"]}
        playerHref={(id) => `/player/x/y/${id}`}
        statsHref="/stats"
        stars={new Map([["p1", "gold"]])}
      />,
    );
    expect(html.match(/players\.star\.gold/g)?.length).toBe(2); // title + aria-label of one badge
  });

  test("no stars without the index", () => {
    const html = renderToStaticMarkup(
      <HighlightsCard
        mode="overall"
        items={[highlight("p1", "Kane")]}
        clubColors={["#ff0000", "#ffffff"]}
        playerHref={(id) => `/player/x/y/${id}`}
        statsHref="/stats"
      />,
    );
    expect(html).not.toContain("players.star");
  });
});
