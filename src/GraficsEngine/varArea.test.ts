import { describe, expect, test } from "bun:test";
import { PITCH_LENGTH, PITCH_MID_X, PITCH_WIDTH } from "@/GameEngine/Domain/pitch";
import { OFFICIALS } from "@/GraficsEngine/officials";
import { reviewRunStep, VAR_AREA, varMonitorSpot, varStandSpot, varZone } from "@/GraficsEngine/varArea";

describe("VAR review area", () => {
  test("the zone is all in the run-off at the halfway line, with the monitor and the referee inside it", () => {
    const z = varZone();
    expect((z.x0 + z.x1) / 2).toBe(PITCH_MID_X);
    expect(z.y1).toBeLessThan(0);
    const half = (VAR_AREA.MONITOR_W * VAR_AREA.MONITOR_ASPECT) / 2;
    expect(z.y0).toBeLessThan(VAR_AREA.MONITOR_Y - half);
    expect(z.y1).toBeGreaterThan(VAR_AREA.MONITOR_Y + half);
    const stand = varStandSpot(false);
    expect(stand.y).toBeLessThan(z.y1);
    expect(stand.x).toBeLessThan(z.x1);
    expect(stand.x).toBeGreaterThan(PITCH_MID_X + VAR_AREA.MONITOR_W / 2);
  });

  test("the stand spot follows the mirror: the drawn top touchline is engine y 74 when turned", () => {
    expect(varStandSpot(false)).toEqual({ x: PITCH_MID_X + VAR_AREA.STAND_DX, y: VAR_AREA.STAND_Y });
    expect(varStandSpot(true)).toEqual({ x: PITCH_LENGTH - PITCH_MID_X - VAR_AREA.STAND_DX, y: PITCH_WIDTH - VAR_AREA.STAND_Y });
    expect(varMonitorSpot(true).y).toBeGreaterThan(PITCH_WIDTH);
  });

  test("the referee reaches the monitor with time to look, without jumping, even from the far penalty spot", () => {
    const target = varStandSpot(false);
    let pos = { x: 103, y: 37 };
    let countdown = 3;
    const dt = 1 / 60;
    let maxStep = 0;
    while (countdown > VAR_AREA.LOOK_S - 0.05) {
      const next = reviewRunStep(pos, target, dt, countdown);
      maxStep = Math.max(maxStep, Math.hypot(next.x - pos.x, next.y - pos.y));
      pos = next;
      countdown -= dt;
    }
    expect(Math.hypot(pos.x - target.x, pos.y - target.y)).toBeLessThan(0.5);
    expect(maxStep).toBeLessThan(OFFICIALS.SNAP_DIST * dt * 2);
  });
});
