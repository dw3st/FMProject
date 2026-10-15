import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { answerNationalOffer } from "@/backend/nationalCoachWorld";
import { ensureNationalWorld } from "@/backend/nationalWorld";
import { seatManagerId } from "@/Domain/seats/seats";

describe("national coaching per seat", () => {
  const created: string[] = [];
  afterAll(async () => { for (const id of created) await saveService.deleteSave(id); }, 120_000);

  test("accepting an offer gives the team to that seat and closes the team's offers to every seat", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    created.push(meta.id);
    await ensureNationalWorld({ service: saveService, saveId: meta.id, today: meta.currentDate!, index: await saveService.getSquadIndex(meta.id) });
    const state = (await saveService.getNationalState(meta.id))!;
    const teamId = Object.keys(state.teams)[0]!;
    const date = meta.currentDate!;
    const offer = (id: string) => ({ id, teamId, nation: state.teams[teamId]!.nation, date, expires: date, prestige: 0.5, rank: 10, wage: 20_000 });
    await saveService.writeNationalState(meta.id, {
      ...state,
      vacancies: { ...state.vacancies, [teamId]: { since: date, hireOn: date } },
      offers: { [meta.seatId]: [offer("o1")], "seat-other": [offer("o2")] },
    });

    const r = await answerNationalOffer(saveService, meta.id, meta.seatId, "o1", true, date);
    expect(r.ok).toBe(true);
    const after = (await saveService.getNationalState(meta.id))!;
    expect(after.human?.[meta.seatId]?.teamId).toBe(teamId);
    expect(after.teams[teamId]!.managerId).toBe(seatManagerId(meta.seatId));
    expect(after.offers?.[meta.seatId] ?? []).toEqual([]);
    // the team is gone: the other seat's offer for it closes too
    expect(after.offers?.["seat-other"] ?? []).toEqual([]);
    const me = (await saveService.getManagers(meta.id)).find((m) => m.seatId === meta.seatId)!;
    expect(me.national?.at(-1)?.to).toBeUndefined();
  }, 300_000);
});
