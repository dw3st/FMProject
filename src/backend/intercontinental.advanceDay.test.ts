import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { advanceOneDay } from "@/backend/advanceDay";
import { ensureIntercontinental, intercontinentalView, playerIntercontinentalSlug } from "@/backend/intercontinentalWorld";
import { getLeagueData, getPyramids } from "@/backend/advanceDay";
import { ICC, ICC_SLUG } from "@/Domain/intercontinental/iccConfig";
import type { SeasonArchive } from "@/types/calendarTypes";
import type { StandingRow } from "@/types/playerTypes";

/** The Intercontinental Cup in the day pipeline (`.claude/rules/game/intercontinental.md`). */
describe("Intercontinental Cup in advanceOneDay", () => {
  const created: string[] = [];
  afterAll(async () => {
    for (const id of created) await saveService.deleteSave(id);
  });

  const archive = (leagueSlug: string, year: number, clubIds: string[], champion?: string): SeasonArchive => ({
    leagueSlug, year, start: `${year}-01-01`, end: `${year}-12-31`,
    standings: clubIds.map((squadId) => ({ squadId }) as unknown as StandingRow),
    titles: champion ? [{ competition: leagueSlug, clubId: champion, clubName: champion, coachId: null, coachName: "" }] : [],
    playerLogs: {},
  });

  test("generated on 1 December, played to a champion: title, manager points, prizes", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    created.push(meta.id);
    const year = Number(meta.currentDate!.slice(0, 4));
    const index = await saveService.getSquadIndex(meta.id);
    const brazil = index.inLeague("brazil_serie_a")[0]!.squadId;
    const saudi = index.inLeague("of_saudi_professional_league").map((t) => t.squadId);
    // The Champions League won by the human club in May, the Libertadores of the year, a closed Saudi season.
    await saveService.writeLeagueSeasonArchive(meta.id, archive("ucl", year - 1, [], "33"));
    await saveService.writeLeagueSeasonArchive(meta.id, archive("lib", year, [], brazil));
    const saudiState = meta.activeLeagues!.find((l) => l.leagueSlug === "of_saudi_professional_league")!;
    await saveService.writeLeagueSeasonArchive(meta.id, archive("of_saudi_professional_league", saudiState.year - 1, saudi));

    // No league ends before December of the first year: jumping there rolls nothing over.
    await saveService.updateMeta(meta.id, { currentDate: `${year}-12-01` });
    const first = await advanceOneDay(saveService, meta.id);
    expect(first.ok).toBe(true);

    let icc = (await saveService.getLeagueMeta(meta.id, ICC_SLUG))!.intercontinental!;
    expect(icc.year).toBe(year);
    expect(icc.entrants.UEFA.clubId).toBe("33");
    expect(icc.entrants.CONMEBOL.clubId).toBe(brazil);
    expect(icc.entrants.AFC.clubId).toBe(saudi[0]!);
    expect(icc.entrants.CAF.clubId).toBeNull(); // no closed season anywhere else
    for (const m of icc.matches) {
      if (m.bye) continue;
      expect(m.date > `${year}-12-01`).toBe(true);
      expect([3, 6]).toContain(new Date(`${m.date}T12:00:00Z`).getUTCDay());
    }
    // AFC goes through two byes; the Challenger Cup (AFC × Libertadores) is drawn at once.
    expect(icc.matches.find((m) => m.n === 4)).toMatchObject({ home: saudi[0], away: brazil, done: false });

    const ledger = await saveService.getLedger(meta.id, (await saveService.getLeagueMeta(meta.id, "premier_league"))!.year, meta.seatId!);
    expect(ledger.some((e) => e.kind === "prize" && e.ref?.competition === ICC_SLUG && e.amount === ICC.PRIZE.PARTICIPATION)).toBe(true);
    // The club's calendar, the advance-until stops and match-setup read this slug.
    expect(await playerIntercontinentalSlug(saveService, meta.id, "33")).toBe(ICC_SLUG);

    // Play the remaining matches: jump to each date (December, no rollover in between).
    for (let i = 0; i < 3 && !icc.championId; i++) {
      const fixtures = await saveService.getAllFixturesForLeague(meta.id, ICC_SLUG);
      const next = fixtures.filter((f) => !f.played).map((f) => f.date).sort()[0];
      if (!next) break;
      await saveService.updateMeta(meta.id, { currentDate: next });
      const out = await advanceOneDay(saveService, meta.id);
      expect(out.ok).toBe(true);
      icc = (await saveService.getLeagueMeta(meta.id, ICC_SLUG))!.intercontinental!;
    }
    const champion = icc.championId!;
    expect([saudi[0], brazil, "33"]).toContain(champion);
    const fixtures = await saveService.getAllFixturesForLeague(meta.id, ICC_SLUG);
    expect(fixtures.length).toBe(2);
    expect(fixtures.every((f) => f.played && f.neutral && f.knockout)).toBe(true);

    // Title pending for the club's next rollover, manager points.
    const world = await saveService.getMeta(meta.id);
    expect(world!.pendingTitles?.[champion]).toContain("continental:icc");
    const managers = await saveService.getManagers(meta.id);
    const mgr = managers.find((m) => m.squadId === champion)!;
    expect(mgr.titles.some((t) => t.competition === ICC_SLUG && t.points === ICC.MANAGER_POINTS)).toBe(true);

    // The human club: title prize in the ledger, or an elimination message.
    const ledger2 = await saveService.getLedger(meta.id, (await saveService.getLeagueMeta(meta.id, "premier_league"))!.year, meta.seatId!);
    const inbox = await saveService.getInbox(meta.id, meta.seatId!);
    const iccMsgs = inbox.filter((m) => m.category === "continental" && m.competition === ICC_SLUG);
    expect(iccMsgs.some((m) => m.category === "continental" && m.kind === "qualified")).toBe(true);
    if (champion === "33") {
      expect(ledger2.some((e) => e.kind === "prize" && e.ref?.competition === ICC_SLUG && e.amount === ICC.PRIZE.TITLE)).toBe(true);
      expect(iccMsgs.some((m) => m.category === "continental" && m.kind === "champion")).toBe(true);
    } else {
      expect(iccMsgs.some((m) => m.category === "continental" && m.kind === "eliminated")).toBe(true);
    }

    const view = await intercontinentalView(saveService, meta.id, index);
    expect(view).toMatchObject({ years: [year], year, current: true });
    expect(view!.entrants.UEFA.name).toBe(index.byId("33")!.name);
    expect(view!.fixtures.length).toBe(2);

    // The next December: the edition is archived (one title, its bracket) and stays readable by year.
    const again = await ensureIntercontinental({
      service: saveService, saveId: meta.id, date: `${year + 1}-12-01`, index,
      catalog: await getLeagueData(), pyramids: await getPyramids(), activeLeagues: meta.activeLeagues!,
    });
    expect(again).not.toBeNull();
    const past = await saveService.readLeagueSeasonArchive(meta.id, ICC_SLUG, year);
    expect(past!.titles.map((t) => t.clubId)).toEqual([champion]);
    const old = await intercontinentalView(saveService, meta.id, index, year);
    expect(old).toMatchObject({ year, current: false, years: [year, year + 1] });
    expect(old!.meta.championId).toBe(champion);
    expect(await intercontinentalView(saveService, meta.id, index, year - 5)).toBeNull();
  }, 600_000);
});
