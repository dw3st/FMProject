import { describe, expect, test } from "bun:test";
import { formatEffect } from "@/GameInterface/Staff/staffApi";

describe("formatEffect", () => {
  test("percent change against the 3-star average", () => {
    expect(formatEffect(1.06, "en", "no effect")).toBe("+6%");
    expect(formatEffect(0.92, "pt-BR", "sem efeito")).toBe("−8%");
    expect(formatEffect(0.4, "en", "no effect")).toBe("−60%");
  });
  test("neutral (rounded) reads as no effect", () => {
    expect(formatEffect(1, "en", "no effect")).toBe("no effect");
    expect(formatEffect(1.004, "pt-BR", "sem efeito")).toBe("sem efeito");
  });
});
