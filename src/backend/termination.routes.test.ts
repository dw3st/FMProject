import { ownSolo } from "@/backend/testing/seatFixtures";
import { describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { apiRoutes } from "@/backend/routes";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { terminationQuote, terminationBreaksDepth, TERMINATION } from "@/Domain/contracts/termination";
import type { RosterPlayer } from "@/types/playerTypes";

describe("friendly termination", () => {
  test("pure: share by role, cap at half the value, near the end pays it all", () => {
    const p = { id: "a", positions: ["Forward"], contract: { until: "2029-06-30", wage: 10_000 }, squadStatus: "backup" } as unknown as RosterPlayer;
    const q = terminationQuote(p, { players: [p] }, "2027-06-30", 1e9)!;
    expect(q.weeksLeft).toBe(105);
    expect(q.fee).toBe(Math.round((105 * 10_000 * TERMINATION.SHARE.backup) / 1000) * 1000);
    expect(terminationQuote({ ...p, squadStatus: "key" } as RosterPlayer, { players: [p] }, "2027-06-30", 1e9)!.share).toBe(1);
    expect(terminationQuote(p, { players: [p] }, "2029-03-01", 1e9)!.share).toBe(1);
    const capped = terminationQuote(p, { players: [p] }, "2027-06-30", 100_000)!;
    expect(capped.capped).toBe(true);
    expect(capped.fee).toBe(50_000);
    expect(terminationQuote({ ...p, contract: undefined } as RosterPlayer, { players: [p] }, "2027-06-30", 1)).toBeNull();
    expect(terminationBreaksDepth({ players: [p] }, "a")).toBe(true);
  });

  test("route: quote, terminate, free agent, ledger; depth refusal", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    const { user, session } = devAutoLogin("terminate@test.local");
    await ownSolo(meta.id, user.id);
    const call = (playerId: string, method: string) => {
      const handler = apiRoutes["/api/saves/:saveId/players/:playerId/terminate" as keyof typeof apiRoutes] as (r: Request) => Promise<Response>;
      return handler(Object.assign(
        new Request(`http://localhost/api/saves/${meta.id}/players/${playerId}/terminate`, {
          method, headers: { cookie: `fs_session=${session.token}` },
        }),
        { params: { saveId: meta.id, playerId } },
      ));
    };
    const ref = (await saveService.resolveSquadId(meta.id, "33"))!;
    const before = (await saveService.getSquad(meta.id, ref.leagueSlug, ref.clubSlug))!;
    const mids = before.players.filter((p) => p.positions[0] === "Midfielder");
    const target = mids.find((p) => p.contract && !p.loan)!;
    expect(target).toBeDefined();
    const quote = await (await call(target.id, "GET")).json() as { fee: number; blocked: boolean };
    expect(quote.fee).toBeGreaterThanOrEqual(0);
    if (mids.length - 1 < 7) {
      expect((await call(target.id, "POST")).status).toBe(409);
    } else {
      expect(quote.blocked).toBe(false);
      expect((await call(target.id, "POST")).status).toBe(200);
      const after = (await saveService.getSquad(meta.id, ref.leagueSlug, ref.clubSlug))!;
      expect(after.players.some((p) => p.id === target.id)).toBe(false);
      expect((await saveService.getFreeAgents(meta.id)).some((f) => f.player.id === target.id)).toBe(true);
      expect((after.finances?.budget ?? 0)).toBe((before.finances?.budget ?? 0) - quote.fee);
      expect((await call(target.id, "GET")).status).toBe(404);
    }
    await saveService.deleteSave(meta.id);
  }, 60_000);
});
