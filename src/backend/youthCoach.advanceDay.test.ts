/**
 * The youth coach in the day pipeline (`.claude/rules/game/staff.md` → "Treinador da base (12.1)"): with the
 * responsibility on him he calls a squad youngster short of minutes up on a youth game day and sets the academy's
 * Monday plan, never touching what the manager set; a pool from before the role gets its quota on the first read.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { advanceOneDay } from "@/backend/advanceDay";
import { soloMeta, soloSeatId, updateSolo } from "@/backend/testing/seatFixtures";
import { coachCallUpsToday, coachMondaySquad } from "@/backend/youthCoachWorld";
import { firstTeamLineup, youthCompFixtures } from "@/backend/youthCompWorld";
import { addDays } from "@/Domain/dates";
import { preferredRole } from "@/Domain/positions/positionAptitude";
import { getMainRole, type MainRole } from "@/Domain/roles";
import { STAFF } from "@/Domain/staff/staffConfig";
import { DP_CATEGORIES } from "@/GameEngine/PlayerDevelopment";
import { emptySeasonLog, type RosterPlayer, type Squad } from "@/types/playerTypes";

const HUMAN = "33";
const LINES: [MainRole, number][] = [["GK", 1], ["Defender", 4], ["Midfielder", 3], ["Forward", 3]];

describe("the youth coach in advanceOneDay", () => {
  let saveId = "";
  beforeAll(async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: HUMAN, clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
  }, 180_000);
  afterAll(async () => { if (saveId) await saveService.deleteSave(saveId); });

  test("calls a low-minutes squad youngster up on the game day, sets the Monday plan, leaves the manager's entries", async () => {
    const seatId = await soloSeatId(saveId);
    const start = (await saveService.getMeta(saveId))!.currentDate!;
    const u19 = (await youthCompFixtures(saveService, saveId, (await saveService.getLeagueMeta(saveId, "u19_england"))!))
      .filter((f) => !f.played && f.date >= start && (f.home === HUMAN || f.away === HUMAN))
      .sort((a, b) => (a.date < b.date ? -1 : 1));
    let game = u19[0]!;
    for (const f of u19) {
      if (!(await saveService.getClubsWithFixtureOn(saveId, f.date)).has(HUMAN)) { game = f; break; }
    }
    const day = game.date;

    // The club: a saved XI, a full academy side (so a squad teenager only plays the under-19 when called up),
    // one squad 18-year-old without games, everybody else too old for the youth sides.
    const squad0 = (await saveService.getSquadById(saveId, HUMAN))!;
    expect(squad0.staff!.members.filter((m) => m.role === "youthCoach")).toHaveLength(1);
    const xi = firstTeamLineup(squad0, "4-3-3", day);
    const lineOf = (p: RosterPlayer) => getMainRole(preferredRole(p));
    const target = squad0.players.find((p) => !xi.includes(p.id) && lineOf(p) !== "GK" && !p.injury && !p.suspension)!;
    const fresh = (apps: number) => ({ ...emptySeasonLog(), appearances: apps, fitness: 95 });
    const academy: RosterPlayer[] = LINES.flatMap(([line, n]) =>
      squad0.players.filter((p) => lineOf(p) === line).slice(0, n).map((p, i) => {
        const { injury: _i, suspension: _s, nationalDuty: _n, loan: _l, ...rest } = p;
        return { ...rest, id: `acad_${line}_${i}`, name: `Acad ${line} ${i}`, age: 17, seasonLog: fresh(0) } as RosterPlayer;
      }));
    expect(academy).toHaveLength(11);
    const mine = academy[1]!.id;
    const prepared: Squad = {
      ...squad0,
      youth: academy,
      players: squad0.players.map((p) => (p.id === target.id
        ? { ...p, age: 18, seasonLog: fresh(0) }
        : { ...p, age: Math.max(p.age, 24), seasonLog: { ...(p.seasonLog ?? emptySeasonLog()), appearances: xi.includes(p.id) ? 10 : 6 } })),
    };
    await saveService.saveSquadById(saveId, prepared);
    await saveService.saveTactics(saveId, { tactical_style: "balanced", formation: "4-3-3", lineup: xi }, seatId);
    await updateSolo(saveId, { currentDate: day, youthCallUps: { u19: [{ id: mine, duration: "indefinite" }] } });

    // The manager in charge (the default): the coach adds nothing.
    const seat = async () => {
      const meta = (await soloMeta(saveId))!;
      return { seatId, clubId: HUMAN, meta, tactics: await saveService.getTactics(saveId, seatId) };
    };
    const ask = async () => coachCallUpsToday({
      service: saveService, saveId, date: day, seats: [await seat()], teamsPlayingToday: new Set(),
      squadOf: (id) => saveService.getSquadById(saveId, id),
    });
    expect((await ask()).size).toBe(0);
    expect(coachMondaySquad(await seat(), prepared)).toBeNull();

    // The coach in charge: the youngster is called up for today's game, after the manager's own entry.
    await updateSolo(saveId, { responsibilities: { contracts: "director", youth: "coach" } });
    expect((await ask()).get(seatId)).toEqual({ u19: [
      { id: mine, duration: "indefinite" },
      { id: target.id, duration: "next", left: 1, byCoach: true },
    ] });
    // A club that plays for the first team today is left alone (its youth game is postponed).
    expect((await coachCallUpsToday({
      service: saveService, saveId, date: day, seats: [await seat()], teamsPlayingToday: new Set([HUMAN]),
      squadOf: (id) => saveService.getSquadById(saveId, id),
    })).size).toBe(0);

    // The day before the game he already makes the list, so the manager sees it a day ahead.
    await updateSolo(saveId, { currentDate: addDays(day, -1) });
    expect((await advanceOneDay(saveService, saveId)).ok).toBe(true);
    const ahead = (await soloMeta(saveId))!;
    expect(ahead.currentDate).toBe(day);
    expect(ahead.youthCoachPlanned).toBe(day);
    expect(ahead.youthCallUps?.u19).toContainEqual({ id: target.id, duration: "next", left: 1, byCoach: true });
    // On the game day the list he made yesterday is left as the manager has it.
    expect((await ask()).size).toBe(0);

    expect((await advanceOneDay(saveService, saveId)).ok).toBe(true);
    const log = (await saveService.getDayLog(saveId, day))!;
    const played = (log.youthMatches ?? []).find((m) => m.fixtureId === game.id);
    expect(played?.score).toBeTruthy();
    const side = played!.home === HUMAN ? played!.players.home : played!.players.away;
    expect(side).toContain(target.id);
    const after = (await saveService.getSquadById(saveId, HUMAN))!;
    expect(after.players.find((p) => p.id === target.id)!.seasonLog!.youthCup!.appearances).toBe(1);
    // His one-game call-up is used up; the manager's stays as it was.
    expect((await soloMeta(saveId))!.youthCallUps).toEqual({ u19: [{ id: mine, duration: "indefinite" }] });

    // Monday: the academy plan. The manager's intensity and his entry for one youngster stay; the rest is the coach's.
    let monday = addDays(day, 1);
    while (new Date(`${monday}T12:00:00Z`).getUTCDay() !== 1) monday = addDays(monday, 1);
    await saveService.saveSquadById(saveId, {
      ...after, youthTraining: { intensity: "light", focus: "balanced", players: { [mine]: { focus: "shooting" } } },
    });
    await updateSolo(saveId, { currentDate: monday });
    expect((await advanceOneDay(saveService, saveId)).ok).toBe(true);
    const plan = (await saveService.getSquadById(saveId, HUMAN))!.youthTraining!;
    expect(plan.intensity).toBe("light");
    expect(plan.intensityByCoach).toBeUndefined();
    expect(plan.players![mine]).toEqual({ focus: "shooting" });
    for (const kid of academy) {
      if (kid.id === mine) continue;
      const entry = plan.players![kid.id]!;
      expect(entry.byCoach).toBe(true);
      expect((DP_CATEGORIES as readonly string[]).includes(entry.focus!)).toBe(true);
    }

    // Without a youth coach at work nothing is his to do, whatever the responsibility says.
    const noCoach: Squad = { ...after, staff: { ...after.staff!, members: after.staff!.members.filter((m) => m.role !== "youthCoach") } };
    expect(coachMondaySquad(await seat(), noCoach)).toBeNull();
    expect((await coachCallUpsToday({
      service: saveService, saveId, date: day, seats: [await seat()], teamsPlayingToday: new Set(),
      squadOf: async () => noCoach,
    })).size).toBe(0);
  }, 300_000);

  test("a staff pool written before the role gets its youth coaches on the first read", async () => {
    const date = (await saveService.getMeta(saveId))!.currentDate!;
    const pool = await saveService.getStaffPool(saveId, date);
    expect(pool.members.filter((m) => m.role === "youthCoach")).toHaveLength(STAFF.POOL.BY_ROLE.youthCoach);
    const old = { ...pool, members: pool.members.filter((m) => m.role !== "youthCoach") };
    await saveService.writeStaffPool(saveId, old);
    const topped = await saveService.getStaffPool(saveId, date);
    expect(topped.members.filter((m) => m.role === "youthCoach")).toHaveLength(STAFF.POOL.BY_ROLE.youthCoach);
    expect(topped.members.length).toBe(old.members.length + STAFF.POOL.BY_ROLE.youthCoach);
    // Written: the next read is the same pool, nothing added twice.
    expect(await saveService.getStaffPool(saveId, date)).toEqual(topped);
  }, 60_000);
});
