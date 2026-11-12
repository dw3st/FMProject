import { describe, expect, test } from "bun:test";
import { appManifest, installState, isIosDevice } from "@/Domain/pwa/manifest";

describe("app manifest", () => {
  test("opens full screen, lying down, with an icon of each kind a phone asks for", () => {
    const m = appManifest();
    expect(m.display).toBe("fullscreen");
    expect(m.orientation).toBe("landscape");
    expect(m.start_url.startsWith(m.scope)).toBe(true);
    expect(m.icons.some((i) => i.sizes === "192x192" && i.purpose === "any")).toBe(true);
    expect(m.icons.some((i) => i.sizes === "512x512" && i.purpose === "any")).toBe(true);
    expect(m.icons.some((i) => i.purpose === "maskable")).toBe(true);
    for (const i of m.icons) expect(i.src.startsWith("/assets/game/")).toBe(true);
  });
});

describe("install state", () => {
  test("already an app wins, then the browser's dialog, then the iPhone steps", () => {
    expect(installState({ standalone: true, hasPrompt: true, ios: true })).toBe("installed");
    expect(installState({ standalone: false, hasPrompt: true, ios: false })).toBe("prompt");
    expect(installState({ standalone: false, hasPrompt: false, ios: true })).toBe("ios");
    expect(installState({ standalone: false, hasPrompt: false, ios: false })).toBe("none");
  });

  test("iOS devices, the iPad that says it is a Mac included", () => {
    expect(isIosDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", 5)).toBe(true);
    expect(isIosDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5)).toBe(true);
    expect(isIosDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 0)).toBe(false);
    expect(isIosDevice("Mozilla/5.0 (Linux; Android 14; Pixel 8)", 5)).toBe(false);
  });
});
