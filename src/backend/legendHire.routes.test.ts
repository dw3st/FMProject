import { ownSolo } from "@/backend/testing/seatFixtures";
import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { apiRoutes } from "@/backend/routes";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { legendHireFee } from "@/Domain/achievements/shop";
import type { RetiredPlayer, RosterPlayer } from "@/types/playerTypes";

describe("legend hire for money (retired list)", () => {
  let saveId = "";
  afterAll(async () => {
    if (saveId) await saveService.deleteSave(saveId);
  });

  test("legends filter, fee, one per season, each legend once, ledger and academy", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    const { user, session } = devAutoLogin("legend-hire@test.local");
    await ownSolo(saveId, user.id);

    const call = (key: string, path: string, method: string, retiredId = "") => {
      const handler = apiRoutes[key as keyof typeof apiRoutes] as (r: Request) => Promise<Response>;
      return handler(Object.assign(
        new Request(`http://localhost${path}`, { method, headers: { cookie: `fs_session=${session.token}` } }),
        { params: { saveId, retiredId } },
      ));
    };
    // Only a strong career counts (level and a career in the game); the weak one stays out of the list.
    const mk = (id: string, worldClass: boolean): RetiredPlayer => ({
      id, name: `Legend ${id}`, nationality: "Brazil", positions: ["ST"], preferredFoot: "right",
      profile: { summary: "s", archetype: "a" }, retiredOn: "2027-06-01", squadId: "other", age: 38,
      wasWorldClass: false, appearances: 30, goals: 20,
      statsAtRetirement: {
        passing: worldClass ? 6 : 3, vision: worldClass ? 7 : 3, finishing: worldClass ? 9 : 3, dribbling: worldClass ? 8 : 3, speed: worldClass ? 6 : 3, acceleration: worldClass ? 6 : 3, tackling: 2,
        pressing: 3, stamina: 5, heading: 7, strength: 7, reflex: 0, jump: 0,
      } as RosterPlayer["stats"],
      // A legend by level also needs a career in the game (150 games or a title).
      history: [{ season: "2026-27", squadId: "other", clubName: "Other", league: "l", apps: 150, goals: 60, assists: 0, avgRating: 7, cupApps: 0, cupGoals: 0, contApps: 0, contGoals: 0, yellowCards: 0, redCards: 0, injuries: 0, daysInjured: 0, titles: [] }],
    });
    await saveService.writeRetired(saveId, [mk("a", true), mk("b", true), mk("n", false)]);

    const rKey = "/api/saves/:saveId/retired";
    const list = async () => (await (await call(rKey, `/api/saves/${saveId}/retired?legends=1`, "GET")).json()) as {
      total: number; items: (RetiredPlayer & { legend: { fee: number | null; back: { via: string; mine: boolean } | null } })[];
      legendHire: { thisSeason: boolean };
    };
    const before = await list();
    expect(before.items.map((r) => r.id).sort()).toEqual(["a", "b"]);
    const fee = legendHireFee(mk("a", true));
    expect(before.items.find((r) => r.id === "a")!.legend.fee).toBe(fee);
    expect(before.legendHire.thisSeason).toBe(false);

    // Not enough money first.
    const ref = (await saveService.resolveSquadId(saveId, meta.clubId))!;
    const squad = (await saveService.getSquad(saveId, ref.leagueSlug, ref.clubSlug))!;
    await saveService.saveSquad(saveId, ref.leagueSlug, ref.clubSlug, { ...squad, finances: { ...squad.finances!, budget: 0 } });
    const hKey = "/api/saves/:saveId/legends/:retiredId/hire";
    expect((await call(hKey, `/api/saves/${saveId}/legends/a/hire`, "POST", "a")).status).toBe(409);

    await saveService.saveSquad(saveId, ref.leagueSlug, ref.clubSlug, { ...squad, finances: { ...squad.finances!, budget: 50_000_000 } });
    expect((await call(hKey, `/api/saves/${saveId}/legends/n/hire`, "POST", "n")).status).toBe(409);
    const ok = await call(hKey, `/api/saves/${saveId}/legends/a/hire`, "POST", "a");
    expect(ok.status).toBe(200);

    const after = (await saveService.getSquad(saveId, ref.leagueSlug, ref.clubSlug))!;
    expect(after.youth?.some((p) => p.id.startsWith("legend_a_") && p.age === 17)).toBe(true);
    expect(after.finances!.budget).toBe(50_000_000 - fee);
    const year = (await saveService.getLeagueMeta(saveId, ref.leagueSlug))!.year;
    const ledger = await saveService.getLedger(saveId, year, meta.seatId);
    expect(ledger.some((e) => e.kind === "transfer_out" && e.amount === -fee && e.ref?.stage === "legend")).toBe(true);

    // One per season, and the legend is marked as back.
    expect((await call(hKey, `/api/saves/${saveId}/legends/b/hire`, "POST", "b")).status).toBe(409);
    const later = await list();
    expect(later.legendHire.thisSeason).toBe(true);
    const a = later.items.find((r) => r.id === "a")!;
    expect(a.legend.fee).toBeNull();
    expect(a.legend.back).toMatchObject({ via: "money", mine: true });
    expect((await saveService.getRetired(saveId)).find((r) => r.id === "a")?.legendVia).toBe("money");

    // The rotation: with more legends than the list, one outside it has no fee and cannot be hired.
    await saveService.writeAchievements(saveId, { ...(await saveService.getAchievements(saveId, meta.seatId)), bought: {} }, meta.seatId);
    const many = Array.from({ length: 40 }, (_, i) => mk(`m${i}`, true));
    await saveService.writeRetired(saveId, many);
    const crowded = await (await call(rKey, `/api/saves/${saveId}/retired?legends=1&limit=100`, "GET")).json() as { items: { id: string; legend: { fee: number | null } }[] };
    const on = crowded.items.filter((r) => r.legend.fee !== null);
    const off = crowded.items.filter((r) => r.legend.fee === null);
    expect(on).toHaveLength(12);
    expect(off).toHaveLength(28);
    expect(crowded.items.slice(0, 12).every((r) => r.legend.fee !== null)).toBe(true); // the available ones first
    expect((await call(hKey, `/api/saves/${saveId}/legends/${off[0]!.id}/hire`, "POST", off[0]!.id)).status).toBe(409);
    expect((await call(hKey, `/api/saves/${saveId}/legends/${on[0]!.id}/hire`, "POST", on[0]!.id)).status).toBe(200);
  }, 60_000);
});
