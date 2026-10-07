import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { saveRoutes } from "@/backend/saves";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { recordSaveOwnership } from "@/backend/auth/saveOwnership";
import { formationForTactics } from "@/Domain/matchFormations";
import { CUSTOM_FORMATION_ID, snapToZones } from "@/Domain/formation/zones";

/** Saved lineups (#84): `TacticsSave.lineupPresets` through `PUT /api/saves/:id/tactics`. */
describe("lineup presets route", () => {
  let saveId = "";
  afterAll(async () => {
    if (saveId) await saveService.deleteSave(saveId);
  });

  test("validates, stores, replaces and clears presets without touching the played lineup", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    const { user, session } = devAutoLogin(`presets-route-${saveId}@test.local`);
    recordSaveOwnership(saveId, user.id);
    const stranger = devAutoLogin(`presets-stranger-${saveId}@test.local`);

    const putTactics = (body: unknown, token = session.token) =>
      (saveRoutes["/api/saves/:id/tactics"] as (r: Request & { params: Record<string, string> }) => Promise<Response>)(
        Object.assign(
          new Request(`http://localhost/api/saves/${saveId}/tactics`, {
            method: "PUT",
            headers: { cookie: `fs_session=${token}`, "content-type": "application/json" },
            body: JSON.stringify(body),
          }),
          { params: { id: saveId } },
        ) as Request & { params: Record<string, string> },
      );

    const squad = (await saveService.getSquadById(saveId, "33"))!;
    const ids = squad.players.slice(0, 11).map((p) => p.id);
    const f433 = formationForTactics({ formation: "4-3-3" });
    const lb = f433.attacking.findIndex((s) => s.role === "LB");
    const instructions: unknown[] = Array(11).fill(null);
    instructions[lb] = { variant: "fb_inverted" };
    const presetA = { formation: "4-3-3", lineup: ids, slotInstructions: instructions, savedOn: "2027-02-05" };
    const presetB = {
      formation: CUSTOM_FORMATION_ID,
      customFormation: { slots: snapToZones(f433.attacking) },
      lineup: ids.slice().reverse(),
      savedOn: "2027-02-06",
    };

    expect((await putTactics({ formation: "4-4-2", lineup: [] })).status).toBe(200);
    expect((await putTactics({ lineupPresets: { A: presetA } }, stranger.session.token)).status).toBe(404);
    const ok = await putTactics({ lineupPresets: { A: presetA, B: presetB } });
    expect(ok.status).toBe(200);
    const saved = (await saveService.getTactics(saveId))!;
    expect(saved.lineupPresets?.A?.lineup).toEqual(ids);
    expect(saved.lineupPresets?.A?.slotInstructions?.[lb]).toEqual({ variant: "fb_inverted" });
    expect(saved.lineupPresets?.B?.customFormation?.slots).toHaveLength(11);
    // Presets never reach the played tactics.
    expect(saved.formation).toBe("4-4-2");
    expect(saved.lineup).toEqual([]);
    expect(saved.slotInstructions).toBeUndefined();

    // Invalid bodies are refused and leave the stored presets alone.
    const bad = [
      { lineupPresets: [] },
      { lineupPresets: { D: presetA } },
      { lineupPresets: { A: { ...presetA, formation: "1-1-8" } } },
      { lineupPresets: { A: { ...presetA, lineup: [...ids, "x"] } } },
      { lineupPresets: { A: { ...presetA, lineup: [7] } } },
      { lineupPresets: { A: { ...presetA, savedOn: 3 } } },
      { lineupPresets: { A: { ...presetA, savedOn: "2027-02-30" } } },
      { lineupPresets: { A: { ...presetA, lineup: ["x".repeat(65)] } } },
      { lineupPresets: { B: { ...presetB, customFormation: { slots: [] } } } },
      { lineupPresets: { A: { ...presetA, slotInstructions: [{ press: "more" }] } } }, // slot 0 = GK
    ];
    for (const body of bad) expect((await putTactics(body)).status).toBe(400);
    expect(Object.keys((await saveService.getTactics(saveId))!.lineupPresets ?? {})).toEqual(["A", "B"]);

    // Other edits keep the presets; a null slot deletes one, null deletes all.
    expect((await putTactics({ formation: "4-3-3" })).status).toBe(200);
    expect(Object.keys((await saveService.getTactics(saveId))!.lineupPresets ?? {})).toEqual(["A", "B"]);
    expect((await putTactics({ lineupPresets: { A: null, B: presetB } })).status).toBe(200);
    expect(Object.keys((await saveService.getTactics(saveId))!.lineupPresets ?? {})).toEqual(["B"]);
    expect((await putTactics({ lineupPresets: null })).status).toBe(200);
    expect((await saveService.getTactics(saveId))!.lineupPresets).toBeUndefined();
  }, 60_000);
});
