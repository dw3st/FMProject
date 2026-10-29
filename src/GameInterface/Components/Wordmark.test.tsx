import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Wordmark } from "@/GameInterface/Components/Wordmark";
import { PitchBackdrop } from "@/GameInterface/Components/PitchBackdrop";

describe("entry visuals", () => {
  test("Wordmark renders both halves", () => {
    const html = renderToStaticMarkup(<Wordmark />);
    expect(html).toContain("FM");
    expect(html).toContain("PROJECT");
  });

  test("PitchBackdrop with the new visual shows the painted stadium", () => {
    const html = renderToStaticMarkup(<PitchBackdrop painted scene="new-game" />);
    expect(html).toContain("backgrounds/bg-new-game.webp");
    expect(html).toContain('aria-hidden="true"');
  });

  test("PitchBackdrop is decorative with 22 players + centre circle", () => {
    const html = renderToStaticMarkup(<PitchBackdrop painted={false} />);
    expect(html).toContain('aria-hidden="true"');
    expect(html.match(/<circle/g)?.length).toBe(23);
  });
});
