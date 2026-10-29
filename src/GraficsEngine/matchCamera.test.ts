import { describe, expect, test } from "bun:test";
import { recordFrame, REPLAY, replayAt, replayClip, stepCamera, type ReplayFrame } from "@/GraficsEngine/matchCamera";

describe("stepCamera", () => {
  test("zoom 1 stays centred on the canvas", () => {
    const c = stepCamera({ zoom: 1, x: 500, y: 300 }, 1, { x: 10, y: 10 }, 1000, 600, 1 / 60);
    expect(c).toEqual({ zoom: 1, x: 500, y: 300 });
  });
  test("following never shows past the canvas edge", () => {
    let c = { zoom: 1, x: 500, y: 300 };
    for (let i = 0; i < 600; i++) c = stepCamera(c, 1.6, { x: 0, y: 0 }, 1000, 600, 1 / 60);
    expect(c.zoom).toBeCloseTo(1.6, 3);
    expect(c.x).toBeCloseTo(1000 / 3.2, 3);
    expect(c.y).toBeCloseTo(600 / 3.2, 3);
  });
});

describe("replay", () => {
  const frame = (t: number): ReplayFrame<number, number> => ({ t, players: new Map([[1, t]]), ball: t });
  test("records at most one frame per sample and drops old frames", () => {
    let buf: ReplayFrame<number, number>[] = [];
    for (let t = 0; t <= 20; t += 1 / 120) buf = recordFrame(buf, frame(t));
    expect(buf[0]!.t).toBeGreaterThan(20 - REPLAY.WINDOW_S - REPLAY.DELAY_S - 0.6);
    for (let i = 1; i < buf.length; i++) expect(buf[i]!.t - buf[i - 1]!.t).toBeGreaterThanOrEqual(REPLAY.SAMPLE_S - 1e-9);
  });
  test("clip covers the window before the goal and plays slower", () => {
    let buf: ReplayFrame<number, number>[] = [];
    for (let t = 0; t <= 12; t += 1 / 30) buf = recordFrame(buf, frame(t));
    const clip = replayClip(buf, 10)!;
    expect(clip[0]!.t).toBeGreaterThanOrEqual(10 - REPLAY.WINDOW_S - 1e-9);
    const mid = replayAt(clip, 2)!;
    expect(mid.a.t + mid.k * (mid.b.t - mid.a.t)).toBeCloseTo(clip[0]!.t + 2 * REPLAY.SPEED, 5);
    expect(replayAt(clip, 60)).toBeNull();
  });
  test("no clip without enough recorded", () => {
    expect(replayClip([frame(9.9), frame(10)], 10)).toBeNull();
  });
});
