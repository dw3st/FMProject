import { describe, expect, test } from "bun:test";
import {
  axesFor,
  axesWithMentality,
  MENTALITY_OPTIONS,
  STYLE_TO_AXES,
  type Mentality,
  type TacticalStyle,
} from "@/types/tacticsTypes";

const ALL_STYLES = Object.keys(STYLE_TO_AXES) as TacticalStyle[];

describe("axesWithMentality — balanced", () => {
  test("returns axesFor(style) unchanged for every style", () => {
    for (const style of ALL_STYLES) {
      expect(axesWithMentality(style, "balanced")).toEqual(axesFor(style));
    }
  });
});

describe("axesWithMentality — attacking", () => {
  test("steps pressing_style and defensive_line up one notch, forces wide + direct", () => {
    const axes = axesWithMentality("balanced", "attacking");
    // balanced style base: mid_block / normal / normal / balanced
    expect(axes.pressing_style).toBe("high_press");
    expect(axes.defensive_line).toBe("high");
    expect(axes.width).toBe("wide");
    expect(axes.build_up).toBe("direct");
  });

  test("saturates at high_press / high instead of overflowing", () => {
    // high_press style base is already pressing_style=high_press, defensive_line=high
    const axes = axesWithMentality("high_press", "attacking");
    expect(axes.pressing_style).toBe("high_press");
    expect(axes.defensive_line).toBe("high");
    expect(axes.width).toBe("wide");
    expect(axes.build_up).toBe("direct");
  });

  test("counter_attack (low_block/deep) steps up exactly one notch, not to the top", () => {
    const axes = axesWithMentality("counter_attack", "attacking");
    expect(axesFor("counter_attack").pressing_style).toBe("low_block");
    expect(axesFor("counter_attack").defensive_line).toBe("deep");
    expect(axes.pressing_style).toBe("mid_block");
    expect(axes.defensive_line).toBe("normal");
  });

  test("always forces width=wide and build_up=direct regardless of base style", () => {
    for (const style of ALL_STYLES) {
      const axes = axesWithMentality(style, "attacking");
      expect(axes.width).toBe("wide");
      expect(axes.build_up).toBe("direct");
    }
  });
});

describe("axesWithMentality — defensive", () => {
  test("steps pressing_style and defensive_line down one notch, forces narrow, keeps build_up", () => {
    const axes = axesWithMentality("balanced", "defensive");
    // balanced style base: mid_block / normal / normal / balanced
    expect(axes.pressing_style).toBe("low_block");
    expect(axes.defensive_line).toBe("deep");
    expect(axes.width).toBe("narrow");
    expect(axes.build_up).toBe("balanced");
  });

  test("saturates at low_block / deep instead of underflowing", () => {
    // counter_attack style base is already pressing_style=low_block, defensive_line=deep
    const axes = axesWithMentality("counter_attack", "defensive");
    expect(axes.pressing_style).toBe("low_block");
    expect(axes.defensive_line).toBe("deep");
    expect(axes.width).toBe("narrow");
  });

  test("high_press (high_press/high) steps down exactly one notch, not to the bottom", () => {
    const axes = axesWithMentality("high_press", "defensive");
    expect(axesFor("high_press").pressing_style).toBe("high_press");
    expect(axesFor("high_press").defensive_line).toBe("high");
    expect(axes.pressing_style).toBe("mid_block");
    expect(axes.defensive_line).toBe("normal");
  });

  test("preserves the base style's build_up unchanged for every style", () => {
    for (const style of ALL_STYLES) {
      const axes = axesWithMentality(style, "defensive");
      expect(axes.build_up).toBe(axesFor(style).build_up);
      expect(axes.width).toBe("narrow");
    }
  });
});

describe("axesWithMentality — full matrix, every style × every mentality", () => {
  const mentalities: Mentality[] = MENTALITY_OPTIONS;
  for (const style of ALL_STYLES) {
    for (const mentality of mentalities) {
      test(`${style} × ${mentality} produces a valid axis bundle`, () => {
        const axes = axesWithMentality(style, mentality);
        expect(["low_block", "mid_block", "high_press"]).toContain(axes.pressing_style);
        expect(["deep", "normal", "high"]).toContain(axes.defensive_line);
        expect(["narrow", "normal", "wide"]).toContain(axes.width);
        expect(["direct", "balanced", "possession"]).toContain(axes.build_up);
      });
    }
  }
});
