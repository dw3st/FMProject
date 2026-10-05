import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { saveRoutes } from "@/backend/saves";
import { advanceOneDay } from "@/backend/advanceDay";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { recordSaveOwnership } from "@/backend/auth/saveOwnership";
import { formationForTactics } from "@/Domain/matchFormations";

/** Player instructions (`.claude/rules/game/player-instructions.md`): tactics PUT and match marking. */
describe("player instructions routes", () => {
  let saveId = "";
  afterAll(async () => {
    if (saveId) await saveService.deleteSave(saveId);
  });

  test("slot instructions validate per slot; match marking validates and the next advance clears it", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    const { user, session } = devAutoLogin(`instructions-route-${saveId}@test.local`);
    recordSaveOwnership(saveId, user.id);
    const stranger = devAutoLogin(`instructions-stranger-${saveId}@test.local`);

    const call = (route: keyof typeof saveRoutes, path: string, method: string, body: unknown, token = session.token) =>
      (saveRoutes[route] as (r: Request & { params: Record<string, string> }) => Promise<Response>)(Object.assign(
        new Request(`http://localhost${path}`, {
          method,
          headers: { cookie: `fs_session=${token}`, "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
        { params: { id: saveId } },
      ) as Request & { params: Record<string, string> });
    const putTactics = (body: unknown, token?: string) =>
      call("/api/saves/:id/tactics", `/api/saves/${saveId}/tactics`, "PUT", body, token);
    const mark = (body: unknown) =>
      call("/api/saves/:id/match-marking", `/api/saves/${saveId}/match-marking`, "POST", body);

    // ── Tactics: slot instructions ────────────────────────────────────────────
    const f433 = formationForTactics({ formation: "4-3-3" });
    const lb = f433.attacking.findIndex((s) => s.role === "LB");
    const st = f433.attacking.findIndex((s) => s.role === "ST");
    const list: unknown[] = Array(11).fill(null);
    list[lb] = { variant: "fb_inverted" };
    list[st] = { variant: "st_target", press: "more" };

    expect((await putTactics({ formation: "4-3-3", slotInstructions: list }, stranger.session.token)).status).toBe(404); // not the owner
    const ok = await putTactics({ formation: "4-3-3", slotInstructions: list });
    expect(ok.status).toBe(200);
    expect((await saveService.getTactics(saveId))?.slotInstructions?.[st]).toEqual({ variant: "st_target", press: "more" });

    const misfit = [...list];
    misfit[lb] = { variant: "st_target" };
    expect((await putTactics({ slotInstructions: misfit })).status).toBe(400);
    expect((await putTactics({ slotInstructions: [{ variant: "nope" }] })).status).toBe(400);
    expect((await putTactics({ slotInstructions: [{ press: "more" }] })).status).toBe(400); // slot 0 = GK

    // A formation change sanitizes the kept instructions (variant dropped where the role changes).
    expect((await putTactics({ formation: "3-5-2" })).status).toBe(200);
    const f352 = formationForTactics({ formation: "3-5-2" });
    const kept = (await saveService.getTactics(saveId))?.slotInstructions ?? [];
    kept.forEach((instr, i) => {
      if (instr?.variant) expect(f352.attacking[i]!.role === "LB" || f352.attacking[i]!.role === "ST").toBe(true);
    });
    expect((await putTactics({ formation: "4-3-3", slotInstructions: list })).status).toBe(200);

    // ── Match marking ─────────────────────────────────────────────────────────
    const fixtures = await saveService.getAllFixturesForLeague(saveId, "premier_league");
    const first = fixtures
      .filter((f) => (f.home === "33" || f.away === "33") && !f.played)
      .sort((a, b) => a.date.localeCompare(b.date))[0]!;
    await saveService.updateMeta(saveId, { currentDate: first.date });
    const opponent = (await saveService.getSquadById(saveId, first.home === "33" ? first.away : first.home))!;
    const oppGk = opponent.players.find((p) => p.positions?.[0] === "GK")!;
    const oppOutfield = opponent.players.filter((p) => p.positions?.[0] !== "GK");
    const cm = f433.attacking.findIndex((s) => s.role === "CM");
    const cdmOrCam = f433.attacking.findIndex((s, i) => i !== cm && (s.role === "CM" || s.role === "CAM"));

    expect((await mark({ date: "2000-01-01", marks: [] })).status).toBe(400);
    expect((await mark({ date: first.date, marks: [{ slot: cm, targetId: "not-a-player" }] })).status).toBe(400);
    expect((await mark({ date: first.date, marks: [{ slot: cm, targetId: oppGk.id }] })).status).toBe(400);
    expect((await mark({ date: first.date, marks: [{ slot: 0, targetId: oppOutfield[0]!.id }] })).status).toBe(400);
    expect((await mark({
      date: first.date,
      marks: [
        { slot: cm, targetId: oppOutfield[0]!.id },
        { slot: cdmOrCam, targetId: oppOutfield[1]!.id },
        { slot: lb, targetId: oppOutfield[2]!.id },
      ],
    })).status).toBe(400);
    expect((await mark({
      date: first.date,
      marks: [{ slot: cm, targetId: oppOutfield[0]!.id }, { slot: cdmOrCam, targetId: oppOutfield[0]!.id }],
    })).status).toBe(400);
    const good = await mark({ date: first.date, marks: [{ slot: cm, targetId: oppOutfield[0]!.id }] });
    expect(good.status).toBe(200);
    expect((await saveService.getMeta(saveId))?.matchMarking).toEqual({ date: first.date, marks: [{ slot: cm, targetId: oppOutfield[0]!.id }] });

    // A formation change drops the pairs whose marker slot changed role (LB -> CB in the 3-5-2).
    expect((await mark({ date: first.date, marks: [{ slot: cm, targetId: oppOutfield[0]!.id }, { slot: lb, targetId: oppOutfield[1]!.id }] })).status).toBe(200);
    expect((await putTactics({ formation: "3-5-2" })).status).toBe(200);
    expect((await saveService.getMeta(saveId))?.matchMarking?.marks).toEqual([{ slot: cm, targetId: oppOutfield[0]!.id }]);
    expect((await putTactics({ formation: "4-3-3", slotInstructions: list })).status).toBe(200);

    // The next advance plays the match with the instructions and clears the marking.
    const out = await advanceOneDay(saveService, saveId);
    expect(out.ok).toBe(true);
    expect((await saveService.getMeta(saveId))?.matchMarking).toBeUndefined();
  }, 180_000);
});
