import { describe, expect, test } from "bun:test";
import { parsePixelAtlas, parsePixelDataPath, parsePixelPointer, pixelSprite, setPixelSprite } from "@/Domain/art/pixelSprite";

const valid = () => ({
  image: "sprites/goals-1.png", body: 15, height: 31,
  layers: ["skin", "socks", "boots", "shorts", "shirt", "hair0", "vfx"],
  rects: [[0, 0, 10, 20], [11, 0, 6, 4]] as unknown[],
  frames: [[0, 0, -5, -31, 5, 1, -3, -33], [0, 0, -5, -30], []] as unknown[],
  clips: {
    idle: { frames: [0, 1], dur: 0.15, loop: true }, walk: { frames: [0, 1], dur: 0.1, loop: true },
    run: { frames: [1, 0], dur: 0.1, loop: true }, kick: { frames: [1, 2], dur: 0.07 },
  } as Record<string, unknown>,
});

describe("parsePixelAtlas", () => {
  test("a valid atlas comes back with its frames as parts", () => {
    const a = parsePixelAtlas(valid())!;
    expect(a.frames[0]).toEqual([{ layer: 0, rect: 0, x: -5, y: -31 }, { layer: 5, rect: 1, x: -3, y: -33 }]);
    expect(a.frames[2]).toEqual([]);
    expect(a.clips.kick).toEqual({ frames: [1, 2], dur: 0.07 });
    expect(a.clips.idle!.loop).toBe(true);
    expect(a.rects[1]).toEqual([11, 0, 6, 4]);
  });

  test("the image must be a png inside sprites/", () => {
    for (const image of ["../secret.png", "sprites/../x.png", "faces/a.png", "sprites/a.webp", "/sprites/a.png", "sprites/a b.png", 3])
      expect(parsePixelAtlas({ ...valid(), image })).toBeNull();
  });

  test("layers: the kit and skin are required, names are plain and unique", () => {
    expect(parsePixelAtlas({ ...valid(), layers: ["skin", "socks", "shorts"] })).toBeNull();
    expect(parsePixelAtlas({ ...valid(), layers: ["skin", "socks", "shorts", "shirt", "shirt"] })).toBeNull();
    expect(parsePixelAtlas({ ...valid(), layers: ["skin", "socks", "shorts", "shirt", "a b"] })).toBeNull();
    expect(parsePixelAtlas({ ...valid(), layers: [] })).toBeNull();
  });

  test("a piece or a part that points outside refuses the atlas", () => {
    expect(parsePixelAtlas({ ...valid(), rects: [[0, 0, 0, 5]] })).toBeNull();
    expect(parsePixelAtlas({ ...valid(), rects: [[4000, 0, 200, 5]] })).toBeNull();
    expect(parsePixelAtlas({ ...valid(), rects: [[0, 0, 5]] })).toBeNull();
    expect(parsePixelAtlas({ ...valid(), frames: [[0, 2, 0, 0]] })).toBeNull();     // no such piece
    expect(parsePixelAtlas({ ...valid(), frames: [[7, 0, 0, 0]] })).toBeNull();     // no such layer
    expect(parsePixelAtlas({ ...valid(), frames: [[0, 0, 0]] })).toBeNull();        // not in fours
    expect(parsePixelAtlas({ ...valid(), frames: [[0, 0, 999, 0]] })).toBeNull();
    expect(parsePixelAtlas({ ...valid(), frames: [[0, 0, 0.5, 0]] })).toBeNull();
  });

  test("a missing basic clip, a bad frame, time or name refuses the atlas", () => {
    const noRun = valid();
    delete noRun.clips.run;
    expect(parsePixelAtlas(noRun)).toBeNull();
    expect(parsePixelAtlas({ ...valid(), clips: { ...valid().clips, kick: { frames: [], dur: 0.1 } } })).toBeNull();
    expect(parsePixelAtlas({ ...valid(), clips: { ...valid().clips, kick: { frames: [-1], dur: 0.1 } } })).toBeNull();
    expect(parsePixelAtlas({ ...valid(), clips: { ...valid().clips, kick: { frames: [3], dur: 0.1 } } })).toBeNull();
    expect(parsePixelAtlas({ ...valid(), clips: { ...valid().clips, kick: { frames: [1], dur: 0 } } })).toBeNull();
    expect(parsePixelAtlas({ ...valid(), clips: { ...valid().clips, "bad name": { frames: [1], dur: 0.1 } } })).toBeNull();
    expect(parsePixelAtlas({ ...valid(), body: 1.5 })).toBeNull();
    expect(parsePixelAtlas(null)).toBeNull();
    expect(parsePixelAtlas("x")).toBeNull();
  });
});

describe("pointer", () => {
  test("the description is a json inside sprites/, never the pointer file itself", () => {
    expect(parsePixelDataPath({ data: "sprites/goals-1.json" })).toBe("sprites/goals-1.json");
    for (const data of ["../index.json", "sprites/a.png", "sprites/../index.json", "index.json", "sprites/pixel-players.json", 4])
      expect(parsePixelDataPath({ data })).toBeNull();
    expect(parsePixelDataPath(null)).toBeNull();
  });

  test("the page state only keeps a valid pointer", () => {
    setPixelSprite({ data: "sprites/goals-1.json", image: "sprites/goals-1.png" });
    expect(pixelSprite()).toEqual({ data: "sprites/goals-1.json", image: "sprites/goals-1.png" });
    setPixelSprite({ data: "sprites/goals-1.json", image: "nope" });
    expect(pixelSprite()).toBeNull();
    expect(parsePixelPointer({ image: "sprites/a.png" })).toBeNull();
  });
});
