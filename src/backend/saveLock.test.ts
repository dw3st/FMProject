import { describe, expect, test } from "bun:test";
import { activeSaveLocks, withSaveLock } from "@/backend/saveLock";

const tick = (ms = 2) => Bun.sleep(ms);

describe("withSaveLock", () => {
  test("calls for the same save run one after another, in arrival order", async () => {
    const log: string[] = [];
    let running = 0;
    let maxRunning = 0;
    const job = (name: string, ms: number) =>
      withSaveLock("save-a", async () => {
        running++;
        maxRunning = Math.max(maxRunning, running);
        log.push(`start ${name}`);
        await tick(ms);
        log.push(`end ${name}`);
        running--;
        return name;
      });

    const results = await Promise.all([job("1", 6), job("2", 1), job("3", 3)]);

    expect(results).toEqual(["1", "2", "3"]);
    expect(maxRunning).toBe(1);
    expect(log).toEqual(["start 1", "end 1", "start 2", "end 2", "start 3", "end 3"]);
    expect(activeSaveLocks()).toBe(0);
  });

  test("calls for different saves run concurrently", async () => {
    let running = 0;
    let maxRunning = 0;
    const job = (key: string) =>
      withSaveLock(key, async () => {
        running++;
        maxRunning = Math.max(maxRunning, running);
        await tick(5);
        running--;
      });

    await Promise.all([job("save-x"), job("save-y"), job("save-z")]);

    expect(maxRunning).toBe(3);
    expect(activeSaveLocks()).toBe(0);
  });

  test("a failing call releases the lock and the next call still runs", async () => {
    const first = withSaveLock("save-b", async () => {
      await tick();
      throw new Error("boom");
    });
    const second = withSaveLock("save-b", async () => "ran");

    await expect(first).rejects.toThrow("boom");
    expect(await second).toBe("ran");
    expect(activeSaveLocks()).toBe(0);
  });
});
