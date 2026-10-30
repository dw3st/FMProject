import { describe, expect, test } from "bun:test";
import { buildMetrics } from "@/GraficsEngine/pitchMetrics";
import {
  bystanders, clearOfBenches, cornerFlags, dashes, EXTRAS, ledFit, ledMarqueeX, ledTransition, outsideCornerBowl, standCorners,
  techArea, vendorAlong, vendors,
} from "@/GraficsEngine/stadiumExtras";
import { standSeatGrid } from "@/GraficsEngine/crowd";
import { towerSpots } from "@/GraficsEngine/stadiumAtmosphere";
import { ledLangOfNationalities, ledLang, LED_ADS, LED_LANGS } from "@/GraficsEngine/ledAds";
import { ledAdFor } from "@/GraficsEngine/pitchStyle";

const m = buildMetrics(1400, 820, { stadium: true });

describe("LED boards", () => {
  test("a text that fits stays; a bit too long shrinks; a long one scrolls inside the screen", () => {
    expect(ledFit(80, 100)).toEqual({ scale: 1, scroll: false });
    expect(ledFit(110, 100).scroll).toBe(false);
    expect(ledFit(110, 100).scale).toBeCloseTo(100 / 110);
    expect(ledFit(400, 100)).toEqual({ scale: 1, scroll: true });
  });
  test("the marquee enters from the right edge and leaves by the left, looping", () => {
    const w = 200, tw = 300, h = 10;
    expect(ledMarqueeX(0, w, tw, h)).toBeCloseTo(w + tw / 2);
    for (let t = 0; t < 20; t += 0.37) {
      const x = ledMarqueeX(t, w, tw, h);
      expect(x).toBeLessThanOrEqual(w + tw / 2 + 1e-6);
      expect(x).toBeGreaterThanOrEqual(-tw / 2 - 1e-6);
    }
  });
  test("one transition per cycle, the same for every board, all three kinds used", () => {
    expect(ledTransition("m", 4)).toBe(ledTransition("m", 4));
    expect(new Set(Array.from({ length: 40 }, (_, c) => ledTransition("m", c))).size).toBe(EXTRAS.LED.KINDS.length);
  });
  test("ads in six languages, the home club's picked from its players' nationalities", () => {
    for (const ad of LED_ADS) for (const l of LED_LANGS) expect(ad.text[l].length).toBeGreaterThan(0);
    expect(LED_ADS.filter((a) => a.text.de !== a.text.en).length).toBeGreaterThan(80);
    expect(ledLangOfNationalities(["Brazil", "Brazil", "Argentina"])).toBe("pt");
    expect(ledLangOfNationalities(["Italy", "France", "Italy"])).toBe("it");
    expect(ledLangOfNationalities(["Netherlands", "Netherlands"])).toBe("en");
    expect(ledLangOfNationalities([])).toBeNull();
    expect(ledLang("es-ES")).toBe("es");
    expect(ledLang("ja")).toBe("en");
    expect(ledAdFor("s", 1, 2, "fr").text).toBe(LED_ADS.find((a) => a.text.pt === ledAdFor("s", 1, 2, "pt").text)!.text.fr);
  });
  test("bottom boards shrink away from the benches, too short ones are dropped", () => {
    expect(clearOfBenches({ x: 9, len: 15 }, [[25, 40]])).toEqual({ x: 9, len: 15 });
    const c = clearOfBenches({ x: 20, len: 15 }, [[22, 40]])!;
    expect(c.x + c.len / 2).toBeLessThanOrEqual(22 - EXTRAS.BOTTOM_BOARD.GAP_YDS + 1e-9);
    expect(clearOfBenches({ x: 30, len: 6 }, [[22, 40]])).toBeNull();
  });
});

describe("around the pitch", () => {
  test("the technical area holds the bench and the manager's walk", () => {
    const bench = { x: 300, y: 700, w: 120, h: 30 };
    const a = techArea(bench, 480, 40, 680, m.scale);
    expect(a.x).toBeLessThan(bench.x);
    expect(a.x + a.w).toBeGreaterThan(520);
    expect(a.y).toBeGreaterThan(680);
    expect(a.y + a.h).toBe(bench.y + bench.h);
    expect(dashes(0, 0, 10, 0, 4, 3).length).toBe(2);
  });
  test("corner flags at the four corners, pennants into the pitch", () => {
    const f = cornerFlags(m);
    expect(f).toHaveLength(4);
    for (const c of f) {
      const cx = m.marginX + m.width / 2, cy = m.marginY + m.height / 2;
      expect(Math.sign(c.dx)).toBe(Math.sign(cx - c.x));
      expect(Math.sign(c.dy)).toBe(Math.sign(cy - c.y));
    }
  });
  test("rounded stand corners: no seat outside the bowl; towers set back into the corners", () => {
    const s = m.stand!;
    expect(standCorners(s)).toHaveLength(4);
    const seats = standSeatGrid(s);
    expect(seats.length).toBeGreaterThan(500);
    for (const seat of seats) expect(outsideCornerBowl(s, seat.x, seat.y)).toBe(false);
    expect(outsideCornerBowl(s, 1, 1)).toBe(true);
    for (const t of towerSpots(s)) {
      expect(t.x < s.inner.x || t.x > s.inner.x + s.inner.w).toBe(true);
      expect(t.y < s.inner.y || t.y > s.inner.y + s.inner.h).toBe(true);
    }
  });
  test("bystanders: four TV cameras, the reporter with a camera, stewards; vendors walk inside their walkway", () => {
    const b = bystanders(m, 3, { x: 200, y: 760 });
    expect(b.filter((x) => x.kind === "tv")).toHaveLength(4);
    expect(b.filter((x) => x.kind === "reporter")).toHaveLength(1);
    expect(b.filter((x) => x.kind === "steward").length).toBeGreaterThan(4);
    const v = vendors("fix", 6);
    expect(v.length).toBeGreaterThanOrEqual(EXTRAS.VENDORS[0]);
    for (let t = 0; t < 60; t += 1.3) {
      const p = vendorAlong(v[0]!, t, 300, m.scale);
      expect(p.at).toBeGreaterThanOrEqual(0);
      expect(p.at).toBeLessThanOrEqual(300);
    }
  });
});
