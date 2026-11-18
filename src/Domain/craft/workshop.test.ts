import { describe, expect, test } from "bun:test";
import { addMaterials } from "@/Domain/craft/stock";
import { advanceQueue, benchCount, cancelJob, enqueue, jobDays, moveJob, newCraft, rollQuality } from "@/Domain/craft/workshop";

const ctx = { saveId: "s1", foremanStars: 3, foremanSpeed: 1 };
function withSteel(n: number) {
  const c = newCraft();
  return { ...c, stock: addMaterials(addMaterials(c.stock, "standard", { steel: n * 3 }), "standard", { concrete: n }) };
}

describe("workshop", () => {
  test("benches and lot days", () => {
    expect(benchCount(1)).toBe(2);
    expect(benchCount(5)).toBe(6);
    expect(jobDays("beam", 5, 1, 1)).toBe(2);
    expect(jobDays("beam", 5, 5, 1)).toBe(2); // 2 × 0.6 = 1.2 → 2
    expect(jobDays("beam", 10, 1, 1)).toBe(4);
  });
  test("enqueue takes materials; refuses short or locked", () => {
    const c = withSteel(5);
    expect(enqueue(c, { component: "beam", qty: 6 }, ctx)).toEqual({ error: "missingMaterials" });
    expect(enqueue(c, { component: "gymKit", qty: 1 }, ctx)).toEqual({ error: "locked" });
    const r = enqueue(c, { component: "beam", qty: 5 }, ctx);
    if ("error" in r) throw new Error(r.error);
    expect(r.craft.stock.materials.steel.standard).toBe(0);
    expect(r.craft.queue).toHaveLength(1);
  });
  test("a day starts jobs on free benches and finishes them", () => {
    let c = withSteel(5);
    const r = enqueue(c, { component: "beam", qty: 5 }, ctx);
    if ("error" in r) throw new Error(r.error);
    c = r.craft;
    const d1 = advanceQueue(c, "2027-03-01", ctx);
    expect(d1.craft.queue[0]!.startedOn).toBe("2027-03-01");
    expect(d1.craft.queue[0]!.doneOn).toBe("2027-03-03");
    const d3 = advanceQueue(d1.craft, "2027-03-03", ctx);
    expect(d3.craft.queue).toHaveLength(0);
    expect(d3.done.beam).toBe(5);
    const c3 = d3.craft.stock.components.beam;
    expect(c3.common + c3.good + c3.excellent).toBe(5);
  });
  test("cancel and move", () => {
    let c = withSteel(10);
    for (const qty of [5, 5]) { const r = enqueue(c, { component: "beam", qty }, ctx); if ("error" in r) throw new Error(); c = r.craft; }
    const [a, b] = c.queue;
    const moved = moveJob(c, b!.id, "up")!;
    expect(moved.queue[0]!.id).toBe(b!.id);
    const cancelled = cancelJob(c, a!.id)!;
    expect(cancelled.queue).toHaveLength(1);
    expect(cancelled.stock.materials.steel.standard).toBe(15);
  });
  test("quality draw is deterministic and gets better with the foreman", () => {
    const q1 = rollQuality(`s1:j1`, 0, { foremanStars: 3, level: 1 });
    expect(q1).toEqual(rollQuality(`s1:j1`, 0, { foremanStars: 3, level: 1 }));
    let exc3 = 0, exc5 = 0;
    for (let i = 0; i < 400; i++) {
      if (rollQuality(`k${i}`, 0, { foremanStars: 3, level: 1 }) === "excellent") exc3++;
      if (rollQuality(`k${i}`, 1, { foremanStars: 5, level: 5 }) === "excellent") exc5++;
    }
    expect(exc5).toBeGreaterThan(exc3);
  });
});
