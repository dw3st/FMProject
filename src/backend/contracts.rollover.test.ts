import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { advanceOneDay } from "@/backend/advanceDay";

/**
 * Season rollover with expiring contracts (`.claude/rules/game/contracts.md`): England is forced
 * to end today, some players' contracts end today too. The human club releases them to the free
 * agents list; an AI club renews or releases by its rule and never keeps an expired contract.
 */
describe("rollover with expiring contracts", () => {
  let saveId = "";
  afterAll(async () => {
    if (saveId) await saveService.deleteSave(saveId);
  });

  test("human releases to free agents, AI renews or releases, nobody keeps an expired contract", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    const today = meta.currentDate!;

    const active = (meta.activeLeagues ?? []).map((l) =>
      l.leagueSlug === "premier_league" || l.leagueSlug === "of_championship" ? { ...l, end: today } : l);
    await saveService.updateMeta(saveId, { activeLeagues: active });

    const index = await saveService.getSquadIndex(saveId);
    const aiId = index.inLeague("premier_league").map((t) => t.squadId).find((id) => id !== "33")!;
    const expireFirst = async (id: string, n: number) => {
      const e = index.byId(id)!;
      const sq = (await saveService.getSquad(saveId, e.leagueSlug, e.stem))!;
      // Young players only: players of 34+ may retire at the rollover before contracts expire.
      const ids = sq.players.filter((p) => p.age < 32).slice(0, n).map((p) => p.id);
      await saveService.saveSquad(saveId, e.leagueSlug, e.stem, {
        ...sq,
        players: sq.players.map((p) => (ids.includes(p.id) ? { ...p, contract: { until: today, wage: p.contract!.wage } } : p)),
      });
      return ids;
    };
    const humanIds = await expireFirst("33", 2);
    const aiIds = await expireFirst(aiId, 4);

    const out = await advanceOneDay(saveService, saveId);
    expect(out.ok).toBe(true);

    const human = (await saveService.getSquadById(saveId, "33"))!;
    for (const id of humanIds) expect(human.players.some((p) => p.id === id)).toBe(false);
    const free = await saveService.getFreeAgents(saveId);
    // A released player may already be signed the same day by an AI club's rollover refill,
    // so "not in the free pool" is fine as long as another club holds them on a fresh contract.
    const signedElsewhere = async (id: string, from: string) => {
      const index = await saveService.getSquadIndex(saveId);
      for (const league of index.leagues()) {
        for (const entry of index.inLeague(league)) {
          if (entry.squadId === from) continue;
          const squad = await saveService.getSquadById(saveId, entry.squadId);
          const p = squad?.players.find((x) => x.id === id);
          if (p) return p.contract!.until > today;
        }
      }
      return false;
    };
    for (const id of humanIds) {
      const f = free.find((x) => x.player.id === id);
      if (f) {
        expect(f.since).toBe(today);
        expect(f.player.contract).toBeUndefined();
      } else {
        expect(await signedElsewhere(id, "33")).toBe(true);
      }
    }

    const ai = (await saveService.getSquadById(saveId, aiId))!;
    for (const id of aiIds) {
      const p = ai.players.find((x) => x.id === id);
      if (p) expect(p.contract!.until > today).toBe(true);
      else if (!free.some((x) => x.player.id === id)) expect(await signedElsewhere(id, aiId)).toBe(true);
    }
    for (const p of ai.players) expect(p.contract!.until > today).toBe(true);

    const inbox = await saveService.getInbox(saveId);
    expect(inbox.some((m) => m.category === "contract" && m.kind === "released")).toBe(true);
  }, 300_000);
});
