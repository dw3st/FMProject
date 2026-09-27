import { afterAll, describe, expect, spyOn, test } from "bun:test";
import { rm } from "fs/promises";
import { saveService } from "@/backend/SaveService";
import { advanceOneDay } from "@/backend/advanceDay";
import { RUNTIME_DATA_DIR } from "@/backend/runtimeDir";

/**
 * A continent whose `createSave`-time generation failed (its try/catch there swallowed the
 * error — see `.claude/rules/game/continental.md`) has no `ucl`/`uel` on disk at all.
 * `continentsToRegenerateContinental` can never pick that up (it only compares against an
 * existing year), so without the self-heal in `advanceOneDay` the continent would stay without a
 * continental competition forever. This simulates that failure (deleting the folders after a
 * normal `createSave`) and checks the very next rollover/resync day creates them fresh.
 */
describe("advanceOneDay self-heals a continent with no continental competition on disk", () => {
  let saveId = "";
  afterAll(async () => {
    if (saveId) await saveService.deleteSave(saveId);
  });

  test("Europe (ucl/uel missing) is created fresh at the next country rollover", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league",
      leagueName: "Premier League",
      clubId: "33",
      clubName: "Test",
      clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;

    // Sanity: Europe's competitions really do exist right after createSave.
    expect(await saveService.getLeagueMeta(saveId, "ucl")).not.toBeNull();
    expect(await saveService.getLeagueMeta(saveId, "uel")).not.toBeNull();

    // Simulate the createSave-time failure: both European continental folders are gone.
    await rm(`${RUNTIME_DATA_DIR}/saves/${saveId}/leagues/ucl`, { recursive: true, force: true });
    await rm(`${RUNTIME_DATA_DIR}/saves/${saveId}/leagues/uel`, { recursive: true, force: true });
    expect(await saveService.getLeagueMeta(saveId, "ucl")).toBeNull();
    expect(await saveService.getLeagueMeta(saveId, "uel")).toBeNull();

    // Iceland (of_icelandic_urvalsdeild) is calendar-year, single-tier, no pyramid — its own
    // rollover is a standalone unit with no promotion/relegation, the simplest possible trigger
    // for the "due.units.length > 0" gate that also runs the self-heal check.
    const iceland = meta.activeLeagues!.find((l) => l.leagueSlug === "of_icelandic_urvalsdeild")!;
    await saveService.updateMeta(saveId, { currentDate: iceland.end });

    const err = spyOn(console, "error").mockImplementation(() => {});
    let outcome: Awaited<ReturnType<typeof advanceOneDay>>;
    let selfHealLogged: boolean;
    try {
      outcome = await advanceOneDay(saveService, saveId);
      selfHealLogged = err.mock.calls.some(
        (c) => c[0] === "[continental]" && String(c[1]).includes("self-heal"),
      );
    } finally {
      err.mockRestore();
    }
    expect(outcome.ok).toBe(true);
    expect(selfHealLogged).toBe(true);

    const uclAfter = await saveService.getLeagueMeta(saveId, "ucl");
    const uelAfter = await saveService.getLeagueMeta(saveId, "uel");
    expect(uclAfter?.kind).toBe("continental");
    expect(uelAfter?.kind).toBe("continental");
    expect(uclAfter!.continental!.groups.flatMap((g) => g.clubs)).toHaveLength(32);
    expect(uelAfter!.continental!.groups.flatMap((g) => g.clubs)).toHaveLength(32);
  }, 300_000);
});
