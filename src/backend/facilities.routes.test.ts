import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { apiRoutes } from "@/backend/routes";
import { advanceOneDay } from "@/backend/advanceDay";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { recordSaveOwnership } from "@/backend/auth/saveOwnership";
import { recordMoney } from "@/backend/FinancialService";
import { addDays } from "@/Domain/dates";

/**
 * Facilities routes and the day pipeline (`.claude/rules/game/facilities.md`): owner only, the board
 * decides, instalments and the board's funding reach the ledger, finished works change the stadium,
 * and an unemployed manager gets 409 noClub (the old club keeps no facilities).
 */
describe("facilities routes", () => {
  let saveId = "";
  afterAll(async () => {
    if (saveId) await saveService.deleteSave(saveId);
  });

  test("request, board decision, instalments, completion, noClub", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    const { user, session } = devAutoLogin("facilities-route@test.local");
    const other = devAutoLogin("facilities-other@test.local");
    recordSaveOwnership(saveId, user.id);

    const call = (path: string, method: string, token: string, body?: unknown) => {
      const key = `/api/saves/:saveId/facilities${path}`;
      const handler = apiRoutes[key as keyof typeof apiRoutes] as (r: Request) => Promise<Response>;
      return handler(Object.assign(
        new Request(`http://localhost/api/saves/${saveId}/facilities${path}`, {
          method,
          headers: { cookie: `fs_session=${token}`, "content-type": "application/json" },
          ...(body ? { body: JSON.stringify(body) } : {}),
        }),
        { params: { saveId } },
      ));
    };

    // Not the owner: indistinguishable from a missing save.
    expect((await call("", "GET", other.session.token)).status).toBe(404);

    // Initial state: stands sum to the venue capacity, comfort 1.
    const start = await (await call("", "GET", session.token)).json() as any;
    const squad0 = (await saveService.getSquadById(saveId, "33"))!;
    expect(start.capacity).toBe(squad0.venue!.capacity);
    expect(start.facilities.stands).toHaveLength(4);
    expect(start.levels.comfort).toBe(1);
    expect(Object.keys(start.facilities.items)).toHaveLength(10);
    expect(start.seatCost).toBeGreaterThanOrEqual(1500);
    expect(start.seatCost).toBeLessThanOrEqual(6000);

    // Validation.
    expect((await call("/request", "POST", session.token, { kind: "stand", stand: "east", seats: 1500 })).status).toBe(400);
    expect((await call("/request", "POST", session.token, { kind: "pool" })).status).toBe(400);

    // No money: refused, with an inbox message.
    const refused = await (await call("/request", "POST", session.token, { kind: "stand", stand: "east", seats: 2000 })).json() as any;
    expect(refused.approved).toBe(false);
    expect(refused.reason).toBe("no_money");

    // A happy board and money in the bank: approved with the board's funding.
    const ledgerSeason = (await saveService.getLeagueMeta(saveId, "premier_league"))!.year;
    await recordMoney(saveService, saveId, ledgerSeason, { leagueSlug: "premier_league", clubSlug: "33" },
      { date: meta.currentDate!, kind: "prize", amount: 500_000_000, label: "test money", ref: { stage: "board_bonus" } });
    await saveService.updateMeta(saveId, { board: { ...meta.board!, board: 100 } });
    const ok = await (await call("/request", "POST", session.token, { kind: "stand", stand: "east", seats: 2000 })).json() as any;
    expect(ok.approved).toBe(true);
    expect(ok.boardShare).toBe(0.5);
    expect(ok.view.effectiveCapacity).toBeLessThan(ok.view.capacity);
    // One project per facility.
    expect((await call("/request", "POST", session.token, { kind: "stand", stand: "west", seats: 1000 })).status).toBe(409);
    const inbox = await saveService.getInbox(saveId);
    // A refusal is answered on screen only.
    expect(inbox.some((m) => m.category === "facilities" && m.kind === "refused")).toBe(false);
    expect(inbox.some((m) => m.category === "facilities" && m.kind === "approved")).toBe(true);

    // The day pays the first instalment and the board's half of it.
    const out = await advanceOneDay(saveService, saveId);
    expect(out.ok).toBe(true);
    const ledger = await saveService.getLedger(saveId, ledgerSeason);
    const inst = ledger.filter((e) => e.kind === "facilities");
    const fund = ledger.filter((e) => e.kind === "board_funding");
    expect(inst).toHaveLength(1);
    expect(fund).toHaveLength(1);
    expect(Math.abs(fund[0]!.amount + inst[0]!.amount / 2)).toBeLessThan(2);
    const balanceSum = (await Promise.all((await saveService.listLedgerSeasons(saveId)).map((s) => saveService.getLedger(saveId, s))))
      .flat().reduce((s, e) => s + e.amount, 0);
    expect(Math.abs(balanceSum - (await saveService.getSquadById(saveId, "33"))!.finances!.budget)).toBeLessThan(1);

    // Bring the end forward: the next day finishes the works, pays what is left and grows the stadium.
    const sq = (await saveService.getSquadById(saveId, "33"))!;
    const date = (await saveService.getMeta(saveId))!.currentDate!;
    const p = sq.facilities!.projects[0]!;
    const index = await saveService.getSquadIndex(saveId);
    const entry = index.byId("33")!;
    await saveService.saveSquad(saveId, entry.leagueSlug, entry.stem, {
      ...sq, facilities: { ...sq.facilities!, projects: [{ ...p, end: date, start: addDays(date, -30) }] },
    });
    expect((await advanceOneDay(saveService, saveId)).ok).toBe(true);
    const after = (await saveService.getSquadById(saveId, "33"))!;
    expect(after.facilities!.projects).toHaveLength(0);
    expect(after.venue!.capacity).toBe(squad0.venue!.capacity + 2000);
    const paid = (await saveService.getLedger(saveId, ledgerSeason)).filter((e) => e.kind === "facilities")
      .reduce((s, e) => s - e.amount, 0);
    expect(paid).toBe(p.cost);
    expect((await saveService.getInbox(saveId)).some((m) => m.category === "facilities" && m.kind === "completed")).toBe(true);

    // Sacked: the club becomes AI without facilities, the routes answer 409 noClub.
    const m2 = (await saveService.getMeta(saveId))!;
    await saveService.updateMeta(saveId, { board: { ...m2.board!, board: 5 } });
    const sacked = await advanceOneDay(saveService, saveId);
    expect(sacked.ok).toBe(true);
    expect((await saveService.getSquadById(saveId, "33"))!.facilities).toBeUndefined();
    expect((await call("", "GET", session.token)).status).toBe(409);
    expect((await call("/request", "POST", session.token, { kind: "training" })).status).toBe(409);
  }, 240_000);
});
